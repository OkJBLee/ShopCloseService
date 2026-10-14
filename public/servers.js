// 전송 서버 목록과 http/https 규칙 — 화면(app.js)과 서버(src/api.js)가 함께 사용한다.

// ServerSocket LibXml_SendRecvData(LibXmlMain.cpp) 의 https 도메인 목록. 그 외(IP 포함)는 http 로 전송한다.
export const HTTPS_HOSTS = [
  'www.kisokpos.co.kr', 'www.niceokpos.co.kr', 'asp.okpos.co.kr', 'aspdev.okpos.co.kr',
  'nice.okpos.co.kr', 'nicedev.okpos.co.kr', 'kis.okpos.co.kr', 'kisdev.okpos.co.kr',
  'www.nicepayokpos.co.kr',
];

export const PRESETS = {
  dev: [
    { label: 'ASP', host: 'dev.netusys.com' },
    { label: 'NK개발(로컬 실행 전용)', host: '192.168.50.234' },
  ],
  prod: [
    { label: 'ASP', host: 'asp.netusys.com' },
    { label: 'KIS(구)', host: 'www.kisokpos.co.kr' },
    { label: 'NICE(구)', host: 'www.niceokpos.co.kr' },
    { label: 'NICEPAY', host: 'www.nicepayokpos.co.kr' },
  ],
};

/** 데몬과 동일하게 호스트로 스킴을 정한다. 입력한 스킴은 무시한다. */
export const schemeFor = (host) => (HTTPS_HOSTS.includes(String(host).toLowerCase()) ? 'https' : 'http');
