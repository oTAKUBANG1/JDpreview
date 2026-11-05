// 编排器：调度 ①解析 → ③改写 → ④闸门，维护回环（REVISE ≤ max_round，BLOCK 回退 1 次）。
// 依赖注入是为了让「必然 REVISE」的循环保护能被单独测试。

import { parseJD } from './jdParse.js';
import { rewriteResume } from './rewrite.js';
import { gate } from './gate.js';
import { parseResume, lineRelevance } from './match.js';
import { compareHardRequirements } from './hardGate.js';
import { buildMatrix } from './profile.js';

export const DEFAULT_MAX_ROUND = 3;

function topBulletHits(resumeText, competencies) {
  const resume = parseResume(resumeText);
  let hit = 0;
  let seen = 0;
  for (const section of resume.sections) {
    if (!/(工作|项目|实习|实践|经历)/.test(section.title)) continue;
    for (const line of section.lines) {
      if (seen >= 3) break;
      seen += 1;
      if (lineRelevance(line.text, competencies).score > 0) hit += 1;
    }
  }
  return hit;
}

function applyRollback(rewrite, fatalRollback) {
  let text = rewrite.rewritten_resume ?? '';
  for (const item of fatalRollback) {
    if (!item.rollback_to) continue;
    const entry = rewrite.fact_ledger.find((e) => e.change_id === item.change_id);
    if (!entry || !entry.after) continue;
    text = text.split(entry.after).join(item.rollback_to);
  }
  return { ...rewrite, rewritten_resume: text };
}

export function analyze(input, deps = {}) {
  const doParse = deps.parseJD ?? parseJD;
  const doRewrite = deps.rewriteResume ?? rewriteResume;
  const doGate = deps.gate ?? gate;
  const maxRound = Number.isFinite(input.max_round) ? input.max_round : DEFAULT_MAX_ROUND;
  const strictness = input.strictness ?? 'strict';
  const resumeText = String(input.resume_text ?? '');
  const jdText = String(input.jd_text ?? '');

  const jd_json = doParse(jdText, input.target_role ?? '');
  const fatalNote = (jd_json.jd_quality_notes ?? []).find((n) => n.startsWith('FATAL'));
  if (fatalNote) {
    return { ok: false, error: fatalNote.replace('FATAL: ', ''), jd_json };
  }
  if (!resumeText.trim()) {
    return { ok: false, error: '简历内容为空', jd_json };
  }

  let round = 0;
  let reviseInstructions = [];
  let rewrite_json = doRewrite({
    jd_json,
    resume_text: resumeText,
    strictness,
    revise_instructions: reviseInstructions,
  });
  let gate_json = doGate({ resume_text: resumeText, jd_json, rewrite_json });

  const beforeTop3 = topBulletHits(resumeText, jd_json.core_competencies ?? []);
  let rollbackUsed = false;
  const trace = [
    { round: 0, verdict: gate_json.verdict, violations: gate_json.violations.length },
  ];

  for (;;) {
    if (gate_json.verdict === 'PASS') break;

    if (gate_json.verdict === 'BLOCK') {
      if (rollbackUsed) break;
      rollbackUsed = true;
      rewrite_json = applyRollback(rewrite_json, gate_json.fatal_rollback);
      gate_json = doGate({ resume_text: resumeText, jd_json, rewrite_json });
      trace.push({ round, verdict: `BLOCK→回退：${gate_json.verdict}`, violations: gate_json.violations.length });
      continue;
    }

    // REVISE
    if (round >= maxRound) break;
    round += 1;
    const next = doRewrite({
      jd_json,
      resume_text: resumeText,
      strictness,
      revise_instructions: gate_json.revise_instructions ?? [],
    });
    const same =
      next.rewritten_resume === rewrite_json.rewritten_resume &&
      JSON.stringify(next.fact_ledger) === JSON.stringify(rewrite_json.fact_ledger);
    reviseInstructions = gate_json.revise_instructions ?? [];
    rewrite_json = { ...next, revise_applied: reviseInstructions };
    gate_json = doGate({ resume_text: resumeText, jd_json, rewrite_json });
    trace.push({ round, verdict: gate_json.verdict, violations: gate_json.violations.length });
    if (same) break;
  }

  const afterTop3 = topBulletHits(rewrite_json.rewritten_resume ?? '', jd_json.core_competencies ?? []);
  const hardGate = compareHardRequirements(resumeText, jd_json);
  const mustMissing = (rewrite_json.missing_items ?? []).filter((m) => m.priority === 'must');
  const score = gate_json.score;

  // 结论优先级：硬门槛不满足 > 事实问题 > 能力缺口/校验未过 > 可投
  let conclusion = '可投递';
  if (hardGate.failed) conclusion = '不建议投递';
  else if (score.fact_consistency < 100) conclusion = '不建议投递';
  else if (mustMissing.length || gate_json.verdict !== 'PASS') conclusion = '建议补充后投递';

  return {
    ok: true,
    meta: {
      rounds: round,
      strictness,
      max_round: maxRound,
      rollback_used: rollbackUsed,
      trace,
      converged: gate_json.verdict === 'PASS',
    },
    jd_json,
    rewrite_json,
    gate_json,
    score,
    conclusion,
    hard_gate: hardGate,
    matrix: buildMatrix(jd_json, resumeText),
    impact: {
      evidence_rank_before: beforeTop3,
      evidence_rank_after: afterTop3,
      changes: (rewrite_json.fact_ledger ?? []).filter((e) => e.change_type !== 'missing').length,
    },
    jd_quality_notes: jd_json.jd_quality_notes ?? [],
  };
}
