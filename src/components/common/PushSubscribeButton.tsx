'use client'
// 알림 받기(구독) + 테스트 알림 보내기. 시각 디자인은 Figma 가 나오면 입힌다 (지금은 기능 우선 기본 화면)
import { useEffect, useState } from 'react'

// VAPID 공개키(base64url) → 브라우저 subscribe() 가 받는 바이트
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type State = 'checking' | 'unsupported' | 'idle' | 'subscribed' | 'denied' | 'working'

// 처음 화면: 이 브라우저가 푸시를 지원하는지, 이미 구독했는지
async function initialState(): Promise<State> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ? 'subscribed' : 'idle'
}

export function PushSubscribeButton({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    initialState().then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [])

  async function subscribe() {
    setState('working')
    setMessage('')
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setState('denied')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidPublicKey) })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) })
      if (!res.ok) throw new Error(`구독 저장 실패 (${res.status})`)
      setState('subscribed')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '알림 설정에 실패했어요')
      setState('idle')
    }
  }

  async function sendTest() {
    setMessage('보내는 중…')
    const res = await fetch('/api/push/test', { method: 'POST' })
    const body = (await res.json().catch(() => null)) as { sent?: number; removed?: number } | null
    setMessage(res.ok && body?.sent ? `테스트 알림을 보냈어요 (${body.sent}대)` : '보낼 수 있는 기기가 없어요. 알림 받기를 다시 눌러 주세요')
    if (res.ok && !body?.sent) setState('idle')
  }

  if (state === 'checking') return null
  return (
    <div className="push">
      {state === 'unsupported' && <p>이 브라우저는 알림을 지원하지 않아요. 아이폰은 홈 화면에 추가한 뒤 열면 알림을 받을 수 있어요.</p>}
      {state === 'denied' && <p>알림이 차단돼 있어요. 브라우저 사이트 설정에서 알림을 허용해 주세요.</p>}
      {(state === 'idle' || state === 'working') && (
        <button className="push__btn" type="button" onClick={subscribe} disabled={state === 'working'}>
          알림 받기
        </button>
      )}
      {state === 'subscribed' && (
        <button className="push__btn" type="button" onClick={sendTest}>
          테스트 알림 보내기
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
