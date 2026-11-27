// D1(SQLite) 테이블 정의. 설계 문서 9장. 이 파일을 고친 뒤 `npm run db:generate` 로 마이그레이션 SQL 을 만든다.
// 시각은 ISO 문자열(UTC), 날짜만 의미 있는 값(정비일 · 실측일)은 'YYYY-MM-DD'(한국 시간 기준 날짜).
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = (name = 'created_at') => text(name).notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
const bool = (name: string, value: boolean) => integer(name, { mode: 'boolean' }).notNull().default(value)

export const FUEL_TYPES = ['GASOLINE', 'DIESEL', 'LPG', 'HYBRID', 'EV'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

// ── 인증 (Auth.js Drizzle 어댑터가 쓰는 모양. JS 키 이름은 어댑터 규칙 그대로) ──

export const users = sqliteTable('users', {
  id: id(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
  image: text('image'),
  isDemo: bool('is_demo', false),
  createdAt: createdAt(),
})

export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
})

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

// ── 차종 · 정비 규칙 (시드로 채우는 읽기 전용 데이터) ──

export const vehicleModels = sqliteTable('vehicle_models', {
  id: id(),
  maker: text('maker').notNull(),
  name: text('name').notNull(),
  generation: text('generation'),
  yearFrom: integer('year_from').notNull(),
  yearTo: integer('year_to'),
  fuelTypes: text('fuel_types', { mode: 'json' }).$type<FuelType[]>().notNull(),
})

export const maintenanceItems = sqliteTable('maintenance_items', {
  code: text('code').primaryKey(), // 예: ENGINE_OIL
  name: text('name').notNull(),
  description: text('description').notNull(),
  mapKeyword: text('map_keyword'),
  shopKeyword: text('shop_keyword'),
  sortOrder: integer('sort_order').notNull(),
})

export const maintenanceRules = sqliteTable(
  'maintenance_rules',
  {
    id: id(),
    itemCode: text('item_code').notNull().references(() => maintenanceItems.code),
    fuelType: text('fuel_type').$type<FuelType>().notNull(),
    vehicleModelId: text('vehicle_model_id').references(() => vehicleModels.id), // null = 연료 공통 규칙
    intervalKm: integer('interval_km'),
    intervalMonths: integer('interval_months'),
  },
  // SQLite 유니크 인덱스는 NULL 끼리 다르다고 보므로, 공통 규칙(NULL)도 하나만 두도록 빈 문자열로 바꿔서 묶는다
  // shortcut: drizzle-kit 0.31 이 식 인덱스의 따옴표를 잘못 써서 0000_init.sql 의 이 줄을 손으로 고침. 이 인덱스를 바꾸면 생성된 SQL 을 다시 확인할 것
  (t) => [uniqueIndex('maintenance_rules_item_fuel_model_uq').on(t.itemCode, t.fuelType, sql`coalesce(${t.vehicleModelId}, '')`)],
)

export const seasonalItems = sqliteTable('seasonal_items', {
  id: id(),
  season: text('season').$type<'SPRING' | 'SUMMER' | 'FALL' | 'WINTER'>().notNull(),
  label: text('label').notNull(),
  excludedFuelTypes: text('excluded_fuel_types', { mode: 'json' }).$type<FuelType[]>().notNull(),
  sortOrder: integer('sort_order').notNull(),
})

// ── 사용자 데이터 ──

export const vehicles = sqliteTable('vehicles', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vehicleModelId: text('vehicle_model_id').references(() => vehicleModels.id),
  customModelName: text('custom_model_name'), // 목록에 없는 차("기타")
  modelYear: integer('model_year').notNull(),
  fuelType: text('fuel_type').$type<FuelType>().notNull(),
  nickname: text('nickname'),
  dailyKm: integer('daily_km').notNull(),
  createdAt: createdAt(),
  updatedAt: createdAt('updated_at'),
})

export const odometerReadings = sqliteTable(
  'odometer_readings',
  {
    id: id(),
    vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    km: integer('km').notNull(),
    source: text('source').$type<'ONBOARDING' | 'MANUAL' | 'MAINTENANCE'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('odometer_readings_vehicle_date_idx').on(t.vehicleId, t.date)],
)

export const maintenanceRecords = sqliteTable(
  'maintenance_records',
  {
    id: id(),
    vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    itemCode: text('item_code').notNull().references(() => maintenanceItems.code),
    date: text('date').notNull(),
    km: integer('km').notNull(),
    cost: integer('cost'),
    memo: text('memo'),
    // 정비 완료 기록과 함께 만든 실측. 실측이 지워지면 연결만 푼다
    odometerReadingId: text('odometer_reading_id').references(() => odometerReadings.id, { onDelete: 'set null' }),
    source: text('source').$type<'ONBOARDING' | 'MANUAL'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('maintenance_records_vehicle_item_date_idx').on(t.vehicleId, t.itemCode, t.date)],
)

// 보정 제안에서 "그대로 두기"를 누른 시점의 최신 실측. 그 실측이 지워지면 다시 제안할 수 있게 같이 지운다
export const calibrationDismissals = sqliteTable('calibration_dismissals', {
  vehicleId: text('vehicle_id').primaryKey().references(() => vehicles.id, { onDelete: 'cascade' }),
  dismissedAtReadingId: text('dismissed_at_reading_id').notNull().references(() => odometerReadings.id, { onDelete: 'cascade' }),
})

export const seasonalChecks = sqliteTable(
  'seasonal_checks',
  {
    vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    seasonKey: text('season_key').notNull(), // 예: 2026-WINTER
    seasonalItemId: text('seasonal_item_id').notNull().references(() => seasonalItems.id),
    checkedAt: createdAt('checked_at'),
  },
  (t) => [primaryKey({ columns: [t.vehicleId, t.seasonKey, t.seasonalItemId] })],
)

// ── 알림 ──

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSuccessAt: text('last_success_at'),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

export const notificationPrefs = sqliteTable('notification_prefs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  dueSoon: bool('due_soon', true),
  overdue: bool('overdue', true),
  seasonal: bool('seasonal', true),
  allOff: bool('all_off', false),
})

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    vehicleId: text('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }),
    type: text('type').$type<'DUE_SOON' | 'OVERDUE' | 'SEASONAL' | 'TEST'>().notNull(),
    itemCode: text('item_code'),
    dedupeKey: text('dedupe_key').notNull().unique(), // 중복 발송 방지의 핵심 (설계 9.4)
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull(),
    createdAt: createdAt(),
    readAt: text('read_at'),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
)
