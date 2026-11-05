// 文本工具：中英文混排的分句、数字抽取、简历行切分。
// 这里刻意不用分词库 —— 零依赖、可离线、行为可预测，代价是长尾词靠词库覆盖。

// 注意：日期行 "2015.09-2019.06" 不能被当成「1.」编号列表切掉，所以编号必须后跟空白
const LIST_MARK = /^\s*(?:[-–—•·*▪◦●○]\s*|\d{1,2}[.、)）](?=\s)|[（(]\d{1,2}[)）]\s*|[一二三四五六七八九十]+[、.）)]\s*)/;

export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 把 JD 切成「需求单元」：一行一条，长句按句号再切 */
export function splitUnits(text) {
  const lines = normalizeText(text).split('\n');
  const units = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(LIST_MARK, '').trim();
    if (!line) continue;
    if (line.length > 90 && /[。]/.test(line)) {
      for (const part of line.split(/(?<=。)/)) {
        const p = part.trim();
        if (p) units.push(p);
      }
    } else {
      units.push(line);
    }
  }
  // 招聘网站复制出来的 JD 常在词中间断行（「重\n点网络项目」「经验\n者优先」）。
  // 只接「明显被折断的长句 / 编号条目」；短标签（市场调研、本科、感兴趣）和页脚一律不接，
  // 否则整个头部会被拼成一坨，岗位职责标签也跟着丢。
  const merged = [];
  const NEXT_ITEM = /^(\d{1,2}[.、)]|[（(]\d{1,2}[)）]|[一二三四五六七八九十]+[、.]|[-•])/;
  const NEXT_JUNK = /^(丰女士|微信|收藏|举报|立即沟通|感兴趣|不合适|招聘中|刚刚活跃|职位描述|岗位职责|任职要求|岗位要求|公司介绍)/;
  for (const unit of units) {
    const prev = merged[merged.length - 1];
    const looksWrapped =
      prev &&
      !/[。；;！？!?：:]$/.test(prev) &&
      (prev.length > 30 || /^\d{1,2}[、.]/.test(prev));
    if (looksWrapped && prev.length < 160 && unit.length > 2 && !NEXT_ITEM.test(unit) && !NEXT_JUNK.test(unit)) {
      merged[merged.length - 1] = `${prev}${unit}`;
    } else {
      merged.push(unit);
    }
  }
  return merged;
}

export function stripBullet(line) {
  return String(line).replace(LIST_MARK, '').trim();
}

export function clip(text, n = 60) {
  const s = String(text ?? '').trim();
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export function cnToNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1) return CN_NUM[s] ?? null;
  if (s.length === 2 && s[0] === '十') return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.length === 2 && s[1] === '十') return (CN_NUM[s[0]] ?? 0) * 10;
  return null;
}

/**
 * 抽数字：保留「原样 token」用于一致性比对（3年 != 三年，不自动换算）。
 * 返回 [{ raw, num, unit, index }]
 */
export function extractNumbers(text) {
  const s = String(text ?? '');
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*(%|‰|万|亿|千|百|人|个|次|条|家|款|年|月|天|小时|分钟|k|K|w|W|DAU|dau|MAU|mau)?/g;
  let m;
  while ((m = re.exec(s))) {
    out.push({ raw: m[0].replace(/\s+/g, ''), num: m[1], unit: m[2] ?? '', index: m.index });
  }
  // 中文数字 + 单位（三年以上 / 十人团队）
  const cnRe = /([一二两三四五六七八九十]{1,2})\s*(年|人|个|次|款|家|条)/g;
  while ((m = cnRe.exec(s))) {
    out.push({ raw: m[0].replace(/\s+/g, ''), num: String(cnToNumber(m[1]) ?? m[1]), unit: m[2], index: m.index, chinese: true });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function hasNumber(text) {
  return extractNumbers(text).length > 0;
}

/** 简历行切分：去掉空行，保留原始行（用于原样回填） */
export function resumeLines(text) {
  return normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const SECTION_RE = /^(个人(信息|简介)?|基本信息|联系方式|求职意向|教育(背景|经历)?|工作(经历|经验)?|实习(经历|经验)?|项目(经历|经验)?|实践经历|校园(经历|活动)?|技能(特长|清单)?|专业技能|证书|荣誉|获奖|自我评价|个人优势|作品|培训经历|其他)\s*[:：]?\s*$/;

export function detectSection(line) {
  const clean = line.replace(/[：:]\s*$/, '').trim();
  if (SECTION_RE.test(clean)) return clean.replace(/[：:]$/, '');
  if (/^#{1,3}\s+/.test(line)) {
    const t = line.replace(/^#{1,3}\s+/, '').trim();
    if (SECTION_RE.test(t)) return t;
  }
  return null;
}

/** 语义等价判断用的「弱/强动词」，闸门 V2 靠它抓升格 */
export const WEAK_VERBS = ['参与', '协助', '配合', '了解', '接触', '学习', '跟进', '支持', '辅助'];
export const STRONG_VERBS = ['主导', '负责', '独立', '精通', '熟练', '从0到1', '从 0 到 1', '全流程', '牵头', '搭建', '落地', '统筹', '操盘', '管理'];

export function strongVerbsIn(text) {
  const s = String(text ?? '');
  return STRONG_VERBS.filter((v) => s.includes(v));
}

export function weakVerbsIn(text) {
  const s = String(text ?? '');
  return WEAK_VERBS.filter((v) => s.includes(v));
}
