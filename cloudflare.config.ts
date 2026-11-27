import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "mycar-note",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-27",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      // D1 데이터베이스 mycar-note-db. id 는 비밀번호가 아니라 커밋해도 됨 (마이그레이션 명령도 이 id 를 씀: package.json db:migrate:*)
      DB: bindings.d1({ id: '739d8b81-effa-4a37-b573-c29580f5142b' }),
      // 비밀값: 배포는 대시보드(Settings > Variables and secrets, Secret) 또는 `npx cf workers secrets update`, 로컬은 .dev.vars (예시: .dev.vars.example)
      AUTH_SECRET: bindings.secret(),
      AUTH_KAKAO_ID: bindings.secret(),
      AUTH_KAKAO_SECRET: bindings.secret(),
      AUTH_GOOGLE_ID: bindings.secret(),
      AUTH_GOOGLE_SECRET: bindings.secret(),
      // Auth.js 기준 주소. vinext 는 x-forwarded-proto 를 안 붙여서 비워 두면 Auth.js 서버 액션이 주소를 추측하다 틀림
      // (로컬에서 https 로 추측 → redirect_uri_mismatch). 로컬 .dev.vars: http://localhost:3000, 배포: https://mycar-note.fridgeo.workers.dev
      // 선언한 secret 은 배포 때 필수라 배포에도 값이 있어야 함. 사용자 도메인을 붙이면 이 값도 바꿀 것
      AUTH_URL: bindings.secret(),
    },
  }),
});
