// 푸시 구독 저장(POST) · 해제(DELETE). 로그인한 사용자 본인 것만
import { getDb } from '@/server/db/client'
import { requireUserId, UnauthorizedError } from '@/server/auth/session'
import { deleteSubscription, parseSubscription, upsertSubscription } from '@/server/push/subscriptions'

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function withUser(run: (userId: string) => Promise<Response>): Promise<Response> {
  try {
    return await run(await requireUserId())
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 })
    throw e
  }
}

export function POST(request: Request): Promise<Response> {
  return withUser(async (userId) => {
    const sub = parseSubscription(await readJson(request))
    if (!sub) return Response.json({ error: '구독 정보가 올바르지 않습니다' }, { status: 400 })
    await upsertSubscription(getDb(), userId, sub, request.headers.get('user-agent')?.slice(0, 300))
    return Response.json({ ok: true })
  })
}

export function DELETE(request: Request): Promise<Response> {
  return withUser(async (userId) => {
    const endpoint = (await readJson(request) as { endpoint?: unknown } | null)?.endpoint
    if (typeof endpoint !== 'string') return Response.json({ error: 'endpoint 가 필요합니다' }, { status: 400 })
    await deleteSubscription(getDb(), userId, endpoint)
    return Response.json({ ok: true })
  })
}
