/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js')

// Firebase config values are public identifiers (not secrets); they're
// passed in via the registration URL because this file is served statically
// and can't read import.meta.env like the rest of the app does.
const params = new URL(location).searchParams
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const tag = payload.data?.tag

  // Data-only "close" message (see stopWorking in functions/index.js) - no
  // `notification` payload of its own, just closes whatever's still shown
  // under this tag instead of showing anything new.
  if (payload.data?.action === 'close' && tag) {
    self.registration.getNotifications({ tag }).then((list) => list.forEach((n) => n.close()))
    return
  }

  const { title, body, icon } = payload.notification ?? {}
  // `tag` (chat notifications, and the active-shift reminder) replaces any
  // still-unread notification with the same tag instead of stacking a new
  // one per message.
  self.registration.showNotification(title ?? 'PortalEB', {
    body,
    icon: icon ?? '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag,
    data: payload.data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { orderId, kind } = event.notification.data ?? {}
  const url = kind ? `/chat/${kind}/${orderId}` : orderId ? `/orders/${orderId}` : '/'
  event.waitUntil(self.clients.openWindow(url))
})
