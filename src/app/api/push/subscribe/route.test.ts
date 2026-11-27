import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/server/db/test-db'

// 로그인 상태와 DB 를 테스트용으로 바꾼다
let t: ReturnType<typeof createTestDb>
let userId: string | null = null
class UnauthorizedError extends Error {}
vi.mock('@/server/db/client', () => ({ getDb: () => t.db }))
vi.mock('@/server/auth/session', () => ({
  UnauthorizedError,
  requireUserId: async () => {
    if (!userId) throw new UnauthorizedError()
    return userId
  },
}))

const { POST, DELETE } = await import('./route')
const sub = { endpoint: 'https://push.example/a', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } }
const req = (method: string, body: unknown) =>
  new Request('http://localhost/api/push/subscribe', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'user-agent': 'UA' } })
const count = () => (t.raw.prepare('select count(*) n from push_subscriptions').get() as { n: number }).n

beforeEach(() => {
  t = createTestDb()
  t.raw.exec(`insert into users (id) values ('u1')`)
  userId = null
})

describe('/api/push/subscribe', () => {
  it('로그인하지 않았으면 401 이고 아무것도 저장하지 않는다', async () => {
    expect((await POST(req('POST', sub))).status).toBe(401)
    expect(count()).toBe(0)
  })

  it('형식이 틀린 구독은 400', async () => {
    userId = 'u1'
    expect((await POST(req('POST', { endpoint: 'http://insecure' }))).status).toBe(400)
    expect(count()).toBe(0)
  })

  it('로그인했으면 구독을 저장하고, DELETE 로 지운다', async () => {
    userId = 'u1'
    expect((await POST(req('POST', sub))).status).toBe(200)
    expect(count()).toBe(1)
    expect((await DELETE(req('DELETE', { endpoint: sub.endpoint }))).status).toBe(200)
    expect(count()).toBe(0)
  })
})
