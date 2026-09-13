# 뉴스매매 (newsmeme.co.kr)

실시간 뉴스 속보와 관련주를 자동으로 매칭해서 보여주는 사이트입니다.
Next.js 14(App Router)로 만들었고, **Vercel**에 배포되어 있습니다.

> 이 폴더를 그냥 열어보는 것만으로는 사이트가 동작하지 않습니다.
> 실제 데이터(뉴스·시세)는 전부 서버에서 외부 API를 불러와서 만들어집니다.

---

## 1. 지금 실제로 돌아가는 것들

| 기능 | 화면 주소 | 데이터가 어디서 오나 |
|---|---|---|
| 홈 (뉴스 피드) | `/` | 텔레그램 채널 → 오라클 서버 수집기 → `/api/telegram-ingest` → Redis |
| 테마 둘러보기 | `/themes` | KRX 정식 Open API + `lib/themeData.json` |
| 차트 패턴 검색 | `/patterns` | Redis에 쌓인 일봉 히스토리 + 30분마다 도는 자동 스캔 |
| 마감시황 | `/daily-review` | 평일 저녁 9시 자동 생성 (Claude API) |
| 칼럼 | `/blog` | `lib/blogPosts.js` (코드에 직접 넣어둔 글) |
| 상단 시세 티커 | `/` 상단 | 환율(Frankfurter) · 금(gold-api) · 유가(FRED) |
| **사이트 상태 점검** | `/health` | 아래 4번 참고 |

---

## 2. 자동으로 돌아가는 작업들

전부 **cron-job.org**에 등록해 둔 예약 호출로 동작합니다.
(Vercel의 자체 cron 기능은 쓰지 않습니다.)

| 주소 | 주기 | 하는 일 |
|---|---|---|
| `/api/poll` | 30분마다 | 그날 시세 저장 + 과거 시세 백필 + 패턴검색 결과 미리 계산 |
| `/api/daily-outlook/refresh` | **매일** 아침 7:50 | "오늘의 전망" 생성 (주말엔 해외 거시뉴스 기반 "다음 거래일 전망") |
| `/api/daily-review/refresh` | 평일 21:00 / 평일 23:00 / **매일** 08:00 | "마감시황" 글 생성·게시 |

> 마감시황이 세 번 등록돼 있는 이유: KRX가 그날 시세를 저녁 9시까지 안 올려주는 날이 많아서입니다.
> 데이터가 아직 없으면 그냥 건너뛰고 다음 회차에 다시 시도하며, **이미 그 날짜 글이 있으면 건너뛰므로 중복 게시되지 않습니다.**

텔레그램 뉴스 수집만 예외로, **오라클 클라우드 VM**에서 24시간 돌고 있는
`telegram-listener.service`(Telethon 유저봇)가 새 메시지를 받을 때마다
`/api/telegram-ingest`로 밀어 넣습니다.

모든 자동 작업은 `CRON_SECRET`으로 인증합니다
(텔레그램 수집만 `TELEGRAM_INGEST_SECRET`).

---

## 3. 환경변수

**Vercel 프로젝트 Settings → Environment Variables** 에서 설정합니다.
여기에 넣어야만 실제로 적용됩니다.

| 이름 | 용도 |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (이름이 `UPSTASH_REDIS_REST_*`여도 동작) |
| `ANTHROPIC_API_KEY` | 뉴스 필터링·종목 매칭·마감시황 글쓰기 |
| `KRX_OPENAPI_KEY` | KRX 정식 Open API 인증키 (유가증권·코스닥 일별매매정보) |
| `CRON_SECRET` | 자동 작업 인증 |
| `TELEGRAM_INGEST_SECRET` | 오라클 서버 수집기 인증 |
| `FRED_API_KEY` | 국제유가(WTI·브렌트) |
| `ALPHA_VANTAGE_API_KEY` | "오늘의 전망"용 미국장 데이터 |

---

## 4. 뭔가 안 될 때 — 먼저 `/health` 를 여세요

<https://newsmeme.co.kr/health>

자동 작업들이 **지금 실제로 돌고 있는지**를 신호등으로 보여줍니다.
🟢 정상 / 🟡 주의 / 🔴 문제.

환경변수 설정 여부까지 보려면 주소 뒤에 `?secret=<CRON_SECRET>` 을 붙이세요.

증상별로 어디를 보면 되는지:

- **뉴스가 안 올라온다**
  → `/health`의 "텔레그램 수집" 시각을 봅니다.
  시각이 멈춰 있으면 **오라클 서버**의 수집기가 죽은 것이고,
  시각은 움직이는데 "뉴스 피드"만 멈춰 있으면 **필터링**에서 다 걸러지는 중입니다.
- **패턴검색 결과가 안 바뀐다 / 히스토리 일수가 안 는다**
  → "30분 자동작업" 시각을 봅니다. 멈춰 있으면 cron-job.org 설정을 확인하세요.
- **마감시황 글이 안 올라온다**
  → "마감시황" 항목의 마지막 실행 기록에 건너뛴 이유가 적혀 있습니다.

---

## 5. 폴더 구조

```
app/
  page.js                  홈 (뉴스 피드)
  themes/                  테마 둘러보기
  patterns/                차트 패턴 검색
  blog/                    칼럼
  daily-review/            마감시황
  admin/                   피드 관리(글 삭제)
  health/                  사이트 상태 점검  ← 문제 생기면 여기부터
  api/                     서버 기능 전부 (아래)
components/                공용 UI 조각
lib/
  newsPipeline.js          뉴스 필터링 → 종목 매칭 → 게재 (핵심)
  priceHistory.js          일봉 시세 저장/백필
  patternDetection.js      차트 패턴 판정 규칙
  patternsScan.js          전 종목 패턴 스캔 + 캐시
  themeData.json           테마-종목 데이터베이스
  blogPosts.js             칼럼 본문
  dailyOutlook.js          오늘의 전망 생성
  dailyReview.js           마감시황 저장소
  dailyReviewWriter.js     마감시황 글쓰기
  runStatus.js             자동 작업 실행 기록 (/health용)
  redis.js                 Upstash 연결
```

---

## 6. 코드를 고칠 때

이 저장소는 GitHub Desktop으로 관리합니다.

1. **작업 시작 전에 반드시 `Pull origin` 을 먼저 누르세요.**
   (집/회사 두 대에서 번갈아 작업하기 때문에, 안 하면 최신 코드를 덮어씁니다.)
2. 파일을 수정합니다.
3. GitHub Desktop에서 커밋 → `Push origin`.
4. Vercel이 자동으로 다시 배포합니다 (보통 1~2분).
