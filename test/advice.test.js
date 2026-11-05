import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJD } from '../src/engine/jdParse.js';
import { buildAdvice } from '../src/engine/advice.js';
import { analyze } from '../src/engine/pipeline.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../src/samples.js';

const GAME_JD = `岗位职责：
1. 负责小游戏平台的产品规划与运营；
2. 推动开放生态合作。
任职要求：
1. 有平台级小游戏平台的从业经验优先；
2. 对 AI 应用场景或开放生态方向有浓厚兴趣；
3. 3 年以上产品经验。`;

test('岗位名不会被职责句污染', () => {
  const jd = parseJD(GAME_JD);
  assert.notEqual(jd.role_summary.title, '产品规划与运营');
  assert.ok(!jd.role_summary.title.includes('负责'));
});

test('「优先」与「有浓厚兴趣」不当成硬性缺口', () => {
  const jd = parseJD(GAME_JD);
  assert.ok(jd.nice_to_have.length >= 1);
  const must = jd.core_competencies.filter((c) => c.level === 'must').map((c) => c.name);
  // 职责里的小游戏平台是正经要求；但「优先/兴趣」两条不能各自造出一个 must
  assert.ok(must.includes('游戏') || must.includes('平台生态'));
  const niceText = jd.nice_to_have.map((n) => n.text).join('');
  assert.ok(niceText.includes('优先') || niceText.includes('兴趣'));
});

test('只有「优先」行时，不产出 must 能力项', () => {
  const jd = parseJD(`岗位名称：产品经理
任职要求：
1. 有平台级小游戏平台的从业经验优先；
2. 3 年以上产品经验。`);
  const must = jd.core_competencies.filter((c) => c.level === 'must').map((c) => c.name);
  assert.equal(must.includes('游戏'), false);
});

test('小游戏 / 开放生态能命中词库', () => {
  const jd = parseJD(GAME_JD);
  const names = jd.core_competencies.map((c) => c.name);
  assert.ok(names.includes('游戏'));
  assert.ok(names.includes('平台生态'));
});

test('改进建议：每个缺口都有可执行方向，加分项单独给建议', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME, strictness: 'balanced' });
  const advice = r.advice;
  assert.equal(advice.items.length, r.rewrite_json.missing_items.length);
  for (const item of advice.items) {
    assert.ok(item.tips.length >= 2, `${item.competency_name} 建议太少`);
    assert.ok(item.tips.every((t) => t.length > 8));
  }
  assert.ok(advice.nice.length > 0);
  assert.ok(advice.nice.every((n) => n.tip.length > 8));
});

test('建议里不出现可以直接粘进简历的编造句', () => {
  const r = analyze({ jd_text: SAMPLE_JD, resume_text: SAMPLE_RESUME });
  const all = [...r.advice.items.flatMap((i) => i.tips), ...r.advice.nice.map((n) => n.tip)].join('\n');
  for (const banned of ['主导', '精通', '百万', '熟练使用']) {
    assert.equal(all.includes(banned), false, `建议里出现了不可直接使用的表述：${banned}`);
  }
});

test('buildAdvice 对加分项给出「兴趣要变成证据」方向', () => {
  const jd = parseJD(GAME_JD);
  const advice = buildAdvice([], jd);
  assert.ok(advice.nice.length >= 1);
  assert.ok(advice.nice.some((n) => n.tip.includes('兴趣') || n.tip.includes('加分项')));
});
