import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBaseUrl } from '../src/api.js';

test('서버 주소: origin 만 사용', () => {
  assert.deepEqual(validateBaseUrl('https://asp.example.co.kr/SvrApp/PS000.java?x=1'), { ok: true, base: 'https://asp.example.co.kr' });
  assert.deepEqual(validateBaseUrl(' asp.example.co.kr:8080/ '), { ok: true, base: 'http://asp.example.co.kr:8080' });
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
