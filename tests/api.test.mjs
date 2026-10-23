import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../server/index.mjs';

const password = `Teste-${randomUUID()}-9a`;
const dateAfter = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function start(dbPath) {
  const app = createApp({ dbPath });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    app, base,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      app.locals.close();
    },
  };
}

function browser(runtime, existingCookie = '') {
  let cookie = existingCookie;
  return {
    get cookie() { return cookie; },
    async request(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`${runtime.base}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method === 'GET' ? {} : { Origin: runtime.base }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : await response.text();
      return { status: response.status, data, headers: response.headers };
    },
  };
}

function expectSuccess(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}

function expectRejected(result, statuses = [400, 422]) {
  assert.ok(statuses.includes(result.status), `Expected ${statuses.join('/')} but got ${result.status}: ${JSON.stringify(result.data)}`);
  assert.equal(typeof result.data.error, 'string');
}

test('API: authentication, tenant isolation, sales workflow and persistent storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pairon-api-'));
  const dbPath = join(directory, 'integration.sqlite');
  let runtime = await start(dbPath);
  let owner = browser(runtime);
  let other = browser(runtime);
  let anonymous = browser(runtime);
  const email = `alice-${randomUUID()}@example.test`;
  const otherEmail = `bruno-${randomUUID()}@example.test`;
  let client;
  let deal;
  let proposal;
  let task;

  t.after(async () => {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });

  await t.test('health endpoint responds and anonymous workspaces are protected', async () => {
    const health = await anonymous.request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(typeof health.data, 'object');
    const session = expectSuccess(await anonymous.request('/api/session'));
    assert.equal(session.user, null);
    expectRejected(await anonymous.request('/api/workspace'), [401]);
  });

  await t.test('registration creates an authenticated empty workspace and secure cookie', async () => {
    const result = await owner.request('/api/auth/register', {
      method: 'POST', body: { name: 'Alice Oliveira', company: 'Aurora Consultoria', email, password },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    assert.equal(result.data.user.email, email);
    assert.equal(result.data.user.company, 'Aurora Consultoria');
    assert.ok(owner.cookie);
    assert.match(result.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(result.headers.get('set-cookie'), /SameSite=Lax/i);
    const storedUser = runtime.app.locals.db.prepare('SELECT password_hash FROM users WHERE email=?').get(email);
    assert.match(storedUser.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(storedUser.password_hash, password);
    const rawToken = owner.cookie.split('=')[1];
    const storedSession = runtime.app.locals.db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(result.data.user.id);
    assert.notEqual(storedSession.token_hash, rawToken);
    const workspace = expectSuccess(await owner.request('/api/workspace'));
    for (const resource of ['clients', 'deals', 'proposals', 'tasks']) {
      assert.deepEqual(workspace[resource], [], `${resource} must not contain demo data`);
    }
    assert.equal(workspace.settings.annualGoal, 1_000_000);
  });

  await t.test('registration rejects duplicate emails and weak passwords', async () => {
    expectRejected(await anonymous.request('/api/auth/register', {
      method: 'POST', body: { name: 'Duplicado', company: 'Duplicada', email: email.toUpperCase(), password },
    }), [400, 409, 422]);
    expectRejected(await anonymous.request('/api/auth/register', {
      method: 'POST', body: { name: 'Fraca', company: 'Fraca', email: `weak-${randomUUID()}@example.test`, password: '123' },
    }));
  });

  await t.test('login checks credentials and logout invalidates the session', async () => {
    const login = browser(runtime);
    expectRejected(await login.request('/api/auth/login', {
      method: 'POST', body: { email, password: `${password}-wrong` },
    }), [401]);
    const result = expectSuccess(await login.request('/api/auth/login', {
      method: 'POST', body: { email: email.toUpperCase(), password },
    }));
    assert.equal(result.user.email, email);
    assert.equal(expectSuccess(await login.request('/api/session')).user.email, email);
    expectSuccess(await login.request('/api/auth/logout', { method: 'POST', body: {} }));
    assert.equal(expectSuccess(await login.request('/api/session')).user, null);
    expectRejected(await login.request('/api/workspace'), [401]);
  });

  await t.test('authenticated mutations reject a foreign origin', async () => {
    for (const origin of [
      'https://untrusted.example', runtime.base.replace('127.0.0.1', '127.0.0.1.untrusted.example'),
      runtime.base.replace('http:', 'https:'), `${runtime.base}/`,
      runtime.base.replace('http://', 'http://ignored@'), 'null',
    ]) {
      expectRejected(await owner.request('/api/clients', {
        method: 'POST', body: { name: 'Bloqueado' }, headers: { Origin: origin },
      }), [403]);
    }
    assert.equal(expectSuccess(await owner.request('/api/workspace')).clients.length, 0);
  });

  await t.test('client creation, validation and editing persist', async () => {
    expectRejected(await owner.request('/api/clients', { method: 'POST', body: { name: '' } }));
    expectRejected(await owner.request('/api/clients', { method: 'POST', body: { name: 'Inválido', email: 'not-an-email' } }));
    const created = await owner.request('/api/clients', {
      method: 'POST', body: { name: 'Marina Costa', company: 'Estúdio Horizonte', email: 'marina@example.test', phone: '11999990000', segment: 'Design', notes: 'Indicação' },
    });
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.data));
    client = created.data;
    assert.ok(client.id);
    const updated = expectSuccess(await owner.request(`/api/clients/${client.id}`, {
      method: 'PATCH', body: { notes: 'Reunião agendada', company: 'Horizonte Studio' },
    }));
    assert.equal(updated.company, 'Horizonte Studio');
    assert.equal(updated.name, 'Marina Costa');
    assert.equal(updated.notes, 'Reunião agendada');
  });

  await t.test('opportunities enforce amounts, stages and client ownership', async () => {
    expectRejected(await owner.request('/api/deals', {
      method: 'POST', body: { title: 'Inválido', clientId: client.id, amount: -1, stage: 'lead' },
    }));
    expectRejected(await owner.request('/api/deals', {
      method: 'POST', body: { title: 'Inválido', clientId: client.id, amount: 1000, stage: 'unsupported' },
    }));
    const result = await owner.request('/api/deals', {
      method: 'POST', body: { title: 'Consultoria de crescimento', clientId: client.id, amount: 2490, recurrence: 'monthly', stage: 'proposal', expectedClose: dateAfter(10), notes: 'Plano mensal' },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    deal = result.data;
    assert.equal(deal.amount, 2490);
    assert.equal(deal.recurrence, 'monthly');
  });

  await t.test('another tenant cannot read, modify or delete owner resources', async () => {
    const result = await other.request('/api/auth/register', {
      method: 'POST', body: { name: 'Bruno Lima', company: 'Outra Agência', email: otherEmail, password },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    const isolated = expectSuccess(await other.request('/api/workspace'));
    assert.equal(isolated.clients.length, 0);
    assert.equal(isolated.deals.length, 0);
    for (const [resource, id, body] of [
      ['clients', client.id, { name: 'Invasão' }],
      ['deals', deal.id, { stage: 'won' }],
    ]) {
      expectRejected(await other.request(`/api/${resource}/${id}`, { method: 'PATCH', body }), [404]);
      expectRejected(await other.request(`/api/${resource}/${id}`, { method: 'DELETE' }), [404]);
    }
    expectRejected(await other.request('/api/deals', {
      method: 'POST', body: { title: 'Referência indevida', clientId: client.id, amount: 1000, stage: 'lead' },
    }), [400, 404, 422]);
  });

  await t.test('proposal totals are calculated from line items, not trusted input', async () => {
    const result = await owner.request('/api/proposals', {
      method: 'POST', body: {
        title: 'Plano de crescimento Horizonte', clientId: client.id, dealId: deal.id,
        items: [{ description: 'Consultoria mensal', quantity: 1, unitPrice: 2490 }, { description: 'Implantação', quantity: 2, unitPrice: 250 }],
        message: 'Vamos crescer juntos.', validUntil: dateAfter(15), status: 'sent', total: 1,
      },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    proposal = result.data;
    assert.ok(proposal.publicToken);
    assert.equal(proposal.total, 2990);
    assert.equal(proposal.status, 'sent');
  });

  await t.test('public proposals expose the selected proposal without exposing workspace data', async () => {
    const result = expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}`));
    assert.equal(result.proposal.title, proposal.title);
    assert.equal(result.proposal.total, 2990);
    assert.equal(result.client.name, client.name);
    assert.equal(result.company, 'Aurora Consultoria');
    assert.equal(result.clients, undefined);
    assert.equal(result.user, undefined);
    for (const privateField of ['email', 'phone', 'notes', 'user_id', 'password_hash']) {
      assert.equal(result.client[privateField], undefined, `Public client must omit ${privateField}`);
    }
    expectRejected(await anonymous.request('/api/public/proposals/nonexistent-token'), [404]);
    expectRejected(await other.request(`/api/proposals/${proposal.id}`, { method: 'PATCH', body: { status: 'draft' } }), [404]);
    expectRejected(await other.request(`/api/proposals/${proposal.id}`, { method: 'DELETE' }), [404]);
  });

  await t.test('public acceptance records signer and moves associated deal to won', async () => {
    expectRejected(await anonymous.request(`/api/public/proposals/${proposal.publicToken}/accept`, {
      method: 'POST', body: { name: '' },
    }));
    expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}/accept`, {
      method: 'POST', body: { name: 'Marina Costa' },
    }));
    const workspace = expectSuccess(await owner.request('/api/workspace'));
    const accepted = workspace.proposals.find(item => item.id === proposal.id);
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.acceptedBy, 'Marina Costa');
    assert.ok(accepted.acceptedAt);
    assert.equal(workspace.deals.find(item => item.id === deal.id).stage, 'won');
    expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}/accept`, {
      method: 'POST', body: { name: 'Marina Costa' },
    }));
    const after = expectSuccess(await owner.request('/api/workspace'));
    assert.equal(after.proposals.length, workspace.proposals.length);
    assert.equal(after.deals.length, workspace.deals.length);
    expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}/accept`, {
      method: 'POST', body: { name: 'Outro nome' },
    }));
    const immutable = expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}`));
    assert.equal(immutable.proposal.acceptedBy, 'Marina Costa');
    assert.equal(immutable.proposal.acceptedAt, accepted.acceptedAt);
    expectRejected(await owner.request(`/api/proposals/${proposal.id}`, {
      method: 'PATCH', body: { status: 'sent', title: 'Tentativa de alteração' },
    }), [409]);
    expectRejected(await owner.request(`/api/proposals/${proposal.id}`, { method: 'DELETE' }), [409]);
  });

  await t.test('draft and expired proposals cannot be accepted', async () => {
    for (const [status, validUntil] of [['draft', dateAfter(15)], ['sent', dateAfter(-2)]]) {
      const result = await owner.request('/api/proposals', {
        method: 'POST', body: {
          title: `Proteção ${status}`, clientId: client.id,
          items: [{ description: 'Serviço', quantity: 1, unitPrice: 100 }], status, validUntil,
        },
      });
      assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
      expectRejected(await anonymous.request(`/api/public/proposals/${result.data.publicToken}/accept`, {
        method: 'POST', body: { name: 'Marina Costa' },
      }), [400, 403, 404, 409, 410, 422]);
    }
  });

  await t.test('invalid proposal items and cross-tenant references are rejected', async () => {
    for (const items of [[], [{ description: 'Erro', quantity: 0, unitPrice: 10 }], [{ description: 'Erro', quantity: 1, unitPrice: -1 }]]) {
      expectRejected(await owner.request('/api/proposals', {
        method: 'POST', body: { title: 'Inválida', clientId: client.id, items },
      }));
    }
    expectRejected(await other.request('/api/proposals', {
      method: 'POST', body: { title: 'Referência indevida', clientId: client.id, items: [{ description: 'Serviço', quantity: 1, unitPrice: 100 }] },
    }), [400, 404, 422]);
  });

  await t.test('follow-up tasks support creation, completion and tenant isolation', async () => {
    const result = await owner.request('/api/tasks', {
      method: 'POST', body: { title: 'Fazer onboarding da Horizonte', dueDate: dateAfter(2), clientId: client.id, dealId: deal.id },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    task = result.data;
    assert.equal(task.done, false);
    const completed = expectSuccess(await owner.request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { done: true } }));
    assert.equal(completed.done, true);
    expectRejected(await other.request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { done: false } }), [404]);
    expectRejected(await other.request(`/api/tasks/${task.id}`, { method: 'DELETE' }), [404]);
    assert.equal(expectSuccess(await other.request('/api/workspace')).tasks.length, 0);
  });

  await t.test('proposal and task associations reject mismatched clients and foreign deals', async () => {
    const extraClientResponse = await owner.request('/api/clients', { method: 'POST', body: { name: 'Outro cliente próprio' } });
    assert.ok([200, 201].includes(extraClientResponse.status), JSON.stringify(extraClientResponse.data));
    const extraClient = extraClientResponse.data;
    for (const [resource, body] of [
      ['proposals', { title: 'Associação inválida', items: [{ description: 'Serviço', quantity: 1, unitPrice: 100 }] }],
      ['tasks', { title: 'Associação inválida' }],
    ]) {
      expectRejected(await owner.request(`/api/${resource}`, {
        method: 'POST', body: { ...body, clientId: extraClient.id, dealId: deal.id },
      }), [400, 404, 422]);
      expectRejected(await other.request(`/api/${resource}`, {
        method: 'POST', body: { ...body, clientId: null, dealId: deal.id },
      }), [400, 404, 422]);
    }
    expectRejected(await owner.request(`/api/deals/${deal.id}`, {
      method: 'PATCH', body: { clientId: extraClient.id },
    }), [409]);
    assert.equal(expectSuccess(await owner.request(`/api/deals/${deal.id}`)).clientId, client.id);
    expectSuccess(await owner.request(`/api/clients/${extraClient.id}`, { method: 'DELETE' }));
  });

  await t.test('deleting referenced resources preserves sales history and clears optional references', async () => {
    expectRejected(await owner.request(`/api/clients/${client.id}`, { method: 'DELETE' }), [409]);
    const extraDealResponse = await owner.request('/api/deals', {
      method: 'POST', body: { title: 'Oportunidade temporária', clientId: client.id, amount: 1000 },
    });
    assert.ok([200, 201].includes(extraDealResponse.status), JSON.stringify(extraDealResponse.data));
    const extraDeal = extraDealResponse.data;
    const extraProposalResponse = await owner.request('/api/proposals', {
      method: 'POST', body: {
        title: 'Rascunho temporário', clientId: client.id, dealId: extraDeal.id,
        items: [{ description: 'Serviço', quantity: 1, unitPrice: 1000 }], status: 'draft',
      },
    });
    assert.ok([200, 201].includes(extraProposalResponse.status), JSON.stringify(extraProposalResponse.data));
    const extraTaskResponse = await owner.request('/api/tasks', {
      method: 'POST', body: { title: 'Retomar oportunidade temporária', clientId: client.id, dealId: extraDeal.id },
    });
    assert.ok([200, 201].includes(extraTaskResponse.status), JSON.stringify(extraTaskResponse.data));
    expectSuccess(await owner.request(`/api/deals/${extraDeal.id}`, { method: 'DELETE' }));
    const workspace = expectSuccess(await owner.request('/api/workspace'));
    assert.equal(workspace.proposals.find(item => item.id === extraProposalResponse.data.id).dealId, null);
    assert.equal(workspace.tasks.find(item => item.id === extraTaskResponse.data.id).dealId, null);
    assert.equal(workspace.proposals.find(item => item.id === proposal.id).status, 'accepted');
    expectSuccess(await owner.request(`/api/proposals/${extraProposalResponse.data.id}`, { method: 'DELETE' }));
    expectSuccess(await owner.request(`/api/tasks/${extraTaskResponse.data.id}`, { method: 'DELETE' }));
  });

  await t.test('revenue settings persist independently for each tenant', async () => {
    const result = expectSuccess(await owner.request('/api/settings', {
      method: 'PATCH', body: { annualGoal: 1_200_000, monthlyTicket: 1490 },
    }));
    assert.equal(result.annualGoal, 1_200_000);
    assert.equal(result.monthlyTicket, 1490);
    expectRejected(await owner.request('/api/settings', { method: 'PATCH', body: { annualGoal: -1 } }));
    const otherWorkspace = expectSuccess(await other.request('/api/workspace'));
    assert.equal(otherWorkspace.settings.annualGoal, 1_000_000);
    assert.equal(otherWorkspace.settings.monthlyTicket, 997);
  });

  await t.test('disposable records can be deleted without affecting other data', async () => {
    const result = await owner.request('/api/clients', { method: 'POST', body: { name: 'Cliente temporário' } });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    expectSuccess(await owner.request(`/api/clients/${result.data.id}`, { method: 'DELETE' }));
    const workspace = expectSuccess(await owner.request('/api/workspace'));
    assert.ok(workspace.clients.some(item => item.id === client.id));
    assert.ok(!workspace.clients.some(item => item.id === result.data.id));
    expectSuccess(await owner.request(`/api/tasks/${task.id}`, { method: 'DELETE' }));
    assert.ok(!expectSuccess(await owner.request('/api/workspace')).tasks.some(item => item.id === task.id));
  });

  await t.test('demo sessions are isolated, seeded, and labeled as demo', async () => {
    const demoA = browser(runtime);
    const demoB = browser(runtime);
    const first = await demoA.request('/api/auth/demo', { method: 'POST', body: {} });
    const second = await demoB.request('/api/auth/demo', { method: 'POST', body: {} });
    assert.ok([200, 201].includes(first.status), JSON.stringify(first.data));
    assert.ok([200, 201].includes(second.status), JSON.stringify(second.data));
    assert.equal(first.data.user.isDemo, true);
    assert.notEqual(first.data.user.id, second.data.user.id);
    const workspaceA = expectSuccess(await demoA.request('/api/workspace'));
    const workspaceB = expectSuccess(await demoB.request('/api/workspace'));
    assert.ok(workspaceA.clients.length > 0);
    assert.ok(workspaceA.deals.some(item => item.stage === 'won' && item.recurrence === 'monthly'));
    assert.ok(workspaceA.proposals.length > 0);
    assert.ok(workspaceA.tasks.length > 0);
    assert.ok(!workspaceB.clients.some(item => item.id === workspaceA.clients[0].id));
    expectRejected(await demoB.request(`/api/clients/${workspaceA.clients[0].id}`, {
      method: 'PATCH', body: { name: 'Tentativa de invasão' },
    }), [404]);
    assert.equal(expectSuccess(await owner.request('/api/workspace')).clients.length, 1);
  });

  await t.test('unknown API endpoints return JSON errors rather than the frontend shell', async () => {
    const result = await anonymous.request('/api/unknown-endpoint');
    expectRejected(result, [404]);
    assert.match(result.headers.get('content-type'), /application\/json/);
  });

  await t.test('database survives restart, including users, opportunities and accepted proposals', async () => {
    await runtime.close();
    runtime = await start(dbPath);
    owner = browser(runtime);
    anonymous = browser(runtime);
    expectSuccess(await owner.request('/api/auth/login', { method: 'POST', body: { email, password } }));
    const workspace = expectSuccess(await owner.request('/api/workspace'));
    assert.equal(workspace.clients.find(item => item.id === client.id).company, 'Horizonte Studio');
    assert.equal(workspace.deals.find(item => item.id === deal.id).stage, 'won');
    assert.equal(workspace.proposals.find(item => item.id === proposal.id).acceptedBy, 'Marina Costa');
    assert.equal(workspace.settings.monthlyTicket, 1490);
    const publicView = expectSuccess(await anonymous.request(`/api/public/proposals/${proposal.publicToken}`));
    assert.equal(publicView.proposal.status, 'accepted');
  });
});
