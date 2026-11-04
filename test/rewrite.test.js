import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine/pipeline.js';
import { SAMPLE_JD, SAMPLE_RESUME, TRAP_JD, TRAP_RESUME } from '../src/samples.js';

test('T1 正常链路：PASS，事实一致率 100，改动全部可溯源', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'balanced' });
  assert.equal(r.ok, true);
  assert.equal(r.gate_json.verdict, 'PASS');
  assert.equal(r.score.fact_consistency, 100);
  assert.ok(r.rewrite_json.fact_ledger.length > 0);
  for (const entry of r.rewrite_json.fact_ledger) {
    if (entry.source_type === 'missing') continue;
    assert.equal(entry.source_type, 'explicit');
    assert.ok(SAMPLE_RESUME.includes(entry.source_quote), 'source_quote 必须来自原简历');
  }
});

test('改写只重排、不删内容：所有原始条目都还在（strict 不改字）', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'strict' });
  const rewritten = r.rewrite_json.rewritten_resume;
  for (const line of SAMPLE_RESUME.split('\n')) {
    const t = line.replace(/^-\s*/, '').trim();
    if (!t || t === '工作经历' || t === '教育背景' || t === '专业技能' || t === '自我评价') continue;
    assert.ok(rewritten.includes(t), `条目丢失: ${t}`);
  }
});

test('T2 诱导编造：改写稿绝不能出现原简历没有的年限/DAU/主导/AI 产品', () => {
  const r = analyze({ jd_text: TRAP_JD, resume_text: TRAP_RESUME, strictness: 'aggressive' });
  assert.equal(r.ok, true);
  const rewritten = r.rewrite_json.rewritten_resume;
  for (const banned of ['3 年', '3年', '百万', 'DAU', '主导', 'AI 产品', 'AI产品', '大模型', 'Prompt']) {
    assert.equal(rewritten.includes(banned), false, `改写稿里出现了编造内容：${banned}`);
  }
  assert.ok(r.rewrite_json.missing_items.length >= 2);
  assert.ok(r.rewrite_json.missing_items.some((m) => m.priority === 'must'));
  assert.ok(r.rewrite_json.questions_for_user.length > 0);
  assert.equal(r.score.fact_consistency, 100);
  assert.equal(r.conclusion, '建议补充后投递');
});

test('缺失项不会被写进改写稿，只进待补清单', () => {
  const r = analyze({ jd_text: TRAP_JD, resume_text: TRAP_RESUME, strictness: 'balanced' });
  const mustMissing = r.rewrite_json.missing_items.filter((m) => m.priority === 'must');
  assert.ok(mustMissing.length > 0);
  const ledgerMissing = r.rewrite_json.fact_ledger.filter((e) => e.source_type === 'missing');
  assert.ok(ledgerMissing.length > 0);
  for (const entry of ledgerMissing) assert.equal(entry.after, '');
});

test('strict 模式不改一个字，只调位次', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'strict' });
  const changedText = r.rewrite_json.fact_ledger.filter((e) => e.change_type === 'term');
  assert.equal(changedText.length, 0);
});

test('balanced 模式把术语统一成 JD 用语', () => {
  const jd = `任职要求：
1. 具备扎实的用户调研能力；
2. 熟悉数据分析。`;
  const resume = `张三
项目经历
- 负责用户访谈，完成 30 份问卷，输出调研报告
- 用 SQL 做数据分析，支撑运营决策`;
  const r = analyze({ jd_text: jd, resume_text: resume, strictness: 'balanced' });
  assert.equal(r.ok, true);
  assert.ok(r.rewrite_json.rewritten_resume.includes('用户调研'));
  const term = r.rewrite_json.fact_ledger.find((e) => e.change_type === 'term');
  assert.ok(term, '应有术语对齐记录');
  assert.ok(term.source_quote.includes('用户访谈'));
});
