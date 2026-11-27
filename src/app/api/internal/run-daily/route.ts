// 일일 작업을 손으로 돌리는 보호된 경로. Cron 이 돌지 않는 프리뷰 · 로컬에서 같은 작업을 확인할 때 쓴다
// 호출: POST, 헤더 Authorization: Bearer <INTERNAL_JOB_TOKEN>
import { env } from 'cloudflare:workers'
import { runDaily } from '@/server/jobs/daily'
import { bearerToken, isValidJobToken } from '@/server/internal/token'

export async function POST(request: Request): Promise<Response> {
  if (!isValidJobToken(bearerToken(request.headers.get('authorization')), env.INTERNAL_JOB_TOKEN ?? '')) {
    return Response.json({ error: '권한이 없습니다' }, { status: 401 })
  }
  return Response.json(await runDaily(new Date()))
}
