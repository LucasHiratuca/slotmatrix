import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Usuario/.gemini/antigravity/brain/262fd821-b669-41d9-9b2f-180042f21b0f';
const BASE_URL = 'http://localhost:18174';

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('slotmatrix_theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
  await page.waitForTimeout(180);
}

async function run() {
  const browser = await chromium.launch();

  // 1. Login screenshots across 390px, 1280px, 1440px, 1920px in Light and Dark
  const loginViewports = [
    { name: '390', width: 390, height: 844 },
    { name: '1280', width: 1280, height: 860 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1920', width: 1920, height: 1080 },
  ];

  for (const vp of loginViewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    // Check 390px button visibility without scrolling
    if (vp.name === '390') {
      const btnBox = await page.getByRole('button', { name: /^Entrar$/i }).boundingBox();
      console.log('[390px Entrar button boundingBox]:', btnBox);
    }

    // Check 1920px right panel alignment (title, illustration, proofs left x)
    if (vp.name === '1920' || vp.name === '1440') {
      const boxes = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="login-brand-column"]');
        if (!container) return null;
        const children = Array.from(container.children).map((el) => {
          const r = el.getBoundingClientRect();
          return { testId: el.getAttribute('data-testid'), left: Math.round(r.left), width: Math.round(r.width) };
        });
        return children;
      });
      console.log(`[${vp.name}px right column children left x]:`, JSON.stringify(boxes));
    }

    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `etapa0_login_${theme}_${vp.name}.png`),
      });
    }
    await context.close();
  }

  // 2. Login error state & keyboard focus state in 1440px (Light & Dark)
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // Keyboard focus state on email input
    await page.locator('#login-email-input').focus();
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.locator('#login-email-input').focus();
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `etapa0_login_focus_${theme}_1440.png`),
      });
    }

    // Error state
    await page.locator('#login-email-input').fill('usuario.invalido@vitascan.test');
    await page.locator('#login-password-input').fill('SenhaIncorreta123');
    await page.getByRole('button', { name: /^Entrar$/i }).click();
    await page.waitForSelector('[role="alert"]');
    await page.waitForTimeout(200);

    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `etapa0_login_error_${theme}_1440.png`),
      });
    }
    await context.close();
  }

  // 3. Login with prefers-reduced-motion: reduce
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await setTheme(page, 'light');
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'etapa0_login_reduced_motion_light_1440.png'),
    });
    await context.close();
  }

  // 4. Post-login screens in 1440px, 390px, and 1900px (Light & Dark)
  const appContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const appPage = await appContext.newPage();
  await appPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await appPage.evaluate(() => document.fonts.ready);

  // Open demo accordion & click demo button to login as Dra. Renata Silveira
  await appPage.getByText(/Explorar com uma conta de demonstração/i).click();
  await appPage.getByText(/VitaScan Diagnósticos \(Proprietário\(a\) · Plano Pro\)/i).click();
  await appPage.waitForSelector('[data-testid="plan-usage-bar"]');
  await appPage.waitForTimeout(400);

  // Verify word spacing in Chromium Canvas post-fix
  const spacingCheck = await appPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '600 18px "Instrument Sans", sans-serif';
    return {
      spaceWidth18px: ctx.measureText(' ').width,
      headerSairVisible: !!document.querySelector('header button[title="Encerrar sessão"]'),
    };
  });
  console.log('[Spacing check]:', spacingCheck);

  const pagesToCapture = [
    { key: 'overview', navLabel: /^Visão geral$/i, captureMobile: true },
    { key: 'agenda', navLabel: /^Agenda$/i, captureMobile: true },
    { key: 'bookings', navLabel: /^Reservas/i, captureMobile: true },
    { key: 'waitlist', navLabel: /^Lista de espera/i, captureMobile: true },
    { key: 'resources', navLabel: /^Recursos/i, captureMobile: false },
    { key: 'procedures', navLabel: /^Procedimentos/i, captureMobile: false },
    { key: 'billing', navLabel: /^Plano e cobrança/i, captureMobile: false },
    { key: 'audit', navLabel: /^Auditoria/i, captureMobile: false },
  ];

  // Capture 1900px header check first on Agenda
  await appPage.setViewportSize({ width: 1900, height: 980 });
  await appPage.getByRole('button', { name: /^Agenda$/i }).click();
  await appPage.waitForTimeout(350);
  // Blur active element to prove no focus outline on active sidebar item
  for (const theme of ['light', 'dark']) {
    await setTheme(appPage, theme);
    await appPage.screenshot({
      path: path.join(ARTIFACT_DIR, `etapa0_shell_${theme}_1900.png`),
    });
  }

  for (const item of pagesToCapture) {
    await appPage.setViewportSize({ width: 1440, height: 900 });
    await appPage.getByRole('button', { name: item.navLabel }).click();
    await appPage.waitForTimeout(350);

    for (const theme of ['light', 'dark']) {
      await setTheme(appPage, theme);
      await appPage.screenshot({
        path: path.join(ARTIFACT_DIR, `etapa0_${item.key}_${theme}_1440.png`),
      });
    }

    if (item.captureMobile) {
      await appPage.setViewportSize({ width: 390, height: 844 });
      await appPage.waitForTimeout(250);
      for (const theme of ['light', 'dark']) {
        await setTheme(appPage, theme);
        await appPage.screenshot({
          path: path.join(ARTIFACT_DIR, `etapa0_${item.key}_${theme}_390.png`),
        });
      }
    }
  }

  await appContext.close();
  await browser.close();
  console.log('ALL ETAPA 0 SCREENSHOTS CAPTURED SUCCESSFULLY.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
