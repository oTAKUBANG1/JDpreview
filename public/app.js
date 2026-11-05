const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

import { fileToText } from './importers.js';

let current = null;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function tab(id) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === id));
}

function showError(message) {
  const el = $('#error');
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  $('#error').hidden = true;
}

function setBusy(busy, text = '') {
  $('#run').disabled = busy;
  const status = $('#status');
  status.hidden = !busy;
  status.textContent = text;
}

async function run() {
  clearError();
  const jd = $('#jd').value;
  const resume = $('#resume').value;
  if (!jd.trim()) return showError('请先填写目标岗位 JD。');
  if (!resume.trim()) return showError('请再填写简历原文。');
  setBusy(true, '解析 JD、找证据、跑闸门…');
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jd_text: jd,
        resume_text: resume,
        target_role: $('#role').value,
        strictness: $('#strictness').value,
        max_round: Number($('#maxRound').value) || 3,
        save_jd: $('#saveJd')?.checked !== false,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      $('#result').hidden = true;
      showError(data.error || '分析失败');
      return;
    }
    current = data;
    render(data);
  } catch (err) {
    showError(`请求失败：${err.message}`);
  } finally {
    setBusy(false);
  }
}

function scoreCard(name, value, extra = '', veto = false) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="score-card ${veto ? 'veto' : ''}">
    <div class="name">${esc(name)}</div>
    <div class="value">${v}</div>
    <div class="bar"><i style="width:${v}%"></i></div>
    ${extra ? `<div class="sub">${esc(extra)}</div>` : ''}
  </div>`;
}

function render(data) {
  const { score, conclusion, gate_json: gate, rewrite_json: rw, jd_json: jd, impact, meta } = data;
  $('#result').hidden = false;

  const kind = conclusion === '可投递' ? 'good' : conclusion === '不建议投递' ? 'bad' : 'warn';
  $('#verdict').className = `verdict ${kind}`;
  $('#verdict').textContent = conclusion;

  const mustMissing = (rw.missing_items || []).filter((m) => m.priority === 'must').length;
  const hardFailed = data.hard_gate?.failed;
  const notes = [];
  if (hardFailed) {
    const first = (data.hard_gate.items || []).find((i) => i.status === 'fail');
    notes.push(`硬门槛不满足${first?.note ? `：${first.note}` : ''}`);
  }
  if (score.fact_consistency < 100) notes.push('事实一致率未达 100，存在无依据改动（已回退或需人工确认）');
  if (mustMissing) notes.push(`${mustMissing} 项 must 级要求在简历里找不到依据，先补再投`);
  if (!notes.length) notes.push('未发现无依据改动；相关证据已按 JD 权重前置，可按需调整措辞');
  if (!meta.converged) notes.push(`校验 ${meta.rounds} 轮未收敛，已强制结束`);
  $('#verdict-note').textContent = notes.join('；');

  const cov = rw.coverage_self_check || {};
  $('#scores').innerHTML = [
    scoreCard('事实一致率', score.fact_consistency, '一票否决 · 权重 0.4', true),
    scoreCard('JD 对齐度', score.jd_coverage, `按权重 ${cov.must_weight_addressed ?? 0}/${cov.must_weight_total ?? 0} · 权重 0.4`),
    scoreCard('量化程度', score.quantification, '权重 0.2'),
    scoreCard('综合', score.overall, '三项加权'),
  ].join('');

  renderHardGate(data.hard_gate);
  renderMatrix(data.matrix);

  // 对齐版简历：把 "## 标题" 标成小标题
  const lines = String(rw.rewritten_resume || '').split('\n');
  const html = lines
    .map((line) => (line.startsWith('## ') ? `<span class="sec">${esc(line.slice(3))}</span>` : esc(line)))
    .join('\n');
  $('#rewritten').innerHTML = html || '<span class="empty">（空）</span>';
  $('#impact').textContent = `关键证据前置：前 3 条命中 ${impact.evidence_rank_before} → ${impact.evidence_rank_after}；共 ${impact.changes} 处改动`;
  $('#impact').dataset.copy = rw.rewritten_resume;
  $('#impact').setAttribute('data-copy-target', '#rewritten');

  renderLedger(rw);
  renderMissing(rw, data.advice);
  renderGate(gate, meta);
  renderJd(jd);
  const hash = location.hash.replace('#', '');
  if (hash && document.getElementById(hash)) tab(hash);
}

function renderHardGate(hard) {
  const el = $('#hardgate');
  const items = hard?.items || [];
  if (!items.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const chip = (status) =>
    status === 'pass'
      ? '<span class="chip explicit">满足</span>'
      : status === 'fail'
        ? '<span class="chip fatal">不满足</span>'
        : '<span class="chip major">待确认</span>';
  el.innerHTML = `<h3>硬门槛比对（学历 / 年限）</h3>${items
    .map(
      (i) => `<div class="row">${chip(i.status)}<span class="text">${esc(i.kind || '门槛')}：${esc(i.text)}</span><span class="note">${esc(i.actual || '')}${i.note ? ` · ${esc(i.note)}` : ''}</span></div>`,
    )
    .join('')}`;
}

function renderLedger(rw) {
  const rows = (rw.fact_ledger || []).filter((e) => e.change_type !== 'missing');
  if (!rows.length) {
    $('#ledger').innerHTML = `<p class="empty">本次没有文字层面的改动。${rw.rewritten_resume ? '简历条目顺序已与目标岗位的能力权重一致，或当前强度为 strict（仅重排、不改字）。' : ''}</p>`;
  } else {
    $('#ledger').innerHTML = `<table>
      <thead><tr><th>编号</th><th>对应 JD 能力项</th><th>原文 → 改写</th><th>事实依据</th><th>类型</th></tr></thead>
      <tbody>${rows
        .map(
          (e) => `<tr>
            <td class="mono">${esc(e.change_id)}</td>
            <td>${esc(e.competency_id || '—')}</td>
            <td>${e.change_type === 'order' ? `<span class="chip">位次调整</span><br><span class="hint">${esc(e.reason)}</span>` : `${esc(e.before)}<br><span class="hint">↓</span><br>${esc(e.after)}`}</td>
            <td class="hint">${esc(e.source_quote || '—')}</td>
            <td><span class="chip ${esc(e.change_type || 'explicit')}">${esc(e.change_type === 'term' ? '术语对齐' : e.change_type === 'order' ? '排序' : '改写')}</span></td>
          </tr>`,
        )
        .join('')}</tbody></table>`;
  }
}

function renderMissing(rw, advice) {
  const items = rw.missing_items || [];
  if (!items.length) {
    $('#missing').innerHTML = '<p class="empty">JD 里的能力项都在简历里找到依据了。</p>';
  } else {
    $('#missing').innerHTML = `<table>
      <thead><tr><th>#</th><th>JD 要求</th><th>简历现状</th><th>优先级</th></tr></thead>
      <tbody>${items
        .map(
          (m, i) => `<tr>
            <td class="mono">${i + 1}</td>
            <td>${esc(m.jd_requirement || m.competency_name)}<br><span class="hint">${esc(m.competency_name || '')} · ${esc(m.competency_id || '')}</span></td>
            <td>${esc(m.resume_status)}</td>
            <td><span class="chip ${m.priority === 'must' ? 'must' : ''}">${esc(m.priority)}</span></td>
          </tr>`,
        )
        .join('')}</tbody></table>`;
  }

  const adviceItems = advice?.items ?? [];
  const niceItems = advice?.nice ?? [];
  const adviceHtml = adviceItems.length
    ? `<div class="advice-block"><h3 class="hint">改进方向（针对缺口，不是让你编）</h3>${adviceItems
        .map(
          (a) => `<div class="advice">
            <div class="advice-head">${esc(a.competency_name)}<span class="chip ${a.priority === 'must' ? 'must' : ''}">${esc(a.priority)} · ${esc(a.resume_status)}</span></div>
            <ul>${a.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          </div>`,
        )
        .join('')}</div>`
    : '';
  const niceHtml = niceItems.length
    ? `<div class="advice-block"><h3 class="hint">加分项（不是硬缺口，别硬凑）</h3>${niceItems
        .map((n) => `<div class="advice"><div class="advice-head">${esc(n.text)}</div><ul><li>${esc(n.tip)}</li></ul></div>`)
        .join('')}</div>`
    : '';
  $('#missing').insertAdjacentHTML('beforeend', adviceHtml + niceHtml);

  const qs = rw.questions_for_user || [];
  $('#questions').innerHTML = qs.length
    ? `<h3 class="hint" style="margin:0 0 8px">待确认问题</h3>${qs.map((q) => `<div class="question">${esc(q)}</div>`).join('')}`
    : '';
  $('#questions').dataset.copy = qs.join('\n');

  const irrelevant = rw.irrelevant_lines || [];
  $('#irrelevant').innerHTML = irrelevant.length
    ? `<h3>与目标 JD 无关、建议压缩的条目</h3><ul>${irrelevant.map((l) => `<li>${esc(l.text)} <span class="hint">（${esc(l.section)}）</span></li>`).join('')}</ul>`
    : '';
}

function renderGate(gate, meta) {
  const v = gate.violations || [];
  $('#gate-summary').textContent = `${gate.verdict} · 通过 ${gate.passed_claims_count}/${gate.total_claims_count} 条断言 · ${meta.rounds} 轮`;
  const violationRows = v.length
    ? `<table><thead><tr><th>校验</th><th>类型</th><th>严重度</th><th>问题片段</th><th>修订指令</th></tr></thead><tbody>${v
        .map(
          (x) => `<tr>
            <td class="mono">${esc(x.check)}</td>
            <td>${esc(x.type)}</td>
            <td><span class="chip ${esc(x.severity)}">${esc(x.severity)}</span></td>
            <td class="hint">${esc(x.quote_in_rewrite || '—')}</td>
            <td class="hint">${esc(x.fix_instruction || '')}</td>
          </tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">五道校验全部通过，没有发现无依据、升格、数字或贴标签问题。</p>';

  const gaps = (gate.coverage_gaps || []).length
    ? `<div class="block"><h3>覆盖缺口</h3><ul>${gate.coverage_gaps.map((g) => `<li>${esc(g.note)}</li>`).join('')}</ul></div>`
    : '';

  const trace = (meta.trace || [])
    .map((t) => `<span class="chip">轮 ${t.round} · ${esc(t.verdict)} · ${t.violations} 条</span>`)
    .join(' ');

  $('#gate').innerHTML = `
    <div class="kv" style="margin-bottom:14px">
      <dt>最终判定</dt><dd>${esc(gate.verdict)}</dd>
      <dt>一句话结论</dt><dd>${esc(gate.summary)}</dd>
      <dt>断言</dt><dd>${gate.passed_claims_count} / ${gate.total_claims_count}</dd>
      <dt>回环轨迹</dt><dd>${trace || '—'}</dd>
    </div>
    ${violationRows}${gaps}`;
}

function renderJd(jd) {
  const role = jd.role_summary || {};
  const core = jd.core_competencies || [];
  const hard = jd.hard_requirements || [];
  const nice = jd.nice_to_have || [];
  const kws = jd.keyword_bank?.must || [];
  const notes = jd.jd_quality_notes || [];

  const coreRows = core.length
    ? `<table><thead><tr><th>编号</th><th>能力项</th><th>权重</th><th>级别</th><th>JD 原文</th></tr></thead><tbody>${core
        .map(
          (c) => `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.name)}</td><td class="mono">${c.weight}</td><td><span class="chip ${c.level === 'must' ? 'must' : ''}">${esc(c.level)}</span></td><td class="hint">${esc(c.jd_quote)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">没有解析出核心能力项。</p>';

  $('#jdout').innerHTML = `
    <div class="kv" style="margin-bottom:14px">
      <dt>岗位</dt><dd>${esc(role.title || '未识别')}${role.level ? ` · ${esc(role.level)}` : ''}</dd>
      <dt>关键词库</dt><dd class="inline-list">${kws.map((k) => `<span class="chip must">${esc(k)}</span>`).join('') || '—'}</dd>
      <dt>硬性门槛</dt><dd>${hard.length ? hard.map((h) => esc(h.text)).join('<br>') : '未识别到'}</dd>
      <dt>加分项</dt><dd>${nice.length ? nice.map((n) => esc(n.text)).join('<br>') : '未识别到'}</dd>
      <dt>JD 质量提示</dt><dd>${notes.length ? notes.map((n) => esc(n)).join('<br>') : '无'}</dd>
    </div>
    ${coreRows}`;
}

// —— 文件 / 链接导入 ——
function setImportStatus(field, text, kind = '') {
  const el = document.querySelector(`[data-status="${field}"]`);
  if (!el) return;
  el.textContent = text;
  el.className = `import-status ${kind}`;
}

async function importFile(field, source) {
  const file = source instanceof File ? source : source.files?.[0];
  if (!(source instanceof File)) source.value = '';
  if (!file) return;
  const box = document.getElementById(field);
  if (file.size > 20 * 1024 * 1024) {
    setImportStatus(field, '文件超过 20MB，请压缩后再试', 'err');
    return;
  }
  if (box.value.trim() && !confirm('导入会覆盖当前输入框里的内容，继续？')) return;

  setImportStatus(field, '正在解析文件…', 'working');
  try {
    const result = await fileToText(file, (pct, status) => {
      if (pct != null) setImportStatus(field, `识别中 ${pct}%`, 'working');
      else if (status) setImportStatus(field, '正在准备识别引擎…', 'working');
    });
    box.value = result.text;
    const hint = result.kind === '图片 OCR' ? '（OCR 结果请先核对再分析）' : '';
    setImportStatus(field, `已从 ${file.name} 提取 ${result.text.length} 字${hint}`, 'ok');
    if (field === 'jd') schedulePreview();
  } catch (err) {
    if (err.message === 'SCANNED_PDF') {
      setImportStatus(field, '这份 PDF 是扫描件，没有文字层。请改用「截图识别」', 'err');
    } else {
      setImportStatus(field, err.message || '解析失败', 'err');
    }
  }
}

async function importUrl(field) {
  const input = document.querySelector(`[data-url="${field}"]`);
  const url = input?.value.trim();
  if (!url) {
    setImportStatus(field, '先粘贴一个网页链接', 'err');
    return;
  }
  setImportStatus(field, '正在抓取页面…', 'working');
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '抓取失败');
    document.getElementById(field).value = data.text;
    setImportStatus(
      field,
      `已抓取${data.title ? `《${data.title}》` : '页面'}，提取 ${data.text.length} 字${data.truncated ? '（内容过长已截断）' : ''}`,
      'ok',
    );
    if (field === 'jd') schedulePreview();
  } catch (err) {
    setImportStatus(field, err.message || '抓取失败', 'err');
  }
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.file) importFile(el.dataset.file, el);
  if (el.dataset?.image) importFile(el.dataset.image, el);
});

// 截图直接 Ctrl+V 粘进 JD 框
$('#jd').addEventListener('paste', (e) => {
  const imageItem = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (!imageItem) return;
  e.preventDefault();
  const file = imageItem.getAsFile();
  if (file) importFile('jd', file);
});

// 也可以把图片/文件拖进 JD 框
$('#jd').addEventListener('dragover', (e) => e.preventDefault());
$('#jd').addEventListener('drop', (e) => {
  const file = [...(e.dataTransfer?.files ?? [])][0];
  if (!file) return;
  e.preventDefault();
  importFile('jd', file);
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-urlgo]');
  if (btn) importUrl(btn.dataset.urlgo);
});

// —— 格式体检 ——
let previewCache = [];
let previewTimer = null;

async function runPreview() {
  const text = $('#jd').value;
  if (!text.trim()) return;
  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jd_text: text }),
    });
    const data = await res.json();
    if (!data.ok) return;
    renderPreview(data);
  } catch {
    // 体检失败不影响主流程
  }
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 600);
}

function renderPreview(data) {
  const panel = $('#preview-panel');
  panel.hidden = false;
  $('#previewNote').textContent = data.note;
  previewCache = data.items;
  $('#previewBody').innerHTML = data.items
    .map(
      (it) => `<div class="preview-card">
        <h3>${data.multi ? `#${it.index + 1} ` : ''}${esc(it.title)}</h3>
        <div class="meta">${it.chars} 字 · 能力项 ${it.core_count} · 硬门槛 ${it.hard_count}${it.nice_count ? ` · 加分项 ${it.nice_count}` : ''}</div>
        ${it.must.length ? `<div class="chips">${it.must.map((m) => `<span class="chip must">${esc(m)}</span>`).join('')}</div>` : ''}
        ${it.warnings.length ? `<ul class="warns">${it.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<div class="meta">格式看起来没问题</div>'}
        <button class="ghost small" data-preview-index="${it.index}">${data.multi ? '分析这个岗位' : '就按这个分析'}</button>
      </div>`,
    )
    .join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preview-index]');
  if (!btn) return;
  const item = previewCache[Number(btn.dataset.previewIndex)];
  if (!item) return;
  $('#jd').value = item.text;
  run();
});

$('#jd').addEventListener('paste', () => setTimeout(schedulePreview, 50));

// —— 用户档案 ——
const PROFILE_KEY = 'jdpreview_profile_v1';

async function buildMyProfile() {
  clearError();
  const resume = $('#resume').value;
  if (!resume.trim()) return showError('先在简历框里放一份简历，才能生成档案。');
  const btn = $('#profileBtn');
  btn.disabled = true;
  $('#profileNote').textContent = '正在提取档案…';
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume_text: resume }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '档案生成失败');
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data.profile));
    renderProfile(data.profile);
  } catch (err) {
    showError(err.message || '档案生成失败');
  } finally {
    btn.disabled = false;
  }
}

function renderProfile(profile) {
  const panel = $('#profile-panel');
  panel.hidden = false;
  $('#profileNote').textContent = profile.note || '';
  const b = profile.basics ?? {};
  const skills = profile.skills ?? [];
  const highlights = profile.highlights ?? [];
  $('#profileBody').innerHTML = `
    <div class="profile-kv">
      <span class="chip">学历：${esc(b.degree ?? '未识别')}</span>
      <span class="chip">工作年限：约 ${esc(String(b.years_experience ?? 0))} 年</span>
      <span class="chip">能力项：${skills.length}</span>
      <span class="chip">量化亮点：${highlights.length}</span>
    </div>
    <div class="profile-skills">${skills
      .map((s) => `<span class="profile-skill"><b>${esc(s.name)}</b><span class="n">×${s.evidence_count}</span>${s.quantified ? '<span class="chip explicit" style="padding:0 5px">有数字</span>' : ''}</span>`)
      .join('') || '<span class="empty">简历里没识别出可归类的技能</span>'}</div>
    ${highlights.length ? `<ul class="profile-highlights">${highlights.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul>` : ''}`;
}

function renderMatrix(matrix) {
  const rows = matrix || [];
  if (!rows.length) {
    $('#matrix').innerHTML = '<p class="empty">没有能力项可匹配。</p>';
    return;
  }
  const label = { evidence: '强证据', weak: '弱证据', gap: '缺口' };
  $('#matrix').innerHTML = `<table>
    <thead><tr><th>#</th><th>能力项</th><th>权重</th><th>级别</th><th>状态</th><th>证据</th></tr></thead>
    <tbody>${rows
      .map(
        (m) => `<tr>
          <td class="mono">${esc(m.competency_id)}</td>
          <td>${esc(m.name)}</td>
          <td class="mono">${m.weight}</td>
          <td><span class="chip ${m.level === 'must' ? 'must' : ''}">${esc(m.level)}</span></td>
          <td><span class="chip ${m.status === 'gap' ? 'major' : m.status === 'evidence' ? 'explicit' : ''}">${label[m.status] ?? esc(m.status)}</span></td>
          <td class="hint">${m.evidence.length ? esc(m.evidence[0]) : '简历里没找到'}</td>
        </tr>`,
      )
      .join('')}</tbody></table>`;
}

// —— 岗位推荐 ——
const recCache = new Map();

async function recommend() {
  clearError();
  const resume = $('#resume').value;
  if (!resume.trim()) return showError('先填简历，才能匹配岗位池里的岗位。');
  const btn = $('#recBtn');
  btn.disabled = true;
  const panel = $('#recommend-panel');
  panel.hidden = false;
  $('#recNote').textContent = '正在匹配岗位池…';
  $('#recList').innerHTML = '';
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resume_text: resume, limit: 3 }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '推荐失败');
    renderRecommend(data);
  } catch (err) {
    panel.hidden = true;
    showError(err.message || '推荐失败');
  } finally {
    btn.disabled = false;
  }
}

function renderRecommend(data) {
  recCache.clear();
  for (const item of data.items) recCache.set(Number(item.id), item);
  $('#recNote').textContent = [
    data.note,
    `岗位池 ${data.pool_size} 条`,
    data.hard_failed ? `已排除 ${data.hard_failed} 个门槛不符` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const list = $('#recList');
  if (!data.items.length) {
    list.innerHTML = '<p class="empty">池子里还没有够格的岗位。先分析几份 JD，它们会自动进池。</p>';
    return;
  }
  list.innerHTML = data.items
    .map(
      (it) => `<div class="rec-card">
        <div class="match">${it.match}<small>% 匹配</small></div>
        <h3>${esc(it.title)}</h3>
        <div class="meta">${it.company ? `${esc(it.company)} · ` : ''}${it.freshness_days === 0 ? '今天还在' : `${it.freshness_days} 天前出现`} · 被贴 ${it.paste_count} 次</div>
        <div class="why">命中核心 ${it.must_hit}/${it.must_total} 项${it.matched.length ? `：${it.matched.map(esc).join('、')}` : ''}</div>
        ${it.gaps.length ? `<div class="chips">${it.gaps.map((g) => `<span class="chip major">缺 ${esc(g)}</span>`).join('')}</div>` : ''}
        <button class="ghost small" data-use-jd="${it.id}">用这份简历分析</button>
      </div>`,
    )
    .join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-use-jd]');
  if (!btn) return;
  const item = recCache.get(Number(btn.dataset.useJd));
  if (!item) return;
  $('#jd').value = item.text;
  $('#resume').scrollIntoView({ block: 'start', behavior: 'smooth' });
  run();
});

// —— 事件 ——
$('#run').addEventListener('click', run);
$('#recBtn').addEventListener('click', recommend);
$('#previewBtn').addEventListener('click', runPreview);
$('#profileBtn').addEventListener('click', buildMyProfile);

// 档案存在本机，刷新后仍能看到
try {
  const saved = localStorage.getItem(PROFILE_KEY);
  if (saved) renderProfile(JSON.parse(saved));
} catch {
  // 忽略损坏的本地数据
}
$('#clear').addEventListener('click', () => {
  $('#jd').value = '';
  $('#resume').value = '';
  $('#result').hidden = true;
});
$('#sample').addEventListener('click', () => {
  $('#jd').value = SAMPLE_CACHE.normal.jd;
  $('#resume').value = SAMPLE_CACHE.normal.resume;
});
$('#trap').addEventListener('click', () => {
  $('#jd').value = SAMPLE_CACHE.trap.jd;
  $('#resume').value = SAMPLE_CACHE.trap.resume;
});

let SAMPLE_CACHE = { normal: { jd: '', resume: '' }, trap: { jd: '', resume: '' } };
fetch('/api/samples')
  .then((r) => r.json())
  .then((d) => {
    SAMPLE_CACHE = d;
    // 演示模式：?demo=1 自动填示例并跑一次，方便截图和演示
    if (new URLSearchParams(location.search).has('demo')) {
      $('#jd').value = d.normal.jd;
      $('#resume').value = d.normal.resume;
      $('#strictness').value = 'balanced';
      run();
    }
  })
  .catch(() => {});

$$('.tab').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn || !current) return;
  const target = btn.dataset.copy;
  let text = '';
  if (target === '#rewritten') text = current.rewrite_json.rewritten_resume;
  if (target === '#questions') text = (current.rewrite_json.questions_for_user || []).join('\n');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => (btn.textContent = old), 1200);
  } catch {
    showError('浏览器拒绝了剪贴板访问，请手动选中复制。');
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
});
