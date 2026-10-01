// 미사용 매장 강제 마감 — 화면 로직
const $ = (s) => document.querySelector(s);
const state = { rows: [], selected: null, connected: false, busy: false, seq: 0 };

const fmtDate = (s) => (s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || '');
const fmtDt = (s) => (s && s.length === 14 ? `${fmtDate(s)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}` : s || '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const target = () => document.querySelector('input[name="target"]:checked').value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- API ----------
function getToken() { try { return sessionStorage.getItem('sc-token') || ''; } catch { return ''; } }
function setToken(t) { try { sessionStorage.setItem('sc-token', t); } catch { /* 저장 불가 시 무시 */ } }

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-access-token': getToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (res.status === 401) { setConnected(false, '토큰이 올바르지 않습니다'); }
  return { status: res.status, data: data || {} };
}

let availableTargets = { dev: false, prod: false };
function setConnected(ok, text) {
  state.connected = ok;
  $('#conn').textContent = text;
  refreshButtons();
}

async function connect() {
  setConnected(false, '연결 중…');
  try {
    const { status, data } = await api('/api/config');
    if (status !== 200) return setConnected(false, data.error || `연결 실패 (HTTP ${status})`);
    availableTargets = data.targets;
    const names = [availableTargets.dev && '개발', availableTargets.prod && '운영'].filter(Boolean);
    setConnected(true, names.length ? `연결됨 · 사용 가능: ${names.join(', ')}` : '연결됨 · 설정된 서버 없음');
  } catch (e) {
    setConnected(false, '연결 실패');
  }
}

// ---------- 목록 ----------
function addRow(input) {
  const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  const dup = state.rows.find((r) => r.input.shopCd?.toUpperCase() === clean.shopCd?.toUpperCase()
    && r.input.saleDate === clean.saleDate && (r.input.posNo || '01') === (clean.posNo || '01'));
  if (dup) { select(dup.id); return false; }
  const row = { id: ++state.seq, input: clean, status: 'new', preview: null, log: [] };
  state.rows.push(row);
  render();
  select(row.id);
  validate(row);
  return true;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: '열 이름 줄과 데이터 줄이 필요합니다.' };
  const head = lines[0].split(',').map((h) => h.trim());
  for (const req of ['shopCd', 'saleDate', 'openDt']) {
    if (!head.includes(req)) return { rows: [], error: `필수 열 ${req} 가 없습니다.` };
  }
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] || '').trim()]));
  });
  return { rows };
}

async function validate(row) {
  if (!state.connected) return;
  row.status = 'checking'; render();
  try {
    const { data } = await api('/api/preview', { row: row.input });
    row.preview = data;
    row.status = data.ok ? (data.warnings?.length ? 'warn' : 'ready') : 'invalid';
  } catch {
    row.status = 'invalid';
    row.preview = { ok: false, errors: ['검증 요청이 실패했습니다.'] };
  }
  render();
}

const STATUS = {
  new: ['검증 전', ''], checking: ['검증 중', 'st-busy'], ready: ['전송 가능', ''],
  warn: ['확인 필요', 'st-warn'], invalid: ['입력 오류', 'st-fail'], sending: ['전송 중', 'st-busy'],
  ok: ['전송성공', 'st-ok'], fail: ['전송실패', 'st-fail'],
};

function render() {
  const tb = $('#rows tbody');
  tb.innerHTML = state.rows.map((r) => {
    const [label, cls] = STATUS[r.status];
    const last = r.log[r.log.length - 1];
    const extra = r.status === 'fail' && last ? ` · ${esc(last.result?.message)}` : (r.status === 'ok' && last ? ` · ${last.target === 'prod' ? '운영' : '개발'}` : '');
    return `<tr data-id="${r.id}" aria-selected="${r.id === state.selected}" tabindex="0">
      <td>${esc(r.input.shopCd?.toUpperCase())}</td><td>${esc(fmtDate(r.input.saleDate))}</td>
      <td>${esc(fmtDt(r.input.openDt))}</td><td>${esc(r.input.posNo || '01')}</td>
      <td class="status ${cls}">${label}${extra}</td>
      <td><button class="del" data-del="${r.id}" aria-label="삭제" ${state.busy ? 'disabled' : ''}>삭제</button></td></tr>`;
  }).join('');
  $('#empty').hidden = state.rows.length > 0;
  const okCnt = state.rows.filter((r) => r.status === 'ok').length;
  $('#count').textContent = state.rows.length ? `${state.rows.length}건${okCnt ? `, 성공 ${okCnt}건` : ''}` : '';
  renderSlip();
  refreshButtons();
}

function select(id) { state.selected = id; render(); }

function renderSlip() {
  const r = state.rows.find((x) => x.id === state.selected);
  const slip = $('#slip');
  if (!r) { slip.innerHTML = '<p class="slip-empty">목록에서 매장을 고르면 정산 전문이 표시됩니다.</p>'; return; }
  const p = r.preview;
  const v = p?.values;
  const last = r.log[r.log.length - 1];
  const msgs = [
    ...(p?.errors || []).map((m) => `<li class="err">${esc(m)}</li>`),
    ...(p?.warnings || []).map((m) => `<li class="warn">${esc(m)}</li>`),
  ].join('');
  slip.innerHTML = `
    <h3>PS010 마감 정산</h3>
    <p class="sub">${esc((v?.SHOP_CD || r.input.shopCd || '').toUpperCase())} · 00차수</p>
    <dl>
      <dt>영업일자</dt><dd>${esc(fmtDate(v?.SALE_DATE || r.input.saleDate))}</dd>
      <dt>포스번호</dt><dd>${esc(v?.POS_NO || r.input.posNo || '01')}</dd>
      <dt>사원번호</dt><dd>${esc(v?.EMP_NO || r.input.empNo || '0000')}</dd>
      <dt>마감구분</dt><dd>3 (영업마감)</dd>
      <dt>개점</dt><dd>${esc(fmtDt(v?.OPEN_DT || r.input.openDt))}</dd>
      <dt>마감</dt><dd>${esc(v ? fmtDt(v.CLOSE_DT) : (r.input.closeDt ? fmtDt(r.input.closeDt) : '전송 시각'))}</dd>
      <dt>등록</dt><dd>${esc(fmtDt(v?.INS_DT || r.input.openDt))}</dd>
    </dl>
    <hr><p class="zero">매출·결제·시재 111개 항목 모두 0</p><hr>
    ${last ? `<dl><dt>전송</dt><dd>${last.target === 'prod' ? '운영서버' : '개발서버'}</dd>
      <dt>결과</dt><dd class="${last.result?.ok ? 'st-ok' : 'st-fail'}">${esc(last.result?.message)}</dd>
      <dt>응답</dt><dd>${esc(last.result?.srid ?? '-')} / ${esc(last.result?.retcd ?? '-')}</dd></dl>` : ''}
    ${msgs ? `<ul class="msgs">${msgs}</ul>` : ''}
    ${p?.xml ? `<details><summary>요청 전문 XML</summary><pre>${esc(p.xml)}</pre>
      <button class="copy" data-copy="req">복사</button></details>` : ''}
    ${last?.responseText ? `<details><summary>응답 원문</summary><pre>${esc(last.responseText)}</pre></details>` : ''}`;
}

// 현재 대상 서버로 아직 성공하지 않은 행 (개발 성공 후 운영 전송 가능)
const sentOkTo = (r, tgt) => r.log.some((l) => l.target === tgt && l.result?.ok);
const isSendable = (r) => ['ready', 'warn', 'fail', 'ok'].includes(r.status) && r.preview?.ok !== false && !sentOkTo(r, target());

function refreshButtons() {
  const sendable = state.rows.filter(isSendable);
  $('#previewAll').disabled = state.busy || !state.connected || !state.rows.length;
  $('#sendAll').disabled = state.busy || !state.connected || !sendable.length
    || !$('#salesChecked').checked || !availableTargets[target()];
  $('#sendAll').textContent = state.busy ? '전송 중…'
    : `PS010 전송${sendable.length ? ` (${sendable.length}건)` : ''} · ${target() === 'prod' ? '운영' : '개발'}`;
}

// ---------- 전송 ----------
async function sendAll() {
  const tgt = target();
  const list = state.rows.filter(isSendable);
  if (!list.length) return;
  if (tgt === 'prod') {
    const ok = await confirmProd(list.length);
    if (!ok) return;
  }
  state.busy = true; render();
  for (const r of list) {
    r.status = 'sending'; render();
    try {
      const { data } = await api('/api/send', { target: tgt, row: r.input, confirm: tgt === 'prod' ? 'YES' : undefined });
      const entry = { at: new Date().toISOString(), target: tgt, ...data, result: data.result || { ok: false, message: data.error || (data.errors || []).join(' ') } };
      r.log.push(entry);
      if (data.requestXml) r.preview = { ...(r.preview || {}), xml: data.requestXml, values: data.values || r.preview?.values };
      r.status = entry.result.ok ? 'ok' : 'fail';
    } catch (e) {
      r.log.push({ at: new Date().toISOString(), target: tgt, result: { ok: false, message: '네트워크 오류' } });
      r.status = 'fail';
    }
    render();
    await sleep(300);
  }
  state.busy = false; render();
}

function confirmProd(n) {
  const dlg = $('#confirmProd');
  $('#prodCount').textContent = n;
  $('#prodYes').value = '';
  $('#prodOk').disabled = true;
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

// ---------- 내려받기 ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

function downloadCsv() {
  const head = 'shopCd,saleDate,posNo,openDt,closeDt,target,result,srid,retcd,message,sentAt';
  const lines = state.rows.map((r) => {
    const l = r.log[r.log.length - 1] || {};
    const v = l.values || r.preview?.values || {};
    return [r.input.shopCd?.toUpperCase(), r.input.saleDate, v.POS_NO || r.input.posNo || '01', r.input.openDt, v.CLOSE_DT || '',
      l.target || '', l.result ? (l.result.ok ? 'OK' : 'FAIL') : '', l.result?.srid || '', l.result?.retcd || '',
      `"${String(l.result?.message || STATUS[r.status][0]).replace(/"/g, '""')}"`, l.at || ''].join(',');
  });
  download(`force-close-result-${stamp()}.csv`, '\uFEFF' + [head, ...lines].join('\r\n'), 'text/csv;charset=utf-8');
}

function downloadJson() {
  const data = state.rows.map((r) => ({ input: r.input, status: r.status, log: r.log }));
  download(`force-close-log-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// ---------- 이벤트 ----------
$('#tokenForm').addEventListener('submit', (e) => {
  e.preventDefault();
  setToken($('#token').value.trim());
  connect().then(() => state.rows.filter((r) => r.status === 'new').forEach(validate));
});

document.querySelectorAll('input[name="target"]').forEach((el) => el.addEventListener('change', () => {
  document.body.dataset.target = target();
  refreshButtons();
}));

$('#rowForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  if (addRow(fd)) {
    ['shopCd', 'saleDate', 'openDt'].forEach((n) => { e.target.elements[n].value = ''; });
    e.target.elements.shopCd.focus();
  }
});

$('#csvAdd').addEventListener('click', () => {
  const { rows, error } = parseCsv($('#csv').value);
  if (error) { alert(error); return; }
  let added = 0;
  rows.forEach((r) => { if (addRow(r)) added++; });
  if (added < rows.length) alert(`${rows.length - added}건은 이미 목록에 있어 건너뛰었습니다.`);
});

$('#rows').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    state.rows = state.rows.filter((r) => r.id !== +del.dataset.del);
    if (state.selected === +del.dataset.del) state.selected = null;
    render(); e.stopPropagation(); return;
  }
  const tr = e.target.closest('tr[data-id]');
  if (tr) select(+tr.dataset.id);
});
$('#rows').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.dataset.id); }
});

$('#slip').addEventListener('click', (e) => {
  if (!e.target.matches('[data-copy]')) return;
  const r = state.rows.find((x) => x.id === state.selected);
  if (r?.preview?.xml) navigator.clipboard.writeText(r.preview.xml).then(() => { e.target.textContent = '복사됨'; });
});

$('#previewAll').addEventListener('click', () => state.rows.filter((r) => r.status !== 'ok').forEach(validate));
$('#sendAll').addEventListener('click', sendAll);
$('#salesChecked').addEventListener('change', refreshButtons);
$('#prodYes').addEventListener('input', (e) => { $('#prodOk').disabled = e.target.value.trim() !== 'YES'; });
$('#dlCsv').addEventListener('click', downloadCsv);
$('#dlJson').addEventListener('click', downloadJson);
$('#clearAll').addEventListener('click', () => {
  if (state.busy) return;
  if (state.rows.length && !confirm('목록과 전송 기록을 모두 비웁니다. 결과를 내려받았는지 확인하세요.')) return;
  state.rows = []; state.selected = null; render();
});
window.addEventListener('beforeunload', (e) => {
  if (state.rows.some((r) => r.log.length)) { e.preventDefault(); e.returnValue = ''; }
});

// 시작
if (getToken()) { $('#token').value = getToken(); connect(); }
render();
