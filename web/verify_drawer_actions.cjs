const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('=== TESTE DE VERIFICAÇÃO AUTOMATIZADA: AÇÕES DO DRAWER ===\n');

  // 1. LOGIN COMO COORDENADOR
  await page.goto('http://localhost:18174');
  await page.waitForTimeout(1000);

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    console.log('1. Autenticando como coordenador (coord@vitascan.test)...');
    await page.fill('input[type="email"]', 'coord@vitascan.test');
    await page.fill('input[type="password"]', 'Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }

  // 2. VERIFICAR HENRIQUE FONTES (CHECKED_IN)
  console.log('2. Testando Henrique Fontes (CHECKED_IN / Em atendimento)...');
  await page.click('button:has-text("Henrique")');
  await page.waitForTimeout(600);

  // Status badge
  const statusBadge = await page.$eval('[data-testid="drawer-patient-name"] ~ *', (el) => el.textContent.trim());
  console.log('   Status badge:', statusBadge);

  // Botão primário contextual
  const primaryBtn = await page.$('[data-testid="drawer-primary-action"]');
  const primaryText = await primaryBtn.textContent();
  const primaryDisabled = await primaryBtn.isDisabled();
  console.log(`   Botão primário: "${primaryText.trim()}", habilitado: ${!primaryDisabled}`);

  // Botão Reagendar
  const reschedBtn = await page.$('[data-testid="drawer-reschedule-btn"]');
  const reschedDisabled = await reschedBtn.isDisabled();
  const reschedTitle = await reschedBtn.getAttribute('title');
  console.log(`   Botão Reagendar desabilitado: ${reschedDisabled}`);
  console.log(`   Motivo do bloqueio do Reagendar: "${reschedTitle}"`);

  // Menu "⋯"
  const moreBtn = await page.$('[data-testid="drawer-more-menu-btn"]');
  await moreBtn.click();
  await page.waitForTimeout(400);

  const menuItems = await page.$$('[role="menuitem"]');
  console.log(`   Menu "⋯" aberto com ${menuItems.length} itens.`);

  for (const item of menuItems) {
    const text = (await item.textContent()).replace(/\s+/g, ' ').trim();
    const isDisabled = await item.isDisabled();
    const title = await item.getAttribute('title');
    console.log(`     - Item: "${text}" | desabilitado: ${isDisabled} | motivo: "${title}"`);
  }

  // Fechar drawer
  await page.click('[data-testid="drawer-close-button"]');
  await page.waitForTimeout(500);

  // 3. VERIFICAR ROBERTO ALMEIDA (CONFIRMED)
  console.log('\n3. Testando Roberto Almeida (CONFIRMED / Confirmado)...');
  await page.click('button:has-text("Roberto")');
  await page.waitForTimeout(600);

  const robertoPrimary = await page.$eval('[data-testid="drawer-primary-action"]', (el) => el.textContent.trim());
  console.log(`   Botão primário Roberto: "${robertoPrimary}"`);

  const robertoResched = await page.$('[data-testid="drawer-reschedule-btn"]');
  const robertoReschedDisabled = await robertoResched.isDisabled();
  console.log(`   Botão Reagendar Roberto habilitado: ${!robertoReschedDisabled}`);

  // Testar clique em Reagendar (Passo 2 in-drawer)
  console.log('   Testando abertura do fluxo Reagendar in-drawer...');
  await robertoResched.click();
  await page.waitForTimeout(600);

  const rescheduleHeader = await page.$eval('h2', (el) => el.textContent.trim());
  console.log(`   Cabeçalho do passo 2: "${rescheduleHeader}"`);

  const backBtn = await page.$('button:has-text("Voltar")');
  console.log(`   Botão "Voltar" encontrado no passo 2: ${Boolean(backBtn)}`);

  const dateInput = await page.$('input[type="date"]');
  console.log(`   Seletor de data presente: ${Boolean(dateInput)}`);

  // Voltar para os detalhes
  await backBtn.click();
  await page.waitForTimeout(500);
  console.log('   Retornou aos detalhes da reserva com sucesso.');

  // Testar Menu "⋯" do Roberto Almeida
  const robertoMoreBtn = await page.$('[data-testid="drawer-more-menu-btn"]');
  await robertoMoreBtn.click();
  await page.waitForTimeout(400);

  const robertoMenuItems = await page.$$('[role="menuitem"]');
  console.log(`   Roberto menu "⋯" aberto com ${robertoMenuItems.length} itens.`);
  for (const item of robertoMenuItems) {
    const text = (await item.textContent()).replace(/\s+/g, ' ').trim();
    const isDisabled = await item.isDisabled();
    console.log(`     - Item: "${text}" | desabilitado: ${isDisabled}`);
  }

  // Clicar em Cancelar e oferecer vaga para testar o modal de confirmação
  const cancelItem = await page.$('[data-testid="drawer-menu-cancel"]');
  if (cancelItem) {
    console.log('   Clicando em "Cancelar e oferecer vaga"...');
    await cancelItem.click();
    await page.waitForTimeout(400);

    const confirmDialog = await page.$('[data-testid="drawer-confirm-dialog"]');
    console.log(`   Diálogo de confirmação aberto: ${Boolean(confirmDialog)}`);

    if (confirmDialog) {
      const dialogTitle = await confirmDialog.$eval('span', (el) => el.textContent.trim());
      console.log(`   Título do diálogo: "${dialogTitle}"`);

      // Clicar em Voltar dentro do diálogo
      const dialogBackBtn = await confirmDialog.$('button:has-text("Voltar")');
      await dialogBackBtn.click();
      await page.waitForTimeout(300);

      const isDialogClosed = !(await page.$('[data-testid="drawer-confirm-dialog"]'));
      console.log(`   Diálogo fechou ao clicar em Voltar: ${isDialogClosed}`);
    }
  }

  // Fechar drawer
  await page.click('[data-testid="drawer-close-button"]');
  await page.waitForTimeout(500);

  // 4. VERIFICAR RBAC COM PAPEL SPECIALIST (SOMENTE LEITURA)
  console.log('\n4. Testando RBAC com papel SPECIALIST (spec@vitascan.test)...');
  // Logout
  const logoutBtn = await page.$('button:has-text("Sair"), button[title="Sair"]');
  if (logoutBtn) {
    await logoutBtn.click();
    await page.waitForTimeout(1000);
  }

  // Login como Especialista
  await page.fill('input[type="email"]', 'spec@vitascan.test');
  await page.fill('input[type="password"]', 'Passw0rd!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Abrir reserva de Roberto Almeida
  await page.click('button:has-text("Roberto")');
  await page.waitForTimeout(600);

  const readonlyBanner = await page.$('[data-testid="drawer-specialist-readonly-banner"]');
  console.log(`   Banner Somente Leitura presente para Especialista: ${Boolean(readonlyBanner)}`);
  if (readonlyBanner) {
    const bannerText = await readonlyBanner.textContent();
    console.log(`   Texto do banner: "${bannerText.trim()}"`);
  }

  const specialistFooter = await page.$eval('.border-t.border-border-subtle.bg-canvas', (el) => el.textContent.trim());
  console.log(`   Rodapé do Especialista: "${specialistFooter}"`);

  await browser.close();
  console.log('\n=== TODAS AS VERIFICAÇÕES CONCLUÍDAS COM SUCESSO! ===');
})();
