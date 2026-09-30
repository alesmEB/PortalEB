import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  firestore,
  functions,
  getPushSupport,
  requestPushNotificationToken,
  type PushSupport,
} from './firebase'

const DEVICE_ID_KEY = 'portaleb-device-id'

/**
 * A random id generated once and persisted in localStorage - stable across
 * FCM token rotations for the same browser (e.g. the same origin getting
 * re-registered after being installed as a PWA), unlike the token itself.
 * localStorage is shared between a regular browser tab and an installed PWA
 * for the same origin, so this reliably identifies "the same device" across
 * both - see deviceTokens' rule comment in firestore.rules.
 */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

async function saveDeviceToken(userId: string, token: string) {
  await setDoc(
    doc(firestore, 'deviceTokens', getOrCreateDeviceId()),
    { userId, token, userAgent: navigator.userAgent, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/**
 * At login: saves the device's FCM token under the user if notifications are
 * already allowed, and asks nothing - asking is NotificationsBanner's job,
 * from a tap (see requestPushNotificationToken).
 */
export async function registerDeviceToken(userId: string) {
  try {
    const token = await requestPushNotificationToken({ prompt: false })
    if (token) await saveDeviceToken(userId, token)
  } catch {
    // Best-effort: a device without notifications shouldn't block the login.
  }
}

/**
 * From the "Activar notificaciones" tap: asks for permission, saves the token
 * and says where the device ended up. Throws if saving fails, so the banner
 * can show it instead of claiming success.
 */
export async function enablePushNotifications(userId: string): Promise<PushSupport> {
  const token = await requestPushNotificationToken({ prompt: true })
  if (token) await saveDeviceToken(userId, token)
  return getPushSupport()
}

interface SendPushNotificationInput {
  userIds: string[]
  title: string
  body: string
  orderId?: string
}

interface SendPushNotificationResult {
  sent: number
  failed: number
}

const callSendPushNotification = httpsCallable<
  SendPushNotificationInput,
  SendPushNotificationResult
>(functions, 'sendPushNotification')

export async function sendPushNotification(input: SendPushNotificationInput) {
  const res = await callSendPushNotification(input)
  return res.data
}
