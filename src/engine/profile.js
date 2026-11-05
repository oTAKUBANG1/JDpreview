// 用户档案：把简历里的事实抽成结构化卡片，每条能力都指回原文行。
// 目的不是「给人打分」，而是让匹配有依据：证据 / 弱证据 / 缺口，三态可解释。
// 推断出来的东西一律不写进档案——宁可空着。

import { parseResume } from './match.js';
import { COMPETENCIES, mentionsCompetency } from './lexicon.js';
import { extractNumbers } from './utils.js';
import { detectDegree, detectYears } from './hardGate.js';

const PERIOD_RE = /((?:19|20)\d{2})\s*[.\-/年]?\s*(\d{1,2})?\s*[-–—~至]+\s*(至今|现在|目前|(?:19|20)\d{2}\s*[.\-/年]?\s*\d{0,2})\s*(.*)/;
const RESULT_RE = /(提升|增长|降低|减少|节省|覆盖|达成|上线|交付|产出|完成|获奖|排名|转化)/;

function collectLines(resume) {
  const out = [];
  for (const section of resume.sections) {
    for (const line of section.lines) out.push({ section: section.title, text: line.text });
  }
  return out;
}

export function buildProfile(resumeText) {
  const text = String(resumeText ?? '');
  const resume = parseResume(text);
  const lines = collectLines(resume);
  const degree = detectDegree(text);
  const years = detectYears(text, resume);

  // 能力项：只收简历原文里真的出现过的
  const skills = [];
  for (const comp of COMPETENCIES) {
    const hits = lines.filter((l) => mentionsCompetency(l.text, comp.name));
    if (!hits.length) continue;
    skills.push({
      name: comp.name,
      group: comp.group,
      evidence_count: hits.length,
      quantified: hits.some((l) => extractNumbers(l.text).length > 0),
      evidence: hits.slice(0, 3).map((l) => ({ section: l.section, text: l.text })),
    });
  }
  skills.sort((a, b) => b.evidence_count - a.evidence_count || a.name.localeCompare(b.name));

  // 履历：时间区间 + 后面那段描述
  const roles = [];
  for (const line of lines) {
    const m = line.text.match(PERIOD_RE);
    if (!m) continue;
    roles.push({
      period: `${m[1]}${m[2] ? `.${m[2]}` : ''} - ${m[3].trim()}`,
      desc: (m[4] ?? '').trim(),
    });
  }

  // 亮点：带数字且有结果词的句子，最多 6 条
  const highlights = lines
    .filter((l) => extractNumbers(l.text).length > 0 && RESULT_RE.test(l.text))
    .slice(0, 6)
    .map((l) => ({ section: l.section, text: l.text }));

  return {
    basics: {
      degree: degree?.label ?? '未识别',
      degree_rank: degree?.rank ?? 0,
      years_experience: Number(years.toFixed(1)),
    },
    roles: roles.slice(0, 6),
    skills: skills.slice(0, 14),
    highlights,
    stats: {
      skill_count: skills.length,
      evidence_lines: lines.length,
      quantified_highlights: highlights.length,
    },
    note: '档案只记录简历里写出来的事实；推断项不进档案，缺口会出现在匹配矩阵里。',
  };
}

/**
 * 匹配矩阵：JD 每个能力项 × 简历证据 → evidence / weak / gap
 * conflict 只在硬门槛层判断（pipeline 的 hard_gate），这里不重复。
 */
export function buildMatrix(jdJson, resumeText) {
  const resume = parseResume(resumeText);
  const lines = collectLines(resume);
  return (jdJson.core_competencies ?? []).map((comp) => {
    const hits = lines.filter((l) => mentionsCompetency(l.text, comp.name));
    const quantified = hits.some((l) => extractNumbers(l.text).length > 0);
    const strong = hits.length >= 2 || quantified;
    return {
      competency_id: comp.id,
      name: comp.name,
      weight: comp.weight,
      level: comp.level,
      status: hits.length === 0 ? 'gap' : strong ? 'evidence' : 'weak',
      evidence_count: hits.length,
      quantified,
      evidence: hits.slice(0, 2).map((l) => l.text),
    };
  });
}
