// 공통 API 처리 — Cloudflare Workers(src/worker.js)와 Vercel Functions(api/*.js)가 함께 사용한다.
//
// 환경변수
//   ACCESS_TOKEN       (필수)  화면에서 입력하는 접근 토큰
//   TARGET_DEV         개발 웹서버 기본 URL (예: http://aspdev.example.co.kr)
//   TARGET_PROD        운영 웹서버 기본 URL (비우면 운영 전송 비활성)
//   SEND_PATH          기본 /SvrApp/PS000.java
//   SEND_CONTENT_TYPE  기본 text/xml; charset=UTF-8   ← LibXml_SendRecvData 와 동일하게 맞출 것
//   SEND_USER_AGENT    기본 OKPOS                     ← LibXml_SendRecvData 와 동일하게 맞출 것
//   SEND_BODY_MODE     raw(기본) | form
//   SEND_FORM_FIELD    form 모드일 때 XML 을 담을 파라미터명
//   SEND_TIMEOUT_MS    기본 15000

import { normalize, buildXml, parseResponse } from './ps010.js';

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

function targets(env) {
  const clean = (u) => (u || '').trim().replace(/\/+$/, '');
  const t = {};
  if (clean(env.TARGET_DEV)) t.dev = clean(env.TARGET_DEV);
  if (clean(env.TARGET_PROD)) t.prod = clean(env.TARGET_PROD);
  return t;
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
      'user-agent': env.SEND_USER_AGENT || 'OKPOS',
    },
    body,
    signal: AbortSignal.timeout(Number(env.SEND_TIMEOUT_MS) || 15000),
  });
  const text = await res.text();
  return { url, httpStatus: res.status, elapsedMs: Date.now() - started, text };
}

export async function handleApi(request, env, path) {
  if (!env.ACCESS_TOKEN) return json({ error: 'ACCESS_TOKEN 이 설정되지 않았습니다. 호스팅 환경변수에 등록하세요.' }, 500);
  if (!safeEqual(request.headers.get('x-access-token') || '', env.ACCESS_TOKEN)) {
    return json({ error: '접근 토큰이 올바르지 않습니다.' }, 401);
  }

  // 사용 가능한 대상 서버 (주소는 노출하지 않음)
  if (path === '/api/config' && request.method === 'GET') {
    const t = targets(env);
    return json({ targets: { dev: !!t.dev, prod: !!t.prod } });
  }

  if (request.method !== 'POST') return json({ error: 'POST 만 지원합니다.' }, 405);
  const body = await readJson(request);
  if (!body) return json({ error: '요청 본문이 JSON 이 아닙니다.' }, 400);

  // 미리보기: 검증 + XML 생성 (전송 없음)
  if (path === '/api/preview') {
    const n = normalize(body.row);
    return json({ ...n, xml: n.ok ? buildXml(n.values) : null });
  }

  // 전송
  if (path === '/api/send') {
    const t = targets(env);
    const target = body.target === 'prod' ? 'prod' : body.target === 'dev' ? 'dev' : null;
    if (!target || !t[target]) return json({ error: '전송할 대상 서버가 설정되지 않았습니다.' }, 400);
    if (target === 'prod' && body.confirm !== 'YES') {
      return json({ error: '운영 서버 전송은 확인 문구 YES 가 필요합니다.' }, 400);
    }

    const n = normalize(body.row);
    if (!n.ok) return json({ ...n, sent: false }, 422);
    const xml = buildXml(n.values);

    try {
      const r = await sendPs010(env, t[target], xml);
      const result = r.httpStatus === 200
        ? parseResponse(r.text)
        : { ok: false, srid: null, retcd: null, message: `HTTP ${r.httpStatus}` };
      return json({
        sent: true, target, key: `${n.values.SHOP_CD};${n.values.SALE_DATE};${n.values.POS_NO};00;3;`,
        warnings: n.warnings, values: n.values,
        requestXml: xml, responseText: r.text, httpStatus: r.httpStatus, elapsedMs: r.elapsedMs,
        result,
      });
    } catch (e) {
      const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return json({
        sent: false, target, values: n.values, requestXml: xml,
        result: { ok: false, message: timeout ? '서버 응답 시간 초과' : `전송 실패: ${e && e.message}` },
      }, 502);
    }
  }

  return json({ error: '알 수 없는 경로입니다.' }, 404);
}
