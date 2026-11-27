// 마이그레이션 SQL 을 Node 내장 SQLite 에 적용해 제약 조건(외래키 · 유니크 · 기본값)을 확인한다.
// D1 도 SQLite 이고 외래키를 기본으로 검사하므로 여기서도 foreign_keys 를 켠다.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

const MIGRATIONS = join(import.meta.dirname, 'migrations')

function freshDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) db.exec(stmt)
    }
  }
  return db
}

const count = (db: DatabaseSync, table: string) => (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n

let db: DatabaseSync
beforeEach(() => {
  db = freshDb()
  db.exec(`
    insert into users (id, email) values ('u1', 'a@example.com');
    insert into maintenance_items (code, name, description, sort_order) values ('ENGINE_OIL', '엔진오일', '설명', 1);
    insert into vehicles (id, user_id, model_year, fuel_type, daily_km) values ('v1', 'u1', 2021, 'GASOLINE', 31);
    insert into odometer_readings (id, vehicle_id, date, km, source) values ('r1', 'v1', '2026-11-01', 42000, 'ONBOARDING');
  `)
})

describe('D1 스키마', () => {
  it('사용자를 지우면 그 사용자의 데이터가 모두 지워진다 (회원 탈퇴)', () => {
    db.exec(`
      insert into maintenance_records (id, vehicle_id, item_code, date, km, source) values ('m1', 'v1', 'ENGINE_OIL', '2025-12-01', 33300, 'MANUAL');
      insert into push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('p1', 'u1', 'https://push.example/1', 'k', 'a');
      insert into notification_prefs (user_id) values ('u1');
      insert into notifications (id, user_id, vehicle_id, type, dedupe_key, title, body, url) values ('n1', 'u1', 'v1', 'TEST', 'TEST:1', 't', 'b', '/');
    `)
    db.exec(`delete from users where id = 'u1'`)
    for (const t of ['vehicles', 'odometer_readings', 'maintenance_records', 'push_subscriptions', 'notification_prefs', 'notifications']) {
      expect(count(db, t), t).toBe(0)
    }
  })

  it('같은 dedupe_key 의 알림은 두 번 저장되지 않는다', () => {
    const insert = `insert into notifications (id, user_id, type, dedupe_key, title, body, url) values (?, 'u1', 'DUE_SOON', 'DUE_SOON:v1:ENGINE_OIL:m1', 't', 'b', '/')`
    db.prepare(insert).run('n1')
    expect(() => db.prepare(insert).run('n2')).toThrow(/UNIQUE/)
  })

  it('같은 endpoint 의 푸시 구독은 두 번 저장되지 않는다', () => {
    const insert = `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth) values (?, 'u1', 'https://push.example/1', 'k', 'a')`
    db.prepare(insert).run('p1')
    expect(() => db.prepare(insert).run('p2')).toThrow(/UNIQUE/)
  })

  it('차종 없는(일반) 규칙도 항목 · 연료당 하나만 허용하고, 차종 지정 규칙은 따로 둘 수 있다', () => {
    db.exec(`insert into vehicle_models (id, maker, name, year_from, fuel_types) values ('m-avante', '현대', '아반떼', 2020, '["GASOLINE"]')`)
    const insert = `insert into maintenance_rules (id, item_code, fuel_type, vehicle_model_id, interval_km, interval_months) values (?, 'ENGINE_OIL', 'GASOLINE', ?, 10000, 12)`
    db.prepare(insert).run('a', null)
    expect(() => db.prepare(insert).run('b', null)).toThrow(/UNIQUE/)
    expect(() => db.prepare(insert).run('c', 'm-avante')).not.toThrow()
  })

  it('실측을 지우면 연결된 정비 기록의 연결만 풀리고, 그 실측을 가리키던 보정 무시 기록은 지워진다', () => {
    db.exec(`
      insert into maintenance_records (id, vehicle_id, item_code, date, km, odometer_reading_id, source) values ('m1', 'v1', 'ENGINE_OIL', '2026-11-01', 42000, 'r1', 'MANUAL');
      insert into calibration_dismissals (vehicle_id, dismissed_at_reading_id) values ('v1', 'r1');
    `)
    db.exec(`delete from odometer_readings where id = 'r1'`)
    expect(db.prepare(`select odometer_reading_id as r from maintenance_records where id = 'm1'`).get()).toEqual({ r: null })
    expect(count(db, 'calibration_dismissals')).toBe(0)
  })

  it('알림 설정 기본값은 모두 켜짐, 전체 끄기는 꺼짐', () => {
    db.exec(`insert into notification_prefs (user_id) values ('u1')`)
    expect(db.prepare(`select due_soon, overdue, seasonal, all_off from notification_prefs`).get()).toEqual({ due_soon: 1, overdue: 1, seasonal: 1, all_off: 0 })
  })

  it('생성 시각은 기본값으로 ISO(UTC) 문자열이 들어간다', () => {
    const { created_at } = db.prepare(`select created_at from vehicles where id = 'v1'`).get() as { created_at: string }
    expect(created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
