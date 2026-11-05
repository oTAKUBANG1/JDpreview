// 浏览器端导入器：PDF / DOCX / 截图 OCR。全部本地运行，文件不出机器。
// 依赖 public/vendor/ 下的 pdf.js 与 tesseract.js（由 `npm run vendor` 生成）。

const PDF_BASE = '/vendor/pdfjs';
const TESS_BASE = '/vendor/tesseract';

// ---------- PDF ----------
let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`${PDF_BASE}/pdf.min.mjs`).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = `${PDF_BASE}/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

// PDF 文本按 y 坐标聚行：同一行内的 item 先按 x 排序，行与行之间换行
function itemsToText(items) {
  const lines = [];
  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5];
    const x = item.transform[4];
    const line = lines.find((l) => Math.abs(l.y - y) <= 3);
    if (line) line.items.push({ x, str: item.str });
    else lines.push({ y, items: [{ x, str: item.str }] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((l) =>
      l.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(''),
    )
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export async function pdfToText(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') throw new Error('这份 PDF 有密码保护，请先解除密码再导入');
    throw new Error('PDF 解析失败：文件可能损坏或格式不受支持');
  }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(itemsToText(content.items));
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new Error('SCANNED_PDF');
  return { text, pages: doc.numPages };
}

// ---------- DOCX（zip + xml，零依赖） ----------
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压 DOCX，请换用 Chrome / Edge / Safari 新版本');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipEntry(buf, targetName) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('DOCX 解析失败：不是有效的 zip 文件');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder('utf-8').decode(buf.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
    if (name !== targetName) continue;

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    return { method, raw };
  }
  throw new Error(`DOCX 里没有找到 ${targetName}`);
}

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

export function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>|<w:cr\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function docxToText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entry = readZipEntry(buf, 'word/document.xml');
  const bytes = entry.method === 0 ? entry.raw : await inflateRaw(entry.raw);
  const xml = new TextDecoder('utf-8').decode(bytes);
  const text = docxXmlToText(xml);
  if (!text) throw new Error('DOCX 里没有可提取的文字');
  return { text };
}

// ---------- 截图 OCR ----------
let tessWorkerPromise = null;

export async function imageToText(file, onProgress = () => {}) {
  const mod = await import(`${TESS_BASE}/tesseract.esm.min.js`);
  const Tesseract = mod.default ?? mod;
  if (!tessWorkerPromise) {
    tessWorkerPromise = Tesseract.createWorker('chi_sim+eng', 1, {
      workerPath: `${TESS_BASE}/worker.min.js`,
      corePath: TESS_BASE,
      langPath: `${TESS_BASE}/lang`,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress(Math.round(m.progress * 100));
        else if (m.status) onProgress(null, m.status);
      },
    });
  }
  const worker = await tessWorkerPromise;
  const { data } = await worker.recognize(file);
  const text = (data.text ?? '').trim();
  if (!text) throw new Error('没识别出文字，截图可能太糊或不是印刷体');
  return { text, confidence: data.confidence };
}

// ---------- 统一入口 ----------
export async function fileToText(file, onProgress) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return { ...(await pdfToText(file)), kind: 'PDF' };
  if (name.endsWith('.docx')) return { ...(await docxToText(file)), kind: 'DOCX' };
  if (file.type.startsWith('image/')) return { ...(await imageToText(file, onProgress)), kind: '图片 OCR' };
  if (name.endsWith('.doc')) throw new Error('旧版 .doc 不支持，请另存为 .docx 或 PDF');
  throw new Error('只支持 PDF、DOCX 和图片（PNG/JPG）');
}
