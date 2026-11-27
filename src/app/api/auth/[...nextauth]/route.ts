// Auth.js 가 처리하는 주소 (/api/auth/signin, /callback/kakao 등)
import { handlers } from '@/server/auth/config'

export const { GET, POST } = handlers
