import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/server/db/test-db'
import { sendToUser, type Vapid } from './send'
import { deleteSubscription, parseSubscription, upsertSubscription } from './subscriptions'

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url')

// 테스트용 VAPID 키와 브라우저(구독) 키를 실제로 만들어서, 암호화까지 진짜로 돈다
async function makeVapid(): Promise<Vapid> {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey)
  return { subject: 'https://example.com', publicKey: b64url(await crypto.subtle.exportKey('raw', k.publicKey)), privateKey: jwk.d! }
}
async function makeClientKeys() {
  const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { p256dh: b64url(await crypto.subtle.exportKey('raw', k.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) }
}

let t: ReturnType<typeof createTestDb>
const count = () => (t.raw.prepare('select count(*) n from push_subscriptions').get() as { n: number }).n
beforeEach(() => {
  t = createTestDb()
  t.raw.exec(`insert into users (id) values ('u1'), ('u2')`)
})

describe('parseSubscription', () => {
  it('브라우저 구독 JSON 에서 필요한 값만 꺼낸다', () => {
    expect(parseSubscription({ endpoint: 'https://push.example/a', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } }))
      .toEqual({ endpoint: 'https://push.example/a', p256dh: 'P', auth: 'A' })
  })

  it('https 가 아니거나 값이 빠지면 null', () => {
    expect(parseSubscription({ endpoint: 'http://push.example/a', keys: { p256dh: 'P', auth: 'A' } })).toBeNull()
    expect(parseSubscription({ endpoint: 'https://push.example/a', keys: { p256dh: 'P' } })).toBeNull()
    expect(parseSubscription(null)).toBeNull()
    expect(parseSubscription({ endpoint: 'https://push.example/' + 'x'.repeat(2000), keys: { p256dh: 'P', auth: 'A' } })).toBeNull()
  })
})

describe('구독 저장', () => {
  it('같은 endpoint 로 다시 구독하면 한 행만 남고 키가 갱신된다', async () => {
    await upsertSubscription(t.db, 'u1', { endpoint: 'https://push.example/a', p256dh: 'old', auth: 'old' })
    await upsertSubscription(t.db, 'u1', { endpoint: 'https://push.example/a', p256dh: 'new', auth: 'new' }, 'UA')
    expect(t.raw.prepare('select p256dh, auth, user_agent from push_subscriptions').all()).toEqual([{ p256dh: 'new', auth: 'new', user_agent: 'UA' }])
  })

  it('구독 해제는 본인 구독만 지운다', async () => {
    await upsertSubscription(t.db, 'u1', { endpoint: 'https://push.example/a', p256dh: 'P', auth: 'A' })
    await deleteSubscription(t.db, 'u2', 'https://push.example/a')
    expect(count()).toBe(1)
    await deleteSubscription(t.db, 'u1', 'https://push.example/a')
    expect(count()).toBe(0)
  })
})

describe('sendToUser', () => {
  const payload = { title: '테스트 알림', body: '알림이 잘 도착했어요', url: '/dashboard' }

  async function subscribe(endpoint: string) {
    await upsertSubscription(t.db, 'u1', { endpoint, ...(await makeClientKeys()) })
  }
  const fakeFetch = (statusByEndpoint: Record<string, number>) =>
    vi.fn(async (url: string | URL | Request) => new Response(null, { status: statusByEndpoint[String(url)] ?? 201 }))

  it('410 이면 그 구독을 지우고 다음 구독은 계속 보낸다', async () => {
    await subscribe('https://push.example/gone')
    await subscribe('https://push.example/ok')
    const fetchFn = fakeFetch({ 'https://push.example/gone': 410 })
    expect(await sendToUser(t.db, 'u1', payload, await makeVapid(), fetchFn)).toEqual({ sent: 1, removed: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(t.raw.prepare('select endpoint from push_subscriptions').all()).toEqual([{ endpoint: 'https://push.example/ok' }])
  })

  it('404 도 지운다', async () => {
    await subscribe('https://push.example/nf')
    expect(await sendToUser(t.db, 'u1', payload, await makeVapid(), fakeFetch({ 'https://push.example/nf': 404 }))).toEqual({ sent: 0, removed: 1 })
    expect(count()).toBe(0)
  })

  it('500 이면 구독을 남기고 오류를 던지지 않는다', async () => {
    await subscribe('https://push.example/err')
    expect(await sendToUser(t.db, 'u1', payload, await makeVapid(), fakeFetch({ 'https://push.example/err': 500 }))).toEqual({ sent: 0, removed: 0 })
    expect(count()).toBe(1)
  })

  it('성공하면 last_success_at 을 기록하고, 다른 사용자 구독에는 보내지 않는다', async () => {
    await subscribe('https://push.example/ok')
    await upsertSubscription(t.db, 'u2', { endpoint: 'https://push.example/other', ...(await makeClientKeys()) })
    const fetchFn = fakeFetch({})
    expect(await sendToUser(t.db, 'u1', payload, await makeVapid(), fetchFn)).toEqual({ sent: 1, removed: 0 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const row = t.raw.prepare(`select last_success_at from push_subscriptions where endpoint = 'https://push.example/ok'`).get() as { last_success_at: string | null }
    expect(row.last_success_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
