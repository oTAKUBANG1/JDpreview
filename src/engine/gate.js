// ④ 防幻觉校验闸门：只判定，不改写。独立于改写器，用原简历作为唯一裁判依据。
// 五道校验：V1 溯源 / V2 越权升格 / V3 数字与实体 / V4 覆盖与贴标签 / V5 缺失项泄漏。

import { extractNumbers, strongVerbsIn, weakVerbsIn } from './utils.js';
import { COMPETENCIES, mentionsCompetency } from './lexicon.js';
import { parseResume, collectEvidence } from './match.js';

const ENTITY_NAMES = COMPETENCIES.filter((c) => c.group === '技术' || c.group === 'AI').map((c) => c.name);

function numberKey(n) {
  return `${n.num}|${n.unit}`;
}

export function gate({ resume_text, jd_json, rewrite_json }) {
  const rewritten = String(rewrite_json.rewritten_resume ?? '');
  const ledger = rewrite_json.fact_ledger ?? [];
  const missing = rewrite_json.missing_items ?? [];
  const violations = [];
  const revise = [];
  let passed = 0;
  let total = 0;

  const resumeNumbers = extractNumbers(resume_text);
  const resumeNumSet = new Set(resumeNumbers.map(numberKey));
  const resumeRawSet = new Set(resumeNumbers.map((n) => n.raw));

  const add = (v) => {
    violations.push(v);
    if (v.severity !== 'minor' && v.fix_instruction) revise.push(v.fix_instruction);
  };

  // —— V1 溯源核验 ——
  for (const entry of ledger) {
    if (entry.source_type === 'missing') continue;
    total += 1;
    const after = String(entry.after ?? '').trim();
    const source = String(entry.source_quote ?? '').replace('[语义等价]', '').trim();
    const afterOk = !after || rewritten.includes(after);
    const sourceOk = Boolean(source) && resume_text.includes(source);
    if (afterOk && sourceOk) {
      passed += 1;
    } else {
      const why = !afterOk ? '改写稿中找不到该改动' : '原简历中找不到引用的原文依据';
      add({
        change_id: entry.change_id ?? '',
        check: 'V1',
        type: '无依据',
        severity: 'fatal',
        quote_in_rewrite: after.slice(0, 80),
        evidence_in_resume: sourceOk ? source.slice(0, 80) : '未找到',
        fix_instruction: `回退改动 ${entry.change_id ?? ''}：${why}`,
      });
    }
  }

  // —— V2 越权升格 ——
  for (const entry of ledger) {
    if (entry.change_type === 'order' || entry.source_type === 'missing') continue;
    const before = String(entry.before ?? '');
    const after = String(entry.after ?? '');
    if (!after || before === after) continue;
    const weak = weakVerbsIn(before);
    const strongInAfter = strongVerbsIn(after).filter((v) => !before.includes(v));
    if (weak.length && strongInAfter.length) {
      add({
        change_id: entry.change_id ?? '',
        check: 'V2',
        type: '越权升格',
        severity: 'fatal',
        quote_in_rewrite: after.slice(0, 80),
        evidence_in_resume: before.slice(0, 80),
        fix_instruction: `把「${strongInAfter.join('/')}」改回原文的「${weak.join('/')}」表述，不得升格`,
      });
    }
  }
  // 全局兜底：改写稿里出现的强动词，原简历里一次都没有 → 至少 major
  for (const verb of strongVerbsIn(rewritten)) {
    if (resume_text.includes(verb)) continue;
    add({
      check: 'V2',
      type: '越权升格',
      severity: 'major',
      quote_in_rewrite: verb,
      evidence_in_resume: '未找到',
      fix_instruction: `删除改写稿中无原文依据的「${verb}」表述`,
    });
  }

  // —— V3 数字与实体 ——
  const rewrittenNumbers = extractNumbers(rewritten);
  for (const num of rewrittenNumbers) {
    total += 1;
    const ok = resumeRawSet.has(num.raw) || resumeNumSet.has(numberKey(num));
    if (ok) {
      passed += 1;
    } else {
      add({
        change_id: '',
        check: 'V3',
        type: '数字不符',
        severity: 'fatal',
        quote_in_rewrite: num.raw,
        evidence_in_resume: '未找到',
        fix_instruction: `删除或还原数字「${num.raw}」，改写稿的数字必须与原简历完全一致`,
      });
    }
  }
  for (const name of ENTITY_NAMES) {
    if (!mentionsCompetency(rewritten, name)) continue;
    total += 1;
    if (mentionsCompetency(resume_text, name)) {
      passed += 1;
    } else {
      add({
        check: 'V3',
        type: '实体新增',
        severity: 'fatal',
        quote_in_rewrite: name,
        evidence_in_resume: '未找到',
        fix_instruction: `删除原简历中不存在的技术/能力实体「${name}」`,
      });
    }
  }

  // 无基准的模糊量化词：原文没有对应说法就是编的
  for (const phrase of ['显著提升', '大幅提升', '明显提升', '显著优化', '大幅优化', '明显优化', '极大提升', '翻倍']) {
    if (rewritten.includes(phrase) && !resume_text.includes(phrase)) {
      add({
        check: 'V3',
        type: '无依据',
        severity: 'major',
        quote_in_rewrite: phrase,
        evidence_in_resume: '未找到',
        fix_instruction: `删除无基准的模糊量化「${phrase}」，换成原文里的具体数字或产出`,
      });
    }
  }

  // —— V4 覆盖与贴标签 ——
  const keywordBank = jd_json.keyword_bank?.must ?? [];
  const gaps = [];
  let keywordHit = 0;
  for (const kw of keywordBank) {
    const inRewrite = mentionsCompetency(rewritten, kw);
    const inResume = mentionsCompetency(resume_text, kw);
    if (inRewrite) keywordHit += 1;
    if (inRewrite && !inResume) {
      add({
        change_id: '',
        check: 'V4',
        type: '贴标签',
        severity: 'major',
        quote_in_rewrite: kw,
        evidence_in_resume: '未找到',
        fix_instruction: `删除无事实支撑的关键词「${kw}」`,
      });
    }
    if (!inRewrite) {
      const declared = missing.some(
        (m) => m.competency_name === kw || m.jd_requirement?.includes(kw),
      );
      gaps.push({ competency_id: '', level: 'must', note: `${kw} 未在改写稿中出现${declared ? '（已列入待补清单）' : '，且未列入待补清单'}` });
      if (!declared) {
        add({
          change_id: '',
          check: 'V4',
          type: '覆盖缺口',
          severity: 'major',
          quote_in_rewrite: '',
          evidence_in_resume: '未找到',
          fix_instruction: `在待补清单中登记「${kw}」并向用户确认，不得直接写入改写稿`,
        });
      }
    }
  }

  // —— V5 缺失项泄漏 ——
  for (const item of missing) {
    const name = item.competency_name || '';
    if (!name) continue;
    if (mentionsCompetency(rewritten, name) && !mentionsCompetency(resume_text, name)) {
      add({
        change_id: '',
        check: 'V5',
        type: '缺失项泄漏',
        severity: 'fatal',
        quote_in_rewrite: name,
        evidence_in_resume: '未找到',
        fix_instruction: `把「${name}」从改写稿中删除，它属于待补清单`,
      });
    }
  }

  const fatal = violations.filter((v) => v.severity === 'fatal');
  const major = violations.filter((v) => v.severity === 'major');
  const verdict = fatal.length ? 'BLOCK' : major.length ? 'REVISE' : 'PASS';

  // —— 打分 ——
  const resume = parseResume(resume_text);
  const competencies = jd_json.core_competencies ?? [];
  const evidence = collectEvidence(resume, competencies);
  const mustComps = competencies.filter((c) => c.level === 'must');
  const covered = mustComps.filter((c) => (evidence.byCompetency.get(c.name) ?? []).length > 0).length;
  const jdCoverage = mustComps.length ? Math.round((covered / mustComps.length) * 100) : 0;
  const keywordPct = keywordBank.length ? Math.round((keywordHit / keywordBank.length) * 100) : 0;
  const allEvidence = [...evidence.byCompetency.values()].flat();
  const quantPct = allEvidence.length
    ? Math.round((allEvidence.filter((e) => e.quantified).length / allEvidence.length) * 100)
    : 0;

  let fact = total ? Math.round((passed / total) * 100) : 100;
  if (fatal.length && fact > 95) fact = 95;

  const overall = Math.round(fact * 0.4 + jdCoverage * 0.3 + keywordPct * 0.2 + quantPct * 0.1);

  return {
    verdict,
    score: {
      fact_consistency: fact,
      jd_coverage: jdCoverage,
      keyword_hit: keywordPct,
      quantification: quantPct,
      overall,
    },
    violations,
    coverage_gaps: gaps,
    revise_instructions: [...new Set(revise)],
    fatal_rollback: fatal
      .filter((v) => v.change_id)
      .map((v) => {
        const entry = ledger.find((e) => e.change_id === v.change_id);
        return { change_id: v.change_id, rollback_to: entry?.before ?? '' };
      }),
    passed_claims_count: passed,
    total_claims_count: total,
    summary: fatal.length
      ? `拦截 ${fatal.length} 处无依据/升格/数字问题，需回退原文`
      : major.length
        ? `发现 ${major.length} 处需修订问题`
        : `通过 ${passed}/${total} 条断言，无幻觉风险`,
  };
}
