import { beforeEach, describe, expect, it, vi } from 'vitest'

// Workers 바인딩과 실제 작업을 가짜로 바꾼다
vi.mock('cloudflare:workers', () => ({ env: { INTERNAL_JOB_TOKEN: 's3cret' } }))
const runDaily = vi.fn(async () => ({ startedAt: '2026-11-27T00:00:00.000Z', processed: 0 }))
vi.mock('@/server/jobs/daily', () => ({ runDaily: () => runDaily() }))

const { POST } = await import('./route')
const call = (auth?: string) =>
  POST(new Request('http://localhost/api/internal/run-daily', { method: 'POST', headers: auth ? { authorization: auth } : {} }))

beforeEach(() => runDaily.mockClear())

describe('POST /api/internal/run-daily', () => {
  it('토큰이 없으면 401 이고 작업을 실행하지 않는다', async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(runDaily).not.toHaveBeenCalled()
  })

  it('토큰이 틀리면 401 이고 작업을 실행하지 않는다', async () => {
    const res = await call('Bearer wrong!')
    expect(res.status).toBe(401)
    expect(runDaily).not.toHaveBeenCalled()
  })

  it('토큰이 맞으면 작업을 한 번 실행하고 결과를 돌려준다', async () => {
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(runDaily).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ startedAt: '2026-11-27T00:00:00.000Z', processed: 0 })
  })
})
