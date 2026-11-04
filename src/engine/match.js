// ② 简历解析与证据匹配：把简历切成「区块 + 条目」，再逐条能力项找证据句。
// 证据强度 = 命中能力词(2) + 动作动词(1) + 有数字(1) + 有结果词(1)。

import { normalizeText, resumeLines, detectSection, stripBullet, hasNumber } from './utils.js';
import { findCompetencies, mentionsCompetency, termsOf } from './lexicon.js';

const ACTION_RE = /(负责|参与|推动|设计|制定|搭建|运营|分析|输出|管理|优化|落地|协同|推进|迭代|产出|建设|规划|跟进|维护|对接|完成|交付|上线|主导|独立)/;
const RESULT_RE = /(提升|增长|降低|减少|节省|覆盖|达成|上线|交付|产出|完成|获奖|第一|Top|top|排名|转化率|留存|DAU|GMV)/;
const REORDERABLE_RE = /(工作|项目|实习|实践|经历|技能|专业)/;

/** 解析简历结构。header = 第一个区块标题之前的内容 */
export function parseResume(text) {
  const lines = resumeLines(text);
  const header = [];
  const sections = [];
  let current = null;
  const BULLET_RE = /^\s*(?:[-–—•·*▪◦●○]|\d{1,2}[.、)）](?=\s)|[（(]\d{1,2}[)）]|[一二三四五六七八九十]+[、.）)])/;
  lines.forEach((line, index) => {
    const title = detectSection(line);
    if (title) {
      current = { title, rawTitle: line, lines: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      header.push({ text: line, index });
      return;
    }
    current.lines.push({ text: stripBullet(line), index, bullet: BULLET_RE.test(line) });
  });
  return { header, sections };
}

export function lineRelevance(text, competencies) {
  const hits = findCompetencies(text);
  if (!hits.length) return { score: 0, names: [] };
  const byName = new Map(competencies.map((c) => [c.name, c]));
  const names = [...new Set(hits.map((h) => h.name))].filter((n) => byName.has(n));
  const score = names.reduce((sum, n) => sum + byName.get(n).weight, 0);
  return { score, names };
}

/** 逐能力项找证据句 */
export function collectEvidence(resume, competencies) {
  const allLines = [];
  for (const sec of resume.sections) {
    for (const line of sec.lines) allLines.push({ ...line, section: sec.title });
  }
  for (const line of resume.header) allLines.push({ ...line, section: '基本信息' });

  const byCompetency = new Map();
  for (const comp of competencies) {
    const evidence = [];
    for (const line of allLines) {
      if (!mentionsCompetency(line.text, comp.name)) continue;
      let score = 2;
      if (ACTION_RE.test(line.text)) score += 1;
      if (hasNumber(line.text)) score += 1;
      if (RESULT_RE.test(line.text)) score += 1;
      evidence.push({
        competency_id: comp.id,
        name: comp.name,
        line_index: line.index,
        section: line.section,
        text: line.text,
        score,
        quantified: hasNumber(line.text),
        strong: score >= 4,
      });
    }
    evidence.sort((a, b) => b.score - a.score || a.line_index - b.line_index);
    byCompetency.set(comp.name, evidence);
  }

  const must = competencies.filter((c) => c.level === 'must');
  const mustAddressed = must.filter((c) => (byCompetency.get(c.name) ?? []).length > 0);
  const allEvidence = [...byCompetency.values()].flat();

  return {
    sections: resume.sections.map((s) => s.title),
    byCompetency,
    stats: {
      total_lines: allLines.length,
      evidence_lines: allEvidence.length,
      repeated_evidence: allEvidence.length - new Set(allEvidence.map((e) => e.line_index)).size,
      must_total: must.length,
      must_addressed: mustAddressed.length,
      must_missing: must.filter((c) => !mustAddressed.includes(c)).map((c) => c.name),
      quantified_ratio: allEvidence.length
        ? Math.round((allEvidence.filter((e) => e.quantified).length / allEvidence.length) * 100)
        : 0,
    },
  };
}

export function findRelevantSections(resume) {
  return resume.sections.filter((s) => REORDERABLE_RE.test(s.title)).map((s) => s.title);
}

export { termsOf };
