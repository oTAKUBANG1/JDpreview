import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { previewJd, splitJdBlocks } from '../src/preview.js';

const REAL_DIR = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const jdFixture = () => readFileSync(join(REAL_DIR, 'JD-test', 'test.md'), 'utf8');

test('多段 JD：按分隔线切成多个岗位', () => {
  const blocks = splitJdBlocks(jdFixture());
  assert.ok(blocks.length >= 3, `只切出 ${blocks.length} 段`);
  assert.ok(blocks[0].includes('技术支持工程师'));
});

test('多段 JD：没有分隔线时按「岗位职责」重复出现切', () => {
  const text = `产品经理\n岗位职责：\n1、负责产品规划。\n任职要求：\n1、本科。\n\n运营专员\n岗位职责：\n1、负责活动运营。\n任职要求：\n1、大专。`;
  const blocks = splitJdBlocks(text);
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].includes('产品经理'));
});

test('单段 JD：体检给出岗位名、能力项与字数', () => {
  const jd = `技术支持工程师
岗位职责：
1. 负责路由器、交换机等数通产品售后支撑。
任职要求：
1. 本科及以上学历，熟悉 TCP/IP。`;
  const p = previewJd(jd);
  assert.equal(p.ok, true);
  assert.equal(p.multi, false);
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].title, '技术支持工程师');
  assert.ok(p.items[0].core_count >= 1);
  assert.ok(p.items[0].hard_count >= 1);
});

test('脏格式：导航、薪资、断行会被标出来', () => {
  const jd = `技术支持工程师
14-25K·16薪
立即沟通 收藏 举报
岗位职责：
1. 负责路由器、交换
机、防火墙的售后支撑。
任职要求：
1. 本科。`;
  const p = previewJd(jd);
  const warnings = p.items[0].warnings.join('\n');
  assert.match(warnings, /导航|按钮/);
  assert.match(warnings, /薪资/);
  assert.match(warnings, /断行|碎片/);
});

test('解析不出能力项时明确警告，而不是装没事', () => {
  const p = previewJd('随便写的一段话，没有任何职责和要求。');
  assert.equal(p.ok, true);
  assert.ok(p.items[0].warnings.some((w) => w.includes('没解析出')));
});

test('空文本返回错误', () => {
  assert.equal(previewJd('').ok, false);
});
