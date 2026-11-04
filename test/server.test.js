import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../src/samples.js';

async function withServer(fn) {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('健康检查与页面可访问', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /简历 × JD 对齐 Agent/);

    const css = await fetch(`${base}/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
  });
});

test('分析接口返回完整交付结构', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'balanced' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    for (const key of ['jd_json', 'rewrite_json', 'gate_json', 'score', 'conclusion', 'impact', 'meta']) {
      assert.ok(key in data, `缺少字段 ${key}`);
    }
    assert.ok(data.rewrite_json.rewritten_resume.length > 100);
    assert.ok(Array.isArray(data.gate_json.violations));
    assert.ok(data.elapsed_ms >= 0);
  });
});

test('空 JD 返回 422 与可读错误', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jd_text: '', resume_text: SAMPLE_RESUME }),
    });
    assert.equal(res.status, 422);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.match(data.error, /JD/);
  });
});

test('非法 JSON 返回 500 而不是崩服务', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /JSON/);
  });
});

test('静态资源路径穿越被挡住', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/../src/server.js`);
    assert.ok([403, 404].includes(res.status));
  });
});
