// Auth.js 설정: 카카오 · 구글 로그인, 세션은 D1 에 저장 (database 전략)
// 바인딩(env.DB, 비밀값)은 요청 때만 확실히 쓸 수 있어서 설정을 함수로 넘겨 요청마다 만든다
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { env } from 'cloudflare:workers'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Kakao from 'next-auth/providers/kakao'
import { getDb } from '@/server/db/client'
import { accounts, sessions, users, verificationTokens } from '@/server/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Kakao({ clientId: env.AUTH_KAKAO_ID, clientSecret: env.AUTH_KAKAO_SECRET }),
    Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
  ],
  secret: env.AUTH_SECRET,
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  // Workers 는 요청 주소의 호스트를 그대로 믿어도 됨 (Cloudflare 가 앞단에서 받음)
  trustHost: true,
  callbacks: {
    // database 전략에서는 세션에 사용자 id 가 기본으로 안 들어가서 직접 넣는다
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
}))
