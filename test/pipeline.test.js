import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine/pipeline.js';
import { gate } from '../src/engine/gate.js';

const resume = `张三
工作经历
- 用 SQL 做数据分析，覆盖 10 个报表`;
const jdText = `任职要求：
1. 具备数据分析能力。`;

test('T6 循环保护：必然 REVISE 的输入在第 3 轮后强制收敛', () => {
  let calls = 0;
  const stubRewrite = ({ resume_text }) => {
    calls += 1;
    const cn = ['一', '二', '三', '四', '五'][calls - 1] ?? '多';
    return {
      rewritten_resume: `${resume_text}\n显著提升了效率（第${cn}轮）`,
      fact_ledger: [],
      missing_items: [],
      questions_for_user: [],
      coverage_self_check: { must_total: 1, must_addressed: 1, must_missing: [] },
    };
  };
  const r = analyze(
    { jd_text: jdText, resume_text: resume, max_round: 3 },
    { rewriteResume: stubRewrite },
  );
  assert.equal(r.ok, true);
  assert.equal(r.meta.rounds, 3);
  assert.equal(r.meta.converged, false);
  assert.equal(calls, 4); // 首轮 + 3 轮重跑
  assert.ok(r.gate_json.violations.some((v) => v.quote_in_rewrite === '显著提升'));
  assert.ok(r.conclusion !== '可投递');
});

test('BLOCK 回退只做一次：回退后仍不通过就带着未解决项收尾', () => {
  let calls = 0;
  const stubRewrite = ({ resume_text }) => {
    calls += 1;
    return {
      rewritten_resume: `${resume_text}\n主导了 100 万用户增长`,
      fact_ledger: [
        {
          change_id: 'C01',
          change_type: 'term',
          before: '用 SQL 做数据分析，覆盖 10 个报表',
          after: '主导了 100 万用户增长',
          source_quote: '用 SQL 做数据分析，覆盖 10 个报表',
          source_type: 'explicit',
        },
      ],
      missing_items: [],
      questions_for_user: [],
      coverage_self_check: { must_total: 1, must_addressed: 1, must_missing: [] },
    };
  };
  const r = analyze(
    { jd_text: jdText, resume_text: resume, max_round: 3 },
    { rewriteResume: stubRewrite },
  );
  assert.equal(r.meta.rollback_used, true);
  assert.equal(calls, 1); // BLOCK 不重新生成，只回退
  assert.equal(r.score.fact_consistency <= 95, true);
});

test('空简历直接报错，不进入流水线', () => {
  const r = analyze({ jd_text: jdText, resume_text: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /简历/);
});

test('空 JD 直接报错，不产出改写稿', () => {
  const r = analyze({ jd_text: '', resume_text: resume });
  assert.equal(r.ok, false);
  assert.equal(r.jd_json.core_competencies.length, 0);
});

test('闸门是独立的：同一份改写稿，规则引擎与流水线结论一致', () => {
  const r = analyze({ jd_text: jdText, resume_text: resume, strictness: 'balanced' });
  assert.equal(r.ok, true);
  const direct = gate({ resume_text: resume, jd_json: r.jd_json, rewrite_json: r.rewrite_json });
  assert.equal(direct.verdict, r.gate_json.verdict);
  assert.deepEqual(direct.score, r.score);
});
