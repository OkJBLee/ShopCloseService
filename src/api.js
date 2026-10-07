// 공통 API 처리 — Cloudflare Workers(src/worker.js)와 Vercel Functions(api/*.js)가 함께 사용한다.
//
// 환경변수
//   ACCESS_TOKEN       (필수)  화면에서 입력하는 접근 토큰
//   TARGET_DEV         (선택) 개발 웹서버 기본 URL. 화면에서 주소를 입력하지 않았을 때 사용
//   TARGET_PROD        (선택) 운영 웹서버 기본 URL. 화면에서 주소를 입력하지 않았을 때 사용
//   ALLOWED_HOSTS      (선택) 화면에서 입력한 주소를 허용할 호스트 목록, 쉼표 구분
//                      (예: asp.okpos.co.kr,aspdev.okpos.co.kr). 비우면 공인 호스트 전체 허용
//   ALLOW_PRIVATE_HOSTS (선택) 1 이면 localhost/사설 IP 허용 (로컬 테스트 전용)
//   SEND_PATH          기본 /SvrApp/PS000.java
//   SEND_CONTENT_TYPE  기본 text/xml; charset=UTF-8   ← LibXml_SendRecvData 와 동일하게 맞출 것
//   SEND_USER_AGENT    기본 LibXml_SendRecvData 의 Win7 값 (Mozilla/5.0 … ORCA-1, 0, 0, 1)
//   SEND_BODY_MODE     raw(기본) | form
//   SEND_FORM_FIELD    form 모드일 때 XML 을 담을 파라미터명
//   SEND_TIMEOUT_MS    기본 15000

import { normalize, buildXml, toWireXml, parseResponse } from './ps010.js';
import { schemeFor } from '../public/servers.js';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; ORCA-1, 0, 0, 1)';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function envTargets(env) {
  const t = {};
  for (const [k, name] of [['dev', 'TARGET_DEV'], ['prod', 'TARGET_PROD']]) {
    const v = validateBaseUrl(env[name], env, { skipAllowlist: true });
    if (v.ok) t[k] = v.base;
  }
  return t;
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

/**
 * 화면에서 입력한 서버 주소 검증. 경로·쿼리는 버리고 origin(scheme://host[:port])만 사용한다.
 * 스킴을 쓰면 그대로 사용하고, 생략하면 데몬 규칙(schemeFor)으로 정한다.
 * @returns {{ok:true, base:string} | {ok:false, error:string}}
 */
export function validateBaseUrl(input, env = {}, { skipAllowlist = false } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: '서버 주소가 비어 있습니다.' };
  const hasScheme = /^[a-z]+:\/\//i.test(raw);
  let u;
  try { u = new URL(hasScheme ? raw : `http://${raw}`); } catch {
    return { ok: false, error: '서버 주소 형식이 올바르지 않습니다.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'http 또는 https 주소만 사용할 수 있습니다.' };
  if (u.username || u.password) return { ok: false, error: '주소에 계정 정보를 넣을 수 없습니다.' };
  const host = u.hostname.toLowerCase();
  if (env.ALLOW_PRIVATE_HOSTS !== '1' && PRIVATE_HOST.test(host)) {
    return { ok: false, error: '내부망·로컬 주소로는 전송할 수 없습니다.' };
  }
  if (!skipAllowlist) {
    const allow = String(env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes(host)) return { ok: false, error: `허용되지 않은 서버입니다 (${host}).` };
  }
  return { ok: true, base: hasScheme ? u.origin : `${schemeFor(host)}://${u.host}` };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function sendPs010(env, baseUrl, xml) {
  const url = baseUrl + (env.SEND_PATH || '/SvrApp/PS000.java');
  const contentType = env.SEND_CONTENT_TYPE || 'text/xml; charset=UTF-8';
  const mode = (env.SEND_BODY_MODE || 'raw').toLowerCase();
  const body = mode === 'form'
    ? new URLSearchParams({ [env.SEND_FORM_FIELD || 'xml']: xml }).toString()
    : xml;

  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': mode === 'form' ? 'application/x-www-form-urlencoded; charset=UTF-8' : contentType,
      'user-agent': env.SEND_USER_AGENT || DEFAULT_USER_AGENT,
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(Number(env.SEND_TIMEOUT_MS) || 15000),
  });
  const text = await res.text();
  return { url, httpStatus: res.status, location: res.headers.get('location'), elapsedMs: Date.now() - started, text };
}

export async function handleApi(request, env, path) {
  if (!env.ACCESS_TOKEN) return json({ error: 'ACCESS_TOKEN 이 설정되지 않았습니다. 호스팅 환경변수에 등록하세요.' }, 500);
  if (!safeEqual(request.headers.get('x-access-token') || '', env.ACCESS_TOKEN)) {
    return json({ error: '접근 토큰이 올바르지 않습니다.' }, 401);
  }

  // 환경변수 기본 서버 존재 여부 (주소 자체는 노출하지 않음)
  if (path === '/api/config' && request.method === 'GET') {
    const t = envTargets(env);
    return json({ envTargets: { dev: !!t.dev, prod: !!t.prod }, allowlist: !!String(env.ALLOWED_HOSTS || '').trim() });
  }

  if (request.method !== 'POST') return json({ error: 'POST 만 지원합니다.' }, 405);
  const body = await readJson(request);
  if (!body) return json({ error: '요청 본문이 JSON 이 아닙니다.' }, 400);

  // 미리보기: 검증 + XML 생성 (전송 없음)
  if (path === '/api/preview') {
    const n = normalize(body.row);
    return json({ ...n, xml: n.ok ? toWireXml(buildXml(n.values)) : null });
  }

  // 전송
  if (path === '/api/send') {
    const target = body.target === 'prod' ? 'prod' : body.target === 'dev' ? 'dev' : null;
    if (!target) return json({ error: '대상 서버 구분(dev/prod)이 없습니다.' }, 400);
    let base;
    if (String(body.targetUrl ?? '').trim()) {
      const v = validateBaseUrl(body.targetUrl, env);
      if (!v.ok) return json({ error: v.error }, 400);
      base = v.base;
    } else {
      base = envTargets(env)[target];
      if (!base) return json({ error: `${target === 'prod' ? '운영' : '개발'}서버 주소를 입력하세요.` }, 400);
    }
    if (target === 'prod' && body.confirm !== 'YES') {
      return json({ error: '운영 서버 전송은 확인 문구 YES 가 필요합니다.' }, 400);
    }

    const n = normalize(body.row);
    if (!n.ok) return json({ ...n, sent: false }, 422);
    const xml = toWireXml(buildXml(n.values));

    try {
      const r = await sendPs010(env, base, xml);
      const result = r.httpStatus === 200
        ? parseResponse(r.text)
        : r.httpStatus >= 300 && r.httpStatus < 400
          ? { ok: false, srid: null, retcd: null, message: `HTTP ${r.httpStatus} 리다이렉트${r.location ? ` → ${r.location}` : ''}. 서버 주소(http/https)를 확인하세요.` }
          : { ok: false, srid: null, retcd: null, message: `HTTP ${r.httpStatus}` };
      return json({
        sent: true, target, targetUrl: base, key: `${n.values.SHOP_CD};${n.values.SALE_DATE};${n.values.POS_NO};00;3;`,
        warnings: n.warnings, values: n.values,
        requestXml: xml, responseText: r.text, httpStatus: r.httpStatus, elapsedMs: r.elapsedMs,
        result,
      });
    } catch (e) {
      const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return json({
        sent: false, target, targetUrl: base, values: n.values, requestXml: xml,
        result: { ok: false, message: timeout ? '서버 응답 시간 초과' : `전송 실패: ${e && e.message}` },
      }, 502);
    }
  }

  return json({ error: '알 수 없는 경로입니다.' }, 404);
}
