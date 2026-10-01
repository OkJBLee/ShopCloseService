import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, buildXml, parseResponse, DT_COLUMNS, nowKst } from '../src/ps010.js';

const sample = readFileSync(new URL('./fixtures/ps010_close_sample.xml', import.meta.url), 'utf8');

test('실제 정상 마감 전문과 바이트 단위로 동일', () => {
  const n = normalize({ shopCd: 'DT0741', saleDate: '20260824', openDt: '20260824154958', closeDt: '20261001011625' });
  assert.equal(n.ok, true);
  assert.equal(buildXml(n.values), sample);
});

test('DATA-DT 컬럼 120개, 중복 없음', () => {
  assert.equal(DT_COLUMNS.length, 120);
  assert.equal(new Set(DT_COLUMNS).size, 120);
});

test('기본값: POS 01, 사원 0000, INS_DT=OPEN_DT, 마감시각 자동', () => {
  const n = normalize({ shopCd: 'dt0741', saleDate: '20260824', openDt: '20260824154958' });
  assert.equal(n.values.SHOP_CD, 'DT0741');
  assert.equal(n.values.POS_NO, '01');
  assert.equal(n.values.EMP_NO, '0000');
  assert.equal(n.values.INS_DT, '20260824154958');
  assert.match(n.values.CLOSE_DT, /^\d{14}$/);
});

test('입력 오류 검출', () => {
  assert.equal(normalize({ shopCd: 'A', saleDate: '20260231', openDt: '20260231000000' }).ok, false);
  assert.equal(normalize({ shopCd: 'A;B', saleDate: '20260824', openDt: '20260824154958' }).ok, false);
  assert.equal(normalize({ shopCd: 'A', saleDate: '20260824', openDt: '20260824154958', closeDt: '20260824100000' }).ok, false);
});

test('개점일과 영업일 불일치는 경고', () => {
  const n = normalize({ shopCd: 'A', saleDate: '20260824', openDt: '20260825010000', closeDt: '20260825020000' });
  assert.equal(n.ok, true);
  assert.equal(n.warnings.length, 1);
});

test('응답 판정', () => {
  assert.equal(parseResponse('<TSP-NVP><TXJM-FD SRID="PS011" RETCD="0"/></TSP-NVP>').ok, true);
  assert.equal(parseResponse('<TSP-NVP><TXJM-FD SRID="PS011" RETCD="0000"/></TSP-NVP>').ok, true);
  assert.equal(parseResponse('<TSP-NVP><TXJM-FD SRID="PS011" RETCD="9999"/></TSP-NVP>').ok, false);
  assert.equal(parseResponse('<html>error</html>').ok, false);
});

test('KST 시각', () => {
  assert.equal(nowKst(new Date('2026-09-30T16:16:25Z')), '20261001011625');
});
