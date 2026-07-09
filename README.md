# WeatherForMe ☔

비 오기 1~2시간 전에 푸시로 알려주는 **내 위치 기반 우산 알리미 PWA**.

- **기상청 초단기예보**(공공데이터포털) 실시간 데이터 사용
- 홈 화면에 설치하는 **앱 형태(PWA)** — 앱이 꺼져 있어도 푸시 수신
- 10분마다 하늘을 확인하고, 강수 예보가 잡히면 즉시 알림 (재알림 쿨다운 3시간)
- **위치 자동 추적**: 앱 사용 중 2km 이상 이동하면 알림 기준 위치를 자동 갱신 (맥/갤럭시 공통)
  - 웹 플랫폼 제약상 앱이 완전히 종료된 동안엔 위치 갱신 불가 — 그동안 알림은 마지막 위치 기준.
    24/7 백그라운드 추적이 필요해지면 네이티브 래핑(Capacitor 등)으로 전환 필요

## 동작 구조

```
[GitHub Actions, 10분마다]
        │  Bearer CRON_SECRET
        ▼
GET /api/cron/weather ──→ 기상청 초단기예보 (구독자 격자 단위로 1회 조회)
        │                     └ 향후 2시간 내 비/눈/진눈깨비 감지
        ▼
web-push (VAPID) ──→ 폰 알림 "☔ 곧 비가 와요 — 오후 3시부터..."

구독자 저장소: Upstash Redis (Vercel Storage 연동)
```

## 셋업 순서

### 1. 기상청 API 키 발급 (필수 — 둘 중 한 곳)

**공공데이터포털** 또는 **기상청 API허브** 아무 쪽이나 됩니다.

- [공공데이터포털](https://www.data.go.kr): **"기상청_단기예보 ((구)_동네예보) 조회서비스"** 검색 → **활용신청**(자동 승인) → 마이페이지의 **일반 인증키(Decoding)** 를 `KMA_SERVICE_KEY=` 에
  ⚠️ 발급/신청 직후엔 게이트웨이 반영까지 **최대 1시간** 걸릴 수 있음
- [기상청 API허브](https://apihub.kma.go.kr): 회원가입 후 발급받은 **인증키**를 `KMA_APIHUB_KEY=` 에

### 2. 로컬 실행

```bash
cp .env.example .env.local   # 이미 .env.local이 있으면 생략
npm install
npm run dev                  # http://localhost:3000
```

> VAPID 키가 없다면 `npx web-push generate-vapid-keys` 로 생성해서 채우세요.
> 개발 모드에선 서비스워커가 비활성화되므로 푸시 테스트는 `npm run build && npm start` 로.

### 3. Vercel 배포

1. Vercel에서 이 저장소 import → 배포
2. **Storage 탭 → Upstash for Redis 생성/연결** (환경변수 `KV_REST_API_URL/TOKEN` 자동 주입)
3. 프로젝트 **Settings → Environment Variables** 에 `.env.local` 값 등록:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - `KMA_SERVICE_KEY`, `CRON_SECRET`

### 4. 10분 크론 연결 (GitHub Actions)

저장소 **Settings → Secrets and variables → Actions** 에 시크릿 2개 추가:

| 시크릿 | 값 |
|---|---|
| `APP_URL` | 배포 주소 (예: `https://weatherforme.vercel.app`) |
| `CRON_SECRET` | `.env.local` 의 `CRON_SECRET` 과 동일 |

푸시하면 [.github/workflows/weather-cron.yml](.github/workflows/weather-cron.yml)이 10분마다 감시 엔드포인트를 호출합니다.
(Vercel 무료 플랜 자체 크론은 하루 1회 제한이라 `vercel.json` 에는 백업용 일 1회만 남겨둠)

### 5. 폰에 설치

- **iPhone (iOS 16.4+)**: Safari로 접속 → 공유 → **홈 화면에 추가** → 홈 화면 아이콘으로 열어서 알림 켜기
  (iOS는 홈 화면에 설치된 PWA에서만 웹 푸시 지원)
- **Android**: Chrome 접속 → 설치 배너 또는 메뉴(⋮) → **앱 설치**

## 환경변수

| 변수 | 설명 |
|---|---|
| `KMA_SERVICE_KEY` | 기상청 단기예보 API 인증키 — 공공데이터포털(Decoding) |
| `KMA_APIHUB_KEY` | 기상청 API허브 인증키 (위 키 대신 사용 가능) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 웹 푸시 VAPID 키 쌍 |
| `VAPID_SUBJECT` | 푸시 서비스 연락처 (`mailto:...`) |
| `CRON_SECRET` | 크론 엔드포인트 인증 토큰 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (미설정시 인메모리 — 로컬 전용) |
| `RAIN_LOOKAHEAD_HOURS` | (선택) 강수 감지 리드타임, 기본 2시간 |
| `NOTIFY_COOLDOWN_HOURS` | (선택) 재알림 쿨다운, 기본 3시간 |

## 주요 코드

| 파일 | 역할 |
|---|---|
| [src/lib/kma.ts](src/lib/kma.ts) | 기상청 API 클라이언트, 위경도→격자 변환, 강수 판정 |
| [src/app/api/cron/weather/route.ts](src/app/api/cron/weather/route.ts) | 주기 감시 + 푸시 발송 (격자별 API 1회, 중복알림 방지) |
| [src/app/api/weather/route.ts](src/app/api/weather/route.ts) | UI용 현재 날씨 + 6시간 예보 |
| [src/app/api/subscribe/route.ts](src/app/api/subscribe/route.ts) | 푸시 구독 등록/해제 |
| [src/lib/db.ts](src/lib/db.ts) | 구독자 저장소 (Upstash Redis) |
| [worker/index.ts](worker/index.ts) | 서비스워커 푸시 수신/클릭 처리 |
