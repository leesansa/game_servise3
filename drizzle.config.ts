// 스키마 → 마이그레이션 SQL 생성 전용 (drizzle-kit). 사용법: npm run db:generate
// 적용은 cf CLI 로 한다: npm run db:migrate:local / db:migrate:remote
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
})
