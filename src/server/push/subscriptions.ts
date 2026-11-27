// 푸시 구독(브라우저마다 하나) 저장 · 삭제. 같은 endpoint 로 다시 구독하면 키만 갱신한다
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/server/db/client'
import { pushSubscriptions } from '@/server/db/schema'

export type SubscriptionKeys = { endpoint: string; p256dh: string; auth: string }

const MAX_ENDPOINT = 1000 // 실제 endpoint 는 수백 자. 큰 값으로 DB 를 채우지 못하게 막는 상한
const MAX_KEY = 200

// 브라우저 PushSubscription.toJSON() 결과를 검사해 필요한 값만 꺼낸다. 형식이 틀리면 null
export function parseSubscription(body: unknown): SubscriptionKeys | null {
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = b?.endpoint
  const p256dh = b?.keys?.p256dh
  const auth = b?.keys?.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT) return null
  if (!p256dh || !auth || p256dh.length > MAX_KEY || auth.length > MAX_KEY) return null
  return { endpoint, p256dh, auth }
}

export async function upsertSubscription(db: Db, userId: string, sub: SubscriptionKeys, userAgent?: string): Promise<void> {
  const values = { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: userAgent ?? null }
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: values.userAgent } })
}

// 본인 구독만 지운다 (다른 사람 endpoint 를 알아도 못 지움)
export async function deleteSubscription(db: Db, userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
}
