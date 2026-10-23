import express from 'express';
import { createHash, randomBytes, randomUUID, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, now, userJson, clientJson, dealJson, proposalJson, taskJson } from './database.mjs';

const scrypt = promisify(rawScrypt);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'pairon_session';
const DAY = 86400000;
const stages = ['lead', 'proposal', 'negotiation', 'won', 'lost'];
const serializers = { clients: clientJson, deals: dealJson, proposals: proposalJson, tasks: taskJson };
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const digest = value => createHash('sha256').update(value).digest('hex');
const dateOffset = days => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const text = (value, name, { required = false, max = 200 } = {}) => {
  if (value == null) value = '';
  if (typeof value !== 'string') fail(400, `${name}: informe um texto válido.`);
  const clean = value.trim();
  if (required && !clean) fail(400, `${name} é obrigatório.`);
  if (clean.length > max) fail(400, `${name} deve ter até ${max} caracteres.`);
  return clean;
};
const money = (value, name, min = 0, max = 1e9) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(400, `${name}: informe um número entre ${min} e ${max}.`);
  }
  return Math.round(value * 100) / 100;
};
const date = (value, name) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${name}: use uma data válida.`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, `${name}: use uma data válida.`);
  return value;
};
const choice = (value, values, name) => {
  if (!values.includes(value)) fail(400, `${name} inválido.`);
  return value;
};
const email = (value, required = false) => {
  const clean = text(value, 'E-mail', { required, max: 254 }).toLowerCase();
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) fail(400, 'Informe um e-mail válido.');
  return clean;
};
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, encoded) {
  const [salt, hash] = (encoded || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail(400, 'A senha deve ter entre 8 e 128 caracteres.');
  return value;
}

export function createApp({ dbPath = process.env.DB_PATH || resolve(ROOT, '.data/pairon.sqlite'), secureCookies = false } = {}) {
  const db = openDatabase(dbPath);
  const app = express();
  let configuredOrigin = null;
  if (process.env.APP_ORIGIN) {
    try {
      const parsed = new URL(process.env.APP_ORIGIN);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== process.env.APP_ORIGIN) throw new Error();
      configuredOrigin = parsed.origin;
    } catch {
      db.close();
      throw new Error('APP_ORIGIN deve conter uma origem HTTP(S) exata, sem caminho ou barra final.');
    }
  }
  app.locals.db = db;
  app.locals.close = () => db.close();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
    }
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({ error: 'Origem da solicitação não permitida.' }); }
      if (req.headers.origin !== origin.origin) return res.status(403).json({ error: 'Origem da solicitação não permitida.' });
      const sameHost = origin.origin === `${req.protocol}://${req.get('host')}`;
      const localDev = process.env.NODE_ENV !== 'production' && ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001'].includes(origin.origin);
      const configured = configuredOrigin && origin.origin === configuredOrigin;
      if (!(sameHost || localDev || configured)) return res.status(403).json({ error: 'Origem da solicitação não permitida.' });
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      return res.status(400).json({ error: 'Envie um objeto JSON válido.' });
    }
    req.body ||= {};
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${TOKEN}=`));
    if (cookie) {
      const sessionToken = cookie.slice(TOKEN.length + 1);
      if (/^[a-f0-9]{64}$/.test(sessionToken)) {
        req.sessionHash = digest(sessionToken);
        req.user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(req.sessionHash, now());
      }
    }
    next();
  });

  const rateLimits = new Map();
  const limiter = (scope, limit, windowMs) => (req, res, next) => {
    const key = `${scope}:${req.ip}`;
    const currentTime = Date.now();
    if (rateLimits.size > 5000) for (const [key, value] of rateLimits) if (value.until < currentTime) rateLimits.delete(key);
    let entry = rateLimits.get(key);
    if (!entry || entry.until < currentTime) { entry = { count: 0, until: currentTime + windowMs }; rateLimits.set(key, entry); }
    entry.count++;
    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.until - currentTime) / 1000));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    next();
  };
  const auth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    next();
  };
  const setSession = (res, req, userId, isDemo = false) => {
    const raw = randomBytes(32).toString('hex');
    const lifetime = (isDemo ? 2 : 7) * DAY;
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(raw), userId, new Date(Date.now() + lifetime).toISOString());
    res.cookie(TOKEN, raw, { httpOnly: true, sameSite: 'lax', secure: secureCookies || req.secure, path: '/', maxAge: lifetime });
  };
  const owned = (table, id, userId) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, userId);
    if (!row) fail(404, 'Registro não encontrado.');
    return row;
  };
  const reference = (table, id, userId, optional = false) => {
    if (optional && (id == null || id === '')) return null;
    if (typeof id !== 'string') fail(400, 'Selecione um registro válido.');
    owned(table, id, userId);
    return id;
  };
  const transaction = callback => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = callback(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };

  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'ok' });
  });
  app.get('/api/session', (req, res) => res.json({ user: userJson(req.user) || null }));
  app.post('/api/auth/register', limiter('register', 15, 15 * 60000), async (req, res, next) => {
    try {
      const name = text(req.body.name, 'Nome', { required: true });
      const company = text(req.body.company, 'Empresa', { required: true });
      const userEmail = email(req.body.email, true);
      const rawPassword = password(req.body.password);
      if (db.prepare('SELECT id FROM users WHERE email=?').get(userEmail)) fail(409, 'Este e-mail já está cadastrado. Entre na sua conta.');
      const encoded = await hashPassword(rawPassword);
      const userId = randomUUID();
      transaction(() => {
        db.prepare('INSERT INTO users(id,name,email,company,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(userId, name, userEmail, company, encoded, now());
        db.prepare('INSERT INTO settings(user_id) VALUES(?)').run(userId);
      });
      setSession(res, req, userId);
      res.status(201).json({ user: userJson(db.prepare('SELECT * FROM users WHERE id=?').get(userId)) });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/login', limiter('login', 15, 15 * 60000), async (req, res, next) => {
    try {
      const userEmail = email(req.body.email, true);
      const rawPassword = password(req.body.password);
      const user = db.prepare('SELECT * FROM users WHERE email=? AND is_demo=0').get(userEmail);
      if (!(await checkPassword(rawPassword, user?.password_hash)) || !user) fail(401, 'E-mail ou senha incorretos.');
      setSession(res, req, user.id);
      res.json({ user: userJson(user) });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
    res.clearCookie(TOKEN, { httpOnly: true, sameSite: 'lax', secure: secureCookies || req.secure, path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/auth/demo', limiter('demo', 15, 60000), (req, res) => {
    const userId = randomUUID();
    transaction(() => {
      db.prepare('INSERT INTO users(id,name,email,company,is_demo,created_at) VALUES(?,?,?,?,1,?)').run(userId, 'Marina Costa', `demo-${userId}@example.invalid`, 'Estúdio Aurora', now());
      db.prepare('INSERT INTO settings(user_id,annual_goal,monthly_ticket) VALUES(?,1000000,1490)').run(userId);
      seedDemo(db, userId);
    });
    setSession(res, req, userId, true);
    res.status(201).json({ user: userJson(db.prepare('SELECT * FROM users WHERE id=?').get(userId)) });
  });
  app.get('/api/workspace', auth, (req, res) => {
    const result = { user: userJson(req.user) };
    for (const [table, serializer] of Object.entries(serializers)) {
      result[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY created_at DESC, rowid DESC`).all(req.user.id).map(serializer);
    }
    const settings = db.prepare('SELECT * FROM settings WHERE user_id=?').get(req.user.id);
    result.settings = { annualGoal: settings.annual_goal, monthlyTicket: settings.monthly_ticket };
    res.json(result);
  });
  app.patch('/api/settings', auth, (req, res) => {
    const existing = db.prepare('SELECT * FROM settings WHERE user_id=?').get(req.user.id);
    const annualGoal = req.body.annualGoal === undefined ? existing.annual_goal : money(req.body.annualGoal, 'Meta anual', 1, 1e12);
    const monthlyTicket = req.body.monthlyTicket === undefined ? existing.monthly_ticket : money(req.body.monthlyTicket, 'Ticket mensal', 1, 1e9);
    db.prepare('UPDATE settings SET annual_goal=?,monthly_ticket=? WHERE user_id=?').run(annualGoal, monthlyTicket, req.user.id);
    res.json({ annualGoal, monthlyTicket });
  });

  const sanitize = (table, body, userId, previous = {}) => {
    const data = { ...previous, ...body };
    if (table === 'clients') return {
      name: text(data.name, 'Nome', { required: true }), company: text(data.company, 'Empresa'),
      email: email(data.email), phone: text(data.phone, 'Telefone', { max: 50 }),
      segment: text(data.segment, 'Segmento'), notes: text(data.notes, 'Observações', { max: 10000 }),
    };
    if (table === 'deals') return {
      title: text(data.title, 'Título', { required: true }), client_id: reference('clients', data.clientId, userId),
      amount: money(data.amount, 'Valor'), recurrence: choice(data.recurrence ?? 'monthly', ['monthly', 'one_time'], 'Recorrência'),
      stage: choice(data.stage ?? 'lead', stages, 'Etapa'), expected_close: date(data.expectedClose ?? dateOffset(0), 'Fechamento previsto'),
      notes: text(data.notes, 'Observações', { max: 10000 }),
    };
    if (table === 'proposals') {
      const clientId = reference('clients', data.clientId, userId);
      const dealId = reference('deals', data.dealId, userId, true);
      if (dealId && owned('deals', dealId, userId).client_id !== clientId) fail(400, 'A oportunidade deve pertencer ao mesmo cliente.');
      if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 50) fail(400, 'Adicione de 1 a 50 itens à proposta.');
      const items = data.items.map(item => {
        if (!item || typeof item !== 'object') fail(400, 'Item de proposta inválido.');
        return { description: text(item.description, 'Descrição do item', { required: true, max: 500 }), quantity: money(item.quantity, 'Quantidade', 0.01, 1e6), unitPrice: money(item.unitPrice, 'Preço unitário') };
      });
      if (items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) > 1e12) fail(400, 'O valor total da proposta excede o limite.');
      return {
        title: text(data.title, 'Título', { required: true }), client_id: clientId, deal_id: dealId,
        items: JSON.stringify(items), message: text(data.message, 'Mensagem', { max: 10000 }),
        valid_until: date(data.validUntil ?? dateOffset(30), 'Validade'),
        status: choice(data.status ?? 'draft', ['draft', 'sent', 'declined'], 'Status'),
      };
    }
    if (table === 'tasks') {
      if (data.done !== undefined && typeof data.done !== 'boolean') fail(400, 'Conclusão da tarefa inválida.');
      const clientId = reference('clients', data.clientId, userId, true);
      const dealId = reference('deals', data.dealId, userId, true);
      if (clientId && dealId && owned('deals', dealId, userId).client_id !== clientId) fail(400, 'A oportunidade deve pertencer ao mesmo cliente.');
      return {
        title: text(data.title, 'Título', { required: true }), client_id: clientId, deal_id: dealId,
        due_date: date(data.dueDate ?? dateOffset(0), 'Prazo'), done: data.done ? 1 : 0,
      };
    }
  };
  for (const [table, serialize] of Object.entries(serializers)) {
    app.get(`/api/${table}`, auth, (req, res) => res.json(db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY created_at DESC,rowid DESC`).all(req.user.id).map(serialize)));
    app.get(`/api/${table}/:id`, auth, (req, res) => res.json(serialize(owned(table, req.params.id, req.user.id))));
    app.post(`/api/${table}`, auth, (req, res) => {
      const clean = sanitize(table, req.body, req.user.id);
      const timestamp = now();
      const id = randomUUID();
      const values = { id, user_id: req.user.id, ...clean, created_at: timestamp, updated_at: timestamp };
      if (table === 'proposals') values.public_token = randomBytes(24).toString('hex');
      const keys = Object.keys(values);
      db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(values));
      res.status(201).json(serialize(owned(table, id, req.user.id)));
    });
    app.patch(`/api/${table}/:id`, auth, (req, res) => {
      const existing = owned(table, req.params.id, req.user.id);
      if (table === 'proposals' && existing.status === 'accepted') fail(409, 'Propostas aceitas não podem ser alteradas. Crie uma nova versão.');
      const clean = sanitize(table, req.body, req.user.id, serialize(existing));
      if (table === 'deals' && clean.client_id !== existing.client_id) {
        const linkedProposal = db.prepare('SELECT id FROM proposals WHERE deal_id=? AND client_id<>? LIMIT 1').get(existing.id, clean.client_id);
        if (linkedProposal) fail(409, 'Esta oportunidade possui propostas vinculadas ao cliente atual. Remova os vínculos antes de trocar o cliente.');
      }
      clean.updated_at = now();
      db.prepare(`UPDATE ${table} SET ${Object.keys(clean).map(key => `${key}=?`).join(',')} WHERE id=? AND user_id=?`).run(...Object.values(clean), req.params.id, req.user.id);
      res.json(serialize(owned(table, req.params.id, req.user.id)));
    });
    app.delete(`/api/${table}/:id`, auth, (req, res) => {
      const existing = owned(table, req.params.id, req.user.id);
      if (table === 'proposals' && existing.status === 'accepted') fail(409, 'Uma proposta aceita deve ser preservada no histórico.');
      if (table === 'clients') {
        const linked = db.prepare('SELECT id FROM deals WHERE client_id=? UNION ALL SELECT id FROM proposals WHERE client_id=? LIMIT 1').get(req.params.id, req.params.id);
        if (linked) fail(409, 'Este cliente possui oportunidades ou propostas. Remova os vínculos antes de excluí-lo.');
      }
      db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(req.params.id, req.user.id);
      res.json({ ok: true });
    });
  }

  const publicProposal = token => {
    const row = db.prepare('SELECT * FROM proposals WHERE public_token=?').get(token);
    if (!row || row.status === 'draft') fail(404, 'Proposta não encontrada ou ainda não compartilhada.');
    return row;
  };
  app.get('/api/public/proposals/:token', (req, res) => {
    const row = publicProposal(req.params.token);
    const client = db.prepare('SELECT id,name,company FROM clients WHERE id=?').get(row.client_id);
    const provider = db.prepare('SELECT company FROM users WHERE id=?').get(row.user_id);
    res.json({ proposal: proposalJson(row), client, company: provider.company });
  });
  app.post('/api/public/proposals/:token/accept', limiter('accept', 60, 60000), (req, res) => {
    const row = publicProposal(req.params.token);
    if (row.status === 'accepted') return res.json(proposalJson(row));
    if (row.status !== 'sent') fail(409, 'Esta proposta não está disponível para aceite.');
    if (row.valid_until < dateOffset(0)) fail(410, 'A validade desta proposta encerrou. Solicite uma nova versão.');
    const name = text(req.body.name, 'Nome de quem aceita', { required: true });
    const timestamp = now();
    transaction(() => {
      db.prepare('UPDATE proposals SET status=?,accepted_at=?,accepted_by=?,updated_at=? WHERE id=?').run('accepted', timestamp, name, timestamp, row.id);
      if (row.deal_id) db.prepare('UPDATE deals SET stage=?,updated_at=? WHERE id=? AND user_id=?').run('won', timestamp, row.deal_id, row.user_id);
    });
    res.json(proposalJson(db.prepare('SELECT * FROM proposals WHERE id=?').get(row.id)));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  const dist = resolve(ROOT, 'dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitação muito grande.' });
    if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed: users.email/.test(error.message)) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    const status = error.status || 500;
    if (status >= 500) console.error('API error:', error.message);
    res.status(status).json({ error: status < 500 ? error.message : 'Não foi possível concluir a operação. Tente novamente.' });
  });
  return app;
}

function seedDemo(db, userId) {
  const timestamp = now();
  const companies = [
    ['Rafael Martins', 'Nuvem Studio', 'Design', 'rafael@nuvem.example'],
    ['Beatriz Lima', 'Forma Arquitetura', 'Arquitetura', 'bia@forma.example'],
    ['Lucas Oliveira', 'Verde Natural', 'Varejo', 'lucas@verde.example'],
    ['Camila Santos', 'Essência Clínica', 'Saúde', 'camila@essencia.example'],
    ['Pedro Almeida', 'Atlas Consultoria', 'Consultoria', 'pedro@atlas.example'],
    ['Julia Rocha', 'Café Botânico', 'Gastronomia', 'julia@botanico.example'],
    ['André Costa', 'Orbital Tech', 'Tecnologia', 'andre@orbital.example'],
    ['Sofia Ferreira', 'Viva Educação', 'Educação', 'sofia@viva.example'],
  ];
  const clientIds = companies.map(([name, company, segment, email]) => {
    const id = randomUUID();
    db.prepare('INSERT INTO clients VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, userId, name, company, email, '(11) 99999-0000', segment, 'Cliente fictício do ambiente de demonstração.', timestamp, timestamp);
    return id;
  });
  const deals = [
    ['Gestão de marca e conteúdo', 6900, 'won', 'monthly', -20],
    ['Posicionamento e redes sociais', 8500, 'won', 'monthly', -15],
    ['Marketing de performance', 4900, 'won', 'monthly', -10],
    ['Presença digital completa', 7800, 'won', 'monthly', -5],
    ['Consultoria de crescimento', 6500, 'negotiation', 'monthly', 4],
    ['Nova identidade visual', 12000, 'proposal', 'one_time', 7],
    ['Estratégia de lançamento', 8900, 'proposal', 'monthly', 10],
    ['Conteúdo e relacionamento', 3900, 'lead', 'monthly', 14],
  ];
  const dealIds = deals.map(([title, amount, stage, recurrence, offset], index) => {
    const id = randomUUID();
    const created = new Date(Date.now() - (40 - index * 3) * DAY).toISOString();
    db.prepare('INSERT INTO deals VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, userId, clientIds[index], title, amount, recurrence, stage, dateOffset(offset), 'Alinhar escopo e próximos passos com o cliente.', created, timestamp);
    return id;
  });
  for (const index of [4, 5, 6]) {
    const [title, amount] = deals[index];
    db.prepare('INSERT INTO proposals(id,user_id,client_id,deal_id,title,items,message,valid_until,status,public_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
      randomUUID(), userId, clientIds[index], dealIds[index], title,
      JSON.stringify([{ description: title, quantity: 1, unitPrice: amount }]),
      'Uma parceria pensada para transformar seus próximos objetivos em resultados. O escopo inclui planejamento, execução e acompanhamento mensal.',
      dateOffset(15), index === 6 ? 'draft' : 'sent', randomBytes(24).toString('hex'), timestamp, timestamp,
    );
  }
  const tasks = [
    ['Apresentar proposta para a Atlas', 0, false, 4],
    ['Enviar referências de identidade visual', 0, false, 5],
    ['Retomar conversa com a Orbital', 1, false, 6],
    ['Agendar diagnóstico com a Viva', 2, false, 7],
    ['Revisar relatório da Nuvem Studio', -1, true, 0],
  ];
  for (const [title, offset, done, index] of tasks) {
    db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(), userId, clientIds[index], dealIds[index], title, dateOffset(offset), done ? 1 : 0, timestamp, timestamp);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '0.0.0.0';
  const app = createApp();
  const server = app.listen(port, host, () => console.log(`Pairon API listening on ${host}:${port}`));
  const shutdown = () => server.close(() => { app.locals.close(); process.exit(0); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
