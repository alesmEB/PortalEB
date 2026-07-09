import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)

export const auth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const functions = getFunctions(firebaseApp)

let messagingInstance: Messaging | null = null

/**
 * The FCM service worker is a separate, statically-served file (not built by
 * Vite) so it can run before the app's own PWA service worker takes over the
 * page. Firebase config values are public identifiers, so passing them as a
 * query string to the worker is safe.
 */
async function registerMessagingServiceWorker() {
  const params = new URLSearchParams(firebaseConfig as Record<string, string>)
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
    scope: '/firebase-cloud-messaging-push-scope',
  })
}

/**
 * Requests notification permission and returns an FCM registration token for
 * the current device, or null if messaging isn't supported (e.g. Safari
 * without a home-screen install) or permission was denied.
 */
export async function requestPushNotificationToken(): Promise<string | null> {
  if (!(await isSupported())) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  if (!messagingInstance) messagingInstance = getMessaging(firebaseApp)

  const serviceWorkerRegistration = await registerMessagingServiceWorker()
  return getToken(messagingInstance, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration,
  })
}

export async function onForegroundPushNotification(
  callback: Parameters<typeof onMessage>[1],
) {
  if (!(await isSupported())) return
  if (!messagingInstance) messagingInstance = getMessaging(firebaseApp)
  onMessage(messagingInstance, callback)
}
