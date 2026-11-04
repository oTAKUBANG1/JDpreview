import test from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../src/engine/gate.js';

const jd = {
  core_competencies: [
    { id: 'C01', name: '软件测试', weight: 5, level: 'must', jd_quote: '负责系统测试' },
    { id: 'C02', name: '数据分析', weight: 4, level: 'should', jd_quote: '具备数据分析能力' },
  ],
  keyword_bank: { must: ['软件测试', '数据分析'], alias: {} },
};

const resume = `张三
工作经历
- 参与 XX 系统测试，输出 10 份报告
- 负责客服工单处理`;

test('T3 越权升格：参与 → 主导 必须被 V2 拦下', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 主导 XX 系统测试，输出 10 份报告\n- 负责客服工单处理',
    fact_ledger: [
      {
        change_id: 'C01',
        change_type: 'term',
        before: '参与 XX 系统测试，输出 10 份报告',
        after: '主导 XX 系统测试，输出 10 份报告',
        source_quote: '参与 XX 系统测试，输出 10 份报告',
        source_type: 'explicit',
      },
    ],
    missing_items: [],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.violations.some((v) => v.check === 'V2' && v.severity === 'fatal'));
  assert.ok(r.score.fact_consistency <= 95);
  assert.ok(r.fatal_rollback.length > 0);
});

test('T3 全局兜底：改写稿凭空出现「主导」，原文没有 → major', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 主导客服工单处理',
    fact_ledger: [],
    missing_items: [],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.notEqual(r.verdict, 'PASS');
  assert.ok(r.violations.some((v) => v.check === 'V2'));
});

test('T4 贴标签：简历没有数据分析，改写稿硬塞关键词 → major', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 负责客服工单处理，具备数据分析能力',
    fact_ledger: [],
    missing_items: [],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'REVISE');
  assert.ok(r.violations.some((v) => v.check === 'V4' && v.type === '贴标签' && v.severity === 'major'));
});

test('V3 数字篡改：18% 改成 28% → fatal', () => {
  const resume2 = '李四\n工作经历\n- 优化流程，人均处理量提升 18%';
  const rewrite_json = {
    rewritten_resume: '李四\n工作经历\n- 优化流程，人均处理量提升 28%',
    fact_ledger: [],
    missing_items: [],
  };
  const r = gate({ resume_text: resume2, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.violations.some((v) => v.check === 'V3' && v.type === '数字不符'));
});

test('V3 模糊量化词：无基准的「显著提升」→ major', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 负责客服工单处理，显著提升效率',
    fact_ledger: [],
    missing_items: [],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.ok(r.violations.some((v) => v.severity === 'major' && v.quote_in_rewrite === '显著提升'));
});

test('V5 缺失项泄漏：待补清单里的能力被偷偷写进改写稿 → fatal', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 负责客服工单处理，熟悉大模型应用',
    fact_ledger: [],
    missing_items: [{ competency_id: 'C03', competency_name: '大模型', jd_requirement: '熟悉大模型', priority: 'must' }],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.violations.some((v) => v.check === 'V5' && v.severity === 'fatal'));
});

test('V1 溯源：source_quote 不在原简历里 → fatal', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 主导 XX 系统测试，输出 10 份报告\n- 负责客服工单处理',
    fact_ledger: [
      {
        change_id: 'C01',
        change_type: 'term',
        before: '负责测试',
        after: '主导 XX 系统测试，输出 10 份报告',
        source_quote: '负责测试全部模块',
        source_type: 'explicit',
      },
    ],
    missing_items: [],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.violations.some((v) => v.check === 'V1' && v.type === '无依据'));
});

test('干净改写稿：PASS 且事实一致率 100', () => {
  const rewrite_json = {
    rewritten_resume: '张三\n工作经历\n- 参与 XX 系统测试，输出 10 份报告\n- 负责客服工单处理',
    fact_ledger: [
      {
        change_id: 'C01',
        change_type: 'order',
        before: '参与 XX 系统测试，输出 10 份报告',
        after: '参与 XX 系统测试，输出 10 份报告',
        source_quote: '参与 XX 系统测试，输出 10 份报告',
        source_type: 'explicit',
      },
    ],
    missing_items: [
      { competency_id: 'C01', competency_name: '软件测试', jd_requirement: '负责系统测试', priority: 'should' },
      { competency_id: 'C02', competency_name: '数据分析', jd_requirement: '具备数据分析能力', priority: 'should' },
    ],
  };
  const r = gate({ resume_text: resume, jd_json: jd, rewrite_json });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.score.fact_consistency, 100);
});
