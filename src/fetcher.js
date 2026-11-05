// JD 链接导入：抓网页 → 转纯文本 → 截出 JD 段落。
// 安全要点：只放行 http/https；拒绝私网/回环/链路本地地址，并在每次重定向时重新校验（防 SSRF）。
// 反爬说明：BOSS 直聘这类有登录墙/风控的站点抓不到，调用方会收到明确的“改用截图”提示。

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_TEXT = 20000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isPrivateAddress(ip) {
  if (!ip) return false;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播/保留
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return false;
}

async function assertPublicHost(hostname, allowPrivate) {
  if (allowPrivate) return;
  const literal = isIP(hostname) ? hostname : null;
  if (literal) {
    if (isPrivateAddress(literal)) throw new Error('该地址指向内网或本机，出于安全考虑禁止抓取');
    return;
  }
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('域名解析失败，请检查链接是否正确');
  }
  if (!records.length) throw new Error('域名解析失败，请检查链接是否正确');
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error('该地址指向内网或本机，出于安全考虑禁止抓取');
  }
}

/** 极简 HTML → 纯文本：去脚本样式、块级标签转换行、解实体 */
export function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '');

  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  s = s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => entities[m] ?? ' ');
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  return s
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** 从整页文本里截出 JD 主体，避免把公司介绍/页脚一起塞进去 */
export function extractJdSection(text) {
  const startRe = /(岗位职责|职位描述|工作内容|你将负责|工作职责|任职要求|岗位要求|任职资格|我们希望你)/;
  const start = text.search(startRe);
  if (start < 0) return text.slice(0, MAX_TEXT);
  let body = text.slice(start);
  const endRe = /\n(公司介绍|关于我们|公司简介|福利待遇|薪资范围|工作地点|投递方式|相关推荐|热门职位)/;
  const end = body.search(endRe);
  if (end > 20) body = body.slice(0, end);
  return body.slice(0, MAX_TEXT);
}

function detectCharset(contentType, bytes) {
  const fromHeader = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = Buffer.from(bytes.slice(0, 4096)).toString('latin1');
  const fromMeta = head.match(/charset=["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? 'utf-8').toLowerCase();
}

function decode(bytes, charset) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function readLimited(res) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('页面内容超过 2MB，已停止抓取');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function fetchPage(rawUrl, { allowPrivate = false } = {}) {
  let current;
  try {
    current = new URL(String(rawUrl).trim());
  } catch {
    throw new Error('链接格式不正确，需要完整的 http(s) 地址');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!['http:', 'https:'].includes(current.protocol)) {
      throw new Error('只支持 http / https 链接');
    }
    await assertPublicHost(current.hostname, allowPrivate);

    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html,*/*' },
      });
    } catch (err) {
      if (err?.name === 'TimeoutError') throw new Error('抓取超时（8 秒），页面可能较慢或禁止访问');
      throw new Error('抓取失败，请检查网络或链接是否有效');
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('页面重定向异常');
      current = new URL(location, current);
      continue;
    }
    if ([401, 403, 429].includes(res.status)) {
      throw new Error('该页面需要登录或禁止抓取，请改用「截图识别」');
    }
    if (!res.ok) throw new Error(`抓取失败（HTTP ${res.status}），请改用「截图识别」`);

    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new Error('链接指向的不是网页（可能是文件），请改用文件或截图导入');
    }

    const bytes = await readLimited(res);
    const html = decode(bytes, detectCharset(type, bytes));
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const full = htmlToText(html);
    const text = extractJdSection(full);
    if (text.length < 30) throw new Error('页面里没找到可读的 JD 文本，请改用「截图识别」');
    return { ok: true, title, text, truncated: full.length > MAX_TEXT, url: current.toString() };
  }
  throw new Error('重定向次数过多，请改用「截图识别」');
}
