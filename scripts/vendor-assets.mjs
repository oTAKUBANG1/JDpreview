// 把 pdf.js / tesseract.js 的运行时文件复制到 public/vendor/，保证离线可用、不依赖 CDN。
// 语言包走 tessdata_fast（chi_sim 约 1.6MB、eng 约 1.9MB），识别清晰截图够用；
// 要更高精度可把 LANG_SET 改成 '4.0.0_best'（体积 12MB+，首次加载慢）。
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PDF_OUT = join(ROOT, 'public/vendor/pdfjs');
const TESS_OUT = join(ROOT, 'public/vendor/tesseract');
const LANG_OUT = join(TESS_OUT, 'lang');
const LANG_SET = process.env.TESS_LANG_SET ?? '4.0.0_fast';

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function copy(from, to) {
  if (!existsSync(from)) throw new Error(`缺少依赖文件：${from}（先执行 npm install）`);
  await mkdir(join(to, '..'), { recursive: true });
  await copyFile(from, to);
  return sizeOf(to);
}

const files = [
  ['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', join(PDF_OUT, 'pdf.min.mjs')],
  ['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', join(PDF_OUT, 'pdf.worker.min.mjs')],
  ['node_modules/tesseract.js/dist/tesseract.esm.min.js', join(TESS_OUT, 'tesseract.esm.min.js')],
  ['node_modules/tesseract.js/dist/worker.min.js', join(TESS_OUT, 'worker.min.js')],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', join(TESS_OUT, 'tesseract-core-simd-lstm.wasm.js')],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', join(TESS_OUT, 'tesseract-core-simd-lstm.wasm')],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', join(TESS_OUT, 'tesseract-core-relaxedsimd-lstm.wasm.js')],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm', join(TESS_OUT, 'tesseract-core-relaxedsimd-lstm.wasm')],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', join(TESS_OUT, 'tesseract-core-lstm.wasm.js')],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', join(TESS_OUT, 'tesseract-core-lstm.wasm')],
];

let total = 0;
for (const [from, to] of files) {
  total += await copy(join(ROOT, from), to);
}

await mkdir(LANG_OUT, { recursive: true });
for (const lang of ['chi_sim', 'eng']) {
  const out = join(LANG_OUT, `${lang}.traineddata.gz`);
  if (existsSync(out)) {
    total += await sizeOf(out);
    continue;
  }
  const url = `https://tessdata.projectnaptha.com/${LANG_SET}/${lang}.traineddata.gz`;
  process.stdout.write(`下载语言包 ${lang} (${LANG_SET})… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`语言包下载失败 ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(out, buf);
  total += buf.length;
  console.log(`${(buf.length / 1048576).toFixed(1)}MB`);
}

console.log(`vendor 完成，共 ${(total / 1048576).toFixed(1)}MB → public/vendor/`);
