import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firestore, functions, requestPushNotificationToken } from './firebase'

/** Requests permission (if needed) and saves the device's FCM token under the given user. */
export async function registerDeviceToken(userId: string) {
  try {
    const token = await requestPushNotificationToken()
    if (!token) return
    await setDoc(doc(firestore, 'deviceTokens', token), { userId, createdAt: serverTimestamp() })
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
