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
  const { title, body, icon } = payload.notification ?? {}
  // `tag` (chat notifications only, see functions/index.js) replaces any
  // still-unread notification from the same chat instead of stacking a new
  // one per message.
  self.registration.showNotification(title ?? 'PortalEB', {
    body,
    icon: icon ?? '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: payload.data?.tag,
    data: payload.data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { orderId, kind } = event.notification.data ?? {}
  const url = kind ? `/chat/${kind}/${orderId}` : orderId ? `/orders/${orderId}` : '/'
  event.waitUntil(self.clients.openWindow(url))
})
