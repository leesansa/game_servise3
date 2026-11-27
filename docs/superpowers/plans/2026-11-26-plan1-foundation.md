# 계획 1: 기반 구축 (0주차) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 앱을 Cloudflare Workers에 올리고, D1·로그인·Cron·Web Push·GitHub Actions 배포가 **실제로 동작하는지** 3일 안에 확인한다. 이후 모든 기능은 이 기반 위에 올라간다.

**Architecture:** 저장소 루트에 Next.js(App Router) 앱 하나. Cloudflare 권장 방식인 vinext로 Workers에 배포하고, D1은 Worker 바인딩(`import { env } from "cloudflare:workers"`)으로 Drizzle을 통해 접근한다. 매일 실행하는 작업은 `src/server/jobs/daily.ts` 한 함수로 두고, Cron(`scheduled()`)과 보호된 HTTP 경로가 둘 다 이 함수를 부른다.

**Tech Stack:** Next.js (App Router) · vinext · Cloudflare Workers · D1 · Drizzle ORM + drizzle-kit · Auth.js (카카오, 구글) · Web Push(VAPID) · Vitest · GitHub Actions · TypeScript strict · 전역 CSS(src/styles) · npm

**Spec:** `docs/superpowers/specs/2026-11-26-car-care-design.md` (8장 아키텍처, 9장 데이터 모델, 10장 알림, 12장 보안, 13장 배포, 15장 0주차)

## 이 계획의 범위
설계 문서 15장 "가. 0주차"와 그 결과물(배포 파이프라인, 전체 스키마, 로그인, Cron 연결, 푸시 발송 경로)이다. **이 계획이 끝나면 런타임(vinext 또는 OpenNext)이 확정되고**, 그 결과를 `docs/decisions/0001-runtime.md`에 남긴다. 화면 기능(온보딩·대시보드), 알림 규칙, 지도·최저가·뉴스·데모는 그 결정 뒤에 쓰는 계획 3~5에서 다룬다. 순수 계산 로직은 계획 2에서 다루며, 이 계획과 병행할 수 있다.

## 사람이 직접 해야 하는 일 (구현 에이전트가 대신할 수 없음)
- Cloudflare 계정 로그인(`npx wrangler login`), API 토큰 생성(Workers 편집 + D1 편집, 이 계정만)
- GitHub 저장소 Secrets 등록: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- 카카오 개발자 콘솔·구글 클라우드 콘솔에서 OAuth 앱 생성, Redirect URI 등록, 키 발급
- 휴대폰에서 푸시 알림 수신 확인

각 작업에서 이 일이 필요한 단계는 **[사람]**으로 표시한다. 비밀값은 채팅이나 저장소에 쓰지 않고 `wrangler secret put` 또는 GitHub Secrets에만 넣는다.

## Global Constraints
- TypeScript `strict: true`.
- 비밀값(OAuth 비밀키, 네이버 Secret, VAPID 개인키, `INTERNAL_JOB_TOKEN`)은 Worker Secret과 GitHub Secrets에만 둔다. `.dev.vars`는 `.gitignore`에 넣는다.
- 공개 변수 이름: `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- Worker Secret 이름: `AUTH_SECRET`, `AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`, `INTERNAL_JOB_TOKEN`.
- D1 바인딩 이름 `DB`, 데이터베이스 이름 `mycar-note-db`.
- Cron 식 `0 0 * * *` (UTC 00:00 = KST 09:00). GitHub Actions의 `schedule`은 쓰지 않는다.
- 시간은 ISO 문자열(UTC), 날짜만 의미 있는 값은 `YYYY-MM-DD`(KST 기준)로 저장한다.
- 내부 작업 경로 `/api/internal/*`는 비밀 토큰을 타이밍 안전 비교로 검사한다.

## Review Focus
- 토큰 헤더가 없거나, 길이가 다르거나, 값이 틀린 `/api/internal/run-daily` 요청 → 모두 401이고 작업이 실행되지 않아야 한다. (Task 5 테스트)
- 같은 endpoint로 다시 구독 → 행이 하나만 남고 키가 갱신되어야 한다. (Task 6 테스트)
- 푸시 서비스가 410/404로 응답 → 해당 구독 행이 삭제되어야 하고, 다른 구독 발송은 계속되어야 한다. (Task 6 테스트)
- D1 마이그레이션이 실패한 배포 → Worker 배포 단계가 실행되지 않아야 한다(구 스키마에 새 코드가 올라가는 것 방지). (Task 2 워크플로 순서)
- 로그인하지 않은 사용자의 `/api/push/subscribe` 요청 → 401, DB 변경 없음. (Task 6 테스트)

---

### Task 1: 앱 뼈대와 Workers 첫 배포

> **완료 (2026-11-27)** — 첫 배포: https://mycar-note.fridgeo.workers.dev (`npm run deploy` = `vinext-cloudflare deploy`, 로컬은 cf CLI OAuth 로그인 사용). 실제 결과는 game_servise2 구조를 따름: `src/app`, `@/*` → `./src/*`, 전역 CSS(`src/styles`, Tailwind 제거), ESLint(`eslint-config-next`), TypeScript 6(typescript-eslint 가 7 미지원), dev 포트 3000, `CLAUDE.md`·`.claude/launch.json` 추가. 아래 단계는 기록용.

**Files:**
- Create: 저장소 루트에 Next.js 앱(`src/app/`, `package.json`, `tsconfig.json`, Cloudflare 설정 파일 등 생성기가 만드는 파일)
- Create: `src/app/api/health/route.ts`
- Create: `vitest.config.ts`, `src/app/api/health/route.test.ts`
- Modify: `.gitignore` (`.dev.vars`, `.wrangler/`, 빌드 산출물)
- Keep: `README.md`, `docs/`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"ok": true}`; npm 스크립트 `dev`, `build`, `test`, `lint`, `typecheck`, `deploy`

- [ ] **Step 1: 생성기로 앱 만들기**

Run: `npm create cloudflare@latest -- mycar-note --framework=next` (Cloudflare 문서의 vinext 경로). 저장소 루트가 비어 있지 않아 생성기가 거부하면, 임시 폴더에 만든 뒤 `README.md`·`docs/`·`.git`을 건드리지 않고 파일을 루트로 옮긴다. 묻는 항목: TypeScript 예, Tailwind 예, ESLint 예, App Router 예, 지금 배포 아니오.

- [ ] **Step 2: `tsconfig.json`에 `"strict": true` 확인, `package.json`에 스크립트 추가**

`"typecheck": "tsc --noEmit"`, `"test": "vitest run"`. 생성기가 만든 `dev`/`build`/`deploy` 스크립트 이름은 그대로 둔다.

- [ ] **Step 3: Vitest 설치·설정 후 실패하는 테스트 작성**

`npm i -D vitest`. `src/app/api/health/route.test.ts`:
```ts
import { GET } from "./route";
it("health returns ok", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
```
Run: `npm test` → Expected: FAIL (route 없음)

- [ ] **Step 4: `src/app/api/health/route.ts`에 `export function GET(): Response` 구현** — `Response.json({ ok: true })`.

- [ ] **Step 5: 검사 전부 통과 확인**

Run: `npm run lint && npm run typecheck && npm test && npm run build` → 모두 exit 0

- [ ] **Step 6: [사람] 로컬 확인 후 수동 첫 배포**

Run: `npm run dev` → `http://localhost:<port>/api/health`가 `{"ok":true}`. 그다음 `npx wrangler login` 후 `npm run deploy` → 출력된 `*.workers.dev/api/health`가 `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app on Cloudflare Workers (vinext)"
```

---

### Task 2: GitHub Actions CI·배포

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Task 1의 npm 스크립트, Task 3 이후 존재할 `src/server/db/migrations/` 마이그레이션 폴더(없으면 마이그레이션 단계가 아무것도 하지 않음)

- [ ] **Step 1: `ci.yml` 작성** — 트리거: `pull_request`, `push`(main). 단계: checkout → `actions/setup-node`(Node 22 LTS, npm 캐시) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

- [ ] **Step 2: `deploy.yml` 작성** — 트리거: `push`(main). `needs`로 CI 작업과 같은 검사를 먼저 돌리거나 `workflow_run`(CI 성공)으로 연결. 단계 순서는 고정:
  1. `npm ci` → `npm run build`
  2. `cloudflare/wrangler-action@v4`로 `d1 migrations apply mycar-note-db --remote`
  3. 같은 액션(또는 vinext가 요구하는 배포 명령)으로 배포
  4. 스모크: `curl -fsS https://<worker>.workers.dev/api/health`
  
  2가 실패하면 3이 실행되지 않아야 한다(같은 job의 순차 step이면 기본 동작). `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`.

- [ ] **Step 3: [사람] GitHub Secrets 등록** — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

- [ ] **Step 4: 검증** — 브랜치에서 PR을 열면 CI가 초록색. main에 merge하면 deploy가 초록색이고 스모크 단계가 `{"ok":true}`를 받음.

- [ ] **Step 5: Commit**

```bash
git add .github && git commit -m "ci: add CI and Cloudflare deploy workflows"
```

---

### Task 3: D1 + Drizzle, 전체 스키마

> **완료 (2026-11-27)** — D1 `mycar-note-db`(apac) 생성, `cloudflare.config.ts` 에 `DB: bindings.d1({ id })`. 마이그레이션은 wrangler 대신 cf CLI: `npm run db:migrate:local` / `db:migrate:remote`(원격에도 0000_init 적용 완료). 스키마 테스트는 Node 내장 `node:sqlite` 에 같은 SQL 을 적용해 실행(추가 의존성 없음). drizzle-kit 0.31 이 식 인덱스(`coalesce`) 따옴표를 잘못 만들어 0000_init.sql 한 줄을 손으로 고침. `@auth/drizzle-adapter` 설치는 Task 4 로 미룸(테이블은 어댑터 모양으로 정의).

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`, `src/server/db/migrations/0000_*.sql`
- Create: `src/server/db/schema.test.ts`
- Modify: Cloudflare 설정 파일(D1 바인딩 `DB`)

**Interfaces:**
- Produces: `getDb(): DrizzleD1Database<typeof schema>` (`src/server/db/client.ts`, `env.DB` 사용); 스키마 테이블 export 이름은 아래 표 그대로

| export | 테이블 | 컬럼 (설계 9장 그대로) |
|---|---|---|
| `users`, `accounts`, `sessions`, `verificationTokens` | Auth.js 표준 | `@auth/drizzle-adapter`의 SQLite 스키마. `users`에 `isDemo integer(boolean) default false` 추가 |
| `vehicleModels` | vehicle_models | id, maker, name, generation?, yearFrom, yearTo?, fuelTypes(JSON text) |
| `maintenanceItems` | maintenance_items | code(PK), name, description, mapKeyword?, shopKeyword?, sortOrder |
| `maintenanceRules` | maintenance_rules | id, itemCode, fuelType, vehicleModelId?, intervalKm?, intervalMonths? — unique(itemCode, fuelType, vehicleModelId) |
| `seasonalItems` | seasonal_items | id, season, label, excludedFuelTypes(JSON text), sortOrder |
| `vehicles` | vehicles | id, userId, vehicleModelId?, customModelName?, modelYear, fuelType, nickname?, dailyKm, createdAt, updatedAt |
| `odometerReadings` | odometer_readings | id, vehicleId, date, km, source(ONBOARDING/MANUAL/MAINTENANCE), createdAt |
| `maintenanceRecords` | maintenance_records | id, vehicleId, itemCode, date, km, cost?, memo?, odometerReadingId?, source(ONBOARDING/MANUAL), createdAt |
| `calibrationDismissals` | calibration_dismissals | vehicleId(PK), dismissedAtReadingId |
| `seasonalChecks` | seasonal_checks | vehicleId, seasonKey, seasonalItemId, checkedAt |
| `pushSubscriptions` | push_subscriptions | id, userId, endpoint(UNIQUE), p256dh, auth, userAgent?, createdAt, lastSuccessAt? |
| `notificationPrefs` | notification_prefs | userId(PK), dueSoon, overdue, seasonal, allOff (기본 true/true/true/false) |
| `notifications` | notifications | id, userId, vehicleId?, type(DUE_SOON/OVERDUE/SEASONAL/TEST), itemCode?, dedupeKey(UNIQUE), title, body, url, createdAt, readAt? |

인덱스: `odometer_readings(vehicle_id, date)`, `maintenance_records(vehicle_id, item_code, date)`, `notifications(user_id, created_at)`, `push_subscriptions(user_id)`. 외래키는 사용자 삭제 시 하위 데이터가 함께 지워지도록 `onDelete: "cascade"`(설계 12장 회원 탈퇴).

- [ ] **Step 1: [사람] D1 생성** — `npx wrangler d1 create mycar-note-db`, 출력된 바인딩을 Cloudflare 설정 파일에 `DB`로 추가.

- [ ] **Step 2: `npm i drizzle-orm @auth/drizzle-adapter && npm i -D drizzle-kit`, 실패하는 스키마 테스트 작성**

`src/server/db/schema.test.ts`: 마이그레이션 SQL을 적용한 D1(테스트 환경은 `@cloudflare/vitest-pool-workers`의 D1 바인딩)에서
```ts
it("cascades user delete to vehicles", async () => { /* insert user, vehicle; delete user; expect vehicles count 0 */ });
it("rejects duplicate notification dedupe_key", async () => { /* insert twice → second throws */ });
it("rejects duplicate push endpoint", async () => { /* same */ });
```
`@cloudflare/vitest-pool-workers`가 vinext 프로젝트에서 설정이 막히면, 이 3개 테스트만 `better-sqlite3`에 같은 마이그레이션 SQL을 적용해 돌린다(SQLite 동작이 같음). 어느 쪽을 썼는지 Task 7 결정 기록에 남긴다.
Run: `npm test` → Expected: FAIL (스키마 없음)

- [ ] **Step 3: `src/server/db/schema.ts` 작성(위 표), `npx drizzle-kit generate`로 `src/server/db/migrations/0000_*.sql` 생성, `src/server/db/client.ts`에 `getDb()` 구현**

- [ ] **Step 4: 테스트 통과 + 로컬·원격 적용**

Run: `npm test` → PASS. `npx wrangler d1 migrations apply mycar-note-db --local` → 성공. 원격 적용은 Task 2의 deploy 워크플로가 한다.

- [ ] **Step 5: Commit**

```bash
git add src/server/db drizzle.config.ts package.json package-lock.json <cloudflare 설정 파일>
git commit -m "feat(db): add D1 schema with Drizzle migrations"
```

---

### Task 4: 로그인 (Auth.js, 카카오·구글)

> **코드 완료 (2026-11-27), 실제 로그인 확인은 OAuth 키 등록 후** — next-auth `5.0.0-beta.32`(고정) + `@auth/drizzle-adapter`, vinext 에서 동작 확인: `/api/auth/providers` 200, 서버 액션 signIn 이 카카오 · 구글 인증 주소로 302. 비밀값은 `cloudflare.config.ts` 의 `bindings.secret()` 으로 선언, 로컬은 `.dev.vars`(예시 `.dev.vars.example`), 배포는 대시보드 Workers > mycar-note > Settings > Variables and Secrets. 설정 파일 경로: `src/server/auth/config.ts`.

**Files:**
- Create: `src/server/auth/config.ts` (Auth.js 설정), `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`
- Create: `src/server/auth/session.ts`, `src/server/auth/session.test.ts`

**Interfaces:**
- Consumes: Task 3 `getDb()`, `users`/`accounts`/`sessions`
- Produces: `requireUserId(): Promise<string>` — 세션이 없으면 `UnauthorizedError`를 던짐; `getUserId(): Promise<string | null>`; `class UnauthorizedError extends Error`

- [ ] **Step 1: [사람] OAuth 앱 등록** — 카카오(동의 항목: 닉네임, 프로필 이미지, 이메일 선택), 구글. Redirect URI: `https://<worker>.workers.dev/api/auth/callback/kakao`, `.../google`, 로컬 `http://localhost:<port>/api/auth/callback/...`. 키는 `wrangler secret put`과 `.dev.vars`에만.

- [ ] **Step 2: 실패하는 테스트** — `src/server/auth/session.test.ts`: 세션 조회 함수를 목으로 바꿔 `requireUserId()`가 세션 없음 → `UnauthorizedError`, 세션 있음 → user id 반환.

- [ ] **Step 3: 구현** — `next-auth` v5 + `@auth/drizzle-adapter`(Task 3 테이블), providers Kakao·Google, session strategy `database`. `/login` 페이지에 버튼 두 개.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. 로컬과 배포본에서 카카오·구글 로그인 → `users`·`accounts` 행 생성 확인(`npx wrangler d1 execute mycar-note-db --remote --command "select id,email from users"`).

- [ ] **Step 5: 결정 지점** — vinext에서 Auth.js 라우트가 동작하지 않으면 여기서 멈추고 Task 7의 전환 절차(OpenNext)를 먼저 수행한다. 4시간 이상 막히면 전환한다.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth src/app/login src/server/auth package.json package-lock.json
git commit -m "feat(auth): add Kakao and Google login with Auth.js"
```

---

### Task 5: 일일 작업 연결 (Cron + 보호된 HTTP 경로)

**Files:**
- Create: `src/server/jobs/daily.ts`, `src/server/internal/token.ts`, `src/server/internal/token.test.ts`
- Create: `src/app/api/internal/run-daily/route.ts`, `src/app/api/internal/run-daily/route.test.ts`
- Modify: Worker 진입점 또는 vinext가 제공하는 방식으로 `scheduled()` 연결, Cloudflare 설정 파일에 `crons = ["0 0 * * *"]`

**Interfaces:**
- Produces: `runDaily(now: Date): Promise<{ startedAt: string; processed: number }>` (`src/server/jobs/daily.ts`) — 이 계획에서는 시작 로그와 `{processed: 0}`만 반환, 실제 내용은 계획 4에서 채움; `isValidJobToken(header: string | null, secret: string): boolean`

- [ ] **Step 1: 실패하는 테스트**
```ts
// token.test.ts
expect(isValidJobToken(null, "s3cret")).toBe(false);
expect(isValidJobToken("", "s3cret")).toBe(false);
expect(isValidJobToken("s3cre", "s3cret")).toBe(false);   // 길이 다름
expect(isValidJobToken("s3crex", "s3cret")).toBe(false);
expect(isValidJobToken("s3cret", "s3cret")).toBe(true);
// route.test.ts: Authorization 없음 → 401, runDaily 호출 0회(spy); "Bearer s3cret" → 200, 호출 1회
```
Run: `npm test` → FAIL

- [ ] **Step 2: 구현** — `isValidJobToken`은 두 값을 `TextEncoder`로 바이트화 후 길이가 다르면 false, 같으면 바이트 XOR 누적으로 비교(Workers에서 Node `timingSafeEqual`에 의존하지 않기 위함). 경로는 `POST`만, 헤더 `Authorization: Bearer <INTERNAL_JOB_TOKEN>`.

- [ ] **Step 3: `scheduled()` 연결** — vinext 문서에서 커스텀 Worker 진입점(fetch는 앱에 위임, `scheduled`는 `runDaily(new Date(controller.scheduledTime))` 호출) 방법을 찾아 적용한다. 방법이 없으면 대안: 같은 저장소 `workers/cron/` 에 작은 Worker를 만들어 같은 D1을 바인딩하고 `src/server/jobs/daily.ts`를 import한다. 택한 방법을 Task 7에 기록.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. 로컬 dev 서버의 `/cdn-cgi/local/explorer` → Cron Triggers에서 실행 → 로그에 `runDaily` 시작 로그. 배포 후 `curl -X POST -H "Authorization: Bearer <token>" https://<worker>/api/internal/run-daily` → 200, 토큰 없이 → 401.

- [ ] **Step 5: Commit**

```bash
git add src/server/jobs src/server/internal src/app/api/internal <설정 파일> && git commit -m "feat(jobs): wire daily job to cron trigger and protected route"
```

---

### Task 6: Web Push 발송 경로

**Files:**
- Create: `public/sw.js`, `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Create: `src/server/push/send.ts`, `src/server/push/send.test.ts`, `src/server/push/subscriptions.ts`, `src/server/push/subscriptions.test.ts`
- Create: `src/app/api/push/subscribe/route.ts`, `src/app/api/push/test/route.ts`
- Create: `src/components/common/PushSubscribeButton.tsx` (임시로 `/login` 아래나 `/dev/push`에 노출)

**Interfaces:**
- Consumes: Task 3 `pushSubscriptions`, Task 4 `requireUserId()`
- Produces:
  - `type PushPayload = { title: string; body: string; url: string }`
  - `sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<{ ok: true } | { ok: false; gone: boolean; status: number }>` — `gone`은 410/404
  - `upsertSubscription(userId: string, sub: {endpoint,p256dh,auth}, userAgent?: string): Promise<void>`
  - `deleteSubscription(userId: string, endpoint: string): Promise<void>`
  - `sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }>` — gone이면 행 삭제, 성공이면 `lastSuccessAt` 갱신, 실패해도 다음 구독 계속

- [ ] **Step 1: VAPID 키 생성** — `npx web-push generate-vapid-keys`(로컬 1회). 공개키 → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, 개인키 → **[사람]** `wrangler secret put VAPID_PRIVATE_KEY`.

- [ ] **Step 2: 실패하는 테스트**
```ts
// subscriptions.test.ts
it("upsert same endpoint keeps one row and updates keys")
it("subscribe route returns 401 without session and writes nothing")
// send.test.ts (fetch를 목으로)
it("sendToUser deletes subscription on 410 and continues to next")   // removed: 1, sent: 1 (구독 2개 중)
it("sendToUser deletes subscription on 404")
it("sendToUser keeps subscription on 500 and does not throw")
```
Run: `npm test` → FAIL

- [ ] **Step 3: 구현** — 발송 라이브러리는 Web Crypto 기반(`@block65/webcrypto-web-push` 우선 시도). Workers에서 서명·암호화가 실패하면 다음 후보로 바꾸고, 그래도 막히면 VAPID JWT(ES256) + `aes128gcm` 페이로드 암호화를 `crypto.subtle`로 직접 구현한다(RFC 8291/8292). 택한 방법을 Task 7에 기록.
  - `sw.js`: `push` → `showNotification(title, { body, data: { url } })`; `notificationclick` → 열린 같은 출처 탭이 있으면 `focus()` 후 `navigate(url)`, 없으면 `clients.openWindow(url)`.
  - `manifest.webmanifest`: `name` "마이카노트", `display` "standalone", 아이콘 192/512, `start_url` "/dashboard".
  - `/api/push/test`: 로그인 사용자에게 `{ title: "테스트 알림", body: "알림이 잘 도착했어요", url: "/dashboard" }` 발송.

- [ ] **Step 4: 검증**

Run: `npm test` → PASS. **[사람]** 배포본에서 로그인 → 구독 버튼 → 테스트 발송 → 안드로이드 Chrome과 데스크톱 Chrome에서 수신, 알림 클릭 시 `/dashboard` 열림. iOS는 홈 화면에 추가한 뒤 같은 확인(가능하면).

- [ ] **Step 5: Commit**

```bash
git add public src/server/push src/app/api/push src/components/common/PushSubscribeButton.tsx package.json package-lock.json
git commit -m "feat(push): add web push subscribe and send path"
```

---

### Task 7: 런타임 결정 기록 (필요 시 OpenNext 전환)

**Files:**
- Create: `docs/decisions/0001-runtime.md`

- [ ] **Step 1: 결과 기록** — 항목별로 "동작함/막힘(증상)/택한 방법": vinext 배포, D1 접근, Auth.js, `scheduled()` 연결 방식, 푸시 라이브러리, DB 테스트 환경(vitest-pool-workers 또는 better-sqlite3). 마지막 줄에 **확정 런타임**.

- [ ] **Step 2: (막힌 경우만) OpenNext 전환** — Cloudflare OpenNext 어댑터 문서대로 `@opennextjs/cloudflare` 설정, 배포 명령을 `deploy.yml`에 반영, Task 1~6의 검증 단계를 다시 실행해 모두 통과시킨다.

- [ ] **Step 3: 최종 확인**

Run: `npm run lint && npm run typecheck && npm test && npm run build` → 모두 exit 0. main 배포 워크플로 초록색, `/api/health` 200.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions && git commit -m "docs: record runtime decision after week-0 spike"
```
