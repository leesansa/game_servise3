// 서비스 워커: 푸시 알림을 받아 보여 주고, 누르면 해당 화면을 연다
// 서버가 보내는 데이터: { title, body, url } (src/server/push/send.ts 의 PushPayload)

self.addEventListener('push', (event) => {
  let data = { title: '마이카노트', body: '', url: '/' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    // 형식이 다른 메시지는 기본 문구로 보여 준다
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon.svg',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // 같은 사이트 안의 주소만 연다
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  if (url.origin !== self.location.origin) return
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const tab = tabs.find((c) => new URL(c.url).origin === url.origin)
      if (tab) {
        await tab.focus()
        return tab.navigate(url.href)
      }
      return self.clients.openWindow(url.href)
    })(),
  )
})
