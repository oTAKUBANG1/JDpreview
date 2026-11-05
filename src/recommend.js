// 岗位推荐：拿简历在 JD 池里按「匹配度 + 新鲜度 + 热度」排序，返回 3 个左右并附理由。
// 硬门槛不满足的岗位直接排除——推荐一个用户根本没资格投的岗位，比不推荐更糟。

import { compareHardRequirements } from './engine/hardGate.js';
import { mentionsCompetency, findCompetencies } from './engine/lexicon.js';

const DAY = 86400000;

export function scoreJdAgainstResume(row, resumeText, now = new Date()) {
  const jd = JSON.parse(row.jd_json || '{}');
  const core = jd.core_competencies ?? [];
  const must = core.filter((c) => c.level === 'must');
  const nice = jd.nice_to_have ?? [];
  const keywords = jd.keyword_bank?.must ?? [];

  const addressed = must.filter((c) => mentionsCompetency(resumeText, c.name));
  const mustWeightTotal = must.reduce((s, c) => s + (c.weight ?? 1), 0);
  const mustWeightHit = addressed.reduce((s, c) => s + (c.weight ?? 1), 0);
  const coverage = mustWeightTotal ? mustWeightHit / mustWeightTotal : 0;

  const niceHits = nice.filter((n) => findCompetencies(n.text ?? '').some((h) => mentionsCompetency(resumeText, h.name)));
  const niceCoverage = nice.length ? niceHits.length / nice.length : coverage;

  const kwHit = keywords.length ? keywords.filter((k) => mentionsCompetency(resumeText, k)).length / keywords.length : 0;

  const match = 0.6 * coverage + 0.2 * niceCoverage + 0.2 * kwHit;
  const days = Math.max(0, (now.getTime() - new Date(row.last_seen).getTime()) / DAY);
  const freshness = Math.exp(-days / 14);
  const popularity = Math.min(1, Math.log1p(row.paste_count ?? 1) / Math.log(11));

  const gaps = must
    .filter((c) => !mentionsCompetency(resumeText, c.name))
    .map((c) => c.name)
    .slice(0, 3);
  const matched = addressed.map((c) => c.name).slice(0, 3);

  return {
    id: row.id,
    title: jd.role_summary?.title || row.title || '未命名岗位',
    company: row.company || '',
    score: 0.75 * match + 0.2 * freshness + 0.05 * popularity,
    match,
    coverage,
    freshness_days: Math.round(days),
    paste_count: row.paste_count ?? 1,
    must_total: must.length,
    must_hit: addressed.length,
    matched,
    gaps,
    text: row.text,
  };
}

export function recommendJobs(store, resumeText, { limit = 3, now = new Date(), activeDays = 30 } = {}) {
  const rows = store.listActive({ days: activeDays, now, limit: 300 });
  const poolSize = rows.length;
  const hardFailed = [];
  const scored = [];

  for (const row of rows) {
    let jd;
    try {
      jd = JSON.parse(row.jd_json || '{}');
    } catch {
      continue;
    }
    if (!(jd.core_competencies ?? []).length) continue;
    if (compareHardRequirements(resumeText, jd).failed) {
      hardFailed.push(row.id);
      continue;
    }
    scored.push(scoreJdAgainstResume(row, resumeText, now));
  }

  scored.sort((a, b) => b.score - a.score || b.match - a.match);
  // 冷启动：池子太小就不做阈值筛选，有什么给什么，但明确标注
  const coldStart = poolSize < 5;
  const picked = coldStart ? scored.slice(0, limit) : scored.filter((s) => s.match >= 0.15).slice(0, limit);

  return {
    items: picked.map((p) => ({ ...p, score: Math.round(p.score * 100), match: Math.round(p.match * 100) })),
    pool_size: poolSize,
    hard_failed: hardFailed.length,
    cold_start: coldStart,
    note: poolSize === 0 ? '岗位池还是空的：先分析几份 JD，它们会自动入库' : coldStart ? '岗位池较小，推荐仅供参考' : '',
  };
}
