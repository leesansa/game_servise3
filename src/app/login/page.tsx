// 로그인: 카카오 · 구글. 이미 로그인했으면 누구로 로그인했는지와 로그아웃 버튼을 보여 준다
import { PushSubscribeButton } from '@/components/common/PushSubscribeButton'
import { auth, signIn, signOut } from '@/server/auth/config'
import { getVapid } from '@/server/push/vapid'

export default async function LoginPage() {
  const session = await auth()

  return (
    <main className="login">
      <h1 className="login__title">마이카노트</h1>
      <p className="login__lead">내 차에 맞춘 정비 시기를 알려 드려요</p>

      {session?.user ? (
        <form
          className="login__box"
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <p>{session.user.name ?? session.user.email} 님으로 로그인했어요</p>
          {/* 0주차 확인용 임시 위치. 알림 설정 화면이 생기면 그리로 옮긴다 */}
          <PushSubscribeButton vapidPublicKey={getVapid().publicKey} />
          <button className="login__btn" type="submit">
            로그아웃
          </button>
        </form>
      ) : (
        <div className="login__box">
          <form
            action={async () => {
              'use server'
              await signIn('kakao', { redirectTo: '/' })
            }}
          >
            <button className="login__btn login__btn--kakao" type="submit">
              카카오로 시작하기
            </button>
          </form>
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <button className="login__btn login__btn--google" type="submit">
              구글로 시작하기
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
