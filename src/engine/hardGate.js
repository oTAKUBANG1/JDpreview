// 硬门槛比对：学历、年限这类「不满足就别投」的条件，v0.1 解析出来却没有模块消费。
// 这里用保守规则从简历抽事实；抽不准的项标记「需人工确认」，不拿猜测下结论。

import { parseResume } from './match.js';

const DEGREE_RANK = [
  { pattern: /博士/, label: '博士', rank: 5 },
  { pattern: /硕士|研究生/, label: '硕士', rank: 4 },
  { pattern: /本科|学士/, label: '本科', rank: 3 },
  { pattern: /大专|专科/, label: '大专', rank: 2 },
  { pattern: /中专|高中|职高/, label: '中专/高中', rank: 1 },
];

const WORK_SECTION = /(工作|实习|实践|经历)/;
// 只有「AI / 算法 / 金融」这类限定领域才算窄领域年限；
// 「产品经理经验」是岗位本身，不是限定领域，按总年限比对即可。
const DOMAIN_WORD = /(AI|人工智能|大模型|算法|数据|金融|医疗|电商|教育|游戏|社交|广告|供应链|B端|C端|ToB|ToC)/i;

function detectDegree(text) {
  for (const d of DEGREE_RANK) {
    if (d.pattern.test(text)) return d;
  }
  return null;
}

/** 从「YYYY.MM - YYYY.MM/至今」这类区间累计工作月数，只看工作/实习区块 */
function estimateMonths(resume) {
  const now = new Date();
  const nowMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
  const lines = [];
  for (const section of resume.sections) {
    if (!WORK_SECTION.test(section.title)) continue;
    for (const line of section.lines) lines.push(line.text);
  }
  if (!lines.length) {
    for (const section of resume.sections) for (const line of section.lines) lines.push(line.text);
  }

  let months = 0;
  for (const line of lines) {
    const years = [...line.matchAll(/((?:19|20)\d{2})\s*[.年\-\/]?\s*(\d{1,2})?/g)];
    if (!years.length) continue;
    const startYear = Number(years[0][1]);
    const startMonth = Number(years[0][2] ?? 1);
    const openEnded = /至今|现在|目前/.test(line);
    let endYear;
    let endMonth;
    if (openEnded) {
      endYear = now.getFullYear();
      endMonth = now.getMonth() + 1;
    } else if (years.length >= 2) {
      endYear = Number(years[1][1]);
      endMonth = Number(years[1][2] ?? 12);
    } else {
      continue;
    }
    const start = startYear * 12 + Math.min(12, Math.max(1, startMonth));
    const end = endYear * 12 + Math.min(12, Math.max(1, endMonth));
    if (end > start && end - start < 600) months += end - start;
  }
  return { months, totalMonthsNow: nowMonths };
}

function detectYears(text, resume) {
  const explicit = [...text.matchAll(/(\d+)\s*年(?:以上|及以上)?\s*(?:工作|相关)?经验/g)];
  const fromPeriods = estimateMonths(resume).months / 12;
  const fromText = explicit.length ? Math.max(...explicit.map((m) => Number(m[1]))) : 0;
  return Math.max(fromPeriods, fromText);
}

/**
 * 逐条比对 JD 硬门槛。返回 {items, failed, notes}
 * status: pass | fail | unverified（抽不准，交给人确认）
 */
export function compareHardRequirements(resumeText, jdJson) {
  const resume = parseResume(resumeText);
  const degree = detectDegree(resumeText);
  const years = detectYears(resumeText, resume);
  const items = [];
  const notes = [];

  for (const req of jdJson.hard_requirements ?? []) {
    const text = req.text ?? '';
    const clauses = text.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean);
    for (const clause of clauses) {
      const degreeNeed = detectDegree(clause);
      if (degreeNeed) {
        items.push(
          degree && degree.rank >= degreeNeed.rank
            ? {
                requirement_id: req.id,
                kind: '学历',
                text: req.jd_quote || text,
                status: 'pass',
                actual: `${degree.label}`,
                note: '',
              }
            : {
                requirement_id: req.id,
                kind: '学历',
                text: req.jd_quote || text,
                status: degree ? 'fail' : 'unverified',
                actual: degree ? degree.label : '未识别',
                note: degree
                  ? `JD 要求 ${degreeNeed.label} 及以上，简历是 ${degree.label}`
                  : '没找到学历信息，请在简历里补一行教育背景',
              },
        );
      }

      const yearMatch = clause.match(/(\d+)\s*年(以上|及以上)?/);
      if (!yearMatch) continue;
      const yearNeed = Number(yearMatch[1]);
      const domainCapture = clause.match(/\d+\s*年(?:以上)?\s*([^，。；]{0,12}?)经验/);
      const domainText = domainCapture?.[1] ?? '';
      const domainSpecific = DOMAIN_WORD.test(domainText) && !/工作|相关/.test(domainText);

      if (domainSpecific) {
        // 简历里连这个领域的影子都没有 → 直接判不满足；有影子但数不清年限 → 交给人确认
        const evidenceRe = /AI|人工智能|大模型|算法|模型|智能/i.test(domainText)
          ? /AI|人工智能|大模型|算法|模型|智能/i
          : /金融|银行|支付|风控|证券/.test(domainText)
            ? /金融|银行|支付|风控|证券/
            : null;
        const hasDomainEvidence = evidenceRe ? evidenceRe.test(resumeText) : false;
        items.push({
          requirement_id: req.id,
          kind: '领域年限',
          text: req.jd_quote || text,
          status: evidenceRe && !hasDomainEvidence ? 'fail' : 'unverified',
          actual: `总工作年限约 ${years.toFixed(1)} 年`,
          note:
            evidenceRe && !hasDomainEvidence
              ? `JD 要求 ${yearNeed} 年以上${domainText.trim()}经验，简历里找不到相关经历`
              : `限定领域年限（${domainText.trim()}）无法自动核实，需你自己判断`,
        });
      } else {
        const ok = years + 0.1 >= yearNeed;
        items.push({
          requirement_id: req.id,
          kind: '年限',
          text: req.jd_quote || text,
          status: ok ? 'pass' : 'fail',
          actual: `约 ${years.toFixed(1)} 年`,
          note: ok ? '' : `JD 要求 ${yearNeed} 年以上，简历累计约 ${years.toFixed(1)} 年`,
        });
      }
    }
  }

  const failed = items.some((i) => i.status === 'fail');
  if (items.some((i) => i.status === 'unverified')) {
    notes.push('有硬性条件无法自动核实，结论里已单列，别当成通过');
  }
  return { items, failed, degree: degree?.label ?? null, years: Number(years.toFixed(1)), notes };
}
