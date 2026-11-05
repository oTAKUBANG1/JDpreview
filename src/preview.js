// 粘贴/导入后的「格式体检」：先看识别到什么，再决定要不要分析。
// 目的不是炫技，是把「断行、导航、薪资、多岗位混在一起」这些坑提前暴露给用户。

import { parseJD } from './engine/jdParse.js';
import { normalizeText } from './engine/utils.js';

const NAV_RE = /(立即沟通|收藏|举报|微信扫码|不合适|感兴趣|刚刚活跃|招聘中)/;
const SALARY_RE = /(\d+\s*[-–~]\s*\d+\s*[Kk千万元]|薪|五险一金|补充医疗)/;
const DUTY_LABEL_RE = /(岗位职责|职位描述|工作内容|你将负责|工作职责)/;
const REQ_LABEL_RE = /(任职要求|岗位要求|任职资格|职位要求|我们希望你)/;

export function splitJdBlocks(text) {
  const normalized = normalizeText(text);
  const byDash = normalized
    .split(/^-{5,}$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 80);
  if (byDash.length > 1) return byDash;

  // 没有分隔线：按「岗位职责 / 职位描述」出现的位置切，至少出现两次才认为有多个岗位
  const marks = [...normalized.matchAll(/^(岗位职责|职位描述|工作内容)[:：]?\s*$/gm)];
  if (marks.length >= 2) {
    const starts = marks.map((m) => m.index);
    const blocks = [];
    for (let i = 0; i < starts.length; i += 1) {
      const from = i === 0 ? 0 : starts[i];
      const to = starts[i + 1] ?? normalized.length;
      const block = normalized.slice(from, to).trim();
      if (block.length > 20) blocks.push(block);
    }
    if (blocks.length > 1) return blocks;
  }
  return [normalized.trim()];
}

function inspectBlock(text) {
  const jd = parseJD(text);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const warnings = [];

  if (NAV_RE.test(text)) warnings.push('含招聘网站按钮/导航文字（立即沟通、收藏、举报等），已尽量剔除');
  if (SALARY_RE.test(text)) warnings.push('含薪资/福利信息，不参与能力匹配');
  if (!DUTY_LABEL_RE.test(text) && !REQ_LABEL_RE.test(text)) warnings.push('没找到「岗位职责 / 任职要求」标签，要求可能被当成职责');
  const fragments = lines.filter(
    (l) => (l.length <= 3 && !/^[。；：:]$/.test(l)) || /^[\u4e00-\u9fa5][、，。；]/.test(l),
  );
  if (fragments.length >= 1) warnings.push(`有 ${fragments.length} 处疑似断行碎片（如「${fragments[0]}」），建议粘完整的句子`);
  if (!jd.core_competencies.length) warnings.push('没解析出任何能力项，这段可能不是完整的 JD');

  const title = jd.role_summary.title || lines[0]?.slice(0, 24) || '未识别岗位名';
  return {
    title,
    chars: text.length,
    core_count: jd.core_competencies.length,
    hard_count: jd.hard_requirements.length,
    must: jd.core_competencies.filter((c) => c.level === 'must').map((c) => c.name).slice(0, 6),
    nice_count: jd.nice_to_have.length,
    warnings,
    ok: jd.core_competencies.length > 0 || jd.hard_requirements.length > 0,
  };
}

export function previewJd(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: false, error: 'JD 内容为空' };
  const blocks = splitJdBlocks(raw).slice(0, 8);
  const items = blocks.map((block, i) => ({ index: i, text: block, ...inspectBlock(block) }));
  const multi = items.length > 1;
  return {
    ok: true,
    multi,
    count: items.length,
    items,
    note: multi
      ? `识别到 ${items.length} 个岗位，选一个分析，或分别分析`
      : items[0]?.warnings.length
        ? '格式有些问题，但可以尝试分析'
        : '格式看起来没问题',
  };
}
