import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { openStore } from '../src/store.js';
import { parseJD } from '../src/engine/jdParse.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../src/samples.js';

async function withServer(fn, options = {}) {
  const server = createApp({ store: openStore(':memory:'), ...options });
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

test('链接导入接口：私网地址返回 422 与可读错误', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/fetch-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:3080/api/health' }),
    });
    assert.equal(res.status, 422);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.match(data.error, /内网或本机/);
  });
});

test('分析会自动把 JD 入池，推荐接口能返回它', async () => {
  const store = openStore(':memory:');
  await withServer(
    async (base) => {
      const analyzed = await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME }),
      });
      assert.equal(analyzed.status, 200);
      const result = await analyzed.json();
      assert.ok(result.jd_id > 0, '返回体应带 jd_id');

      const list = await fetch(`${base}/api/jds`);
      assert.equal((await list.json()).total, 1);

      const rec = await fetch(`${base}/api/recommend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resume_text: SAMPLE_RESUME, limit: 3 }),
      });
      const data = await rec.json();
      assert.equal(data.ok, true);
      assert.equal(data.pool_size, 1);
      assert.equal(data.items[0].title, 'AI 产品经理');
    },
    { store },
  );
});

test('关闭入池开关后不落库', async () => {
  const store = openStore(':memory:');
  await withServer(
    async (base) => {
      await fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, save_jd: false }),
      });
      assert.equal(store.count(), 0);
    },
    { store },
  );
});

test('推荐接口空简历返回 422', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/recommend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume_text: '  ' }),
    });
    assert.equal(res.status, 422);
  });
});

test('档案接口：正常返回结构，空简历 422', async () => {
  await withServer(async (base) => {
    const ok = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume_text: SAMPLE_RESUME }),
    });
    assert.equal(ok.status, 200);
    const data = await ok.json();
    assert.equal(data.profile.basics.degree, '本科');
    assert.ok(data.profile.skills.length > 0);

    const bad = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume_text: '' }),
    });
    assert.equal(bad.status, 422);
  });
});
