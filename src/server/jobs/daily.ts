// 매일 한 번 도는 작업 (Cron: UTC 00:00 = 한국 09:00). Cron 과 보호된 HTTP 경로가 둘 다 이 함수를 부른다.
// 지금은 연결 확인용으로 시작 로그만 남긴다. 정비 알림 계산 · 발송은 알림 계획(계획 4)에서 채운다
export async function runDaily(now: Date): Promise<{ startedAt: string; processed: number }> {
  const startedAt = now.toISOString()
  console.log(`[runDaily] 시작 ${startedAt}`)
  return { startedAt, processed: 0 }
}
