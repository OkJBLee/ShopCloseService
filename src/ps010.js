// PS010 (정산, POS_REGIS_T) 00차수 마감 전문 생성 / 응답 판정
// 컬럼 순서와 선언부는 실제 정상 마감 전문(test/fixtures/ps010_close_sample.xml)과 동일하게 유지한다.

export const DT_COLUMNS = (
  'SHOP_CD SALE_DATE POS_NO REGI_SEQ EMP_NO CLOSE_FG OPEN_DT CLOSE_DT TOT_BILL_CNT TOT_SALE_AMT ' +
  'TOT_DC_AMT SVC_TIP_AMT TOT_ETC_AMT DCM_SALE_AMT VAT_SALE_AMT VAT_AMT NO_VAT_SALE_AMT NO_TAX_SALE_AMT ' +
  'RET_BILL_CNT RET_BILL_AMT VISIT_CST_CNT POS_READY_AMT POS_CSH_IN_AMT POS_CSH_OUT_AMT WEA_IN_CSH_AMT ' +
  'WEA_IN_CRD_AMT TK_GFT_SALE_CSH_AMT TK_GFT_SALE_CRD_AMT TK_FOD_SALE_CSH_AMT TK_FOD_SALE_CRD_AMT CASH_CNT ' +
  'CASH_AMT CASH_BILL_CNT CASH_BILL_AMT CRD_CARD_CNT CRD_CARD_AMT WES_CNT WES_AMT TK_GFT_CNT TK_GFT_AMT ' +
  'TK_FOD_CNT TK_FOD_AMT CST_POINT_CNT CST_POINT_AMT JCD_CARD_CNT JCD_CARD_AMT RFC_CNT RFC_AMT DC_GEN_CNT ' +
  'DC_GEN_AMT DC_SVC_CNT DC_SVC_AMT DC_JCD_CNT DC_JCD_AMT DC_CPN_CNT DC_CPN_AMT DC_CST_CNT DC_CST_AMT ' +
  'DC_TFD_CNT DC_TFD_AMT DC_PRM_CNT DC_PRM_AMT DC_CRD_CNT DC_CRD_AMT DC_PACK_CNT DC_PACK_AMT REM_CHECK_CNT ' +
  'REM_CHECK_AMT REM_W100000_CNT REM_W50000_CNT REM_W10000_CNT REM_W5000_CNT REM_W1000_CNT REM_W500_CNT ' +
  'REM_W100_CNT REM_W50_CNT REM_W10_CNT REM_CASH_AMT REM_TK_GFT_CNT REM_TK_GFT_AMT REM_TK_FOD_CNT ' +
  'REM_TK_FOD_AMT ETC_TK_FOD_AMT LOSS_CASH_AMT LOSS_TK_GFT_AMT LOSS_TK_FOD_AMT REPAY_CASH_CNT REPAY_CASH_AMT ' +
  'REPAY_TK_GFT_CNT REPAY_TK_GFT_AMT INS_DT MCP_CNT MCP_AMT PCD_CARD_CNT PCD_CARD_AMT TAX_RFND_CNT ' +
  'TAX_RFND_AMT TAX_RFND_FEE DC_TAX_CNT DC_TAX_AMT PPC_CARD_AMT PPC_CARD_CNT DC_YAP_CNT DC_YAP_AMT ' +
  'SP_PAY_AMT SP_PAY_CNT O2O_CNT O2O_AMT ETC_PAY_AMT ETC_PAY_CNT DEPOSIT_AMT DEPOSIT_CNT REFUND_AMT ' +
  'REFUND_CNT PPC_CARD_SALE_CSH_AMT PPC_CARD_SALE_CRD_AMT EGIFT_CNT EGIFT_AMT OPT_PAY_AMT OPT_PAY_CNT'
).split(' ');

// 0 이 아닌 값을 갖는 컬럼. 나머지 111개는 "0".
const KEY_FIELDS = new Set(['SHOP_CD', 'SALE_DATE', 'POS_NO', 'REGI_SEQ', 'EMP_NO', 'CLOSE_FG', 'OPEN_DT', 'CLOSE_DT', 'INS_DT']);

export const DEFAULTS = { POS_NO: '01', EMP_NO: '0000' };

/** 한국 시각 yyyyMMddHHmmss */
export function nowKst(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}` +
         `${p(k.getUTCHours())}${p(k.getUTCMinutes())}${p(k.getUTCSeconds())}`;
}

function isValidDate(s, withTime) {
  if (!(withTime ? /^\d{14}$/ : /^\d{8}$/).test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  if (withTime && (+s.slice(8, 10) > 23 || +s.slice(10, 12) > 59 || +s.slice(12, 14) > 59)) return false;
  return true;
}

/**
 * 입력값 정규화 및 검증.
 * input: { shopCd, saleDate, posNo?, empNo?, openDt, closeDt? }
 * @returns {{ok:boolean, errors:string[], warnings:string[], values?:object}}
 */
export function normalize(input = {}) {
  const t = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const v = {
    SHOP_CD: t(input.shopCd).toUpperCase(),
    SALE_DATE: t(input.saleDate).replace(/-/g, ''),
    POS_NO: t(input.posNo) || DEFAULTS.POS_NO,
    EMP_NO: t(input.empNo) || DEFAULTS.EMP_NO,
    OPEN_DT: t(input.openDt).replace(/[-: ]/g, ''),
    CLOSE_DT: t(input.closeDt).replace(/[-: ]/g, '') || nowKst(),
  };
  const errors = [], warnings = [];

  if (!/^[A-Z0-9]{1,10}$/.test(v.SHOP_CD)) errors.push('매장코드는 영문·숫자 10자 이내로 입력하세요.');
  if (!isValidDate(v.SALE_DATE, false)) errors.push('영업일자를 yyyyMMdd 형식의 실제 날짜로 입력하세요.');
  if (!/^\d{2}$/.test(v.POS_NO)) errors.push('포스번호는 두 자리 숫자로 입력하세요 (예: 01).');
  if (!/^\d{4}$/.test(v.EMP_NO)) errors.push('사원번호는 네 자리 숫자로 입력하세요 (예: 0000).');
  if (!isValidDate(v.OPEN_DT, true)) errors.push('개점시각을 yyyyMMddHHmmss 형식의 실제 시각으로 입력하세요.');
  if (!isValidDate(v.CLOSE_DT, true)) errors.push('마감시각을 yyyyMMddHHmmss 형식의 실제 시각으로 입력하세요.');

  if (!errors.length) {
    if (v.OPEN_DT > v.CLOSE_DT) errors.push('마감시각이 개점시각보다 앞섭니다.');
    if (v.OPEN_DT.slice(0, 8) !== v.SALE_DATE) {
      warnings.push('개점시각의 날짜가 영업일자와 다릅니다. ASP의 개점 기록을 확인하세요.');
    }
  }
  if (errors.length) return { ok: false, errors, warnings };

  return {
    ok: true, errors, warnings,
    values: { ...v, REGI_SEQ: '00', CLOSE_FG: '3', INS_DT: v.OPEN_DT },
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 정규화된 값으로 PS010 XML 생성 (실전문과 동일: 선언부 encoding 없음, 한 줄, CRLF) */
export function buildXml(v) {
  const hd = `SHOP_CD="${esc(v.SHOP_CD)}" SALE_DATE="${v.SALE_DATE}" POS_NO="${v.POS_NO}" REGI_SEQ="00" ` +
             `INDEX_NO="${esc(v.SHOP_CD)};${v.SALE_DATE};${v.POS_NO};00;3;" DT_CNT="1"`;
  const dt = DT_COLUMNS.map((c) => `${c}="${KEY_FIELDS.has(c) ? esc(v[c]) : '0'}"`).join(' ');
  return `<?xml version="1.0"?>\r\n<TSP-NVP><TXJM-FD SRID="PS010" RETCD="0000"/>` +
         `<DATA-HD ${hd}><DATA-DT ${dt}/></DATA-HD></TSP-NVP>\r\n`;
}

/** 실제 전송 본문: 데몬(LibXml_SendRecvData)과 같이 선언부에 encoding="UTF-8" 을 넣는다 */
export const toWireXml = (xml) => xml.replace('?>', ' encoding="UTF-8"?>');

/** 응답 판정: TXJM-FD 의 SRID=PS011 이고 RETCD 가 0(0, 0000 …)이면 성공 */
export function parseResponse(text) {
  const tag = /<TXJM-FD\b([^>]*?)\/?>/i.exec(text || '');
  if (!tag) return { ok: false, srid: null, retcd: null, message: '응답에 TXJM-FD 가 없습니다.' };
  const attr = (n) => {
    const m = new RegExp(`\\b${n}\\s*=\\s*"([^"]*)"`, 'i').exec(tag[1]);
    return m ? m[1] : null;
  };
  const srid = attr('SRID'), retcd = attr('RETCD'), msg = attr('RETMSG') || attr('MSG');
  const ok = srid === 'PS011' && retcd !== null && /^0+$/.test(retcd);
  return { ok, srid, retcd, message: ok ? '전송성공' : (msg || `SRID=${srid}, RETCD=${retcd}`) };
}
