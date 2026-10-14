import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBaseUrl, handleApi } from '../src/api.js';

test('서버 주소: origin 만 사용', () => {
  assert.deepEqual(validateBaseUrl('http://asp.example.co.kr/SvrApp/PS000.java?x=1'), { ok: true, base: 'http://asp.example.co.kr' });
  assert.deepEqual(validateBaseUrl(' asp.example.co.kr:8080/ '), { ok: true, base: 'http://asp.example.co.kr:8080' });
});

test('서버 주소: 스킴 생략 시 데몬 규칙 (목록 도메인 https, 그 외 http), 지정 시 그대로', () => {
  assert.deepEqual(validateBaseUrl('asp.okpos.co.kr'), { ok: true, base: 'https://asp.okpos.co.kr' });
  assert.deepEqual(validateBaseUrl('ASPDEV.okpos.co.kr/x'), { ok: true, base: 'https://aspdev.okpos.co.kr' });
  assert.deepEqual(validateBaseUrl('211.43.10.5:8080'), { ok: true, base: 'http://211.43.10.5:8080' });
  assert.deepEqual(validateBaseUrl('http://asp.okpos.co.kr'), { ok: true, base: 'http://asp.okpos.co.kr' });
  assert.deepEqual(validateBaseUrl('https://211.43.10.5:8080'), { ok: true, base: 'https://211.43.10.5:8080' });
});

test('서버 주소: 잘못된 형식·스킴·계정 거부', () => {
  assert.equal(validateBaseUrl('').ok, false);
  assert.equal(validateBaseUrl('ftp://asp.example.co.kr').ok, false);
  assert.equal(validateBaseUrl('http://user:pw@asp.example.co.kr').ok, false);
  assert.equal(validateBaseUrl('http://exa mple').ok, false);
});

test('서버 주소: 내부망 차단, ALLOW_PRIVATE_HOSTS=1 이면 허용', () => {
  for (const h of ['http://localhost', 'http://127.0.0.1:9000', 'http://10.1.2.3', 'http://192.168.0.49', 'http://172.20.0.1', 'http://169.254.169.254', 'http://[::1]']) {
    assert.equal(validateBaseUrl(h).ok, false, h);
  }
  assert.equal(validateBaseUrl('http://172.32.0.1').ok, true);
  assert.equal(validateBaseUrl('http://127.0.0.1:9000', { ALLOW_PRIVATE_HOSTS: '1' }).ok, true);
});

test('서버 주소: ALLOWED_HOSTS 허용 목록', () => {
  const env = { ALLOWED_HOSTS: 'asp.example.co.kr, aspdev.example.co.kr' };
  assert.equal(validateBaseUrl('https://aspdev.example.co.kr', env).ok, true);
  assert.equal(validateBaseUrl('https://evil.example.com', env).ok, false);
});

test('전송: 실제 요청(URL·헤더·본문)을 성공·실패 모두 기록', async () => {
  const env = { ACCESS_TOKEN: 't' };
  const call = () => handleApi(new Request('http://x/api/send', {
    method: 'POST', headers: { 'x-access-token': 't' },
    body: JSON.stringify({ target: 'dev', targetUrl: 'aspdev.okpos.co.kr', row: { shopCd: 'DT0241', saleDate: '20261014', openDt: '20261014101843' } }),
  }), env, '/api/send').then((r) => r.json());
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } }); };
    const fail = await call();
    assert.equal(fail.request.url, 'https://aspdev.okpos.co.kr/SvrApp/PS000.java');
    assert.equal(fail.request.headers['user-agent'], 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; ORCA-1, 0, 0, 1)');
    assert.equal(fail.request.body, fail.requestXml);
    assert.match(fail.result.message, /ETIMEDOUT/);

    let sent;
    globalThis.fetch = async (url, init) => { sent = { url, ...init }; return new Response('<TSP-NVP><TXJM-FD SRID="PS011" RETCD="0"/></TSP-NVP>'); };
    const ok = await call();
    assert.equal(ok.request.url, sent.url);
    assert.deepEqual(ok.request.headers, sent.headers);
    assert.equal(ok.request.body, sent.body);
  } finally { globalThis.fetch = orig; }
});
