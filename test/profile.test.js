import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, buildMatrix } from '../src/engine/profile.js';
import { parseJD } from '../src/engine/jdParse.js';
import { analyze } from '../src/engine/pipeline.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../src/samples.js';

test('档案：学历、年限、能力项、量化亮点都能从简历抽出来', () => {
  const profile = buildProfile(SAMPLE_RESUME);
  assert.equal(profile.basics.degree, '本科');
  assert.ok(profile.basics.years_experience > 3);
  assert.ok(profile.skills.length >= 5);
  assert.ok(profile.skills.some((s) => s.name === '需求分析'));
  assert.ok(profile.highlights.length > 0);
  // 每条能力都要有原文证据
  for (const skill of profile.skills) {
    assert.ok(skill.evidence.length > 0, `${skill.name} 缺证据`);
    assert.ok(skill.evidence_count >= 1);
  }
});

test('档案不脑补：没出现的技能不会进档案', () => {
  const profile = buildProfile(SAMPLE_RESUME);
  assert.equal(profile.skills.some((s) => s.name === 'Kubernetes'), false);
});

test('匹配矩阵：JD 每个能力项都有状态，缺口能定位', () => {
  const jd = parseJD(SAMPLE_JD);
  const matrix = buildMatrix(jd, SAMPLE_RESUME);
  assert.equal(matrix.length, jd.core_competencies.length);
  for (const row of matrix) {
    assert.ok(['evidence', 'weak', 'gap'].includes(row.status));
    if (row.status === 'gap') assert.equal(row.evidence.length, 0);
  }
  assert.ok(matrix.some((m) => m.status === 'gap' && ['大模型', 'Prompt工程', 'RAG'].includes(m.name)));
  assert.ok(matrix.some((m) => m.status === 'evidence'));
});

test('分析结果带矩阵，且与 JD 能力项一一对应', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'balanced' });
  assert.equal(r.matrix.length, r.jd_json.core_competencies.length);
  const mustGaps = r.matrix.filter((m) => m.level === 'must' && m.status === 'gap').map((m) => m.name);
  assert.deepEqual(mustGaps.sort(), r.rewrite_json.coverage_self_check.must_missing.sort());
});

test('空简历：档案仍返回结构，但不编造任何能力', () => {
  const profile = buildProfile('张三\n手机：13800000000');
  assert.equal(profile.skills.length, 0);
  assert.equal(profile.basics.degree, '未识别');
  assert.equal(profile.basics.years_experience, 0);
});
