// D1 연결. Worker 바인딩 env.DB(cloudflare.config.ts)를 Drizzle 로 감싼다. 서버 코드에서만 import 한다
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'

export function getDb() {
  return drizzle(env.DB, { schema })
}

// 서버 함수들이 받는 DB 타입. 배포는 D1, 테스트는 node:sqlite(test-db.ts) 가 같은 모양으로 들어온다
export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>
