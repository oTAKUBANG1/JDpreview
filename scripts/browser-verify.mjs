// 浏览器端验收：跑一次 PDF 抽取 + 截图 OCR，并给桌面/手机各截一张图。
// 用法：先 node src/server.js，再 node scripts/browser-verify.mjs
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3080';
const OUT = process.env.SHOT_DIR ?? 'tmp';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`${BASE}/__import-test.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__DONE === true', { timeout: 120000 });
  const result = await page.$eval('#out', (el) => el.textContent);
  console.log(result);

  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 1200 });
  await desktop.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0', timeout: 60000 });
  await desktop.waitForSelector('#result:not([hidden])', { timeout: 30000 });
  await desktop.screenshot({ path: `${OUT}/shot-desktop.png` });

  // 格式体检
  await desktop.click('#previewBtn');
  await desktop.waitForSelector('#previewBody .preview-card', { timeout: 15000 }).catch(() => {});
  await desktop.screenshot({ path: `${OUT}/shot-preview.png` });

  // 档案：生成后截图
  await desktop.click('#profileBtn');
  await desktop.waitForSelector('#profileBody .profile-skill', { timeout: 20000 }).catch(() => {});
  await desktop.screenshot({ path: `${OUT}/shot-profile.png` });

  // 匹配矩阵 tab
  await desktop.click('[data-tab="matrix-tab"]');
  await desktop.waitForSelector('#matrix table', { timeout: 10000 }).catch(() => {});
  await desktop.screenshot({ path: `${OUT}/shot-matrix.png` });

  // 截图按钮：清空 JD，走真实上传路径（验证 data-image 监听是否接上）
  await desktop.evaluate(() => {
    document.getElementById('jd').value = '';
  });
  desktop.on('dialog', (d) => d.accept());
  const imageInput = await desktop.$('input[data-image="jd"]');
  await imageInput.uploadFile('tmp/fixture-jd.png');
  await desktop
    .waitForFunction(() => document.querySelector('[data-status="jd"]').className.includes('ok'), { timeout: 120000 })
    .catch(() => {});
  const uploadResult = await desktop.evaluate(() => ({
    status: document.querySelector('[data-status="jd"]').textContent,
    chars: document.getElementById('jd').value.length,
    head: document.getElementById('jd').value.slice(0, 40),
  }));
  console.log('upload:', JSON.stringify(uploadResult));
  await desktop.screenshot({ path: `${OUT}/shot-ocr-upload.png` });

  await desktop.click('[data-tab="missing-tab"]');
  await desktop.evaluate(() => document.querySelector('.advice-block')?.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 300));
  await desktop.screenshot({ path: `${OUT}/shot-advice.png` });

  // 推荐：点一下按钮，等卡片出来再截图
  await desktop.click('#recBtn');
  await desktop.waitForSelector('#recList .rec-card', { timeout: 20000 }).catch(() => {});
  await desktop.screenshot({ path: `${OUT}/shot-recommend.png` });

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await mobile.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0', timeout: 60000 });
  await mobile.waitForSelector('#result:not([hidden])', { timeout: 30000 });
  await mobile.screenshot({ path: `${OUT}/shot-mobile.png` });
} finally {
  await browser.close();
}
