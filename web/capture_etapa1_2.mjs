import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/Usuario/.gemini/antigravity/brain/262fd821-b669-41d9-9b2f-180042f21b0f';
const BASE_URL = 'http://localhost:18174';

async function main() {
  const browser = await chromium.launch();

  // 1. Gravar vídeo da animação de entrada (1x) do Login em 1440x900 (Tema Claro)
  const videoDir = path.join(ARTIFACT_DIR, 'scratch_video');
  fs.mkdirSync(videoDir, { recursive: true });
  const videoContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const videoPage = await videoContext.newPage();
  await videoPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await videoPage.waitForTimeout(1600);
  const videoPath = await videoPage.video().path();
  await videoContext.close();
  if (videoPath && fs.existsSync(videoPath)) {
    fs.copyFileSync(videoPath, path.join(ARTIFACT_DIR, 'etapa2_login_entry_animation.webm'));
  }

  // 2. Login 1440x900 (Claro e Escuro)
  const ctx1440 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page1440 = await ctx1440.newPage();
  await page1440.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(900);
  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa2_login_light_1440.png'),
    fullPage: false,
  });

  // Alternar para Tema Escuro
  await page1440.getByRole('button', { name: /Ativar tema escuro/i }).click();
  await page1440.waitForTimeout(350);
  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa2_login_dark_1440.png'),
    fullPage: false,
  });

  // Voltar para Tema Claro e fazer login como Dra. Renata Silveira (Shell 1440px)
  await page1440.getByRole('button', { name: /Ativar tema claro/i }).click();
  await page1440.waitForTimeout(200);
  await page1440.getByText('Explorar com uma conta de demonstração').click();
  await page1440.waitForTimeout(200);
  await page1440.getByText(/Dra\. Renata Silveira · Proprietária/i).click();
  await page1440.waitForSelector('[data-testid="plan-usage-bar"]', { timeout: 10000 });
  await page1440.waitForTimeout(600);

  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa1_shell_light_1440.png'),
    fullPage: false,
  });

  // Alternar Shell para Tema Escuro
  await page1440.getByRole('button', { name: /Ativar tema escuro/i }).click();
  await page1440.waitForTimeout(350);
  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa1_shell_dark_1440.png'),
    fullPage: false,
  });
  await ctx1440.close();

  // 3. Login 390x844 Mobile (Claro e Escuro) — verificar que o botão Entrar aparece sem rolar
  const ctx390 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page390 = await ctx390.newPage();
  await page390.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page390.waitForTimeout(500);

  const submitBox = await page390.getByRole('button', { name: /^Entrar$/i }).boundingBox();
  console.log('Mobile 390x844 Entrar button boundingBox:', submitBox);

  await page390.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa2_login_light_390.png'),
    fullPage: false,
  });

  await page390.getByRole('button', { name: /Ativar tema escuro/i }).click();
  await page390.waitForTimeout(350);
  await page390.screenshot({
    path: path.join(ARTIFACT_DIR, 'etapa2_login_dark_390.png'),
    fullPage: false,
  });

  await ctx390.close();
  await browser.close();
  console.log('All Etapa 1 & Etapa 2 screenshots and animation captured successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
