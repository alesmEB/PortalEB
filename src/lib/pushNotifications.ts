import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firestore, functions, requestPushNotificationToken } from './firebase'

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

/** Requests permission (if needed) and saves the device's FCM token under the given user. */
export async function registerDeviceToken(userId: string) {
  try {
    const token = await requestPushNotificationToken()
    if (!token) return
    const deviceId = getOrCreateDeviceId()
    await setDoc(
      doc(firestore, 'deviceTokens', deviceId),
      { userId, token, userAgent: navigator.userAgent, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    // Best-effort: a user denying/lacking notification support shouldn't
    // block anything else in the app.
  }
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
