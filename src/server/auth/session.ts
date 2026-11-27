// 서버 코드에서 현재 로그인한 사용자 id 를 얻는 도구. 다른 사람 데이터 접근을 막는 소유권 검사의 출발점
import { auth } from './config'

export class UnauthorizedError extends Error {
  constructor() {
    super('로그인이 필요합니다')
    this.name = 'UnauthorizedError'
  }
}

export async function getUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export async function requireUserId(): Promise<string> {
  const id = await getUserId()
  if (!id) throw new UnauthorizedError()
  return id
}
