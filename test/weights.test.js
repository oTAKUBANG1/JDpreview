import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJD } from '../src/engine/jdParse.js';
import { compareHardRequirements } from '../src/engine/hardGate.js';
import { analyze } from '../src/engine/pipeline.js';
import { findCompetencies } from '../src/engine/lexicon.js';

const AI_JD = `AI 产品经理
岗位职责：
1. 负责 AI 应用产品设计；
2. 与算法团队协作，推动大模型能力落地。
任职要求：
1. 本科及以上学历，3 年以上产品经验，至少 1 年 AI 产品经验；
2. 熟悉大模型与 Prompt 工程；
3. 优秀的跨部门沟通能力。`;

test('中英文空格不影响能力识别：AI 产品 / AI Agent', () => {
  assert.ok(findCompetencies('至少 1 年 AI 产品经验').some((h) => h.name === 'AI产品'));
  assert.ok(findCompetencies('熟悉 AI Agent 编排').some((h) => h.name === 'Agent'));
  assert.ok(findCompetencies('熟悉AI产品').some((h) => h.name === 'AI产品'));
});

test('权重来源驱动：标题/硬门槛 = 5，任职要求 = 4，纯职责 ≤ 3', () => {
  const jd = parseJD(AI_JD);
  const byName = Object.fromEntries(jd.core_competencies.map((c) => [c.name, c.weight]));
  assert.equal(byName['AI产品'], 5, '标题 + 硬门槛里的 AI 产品应是最高权重');
  assert.equal(byName['大模型'], 5);
  assert.equal(byName['Prompt工程'], 4);
  assert.equal(byName['跨部门协作'], 4);
  assert.ok(byName['产品设计'] <= 3, '只在职责区出现的项不该顶到 5');
  assert.equal(jd.core_competencies.find((c) => c.name === 'AI产品').level, 'must');
});

test('JD 覆盖率按权重加权，而不是按条数平均', () => {
  const jd = `AI 产品经理
任职要求：
1. 熟悉大模型与 Prompt 工程；
2. 优秀的沟通表达能力。`;
  const resume = `张三
工作经历
- 负责产品方案设计，沟通表达清晰，完成 3 次跨部门汇报`;
  const r = analyze({ jd_text: jd, resume_text: resume });
  assert.equal(r.ok, true);
  // 大模型/Prompt 都是 must，简历完全没有；沟通表达有证据但权重低
  assert.ok(r.score.jd_coverage < 50, `加权覆盖率应显著低于按条数算的 33%，实际 ${r.score.jd_coverage}`);
  assert.equal(r.score.keyword_hit >= 0, true);
});

test('T11 硬门槛不满足：大专 1 年 vs 本科 3 年 → 不建议投递并说明原因', () => {
  const jd = `产品经理
任职要求：
1. 本科及以上学历，3 年以上产品经验；
2. 熟悉需求分析。`;
  const resume = `李四
教育背景
2018.09-2021.06 某职业技术学院 大专
工作经历
2024.01-2025.06 某公司 产品助理
- 参与需求分析，整理需求文档 20 份`;
  const r = analyze({ jd_text: jd, resume_text: resume });
  assert.equal(r.ok, true);
  assert.equal(r.conclusion, '不建议投递');
  assert.equal(r.hard_gate.failed, true);
  const failed = r.hard_gate.items.filter((i) => i.status === 'fail');
  assert.ok(failed.some((i) => i.note.includes('本科')));
  assert.ok(failed.some((i) => i.note.includes('3 年以上')));
});

test('硬门槛通过时不影响结论', () => {
  const jd = `产品经理
任职要求：
1. 本科及以上学历，3 年以上产品经验；
2. 熟悉需求分析。`;
  const resume = `王五
教育背景
2013.09-2017.06 某大学 本科
工作经历
2017.07-至今 某公司 产品经理
- 负责需求分析，输出 PRD 30 份，推动 8 个版本上线`;
  const r = analyze({ jd_text: jd, resume_text: resume });
  assert.equal(r.hard_gate.failed, false);
  assert.notEqual(r.conclusion, '不建议投递');
});

test('限定领域年限无法自动核实时不误判为不满足', () => {
  const jd = parseJD(`AI 产品经理
任职要求：
1. 至少 1 年 AI 产品经验。`);
  const resume = `张三
工作经历
- 与算法团队协作上线智能分类模型，覆盖 60% 工单`;
  const hg = compareHardRequirements(resume, jd);
  assert.equal(hg.failed, false);
  assert.ok(hg.items.some((i) => i.status === 'unverified'));
});
