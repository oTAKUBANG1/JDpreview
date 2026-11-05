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
