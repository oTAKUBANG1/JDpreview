// ③ 对齐改写：只做两类动作 —— 条目重排、语义等价术语对齐。
// 这两类动作都不产生新事实，所以改写稿的事实一致率可以被机器验证。
// 明确不做：自由重写句子、删减内容、补 STAR、加量化数字（这些留给 v0.2 的 LLM 模式，且必须过闸门）。

import { parseResume, collectEvidence, lineRelevance } from './match.js';
import { clip, hasNumber } from './utils.js';

// 只收「可以逐字替换且不改变事实」的近义词对，宁缺毋滥
const SAFE_ALIGN = new Map([
  ['用户访谈', '用户调研'],
  ['用户研究', '用户调研'],
  ['需求调研', '需求分析'],
  ['需求梳理', '需求分析'],
  ['竞品调研', '竞品分析'],
  ['竞对分析', '竞品分析'],
  ['产品需求文档', 'PRD'],
  ['AB测试', 'A/B测试'],
  ['AB test', 'A/B测试'],
  ['ABTest', 'A/B测试'],
  ['K8s', 'Kubernetes'],
  ['k8s', 'Kubernetes'],
  ['golang', 'Go'],
]);

const REORDER_SECTIONS = /(工作|项目|实习|实践|经历|技能)/;
const AGGRESSIVE_SECTIONS = /(技能|专业)/;

function alignTerm(line, targets) {
  for (const target of targets) {
    // 这里必须看「字面」而不是同义词命中，否则原句里出现同义写法会被误判为已对齐
    if (line.includes(target)) continue;
    for (const [alias, canonical] of SAFE_ALIGN) {
      if (canonical !== target) continue;
      if (!line.includes(alias)) continue;
      const after = line.replace(alias, canonical);
      if (after !== line) return { after, alias, canonical };
    }
  }
  return null;
}

function composeResume(resume, reorderSet, aggressive) {
  const out = [];
  if (resume.header.length) {
    out.push(...resume.header.map((l) => l.text));
  }
  for (const section of resume.sections) {
    out.push('');
    out.push(`## ${section.rawTitle.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '')}`);
    const canReorder =
      REORDER_SECTIONS.test(section.title) || (aggressive && AGGRESSIVE_SECTIONS.test(section.title));
    const lines = canReorder ? reorderSet.get(section.title) ?? section.lines : section.lines;
    for (const line of lines) out.push(`${line.bullet ? '- ' : ''}${line.text}`);
  }
  return out.join('\n').trim();
}

// 只在「连续的项目符号段落」内部重排；公司名/时间这类标题行永远钉在原位，
// 否则会出现「职位标题被排到项目条目下面」的荒谬结果。
function reorderRuns(lines) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    run.sort((a, b) => b.score - a.score || a.index - b.index);
    out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (line.bullet) run.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out;
}

export function rewriteResume({ jd_json, resume_text, strictness = 'strict', revise_instructions = [] }) {
  const resume = parseResume(resume_text);
  const competencies = jd_json.core_competencies ?? [];
  const mustComps = competencies.filter((c) => c.level === 'must');
  const evidence = collectEvidence(resume, competencies);
  const allowTermAlign = strictness !== 'strict';
  const aggressive = strictness === 'aggressive';

  const fact_ledger = [];
  const orderMoves = [];
  const aligned = new Map(); // section title -> lines（替换后的文本）
  const targets = mustComps.map((c) => c.name);

  for (const section of resume.sections) {
    const scored = section.lines.map((line) => ({
      ...line,
      ...lineRelevance(line.text, competencies),
    }));
    const canReorder =
      REORDER_SECTIONS.test(section.title) || (aggressive && AGGRESSIVE_SECTIONS.test(section.title));

    const sorted = canReorder ? reorderRuns(scored) : scored;

    // 记录有意义的位次变化（移动 ≥ 2 位），供「改了什么」表展示
    if (canReorder) {
      const beforeRank = new Map(scored.map((l, i) => [l.index, i]));
      sorted.forEach((line, i) => {
        const old = beforeRank.get(line.index);
        if (old !== undefined && old - i >= 2 && line.score > 0) {
          orderMoves.push({
            line,
            from: old,
            to: i,
            section: section.title,
            delta: old - i,
          });
        }
      });
    }

    const finalLines = [];
    for (const line of sorted) {
      let text = line.text;
      if (allowTermAlign) {
        const change = alignTerm(text, targets);
        if (change) {
          fact_ledger.push({
            change_id: `C${String(fact_ledger.length + 1).padStart(2, '0')}`,
            change_type: 'term',
            competency_id: mustComps.find((c) => c.name === change.canonical)?.id ?? '',
            before: text,
            after: change.after,
            source_quote: text,
            source_type: 'explicit',
            confidence: 1,
            reason: `术语对齐：「${change.alias}」与 JD 用语「${change.canonical}」语义等价，逐字替换不改变事实`,
          });
          text = change.after;
        }
      }
      finalLines.push({ ...line, text });
    }
    aligned.set(section.title, finalLines);
  }

  // 位次变化入账：before/after 文本相同，source_type=explicit，仅描述位置
  for (const move of orderMoves.slice(0, 10)) {
    fact_ledger.push({
      change_id: `C${String(fact_ledger.length + 1).padStart(2, '0')}`,
      change_type: 'order',
      competency_id: competencies.find((c) => c.name === move.line.names[0])?.id ?? '',
      before: move.line.text,
      after: move.line.text,
      source_quote: move.line.text,
      source_type: 'explicit',
      confidence: 1,
      reason: `位次前移 ${move.delta} 位（${move.section}）：命中 ${move.line.names.join('、')}，与 JD 权重更高的能力项直接相关`,
    });
  }

  const rewritten_resume = composeResume(resume, aligned, aggressive);

  // —— 缺失项：JD 要、简历找不到依据 ——
  const missing_items = [];
  for (const comp of competencies) {
    const ev = evidence.byCompetency.get(comp.name) ?? [];
    if (ev.length === 0) {
      missing_items.push({
        competency_id: comp.id,
        competency_name: comp.name,
        jd_requirement: comp.jd_quote ?? comp.name,
        resume_status: '完全无相关经历',
        priority: comp.level,
      });
    } else if (comp.level === 'must' && !ev.some((e) => e.quantified)) {
      missing_items.push({
        competency_id: comp.id,
        competency_name: comp.name,
        jd_requirement: comp.jd_quote ?? comp.name,
        resume_status: '有经历但缺少量化',
        priority: 'should',
      });
    }
  }
  // 缺失项也进 ledger 占位（after 必须为空）
  for (const item of missing_items.filter((m) => m.priority === 'must')) {
    fact_ledger.push({
      change_id: `C${String(fact_ledger.length + 1).padStart(2, '0')}`,
      change_type: 'missing',
      competency_id: item.competency_id,
      before: item.jd_requirement,
      after: '',
      source_quote: '',
      source_type: 'missing',
      confidence: 1,
      reason: 'JD 要求但简历无依据，不写入改写稿，转待补清单',
    });
  }

  const questions_for_user = [];
  for (const item of missing_items) {
    if (item.resume_status === '完全无相关经历') {
      questions_for_user.push(
        `你在过往经历里有没有做过「${item.competency_name}」相关的事？如果有：在哪个项目、你具体做了什么、产出了什么（文档 / 功能 / 数据结果）？`,
      );
    }
  }
  for (const comp of mustComps) {
    const ev = evidence.byCompetency.get(comp.name) ?? [];
    // 技能清单里的「熟练使用 XX」问不出量化结果，别浪费用户注意力
    const unquantified = ev.find(
      (e) =>
        !e.quantified &&
        !/(技能|证书|专业)/.test(e.section) &&
        /(负责|参与|推动|设计|制定|搭建|运营|优化|落地|完成|交付|输出|管理|跟进|对接)/.test(e.text),
    );
    if (unquantified && questions_for_user.length < 8) {
      questions_for_user.push(
        `「${clip(unquantified.text, 30)}」这条能补一个结果数字吗？比如覆盖多少用户、提升 / 节省多少、周期多长？`,
      );
    }
  }

  const mustMissing = mustComps.filter((c) => (evidence.byCompetency.get(c.name) ?? []).length === 0);
  const mustWeightTotal = mustComps.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const mustWeightAddressed = mustComps
    .filter((c) => (evidence.byCompetency.get(c.name) ?? []).length > 0)
    .reduce((sum, c) => sum + (c.weight ?? 1), 0);

  return {
    rewritten_resume,
    fact_ledger,
    missing_items,
    questions_for_user: [...new Set(questions_for_user)],
    coverage_self_check: {
      must_total: mustComps.length,
      must_addressed: mustComps.length - mustMissing.length,
      must_missing: mustMissing.map((c) => c.name),
      must_weight_total: mustWeightTotal,
      must_weight_addressed: mustWeightAddressed,
    },
    revise_applied: revise_instructions.length
      ? revise_instructions.map((i) => `已响应：${i}`)
      : [],
    irrelevant_lines: collectIrrelevant(aligned, competencies),
  };
}

function collectIrrelevant(aligned, competencies) {
  const out = [];
  for (const [section, lines] of aligned) {
    if (!REORDER_SECTIONS.test(section)) continue;
    for (const line of lines) {
      const rel = lineRelevance(line.text, competencies);
      if (rel.score === 0 && !hasNumber(line.text) && line.text.length > 8) {
        out.push({ section, text: clip(line.text, 60) });
      }
    }
  }
  return out.slice(0, 8);
}

export { SAFE_ALIGN };
