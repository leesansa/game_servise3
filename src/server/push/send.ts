// Web Push 발송. 암호화 · VAPID 서명은 Web Crypto 기반 라이브러리가 하고(Workers 에서 동작), 여기서는 보내고 결과를 정리한다
import { buildPushPayload } from '@block65/webcrypto-web-push'
import { eq } from 'drizzle-orm'
import type { Db } from '@/server/db/client'
import { pushSubscriptions } from '@/server/db/schema'
import type { SubscriptionKeys } from './subscriptions'

export type PushPayload = { title: string; body: string; url: string }
export type Vapid = { subject: string; publicKey: string; privateKey: string }
type FetchFn = (input: string, init: RequestInit) => Promise<Response>

export type SendResult = { ok: true } | { ok: false; gone: boolean; status: number }

export async function sendPush(sub: SubscriptionKeys, payload: PushPayload, vapid: Vapid, fetchFn: FetchFn = fetch): Promise<SendResult> {
  const request = await buildPushPayload(
    { data: JSON.stringify(payload), options: { ttl: 24 * 60 * 60 } }, // 기기가 꺼져 있어도 하루 동안은 전달 시도
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    vapid,
  )
  const res = await fetchFn(sub.endpoint, request)
  if (res.ok) return { ok: true }
  // 404 · 410: 브라우저가 구독을 해지했거나 만료됨 → 이 구독은 다시 쓸 수 없음
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status }
}

// 한 사용자의 모든 기기로 보낸다. 실패한 기기가 있어도 나머지는 계속 보낸다
export async function sendToUser(db: Db, userId: string, payload: PushPayload, vapid: Vapid, fetchFn: FetchFn = fetch): Promise<{ sent: number; removed: number }> {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  let sent = 0
  let removed = 0
  for (const sub of subs) {
    try {
      const result = await sendPush(sub, payload, vapid, fetchFn)
      if (result.ok) {
        sent++
        await db.update(pushSubscriptions).set({ lastSuccessAt: new Date().toISOString() }).where(eq(pushSubscriptions.id, sub.id))
      } else if (result.gone) {
        removed++
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
      } else {
        console.warn(`[push] 발송 실패 status=${result.status}`)
      }
    } catch (e) {
      console.warn('[push] 발송 오류', e)
    }
  }
  return { sent, removed }
}
