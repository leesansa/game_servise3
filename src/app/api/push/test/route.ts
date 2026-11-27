// 로그인한 사용자의 모든 기기로 테스트 알림 1건 발송 (알림 설정 화면 · 0주차 확인용)
import { getDb } from '@/server/db/client'
import { requireUserId, UnauthorizedError } from '@/server/auth/session'
import { sendToUser } from '@/server/push/send'
import { getVapid } from '@/server/push/vapid'

export async function POST(): Promise<Response> {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 })
    throw e
  }
  const result = await sendToUser(getDb(), userId, { title: '테스트 알림', body: '알림이 잘 도착했어요', url: '/dashboard' }, getVapid())
  return Response.json(result)
}
