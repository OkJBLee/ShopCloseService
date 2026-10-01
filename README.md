# ShopCloseService

OKPOS 미사용 매장의 영업마감을 웹에서 처리하는 개인용 점검 툴입니다.
메인포스 00차수 `PS010`(CLOSE_FG=3, 금액·건수 0)을 웹서버 `/SvrApp/PS000.java` 로 직접 전송합니다.
Vercel(Hobby) 또는 Cloudflare Workers 무료 플랜에서 동작합니다. 두 호스팅이 같은 코드(`src/api.js`)를 사용합니다.

> 전문 형식은 매출이 없는 매장의 실제 정상 마감 전문(`test/fixtures/ps010_close_sample.xml`)과
> 바이트 단위로 동일합니다(`npm test` 로 검증).

## 처리 범위

| 처리함 | 처리하지 않음 |
|---|---|
| PS010 00차수 1건 (CLOSE_FG=3) | 01차수 이하 행, 로컬 DB, POS 메모리 상태 |
| | `/REGI;3`, `/REGICLOSE`, PD050, OKDC, 다붓, `/IF010`, 미전송 매출(SL010) |

매출이 있었던 일자에 쓰면 웹 00차수 합계가 0으로 기록됩니다. **전송 전에 ASP에서 해당 일자 매출이 0인지 확인하세요.**

## 구조

```
public/            화면 (정적 파일)
  index.html, style.css, app.js
api/               Vercel Functions 진입점 (config.js, preview.js, send.js)
src/
  api.js           /api/config, /api/preview, /api/send 공통 처리 (프록시)
  worker.js        Cloudflare Workers 진입점
  ps010.js         입력 검증, XML 생성, 응답 판정
vercel.json        Vercel 설정 (정적 디렉터리 public, 서울 리전 icn1)
test/
  ps010.test.js    실전문 일치 등 단위 테스트
  fixtures/ps010_close_sample.xml
wrangler.toml
```

필드 기본값: POS_NO `01`, EMP_NO `0000`, CLOSE_DT 전송 시각(KST), INS_DT = OPEN_DT.

## 로컬 실행

```powershell
npm install
npm test
copy .dev.vars.example .dev.vars   # ACCESS_TOKEN, TARGET_DEV 입력
npm run dev                        # wrangler, http://localhost:8787
# Vercel 방식으로 확인하려면: npx vercel dev  (Vercel 로그인 필요, 환경변수는 .env.local)
```

## 배포 A — Vercel (GitHub 연동)

1. 이 폴더를 GitHub 저장소(비공개 권장)에 push
2. vercel.com > Add New > Project > 저장소 Import
   - Framework Preset: **Other** (vercel.json 이 빌드 없음, 출력 `public` 으로 지정)
3. Settings > Environment Variables 에 등록 (Production)
   - `ACCESS_TOKEN` (길고 임의의 문자열, 필수)
   - `TARGET_DEV`, `TARGET_PROD` (끝에 `/` 없이, 운영을 비우면 운영 전송 비활성)
   - 필요 시 `SEND_CONTENT_TYPE`, `SEND_USER_AGENT`, `SEND_BODY_MODE`, `SEND_FORM_FIELD`, `SEND_TIMEOUT_MS`
     (Vercel 은 `wrangler.toml` 을 읽지 않으므로 기본값과 다르게 쓰려면 여기에 넣어야 함)
4. 환경변수 변경 후에는 Deployments > Redeploy 해야 반영됨
5. 이후 main 에 push 할 때마다 자동 배포

참고
- 함수 리전은 `vercel.json` 의 `icn1`(서울)로 고정했습니다.
- Hobby 플랜의 Deployment Protection 은 프로덕션 주소를 보호하지 않으므로 접근 통제는 `ACCESS_TOKEN` 에 의존합니다.
  토큰은 충분히 길게 만드세요.
- Vercel Hobby 는 약관상 비상업적 개인 용도로 제한됩니다. 업무 용도라면 약관을 확인하세요.

## 배포 B — Cloudflare Workers 무료

1. Cloudflare 계정 생성 후 로그인: `npx wrangler login`
2. 접근 토큰 등록 (길고 임의의 문자열): `npx wrangler secret put ACCESS_TOKEN`
3. 배포: `npm run deploy` → `https://shop-close-service.<계정>.workers.dev`
4. 대시보드 Workers > shop-close-service > Settings > Variables 에서 `TARGET_DEV`, `TARGET_PROD` 입력
   (예: `http://aspdev.example.co.kr`, 끝에 `/` 없이). 서버 주소는 저장소에 넣지 않습니다.
   `npm run deploy` 는 `--keep-vars` 로 실행되어 대시보드 값을 보존합니다. 운영 값을 비워 두면 운영 전송이 비활성화됩니다.
5. 권장: Zero Trust > Access > Applications 에서 이 workers.dev 주소에 본인 이메일만 허용 (무료, 이메일 OTP)

GitHub 연동 배포를 원하면 대시보드 Workers > Create > Import a repository 에서 이 저장소를 연결하면 됩니다.

## 사용 순서

1. 접근 토큰 입력 → 연결
2. 매장 추가 (단건 또는 CSV: `shopCd,saleDate,openDt[,posNo,empNo,closeDt]`)
3. 오른쪽 정산 전문 확인, 경고(개점일 ≠ 영업일 등) 확인
4. "매출 0 확인" 체크 → **개발서버로 먼저 전송** → ASP 개발서버 화면 확인
5. 운영서버 선택 → YES 입력 → 전송
6. 결과 CSV / 전문 기록 JSON 내려받기 (서버에는 아무 기록도 남지 않음)

같은 행은 서버별로 한 번 성공하면 다시 보내지지 않습니다(개발 성공 후 운영 전송은 가능).

## 운영 전 확인 필요

- **전송 헤더/본문 형식**: `SEND_CONTENT_TYPE`, `SEND_USER_AGENT`, `SEND_BODY_MODE` 는 임시값입니다.
  `LibXml_SendRecvData` 또는 `Send-PS010Close.ps1` 과 동일하게 맞춰야 합니다.
  (본문을 폼 파라미터로 보내는 방식이면 `SEND_BODY_MODE=form`, `SEND_FORM_FIELD=<파라미터명>`)
- **IP 제한**: 웹서버가 접속 IP를 제한하면 Cloudflare 에서의 요청이 차단됩니다.
- **응답 판정**: `TXJM-FD SRID="PS011"` 이고 `RETCD` 가 0(0, 0000 …)이면 성공으로 봅니다.
  실제 PS011 응답 원문으로 한 번 확인하세요.
- **저장소 공개 여부**: 테스트 픽스처에 실제 매장코드가 들어 있습니다. 저장소는 비공개로 두는 것을 권장합니다.
- 사내 운영 서버에 외부 호스팅에서 접근하는 것이므로 사내 보안 정책을 확인하세요.
