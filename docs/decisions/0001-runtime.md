# 0001. 런타임 결정: vinext 유지

- 날짜: 2026-11-27
- 상태: 확정
- 관련: 설계 문서 8장 · 16장, 계획 1(`docs/superpowers/plans/2026-11-26-plan1-foundation.md`) 0주차

## 결론

**Next.js 앱은 vinext 로 Cloudflare Workers 에서 실행한다. OpenNext 로 바꾸지 않는다.**
0주차에 확인하려던 위험 요소(로그인 · Cron · Web Push · DB)가 모두 vinext 에서 로컬과 배포 사이트 둘 다 동작했다.

## 항목별 결과

| 항목 | 결과 | 택한 방법 |
|---|---|---|
| vinext 배포 | 동작 | `npm run deploy` (= `vinext-cloudflare deploy`, cf CLI). 배포 주소 https://mycar-note.fridgeo.workers.dev |
| D1 접근 | 동작 | `cloudflare.config.ts` 의 `bindings.d1({ id })`, 코드는 `import { env } from 'cloudflare:workers'` + Drizzle (`src/server/db/client.ts`) |
| 마이그레이션 | 동작 | drizzle-kit 로 SQL 생성, 적용은 cf CLI (`npm run db:migrate:local` / `:remote`). wrangler 는 쓰지 않음 |
| Auth.js (카카오 · 구글) | 동작 (주의 1) | next-auth `5.0.0-beta.32` 고정 + `@auth/drizzle-adapter`, 세션은 D1 (database 전략) |
| Cron `scheduled()` | 동작 (주의 2) | `src/worker.ts` 가 vinext 의 `fetch` 를 그대로 쓰고 `scheduled()` 를 더함. `entrypoint: './src/worker.ts'`, `triggers.scheduled({ schedule: '0 0 * * *' })` |
| Web Push | 동작 | `@block65/webcrypto-web-push` 2.x (Web Crypto, aes128gcm + VAPID). 직접 구현할 필요 없었음 |
| 테스트 DB | 동작 | Node 내장 `node:sqlite` 에 같은 마이그레이션 SQL 적용 + Drizzle `sqlite-proxy` (`src/server/db/test-db.ts`). `@cloudflare/vitest-pool-workers` · better-sqlite3 는 쓰지 않음 |
| GitHub Actions | CI 통과 (배포 워크플로는 main 병합 때 첫 실행) | `ci.yml` 검사, `deploy.yml` 검사 → 마이그레이션 → 배포 → 스모크 |

## 주의할 점 (vinext 가 Next.js 와 다른 곳)

1. **`x-forwarded-proto` 를 붙이지 않는다.** Auth.js 서버 액션(`signIn`)이 주소를 https 로 추측해 로컬에서 `redirect_uri_mismatch` 가 났다. → `AUTH_URL` 을 secret 으로 선언하고 로컬은 `http://localhost:3000`, 배포는 배포 주소를 넣는다. 사용자 도메인을 붙이면 이 값도 바꿔야 한다.
2. **기본 진입점은 `fetch` 만 내보낸다.** Cron 을 쓰려고 진입점을 감쌌다(`src/worker.ts`).
3. **`.dev.vars` 는 `cloudflare.config.ts` 에 선언된 값만 읽는다.** 그리고 선언한 secret 은 배포 때 필수다(없으면 배포가 멈춤). 새 비밀값은 선언 → `.dev.vars` → 대시보드 Secret 순서로 넣는다.
4. **바인딩 타입 파일(`.cloudflare/types`)은 생성물이라 git 에 없다.** `npm run typecheck` 가 `cf workers types` 를 먼저 실행한다(CI 에서 이것 때문에 한 번 실패했었음).
5. **`_` 로 시작하는 `app/` 폴더는 라우트가 되지 않는다** (Next.js 규칙과 같음).

## 그 밖의 도구 결정

- TypeScript 6 (typescript-eslint 가 7 을 지원하지 않음)
- 스타일은 전역 CSS(`src/styles`) — Tailwind 를 쓰지 않음. 시각 디자인은 사용자의 Figma 디자인을 적용
- drizzle-kit 0.31 은 SQLite 식 인덱스(`coalesce`)의 따옴표를 잘못 만든다 → `0000_init.sql` 한 줄을 손으로 고침 (스키마 주석에 표시)

## 다시 검토할 때

- vinext 에서 쓰려는 라이브러리가 동작하지 않을 때(우선 `npx vinext check`), 또는 Auth.js 가 정식 5.0 이 되어 올릴 때
- 대체안: Cloudflare OpenNext 어댑터(`@opennextjs/cloudflare`). 바꾸면 `src/worker.ts` · 배포 명령 · `cloudflare.config.ts` 를 함께 고쳐야 한다
