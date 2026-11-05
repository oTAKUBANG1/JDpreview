const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

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
  const notes = [];
  if (score.fact_consistency < 100) notes.push('事实一致率未达 100，存在无依据改动（已回退或需人工确认）');
  if (mustMissing) notes.push(`${mustMissing} 项 must 级要求在简历里找不到依据，先补再投`);
  if (!notes.length) notes.push('未发现无依据改动；相关证据已按 JD 权重前置，可按需调整措辞');
  if (!meta.converged) notes.push(`校验 ${meta.rounds} 轮未收敛，已强制结束`);
  $('#verdict-note').textContent = notes.join('；');

  const addressed = rw.coverage_self_check?.must_addressed ?? 0;
  const mustTotal = rw.coverage_self_check?.must_total ?? 0;
  $('#scores').innerHTML = [
    scoreCard('事实一致率', score.fact_consistency, '一票否决 · 权重 0.4', true),
    scoreCard('JD 覆盖率', score.jd_coverage, `must ${addressed}/${mustTotal} · 权重 0.3`),
    scoreCard('关键词命中', score.keyword_hit, '权重 0.2'),
    scoreCard('量化程度', score.quantification, '权重 0.1'),
    scoreCard('综合', score.overall, '四项加权'),
  ].join('');

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
  renderMissing(rw);
  renderGate(gate, meta);
  renderJd(jd);
  const hash = location.hash.replace('#', '');
  if (hash && document.getElementById(hash)) tab(hash);
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

function renderMissing(rw) {
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

// —— 事件 ——
$('#run').addEventListener('click', run);
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
