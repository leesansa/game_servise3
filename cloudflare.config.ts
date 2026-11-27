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
    },
  }),
});
