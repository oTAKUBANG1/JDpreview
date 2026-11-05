import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, scrubPii, fingerprint } from '../src/store.js';
import { recommendJobs } from '../src/recommend.js';
import { parseJD } from '../src/engine/jdParse.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../src/samples.js';

const AI_JD = `AI 产品经理
任职要求：
1. 本科及以上学历，3 年以上产品经验；
2. 熟悉大模型与 Prompt 工程，有 RAG 落地经验；
3. 具备需求分析与数据分析能力，熟练使用 SQL。`;

const JAVA_JD = `Java 后端工程师
任职要求：
1. 本科及以上学历，3 年以上 Java 开发经验；
2. 熟悉 Spring、MySQL、Redis，有高并发经验。`;

const SALES_JD = `销售经理
任职要求：
1. 大专及以上学历，2 年以上销售经验；
2. 具备客户开拓与商务谈判能力。`;

const RESUME = `李明
教育背景
2013.09-2017.06 某大学 本科
工作经历
2017.07-至今 某 SaaS 公司 产品经理
- 负责 AI 应用产品规划，推动大模型能力落地，主导 RAG 知识库检索方案
- 搭建指标体系，用 SQL 做数据分析，输出 PRD 20 份
- 跨部门协作推动 8 个版本上线`;

function seed(store, text, { now = new Date('2026-11-05T12:00:00Z'), ...rest } = {}) {
  const jdJson = parseJD(text);
  return store.upsertJd({ text, jdJson, now, ...rest });
}

test('JD 去重：同一份 JD 贴两次只留一条，paste_count 累加', () => {
  const store = openStore(':memory:');
  const a = seed(store, AI_JD);
  const b = seed(store, AI_JD);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(store.count(), 1);
  const row = store.listAll()[0];
  assert.equal(row.paste_count, 2);
});

test('入库前脱敏：手机号 / 邮箱 / 微信 / 证件号', () => {
  const dirty = '联系 HR：13800001111，邮箱 hr@example.com，微信：abc_12345，证件 110101199001011234';
  const clean = scrubPii(dirty);
  for (const secret of ['13800001111', 'hr@example.com', 'abc_12345', '110101199001011234']) {
    assert.equal(clean.includes(secret), false, `未脱敏：${secret}`);
  }
  assert.ok(clean.includes('[手机号已隐藏]'));
});

test('指纹与空白/标点无关', () => {
  assert.equal(fingerprint('AI 产品经理', '', AI_JD), fingerprint('AI 产品经理', '', AI_JD.replace(/\s+/g, ' ')));
});

test('时效：30 天前的岗位不进候选池', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const store = openStore(':memory:');
  seed(store, AI_JD, { now });
  seed(store, JAVA_JD, { now: new Date('2026-09-01T12:00:00Z') });
  const active = store.listActive({ now });
  assert.equal(active.length, 1);
  assert.ok(active[0].text.includes('AI 产品经理'));
});

test('推荐：简历匹配 AI 岗排第一，并给出命中与缺口', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const store = openStore(':memory:');
  seed(store, AI_JD, { now });
  seed(store, JAVA_JD, { now });
  seed(store, SALES_JD, { now });
  const result = recommendJobs(store, RESUME, { limit: 3, now });
  assert.ok(result.items.length >= 2);
  assert.equal(result.items[0].title, 'AI 产品经理');
  assert.ok(result.items[0].match > 50, `AI 岗匹配度应过半，实际 ${result.items[0].match}`);
  assert.ok(result.items[0].matched.length > 0);
});

test('硬门槛不符的岗位不推荐', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const store = openStore(':memory:');
  seed(store, AI_JD, { now });
  const 大专简历 = `王五
教育背景
2018.09-2021.06 某职业技术学院 大专
工作经历
2021.07-2022.06 某公司 运营
- 整理数据报表`;
  const result = recommendJobs(store, 大专简历, { now });
  assert.equal(result.items.length, 0);
  assert.equal(result.hard_failed, 1);
});

test('冷启动：池子小于 5 条时照常返回但明确标注', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const store = openStore(':memory:');
  seed(store, AI_JD, { now });
  const result = recommendJobs(store, RESUME, { now });
  assert.equal(result.cold_start, true);
  assert.equal(result.items.length, 1);
  assert.match(result.note, /岗位池较小/);
});

test('空池返回空列表和提示，不凑数', () => {
  const store = openStore(':memory:');
  const result = recommendJobs(store, RESUME);
  assert.equal(result.items.length, 0);
  assert.match(result.note, /岗位池还是空的/);
});

test('推荐结果稳定：同样输入排序一致', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const store = openStore(':memory:');
  seed(store, AI_JD, { now });
  seed(store, JAVA_JD, { now });
  const a = recommendJobs(store, RESUME, { now });
  const b = recommendJobs(store, RESUME, { now });
  assert.deepEqual(a.items.map((i) => i.id), b.items.map((i) => i.id));
});
