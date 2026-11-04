// ① JD 解析：把 JD 拆成可比对的能力清单。只抽取、分类，不评价候选人。
// 设计原则：宁可少写，不可脑补。拿不到 JD 原文依据的条目一律不产出。

import { normalizeText, splitUnits, clip, detectSection } from './utils.js';
import { findCompetencies } from './lexicon.js';

const NOISE_RE = /(薪资|薪酬|月薪|年薪|薪|五险|公积金|福利|补贴|年终奖|期权|股权|弹性工作|双休|大小周|团建|下午茶|零食|办公地点|工作地点|上班地点|公司地址|地铁|邮箱|简历投递|投递简历|简历请|创始人|融资|天使轮|A轮|B轮|C轮|D轮|上市公司|我们是一家|公司简介|关于我们|团队规模|公司规模|招聘流程|面试流程|年假|带薪|餐补|房补|交通补|节日|生日|体检)/;
const LABEL_RE = /^(岗位职责|工作职责|职位描述|工作内容|你将负责|你将会|负责内容|任职要求|岗位要求|任职资格|职位要求|我们希望你|希望你|你需要|加分项|优先条件|加分)[:：]?$/;
const DUTY_LABEL_RE = /职责|工作内容|你将|负责内容|职位描述/;
const BONUS_LABEL_RE = /加分|优先/;

const HARD_RE = /(本科|硕士|博士|大专|统招|全日制|985|211|双一流|\d+\s*年(以上|及以上)|[一二两三四五六七八九十]+\s*年(以上|及以上)|必须|仅限|至少|需具备|须具备|要求具备|持有|证书|CET-?[46]|雅思|托福|英语(四|六)级)/;
const NICE_RE = /(优先|加分|更佳|更好|为佳|了解即可|锦上添花|者优先|有…?者优先)/;
const EMPHASIS_RE = /(核心|重点|关键|必须|主导|独立负责|从0到1|从 0 到 1)/;
const ACTION_RE = /(负责|参与|推动|设计|制定|搭建|运营|分析|输出|管理|优化|落地|协同|推进|迭代|产出|建设|规划|跟进|维护|对接|熟悉|掌握|精通|具备|使用|有.{0,8}经验)/;
const LEVEL_RE = /(实习|应届|校招|初级|助理|高级|资深|专家|总监|负责人|主管)/;
const TITLE_RE = /(产品|运营|数据|算法|研发|开发|测试|设计|市场|销售|人力|财务|项目|增长|战略|商务|内容|用户研究|交互|视觉|前端|后端|全栈)[^\s，。；]{0,6}(经理|专员|总监|主管|工程师|架构师|分析师|助理|专家)?/;

const ID = (prefix, n) => `${prefix}${String(n).padStart(2, '0')}`;

function fatal(message) {
  return {
    role_summary: { title: '', level: '', domain: '', one_line: '' },
    hard_requirements: [],
    core_competencies: [],
    nice_to_have: [],
    keyword_bank: { must: [], alias: {} },
    implicit_needs: [],
    scoring_anchors: [],
    jd_quality_notes: [`FATAL: ${message}`],
  };
}

function detectRole(units, targetRole) {
  const title = targetRole?.trim() || '';
  if (title) {
    return { title, level: (title.match(LEVEL_RE) ?? [''])[0], domain: '', one_line: '' };
  }
  for (const unit of units.slice(0, 3)) {
    // 第一行往往就是「AI 产品经理（大模型应用方向）」这种岗位名，优先整行取用
    const head = unit.split(/[（(|｜]/)[0].trim();
    if (head.length >= 2 && head.length <= 24 && /(经理|工程师|专员|总监|主管|分析师|架构师|设计师|运营|研究员)/.test(head) && !/负责|参与|要求/.test(head)) {
      return { title: head, level: (head.match(LEVEL_RE) ?? [''])[0], domain: '', one_line: clip(unit, 50) };
    }
  }
  for (const unit of units.slice(0, 4)) {
    const t = unit.match(TITLE_RE);
    if (t) {
      const clean = t[0].split(/[（(|｜·]/)[0].trim();
      if (clean.length >= 2) {
        return {
          title: clean,
          level: (clean.match(LEVEL_RE) ?? [''])[0],
          domain: '',
          one_line: clip(unit, 50),
        };
      }
    }
  }
  return { title: '', level: '', domain: '', one_line: clip(units[0] ?? '', 50) };
}

export function parseJD(jdText, targetRole = '') {
  const text = normalizeText(jdText);
  if (!text) return fatal('JD 为空，无法解析');
  if (text.length < 15) return fatal(`JD 只有 ${text.length} 个字符，不足以解析出有效需求`);

  const units = splitUnits(text);
  if (!units.length) return fatal('JD 没有可解析的文本行');

  const notes = [];
  const hard = [];
  const nice = [];
  const competencyMap = new Map(); // name -> { name, weight, quotes: [], firstIndex, group }
  let mode = 'duty';
  let noiseCount = 0;

  units.forEach((unit, index) => {
    const label = unit.replace(/[:：]\s*$/, '');
    if (LABEL_RE.test(label)) {
      if (BONUS_LABEL_RE.test(label)) mode = 'bonus';
      else if (DUTY_LABEL_RE.test(label)) mode = 'duty';
      else mode = 'requirement';
      return;
    }
    if (detectSection(unit) && unit.length < 12) return;

    if (NOISE_RE.test(unit)) {
      noiseCount += 1;
      return;
    }

    const isBonus = mode === 'bonus' || NICE_RE.test(unit);
    const isHard = !isBonus && HARD_RE.test(unit);
    const hits = findCompetencies(unit);

    if (isBonus) {
      nice.push({ id: ID('N', nice.length + 1), text: clip(unit, 80), jd_quote: clip(unit, 60) });
      return;
    }

    if (isHard) {
      hard.push({
        id: ID('H', hard.length + 1),
        text: clip(unit, 80),
        jd_quote: clip(unit, 60),
        checkable: /(本科|硕士|博士|大专|\d+\s*年|级别|证书|CET)/.test(unit),
      });
    }

    if (!hits.length) return;
    if (unit.length < 4) return;
    if (!ACTION_RE.test(unit) && !isHard && mode === 'duty') {
      // 职责区里没有动作词、也没命中能力词的句子，多半是背景介绍
      return;
    }

    // 「任职要求」区里的能力项才是真正的门槛；职责区里的按位置加权
    let weight = mode === 'requirement' ? 5 : index < 3 ? 5 : 4;
    if (EMPHASIS_RE.test(unit)) weight = Math.min(5, weight + 1);
    if (!ACTION_RE.test(unit)) weight = Math.max(3, weight - 1);

    for (const hit of hits) {
      const prev = competencyMap.get(hit.name);
      if (prev) {
        prev.weight = Math.max(prev.weight, weight);
        if (prev.quotes.length < 3 && !prev.quotes.includes(clip(unit, 60))) {
          prev.quotes.push(clip(unit, 60));
        }
      } else {
        competencyMap.set(hit.name, {
          name: hit.name,
          group: hit.group,
          weight,
          quotes: [clip(unit, 60)],
          firstIndex: index,
        });
      }
    }
  });

  const competencies = [...competencyMap.values()].sort(
    (a, b) => b.weight - a.weight || a.firstIndex - b.firstIndex,
  );

  // must 级：JD 明确强调（weight 5）的；若 JD 一个都没强调，取前 3，避免覆盖率分母为 0
  let mustNames = competencies.filter((c) => c.weight >= 5).map((c) => c.name);
  if (!mustNames.length) mustNames = competencies.slice(0, 3).map((c) => c.name);

  const core = competencies.map((c, i) => ({
    id: ID('C', i + 1),
    name: c.name,
    weight: c.weight,
    level: mustNames.includes(c.name) ? 'must' : 'should',
    jd_quote: c.quotes[0] ?? '',
    evidence_type: guessEvidenceType(c.group),
    inferred: false,
    confidence: 1,
  }));

  const keywordMust = [...mustNames];
  for (const h of hard) {
    for (const hit of findCompetencies(h.text)) {
      if (!keywordMust.includes(hit.name) && keywordMust.length < 12) keywordMust.push(hit.name);
    }
  }

  const alias = {};
  for (const name of keywordMust) {
    const item = competencies.find((c) => c.name === name);
    if (item) alias[name] = [];
  }

  if (noiseCount >= 1) notes.push(`JD 中混入 ${noiseCount} 行薪资/福利/公司介绍等非能力信息，已剔除`);
  if (!core.length && !hard.length) notes.push('该 JD 无明确能力要求，对齐结果仅供参考');
  if (core.length && !competencies.some((c) => c.weight >= 5)) {
    notes.push('JD 未强调任何能力项，已按前 3 条职责推断 must 级，结论仅供参考');
  }
  if (/(应届|校招|实习)/.test(text) && /(\d+\s*年(以上|及以上))/.test(text)) {
    notes.push('JD 同时要求应届与工作年限，要求可能自相矛盾，请与 HR 确认');
  }

  return {
    role_summary: detectRole(units, targetRole),
    hard_requirements: hard,
    core_competencies: core,
    nice_to_have: nice,
    keyword_bank: { must: keywordMust, alias },
    implicit_needs: buildImplicitNeeds(text),
    scoring_anchors: core
      .filter((c) => c.level === 'must')
      .map((c) => ({
        competency_id: c.id,
        strong_evidence: `${c.name}，且有量化结果或明确产出`,
        weak_evidence: `${c.name}，仅一句话带过、无结果`,
      })),
    jd_quality_notes: notes,
  };
}

function guessEvidenceType(group) {
  if (group === '技术') return '技能';
  if (group === '数据') return '工作成果';
  if (group === '通用') return '软能力';
  return '项目经历';
}

// 只保留极少数「JD 原文明确出现、但没被写成能力项」的推断，confidence 一律不高
function buildImplicitNeeds(text) {
  const needs = [];
  if (/从\s*0\s*到\s*1|0-1/.test(text)) {
    needs.push({
      text: '具备从 0 到 1 搭建业务/产品的经验',
      inferred: true,
      confidence: 0.55,
      reason: 'JD 原文出现「从0到1」',
    });
  }
  if (/(带|管理).{0,3}团队|团队规模/.test(text) && !/团队管理/.test(text)) {
    needs.push({
      text: '有带团队经历',
      inferred: true,
      confidence: 0.5,
      reason: 'JD 原文提到团队管理/团队规模',
    });
  }
  return needs;
}
