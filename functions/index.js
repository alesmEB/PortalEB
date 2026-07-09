const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

admin.initializeApp()

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

// Callable from the client (see src/lib/pushNotifications.ts): used both for
// the automatic "you've been assigned" notification and the admin:lab-gated
// manual broadcast screen. Permission to use the manual screen is enforced
// client-side only, same trust model as the rest of the app (see
// dataconnect/connector/mutations.gql header) - this just requires the
// caller to be signed in.
exports.sendPushNotification = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { userIds, title, body, orderId } = request.data ?? {}
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpsError('invalid-argument', 'userIds es obligatorio.')
  }
  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
    throw new HttpsError('invalid-argument', 'title y body son obligatorios.')
  }

  const firestore = admin.firestore()
  const tokenDocs = []
  for (const idsChunk of chunk(userIds, 10)) {
    const snapshot = await firestore
      .collection('deviceTokens')
      .where('userId', 'in', idsChunk)
      .get()
    tokenDocs.push(...snapshot.docs)
  }

  if (tokenDocs.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: tokenDocs.map((doc) => doc.id),
    notification: { title: title.trim(), body: body.trim() },
    data: orderId ? { orderId } : {},
  })

  // Drop tokens FCM reports as permanently dead (app uninstalled, permission
  // revoked, etc.) so future sends stop retrying them.
  await Promise.all(
    response.responses.map((result, i) =>
      !result.success && STALE_TOKEN_ERRORS.has(result.error?.code)
        ? tokenDocs[i].ref.delete()
        : null,
    ),
  )

  return { sent: response.successCount, failed: response.failureCount }
})
