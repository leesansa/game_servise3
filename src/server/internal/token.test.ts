import { describe, expect, it } from 'vitest'
import { bearerToken, isValidJobToken } from './token'

describe('isValidJobToken', () => {
  it('토큰이 없거나 비어 있으면 거절', () => {
    expect(isValidJobToken(null, 's3cret')).toBe(false)
    expect(isValidJobToken('', 's3cret')).toBe(false)
  })

  it('길이가 다르거나 값이 다르면 거절', () => {
    expect(isValidJobToken('s3cre', 's3cret')).toBe(false)
    expect(isValidJobToken('s3crex', 's3cret')).toBe(false)
  })

  it('비밀값이 설정되지 않았으면 무엇이 와도 거절', () => {
    expect(isValidJobToken('', '')).toBe(false)
    expect(isValidJobToken('anything', '')).toBe(false)
  })

  it('같으면 통과', () => {
    expect(isValidJobToken('s3cret', 's3cret')).toBe(true)
  })
})

describe('bearerToken', () => {
  it('Authorization: Bearer <토큰> 에서 토큰만 꺼낸다', () => {
    expect(bearerToken('Bearer s3cret')).toBe('s3cret')
  })

  it('형식이 다르면 null', () => {
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('s3cret')).toBeNull()
    expect(bearerToken('Basic s3cret')).toBeNull()
  })
})
