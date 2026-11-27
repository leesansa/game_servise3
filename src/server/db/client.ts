// D1 연결. Worker 바인딩 env.DB(cloudflare.config.ts)를 Drizzle 로 감싼다. 서버 코드에서만 import 한다
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function getDb() {
  return drizzle(env.DB, { schema })
}
