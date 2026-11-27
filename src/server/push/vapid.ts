// VAPID 키 (푸시 서버에 "이 앱이 보낸 알림"임을 증명). 공개키는 브라우저 구독에도 쓰여서 화면으로도 넘긴다
import { env } from 'cloudflare:workers'
import type { Vapid } from './send'

// 푸시 서비스가 문제 있을 때 연락할 곳. mailto: 또는 https 주소여야 해서 배포 사이트 주소를 쓴다
const SUBJECT = 'https://mycar-note.fridgeo.workers.dev'

export function getVapid(): Vapid {
  return { subject: SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
}
