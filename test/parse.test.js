import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJD } from '../src/engine/jdParse.js';
import { SAMPLE_JD, TRAP_JD } from '../src/samples.js';

test('解析正常 JD：能力项、硬门槛、关键词库都不为空', () => {
  const jd = parseJD(SAMPLE_JD);
  assert.ok(jd.core_competencies.length >= 4);
  assert.ok(jd.hard_requirements.length >= 1);
  assert.ok(jd.keyword_bank.must.length >= 3);
  assert.equal(jd.jd_quality_notes.some((n) => n.startsWith('FATAL')), false);

  const must = jd.core_competencies.filter((c) => c.level === 'must');
  assert.ok(must.length >= 1);
  // 每个能力项都必须有 JD 原文片段
  for (const c of jd.core_competencies) {
    assert.ok(c.jd_quote.length > 0, `${c.name} 缺少 jd_quote`);
  }
});

test('薪资福利行不计入能力项', () => {
  const jd = parseJD(SAMPLE_JD);
  const text = jd.core_competencies.map((c) => c.name).join(',');
  assert.equal(text.includes('六险一金'), false);
  assert.ok(jd.jd_quality_notes.some((n) => n.includes('非能力信息')));
});

test('T5 空 JD 直接 FATAL', () => {
  const jd = parseJD('');
  assert.ok(jd.jd_quality_notes.some((n) => n.startsWith('FATAL')));
  assert.equal(jd.core_competencies.length, 0);
});

test('T5 乱码/过短 JD 也 FATAL', () => {
  const jd = parseJD('招聘');
  assert.ok(jd.jd_quality_notes.some((n) => n.startsWith('FATAL')));
});

test('T2 陷阱 JD 的硬门槛被单独拎出来，不混进能力项', () => {
  const jd = parseJD(TRAP_JD);
  assert.ok(jd.hard_requirements.some((h) => h.text.includes('3 年以上')));
  const names = jd.core_competencies.map((c) => c.name);
  assert.equal(names.includes('百万 DAU'), false);
});

test('JD 未强调任何能力项时，取前 3 条做 must 并给出提示', () => {
  const jd = parseJD(`关于我们：一家做企业服务的公司。
我们希望你加入。
岗位职责：
1. 负责产品需求分析；
2. 推进项目进度；
3. 输出数据报表；
4. 整理竞品资料。`);
  assert.ok(jd.core_competencies.length > 0);
  assert.ok(jd.core_competencies.some((c) => c.level === 'must'));
  assert.ok(jd.jd_quality_notes.length > 0);
});
