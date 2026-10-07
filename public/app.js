// 미사용 매장 강제 마감 — 화면 로직
import { PRESETS, schemeFor } from './servers.js';
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

// ---------- 전송 서버 주소 (브라우저에만 저장) ----------
let envTargets = { dev: false, prod: false };
const urlInput = (t) => (t === 'prod' ? $('#urlProd') : $('#urlDev'));
const urlSelect = (t) => (t === 'prod' ? $('#selProd') : $('#selDev'));
const httpsBox = (t) => (t === 'prod' ? $('#httpsProd') : $('#httpsDev'));
/** 콤보에서 서버를 고르면 주소 칸을 그 호스트로 채우고 숨긴다. '직접 입력'이면 주소 칸을 보인다. */
function applySelect(t) {
  const host = urlSelect(t).value;
  urlInput(t).hidden = !!host;
  if (host) urlInput(t).value = host;
}
/** 주소에서 호스트만 추출. 비었거나 형식 오류면 '' */
function hostOf(v) {
  const raw = String(v || '').trim();
  try { return raw ? new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`).hostname : ''; } catch { return ''; }
}
/** https 체크 기본값: 주소에 스킴을 썼으면 그 스킴, 아니면 데몬 규칙(목록 도메인 https, 그 외 http) */
function autoHttps(t) {
  const raw = urlInput(t).value.trim();
  const m = /^(https?):\/\//i.exec(raw);
  httpsBox(t).checked = m ? m[1].toLowerCase() === 'https' : schemeFor(hostOf(raw)) === 'https';
}
function loadUrls() {
  for (const t of ['dev', 'prod']) {
    urlSelect(t).innerHTML = PRESETS[t].map((p) => `<option value="${esc(p.host)}">${esc(p.label)} · ${esc(p.host)}</option>`).join('')
      + '<option value="">직접 입력 (IP 등)</option>';
    let saved = '';
    try { saved = localStorage.getItem(`sc-url-${t}`) || ''; } catch { /* 저장소 사용 불가 */ }
    const preset = PRESETS[t].find((p) => p.host === saved);
    urlSelect(t).value = preset ? preset.host : '';
    urlInput(t).value = saved;
    applySelect(t);
    let https = null;
    try { https = localStorage.getItem(`sc-https-${t}`); } catch { /* 저장소 사용 불가 */ }
    if (https === null) autoHttps(t); else httpsBox(t).checked = https === '1';
  }
}
function saveUrls() {
  try {
    localStorage.setItem('sc-url-dev', $('#urlDev').value.trim());
    localStorage.setItem('sc-url-prod', $('#urlProd').value.trim());
    localStorage.setItem('sc-https-dev', $('#httpsDev').checked ? '1' : '0');
    localStorage.setItem('sc-https-prod', $('#httpsProd').checked ? '1' : '0');
  } catch { /* 저장소 사용 불가 */ }
}
/** 입력값을 scheme://host[:port] 로 정리. 스킴은 https 체크로 정한다. 비었으면 '', 형식 오류면 null */
function cleanUrl(v, https) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${https ? 'https' : 'http'}://${new URL(`${https ? 'https' : 'http'}://${u.host}`).host}`;
  } catch { return null; }
}
function targetUrl(t = target()) { return cleanUrl(urlInput(t).value, httpsBox(t).checked); }
function targetReady(t = target()) {
  const u = targetUrl(t);
  return u === null ? false : (u !== '' || envTargets[t]);
}
function targetLabel(t = target()) {
  const u = targetUrl(t);
  return u || (envTargets[t] ? '환경변수에 설정된 기본 주소' : '');
}
function refreshServers() {
  document.querySelectorAll('.servers .server').forEach((l) => { l.dataset.active = String(l.dataset.server === target()); });
  for (const t of ['dev', 'prod']) {
    urlInput(t).placeholder = envTargets[t] ? '비우면 환경변수 기본 주소 사용' : 'IP 또는 주소 (예: 211.43.10.5)';
  }
  const u = targetUrl();
  const differs = u && httpsBox(target()).checked !== (schemeFor(hostOf(u)) === 'https');
  $('#serverHint').textContent = u === null
    ? '주소 형식이 올바르지 않습니다. IP 또는 서버 주소를 입력하세요.'
    : `${u ? `전송 주소: ${u}/SvrApp/PS000.java · ` : '주소 뒤에 /SvrApp/PS000.java 가 붙어 전송됩니다. '}`
      + (differs ? '데몬 규칙(목록 도메인 https, 그 외 http)과 다른 스킴입니다. '
        : 'http/https 는 "https 사용" 체크로 정합니다 (기본값은 데몬 규칙). ')
      + '선택한 주소는 이 브라우저에만 저장됩니다.';
  $('#serverHint').classList.toggle('st-fail', u === null);
  $('#serverHint').classList.toggle('st-warn', !!differs);
}
function setConnected(ok, text) {
  state.connected = ok;
  $('#conn').textContent = text;
  $('#tokenForm').dataset.connected = String(ok);
  $('#tokenBtn').textContent = ok ? '로그아웃' : '연결';
  refreshButtons();
}

async function connect() {
  setConnected(false, '연결 중…');
  try {
    const { status, data } = await api('/api/config');
    if (status !== 200) return setConnected(false, data.error || `연결 실패 (HTTP ${status})`);
    envTargets = data.envTargets || { dev: false, prod: false };
    refreshServers();
    setConnected(true, '연결됨');
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
      ${last.targetUrl ? `<dt>주소</dt><dd>${esc(last.targetUrl)}</dd>` : ''}
      <dt>결과</dt><dd class="${last.result?.ok ? 'st-ok' : 'st-fail'}">${esc(last.result?.message)}</dd>
      <dt>응답</dt><dd>${esc(last.result?.srid ?? '-')} / ${esc(last.result?.retcd ?? '-')}</dd></dl>` : ''}
    ${msgs ? `<ul class="msgs">${msgs}</ul>` : ''}
    ${p?.xml ? `<details><summary>요청 전문 XML</summary><pre>${esc(p.xml)}</pre>
      <button class="copy" data-copy="req">복사</button></details>` : ''}
    ${last?.responseText ? `<details><summary>응답 원문</summary><pre>${esc(last.responseText)}</pre></details>` : ''}`;
}

// 현재 대상 서버로 아직 성공하지 않은 행 (개발 성공 후 운영 전송 가능)
// 같은 구분(dev/prod)이라도 주소를 바꾸면 다시 보낼 수 있다
const sentOkTo = (r, tgt) => r.log.some((l) => l.target === tgt && l.requestedUrl === (targetUrl(tgt) || '') && l.result?.ok);
const isSendable = (r) => ['ready', 'warn', 'fail', 'ok'].includes(r.status) && r.preview?.ok !== false && !sentOkTo(r, target());

function refreshButtons() {
  const sendable = state.rows.filter(isSendable);
  $('#previewAll').disabled = state.busy || !state.connected || !state.rows.length;
  $('#sendAll').disabled = state.busy || !state.connected || !sendable.length
    || !targetReady();
  $('#sendAll').textContent = state.busy ? '전송 중…'
    : `PS010 전송${sendable.length ? ` (${sendable.length}건)` : ''} · ${target() === 'prod' ? '운영' : '개발'}`;
}

// ---------- 전송 ----------
async function sendAll() {
  const tgt = target();
  const list = state.rows.filter(isSendable);
  if (!list.length) return;
  const url = targetUrl(tgt);
  if (url === null) { alert('서버 주소 형식이 올바르지 않습니다.'); return; }
  if (tgt === 'prod') {
    const ok = await confirmProd(list.length, targetLabel(tgt));
    if (!ok) return;
  }
  saveUrls();
  state.busy = true; render();
  for (const r of list) {
    r.status = 'sending'; render();
    try {
      const { data } = await api('/api/send', { target: tgt, targetUrl: url || undefined, row: r.input, confirm: tgt === 'prod' ? 'YES' : undefined });
      const entry = { at: new Date().toISOString(), target: tgt, requestedUrl: url || '', ...data, result: data.result || { ok: false, message: data.error || (data.errors || []).join(' ') } };
      r.log.push(entry);
      if (data.requestXml) r.preview = { ...(r.preview || {}), xml: data.requestXml, values: data.values || r.preview?.values };
      r.status = entry.result.ok ? 'ok' : 'fail';
    } catch (e) {
      r.log.push({ at: new Date().toISOString(), target: tgt, requestedUrl: url || '', targetUrl: url, result: { ok: false, message: '네트워크 오류' } });
      r.status = 'fail';
    }
    render();
    await sleep(300);
  }
  state.busy = false; render();
}

function confirmProd(n, dest) {
  const dlg = $('#confirmProd');
  $('#prodCount').textContent = n;
  $('#prodUrl').textContent = dest;
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
  const head = 'shopCd,saleDate,posNo,openDt,closeDt,target,targetUrl,result,srid,retcd,message,sentAt';
  const lines = state.rows.map((r) => {
    const l = r.log[r.log.length - 1] || {};
    const v = l.values || r.preview?.values || {};
    return [r.input.shopCd?.toUpperCase(), r.input.saleDate, v.POS_NO || r.input.posNo || '01', r.input.openDt, v.CLOSE_DT || '',
      l.target || '', l.targetUrl || '', l.result ? (l.result.ok ? 'OK' : 'FAIL') : '', l.result?.srid || '', l.result?.retcd || '',
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
  if (state.connected) {
    if (state.busy) return;
    setToken('');
    $('#token').value = '';
    setConnected(false, '미연결');
    return;
  }
  setToken($('#token').value.trim());
  connect().then(() => state.rows.filter((r) => r.status === 'new').forEach(validate));
});

document.querySelectorAll('input[name="target"]').forEach((el) => el.addEventListener('change', () => {
  document.body.dataset.target = target();
  refreshServers();
  refreshButtons();
}));
['#urlDev', '#urlProd'].forEach((id) => {
  $(id).addEventListener('input', () => { refreshServers(); refreshButtons(); });
  $(id).addEventListener('change', saveUrls);
});
for (const t of ['dev', 'prod']) {
  urlInput(t).addEventListener('input', () => { autoHttps(t); refreshServers(); refreshButtons(); });
  httpsBox(t).addEventListener('change', () => { saveUrls(); refreshServers(); refreshButtons(); });
  urlSelect(t).addEventListener('change', () => {
    if (!urlSelect(t).value) urlInput(t).value = '';
    applySelect(t);
    autoHttps(t);
    saveUrls();
    refreshServers();
    refreshButtons();
    if (!urlSelect(t).value) urlInput(t).focus();
  });
}

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
loadUrls();
refreshServers();
if (getToken()) { $('#token').value = getToken(); connect(); }
render();
