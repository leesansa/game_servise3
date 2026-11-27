import type { Metadata } from 'next'
// 순서 중요: 토큰 → 리셋 → 기본값 → 화면별
import '@/styles/variables.css'
import '@/styles/reset.css'
import '@/styles/globals.css'
import '@/styles/login.css'

export const metadata: Metadata = {
  title: '마이카노트 — 내 차 맞춤 정비 알림',
  description: '내 차와 주행 습관에 맞춰 정비 시기를 계산하고 알려주는 서비스',
  // PWA: 아이폰은 홈 화면에 추가해야 푸시를 받을 수 있음
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
