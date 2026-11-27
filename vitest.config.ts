// 단위 테스트 설정. 도메인 로직·route handler 를 Node 환경에서 돌린다 (Workers 런타임이 필요한 테스트는 따로 둔다)
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
})
