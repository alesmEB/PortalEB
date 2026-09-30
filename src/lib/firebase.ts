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

export type PushSupport = 'unsupported' | NotificationPermission

/** Where this device stands on notifications, without asking anything. */
export async function getPushSupport(): Promise<PushSupport> {
  if (!('Notification' in window) || !(await isSupported())) return 'unsupported'
  return Notification.permission
}

/**
 * The device's FCM registration token, or null if messaging isn't supported
 * (e.g. Safari without a home-screen install) or permission isn't granted.
 *
 * Only with `prompt` does it ask for permission, and that has to come from a
 * tap: Chrome - on Android especially - shows no dialog for a request made on
 * page load, only a quiet hint in the address bar, which an installed app
 * doesn't have. Asking at login is how a technician's phone ended up with the
 * app installed and never asked.
 */
export async function requestPushNotificationToken({
  prompt,
}: {
  prompt: boolean
}): Promise<string | null> {
  if (!(await isSupported())) return null

  const permission = prompt ? await Notification.requestPermission() : Notification.permission
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
