import { beforeEach, describe, expect, it, vi } from 'vitest'

// Auth.js 설정(D1 · OAuth)을 불러오지 않도록 auth() 만 가짜로 바꾼다
const auth = vi.fn()
vi.mock('./config', () => ({ auth: () => auth() }))

const { getUserId, requireUserId, UnauthorizedError } = await import('./session')

beforeEach(() => auth.mockReset())

describe('세션 헬퍼', () => {
  it('로그인하지 않았으면 getUserId 는 null', async () => {
    auth.mockResolvedValue(null)
    expect(await getUserId()).toBeNull()
  })

  it('세션에 사용자 id 가 없어도 null', async () => {
    auth.mockResolvedValue({ user: {}, expires: '2099-01-01T00:00:00.000Z' })
    expect(await getUserId()).toBeNull()
  })

  it('로그인했으면 getUserId 는 사용자 id', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' }, expires: '2099-01-01T00:00:00.000Z' })
    expect(await getUserId()).toBe('u1')
  })

  it('로그인하지 않았으면 requireUserId 는 UnauthorizedError', async () => {
    auth.mockResolvedValue(null)
    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('로그인했으면 requireUserId 는 사용자 id', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' }, expires: '2099-01-01T00:00:00.000Z' })
    expect(await requireUserId()).toBe('u1')
  })
})
