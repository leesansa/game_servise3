// 테스트 전용: 마이그레이션 SQL 을 Node 내장 SQLite(메모리)에 적용하고 Drizzle 로 감싼다.
// D1 과 같은 SQLite 라서 서버 코드의 쿼리를 그대로 테스트할 수 있다 (sqlite-proxy 드라이버로 연결)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'

const MIGRATIONS = join(import.meta.dirname, 'migrations')

export function createRawTestDb() {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON') // D1 처럼 외래키 검사
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) raw.exec(stmt)
    }
  }
  return raw
}

export function createTestDb() {
  const raw = createRawTestDb()
  const db = drizzle(
    async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      const args = params as SQLInputValue[]
      if (method === 'run') {
        stmt.run(...args)
        return { rows: [] }
      }
      stmt.setReturnArrays(true)
      if (method === 'get') return { rows: (stmt.get(...args) as unknown[] | undefined) ?? [] }
      return { rows: stmt.all(...args) as unknown[] }
    },
    { schema },
  )
  return { db, raw }
}
