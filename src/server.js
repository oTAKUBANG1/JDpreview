// 零依赖 HTTP 服务：静态页面 + 一个分析接口。
// 不引框架是刻意的：MVP 要求克隆下来就能 `node src/server.js` 跑，不依赖网络装包。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './engine/pipeline.js';
import { fetchPage } from './fetcher.js';
import { openStore } from './store.js';
import { recommendJobs } from './recommend.js';
import { buildProfile } from './engine/profile.js';
import { SAMPLE_JD, SAMPLE_RESUME, TRAP_JD, TRAP_RESUME } from './samples.js';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};
const MAX_BODY = 2 * 1024 * 1024;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('请求体超过 2MB 限制');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const safe = normalize(rel).replace(/^([/\\])+/, '');
  const filePath = join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

export function createApp(options = {}) {
  const store = options.store ?? openStore();
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return json(res, 200, { ok: true, version: '0.1.5' });
      }
      if (req.method === 'GET' && url.pathname === '/api/samples') {
        return json(res, 200, {
          normal: { jd: SAMPLE_JD, resume: SAMPLE_RESUME },
          trap: { jd: TRAP_JD, resume: TRAP_RESUME },
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/fetch-url') {
        const body = await readBody(req);
        try {
          const data = await fetchPage(String(body.url ?? ''));
          return json(res, 200, data);
        } catch (err) {
          return json(res, 422, { ok: false, error: err.message });
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/jds') {
        const rows = store.listActive({ limit: 20 });
        return json(res, 200, {
          ok: true,
          total: store.count(),
          items: rows.map((r) => ({
            id: r.id,
            title: JSON.parse(r.jd_json).role_summary?.title ?? r.title,
            last_seen: r.last_seen,
            paste_count: r.paste_count,
          })),
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        const body = await readBody(req);
        const resumeText = String(body.resume_text ?? '');
        if (!resumeText.trim()) return json(res, 422, { ok: false, error: '请先填写简历原文' });
        return json(res, 200, { ok: true, profile: buildProfile(resumeText) });
      }
      if (req.method === 'POST' && url.pathname === '/api/recommend') {
        const body = await readBody(req);
        const resumeText = String(body.resume_text ?? '');
        if (!resumeText.trim()) return json(res, 422, { ok: false, error: '请先填写简历原文' });
        const limit = Math.max(1, Math.min(6, Number(body.limit ?? 3)));
        const result = recommendJobs(store, resumeText, { limit });
        return json(res, 200, { ok: true, ...result });
      }
      if (req.method === 'POST' && url.pathname === '/api/analyze') {
        const body = await readBody(req);
        const started = Date.now();
        const result = analyze({
          jd_text: String(body.jd_text ?? ''),
          resume_text: String(body.resume_text ?? ''),
          target_role: String(body.target_role ?? ''),
          strictness: ['strict', 'balanced', 'aggressive'].includes(body.strictness)
            ? body.strictness
            : 'strict',
          max_round: Number(body.max_round ?? 3),
        });
        // JD 匿名入池，供其他成员推荐使用；save_jd=false 时完全不落库
        if (result.ok && body.save_jd !== false) {
          try {
            result.jd_id = store.upsertJd({ text: String(body.jd_text ?? ''), jdJson: result.jd_json }).id;
          } catch {
            result.jd_id = null;
          }
        }
        return json(res, result.ok ? 200 : 422, { ...result, elapsed_ms: Date.now() - started });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        return serveStatic(res, url.pathname);
      }
      return json(res, 405, { ok: false, error: 'method not allowed' });
    } catch (err) {
      const message = err instanceof SyntaxError ? '请求体不是合法 JSON' : err.message;
      return json(res, 500, { ok: false, error: message });
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 3080);
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`简历 × JD 对齐 Agent 已启动: http://127.0.0.1:${port}`);
  });
}
