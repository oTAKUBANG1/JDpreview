import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseJD } from '../src/engine/jdParse.js';
import { analyze } from '../src/engine/pipeline.js';

const REAL_DIR = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RESUME_DIR = join(REAL_DIR, 'proview-test');
const JD_FILE = join(REAL_DIR, 'JD-test', 'test.md');

function jdBlocks() {
  return readFileSync(JD_FILE, 'utf8')
    .split(/^-{5,}$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 120 && !s.startsWith('!['));
}

const block = (i) => jdBlocks()[i];
const resume = (prefix) => {
  const f = readdirSync(RESUME_DIR).find((x) => x.startsWith(prefix));
  assert.ok(f, `缺少样本 ${prefix}`);
  return readFileSync(join(RESUME_DIR, f), 'utf8');
};

test('真实 JD（技术支持）：岗位名与核心能力不被软技能/运维误占', () => {
  const jd = parseJD(block(0));
  assert.equal(jd.role_summary.title, '技术支持工程师');
  const core = jd.core_competencies.map((c) => c.name);
  assert.ok(core.includes('网络工程'), `核心能力缺网络工程：${core.join(',')}`);
  assert.ok(core.includes('售后支持'));
  assert.equal(core.includes('DevOps'), false, '「运维」不该被认成 DevOps');
  assert.equal(jd.core_competencies.find((c) => c.name === '沟通表达')?.level, 'should', '软技能不该是 must');
});

test('真实 JD（技术支持）：经验不限 + 优先项不产生年限硬门槛', () => {
  const jd = parseJD(block(0));
  const hardText = jd.hard_requirements.map((h) => h.text).join('\n');
  assert.ok(hardText.includes('本科'));
  assert.equal(/\d+\s*年/.test(hardText), false, `「经验不限/优先」被误判成年限：${hardText}`);
});

test('真实简历 S01（8 年解决方案）对技术支持岗：有覆盖、不误判不建议', () => {
  const r = analyze({ jd_text: block(0), resume_text: resume('S01'), strictness: 'balanced' });
  assert.equal(r.ok, true);
  assert.ok(r.score.jd_coverage >= 50, `覆盖率过低：${r.score.jd_coverage}`);
  assert.notEqual(r.conclusion, '不建议投递');
});

test('真实简历 S03（大专）对本科门槛：硬门槛不满足 → 不建议投递', () => {
  const r = analyze({ jd_text: block(0), resume_text: resume('S03'), strictness: 'balanced' });
  assert.equal(r.hard_gate.failed, true);
  assert.equal(r.conclusion, '不建议投递');
});

test('只有链接的块：不产出「可投递」假结论', () => {
  const r = analyze({ jd_text: block(4), resume_text: resume('S01') });
  assert.equal(r.ok, false);
  assert.match(r.error, /岗位要求/);
});

test('中文 JD 断行被接回（岗位职责/任职要求标签不丢）', () => {
  const jd = parseJD(block(0));
  assert.ok(jd.hard_requirements.length >= 1);
  assert.ok(jd.core_competencies.length >= 2);
});
