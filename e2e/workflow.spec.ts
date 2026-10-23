import { test, expect } from '@playwright/test';

test('a real account can create a client, send a proposal and record its acceptance', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /começar|criar minha conta/i }).first().click();
  const auth = page.getByRole('dialog');
  await auth.getByLabel('Seu nome', { exact: true }).fill('Ana Teste');
  await auth.getByLabel('Nome da agência ou consultoria').fill('Agência Teste Real');
  await auth.getByLabel('E-mail profissional').fill(`ana-${Date.now()}@example.test`);
  await auth.getByLabel('Senha', { exact: true }).fill('Senha-teste-2026!');
  await auth.getByRole('button', { name: 'Criar meu workspace' }).click();
  await expect(page.getByRole('heading', { name: /Bom te ver, Ana/ })).toBeVisible();
  await expect(page.getByText('Workspace de demonstração')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Nome do contato/).fill('Joana Silva');
  await dialog.getByLabel('Empresa', { exact: true }).fill('Horizonte Criativo');
  await dialog.getByLabel('E-mail', { exact: true }).fill('joana@example.test');
  await dialog.getByRole('button', { name: 'Criar cliente', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: /Horizonte Criativo/ })).toBeVisible();

  await page.getByRole('button', { name: 'Pipeline de vendas', exact: true }).click();
  await page.getByRole('button', { name: 'Novo negócio', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Nome da oportunidade/).fill('Consultoria Horizonte');
  await dialog.getByLabel(/^Cliente/).selectOption({ label: 'Horizonte Criativo · Joana Silva' });
  await dialog.getByLabel(/Valor \(R\$\)/).fill('2490');
  await dialog.getByRole('button', { name: 'Criar oportunidade', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Consultoria Horizonte', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Propostas', exact: true }).click();
  await page.getByRole('button', { name: 'Nova proposta', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Título da proposta/).fill('Plano Horizonte');
  await dialog.getByLabel(/^Cliente/).selectOption({ label: 'Horizonte Criativo · Joana Silva' });
  await dialog.getByLabel('Oportunidade vinculada').selectOption({ label: 'Consultoria Horizonte' });
  await dialog.getByLabel('Descrição do serviço 1', { exact: true }).fill('Consultoria mensal de crescimento');
  await dialog.getByLabel('Valor do serviço 1', { exact: true }).fill('2490');
  await dialog.getByRole('button', { name: 'Criar proposta', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: /^Plano Horizonte/ })).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const proposal = workspace.proposals.find((item: { title: string }) => item.title === 'Plano Horizonte');
  expect(proposal.status).toBe('sent');

  const buyerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  const buyer = await buyerContext.newPage();
  await buyer.goto(`/proposta/${proposal.publicToken}`);
  await expect(buyer.getByRole('heading', { name: 'Plano Horizonte', exact: true })).toBeVisible();
  await buyer.getByLabel(/nome/i).fill('Joana Silva');
  await buyer.getByRole('button', { name: /aceitar proposta/i }).click();
  await expect(buyer.getByText(/proposta aceita/i).first()).toBeVisible();
  await buyerContext.close();

  await page.reload();
  await page.getByRole('button', { name: 'Propostas', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Plano Horizonte' }).getByText('Aceita', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pipeline de vendas', exact: true }).click();
  await expect(page.getByLabel('Etapa de Consultoria Horizonte')).toHaveValue('won');

  await page.getByRole('button', { name: /^Tarefas/ }).click();
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Próximo passo/).fill('Agendar implantação');
  await dialog.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Concluir tarefa Agendar implantação' }).click();
  await expect(page.getByRole('button', { name: 'Reabrir tarefa Agendar implantação' })).toBeVisible();

  await page.getByRole('button', { name: 'Meta de receita', exact: true }).click();
  await page.getByLabel('Ticket mensal por cliente (R$)').fill('497');
  await page.getByRole('button', { name: 'Salvar minha meta' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/workspace')).json()).settings.monthlyTicket).toBe(497);
  await expect(page.getByText('168', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('demo is clearly identified and mobile navigation stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /explorar demonstração/i }).first().click();
  await expect(page.getByText('Workspace de demonstração', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bom te ver, Marina/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Por trás de cada contrato, pessoas.' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: /explorar demonstração/i }).first()).toBeVisible();
});

test('a private draft becomes shareable only after it is published', async ({ page, context }) => {
  const response = await page.request.post('/api/auth/demo');
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Propostas', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Estratégia de lançamento' });
  await expect(row.getByText('Rascunho', { exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: /Abrir proposta/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Copiar link/ })).toHaveCount(0);
  await row.getByRole('button', { name: /Editar proposta/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Disponibilidade').selectOption('sent');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('Enviada', { exact: true })).toBeVisible();
  const opened = context.waitForEvent('page');
  await row.getByRole('link', { name: /Abrir proposta/ }).click();
  const proposal = await opened;
  await expect(proposal.getByRole('heading', { name: 'Estratégia de lançamento', exact: true })).toBeVisible();
});
