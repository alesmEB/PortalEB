const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { getDataConnect } = require('firebase-admin/data-connect')
const admin = require('firebase-admin')

admin.initializeApp()

// Matches dataconnect/dataconnect.yaml - the Admin SDK talks to this
// service directly, bypassing every @auth(level: ...) directive (same
// trust model as the Firestore Admin SDK bypassing security rules).
const DATA_CONNECT_CONFIG = { location: 'europe-southwest1', serviceId: 'portaleb-service' }

const GET_USER_FOR_CLAIMS_QUERY = `
  query GetUserForClaims($id: String!) {
    user(id: $id) {
      role
      userPermissions: userPermissions_on_user {
        permission { key }
      }
    }
  }
`

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

async function sendToUsers(userIds, { notification, data }) {
  const firestore = admin.firestore()
  const tokenDocs = []
  for (const idsChunk of chunk(userIds, 10)) {
    const snapshot = await firestore.collection('deviceTokens').where('userId', 'in', idsChunk).get()
    tokenDocs.push(...snapshot.docs)
  }
  if (tokenDocs.length === 0) return { sent: 0, failed: 0 }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: tokenDocs.map((doc) => doc.id),
    notification,
    data,
  })

  await Promise.all(
    response.responses.map((result, i) =>
      !result.success && STALE_TOKEN_ERRORS.has(result.error?.code)
        ? tokenDocs[i].ref.delete()
        : null,
    ),
  )

  return { sent: response.successCount, failed: response.failureCount }
}

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

  return sendToUsers(userIds, {
    notification: { title: title.trim(), body: body.trim() },
    data: orderId ? { orderId } : {},
  })
})

// Fires for every new chat message (see src/lib/chat.ts sendChatMessage) and
// pushes to everyone who can read that chat - its participants plus every
// admin (adminUsers mirror, same "who can access this chat" logic as
// firestore.rules' canAccessChat) - except whoever sent it. `tag` lets the
// service worker replace a still-unread notification from the same chat
// instead of stacking one per message (see firebase-messaging-sw.js).
async function notifyNewChatMessage(event, kind) {
  const message = event.data?.data()
  if (!message) return

  const { orderId } = event.params
  const firestore = admin.firestore()
  const collectionName = kind === 'client' ? 'clientChats' : 'technicianChats'

  const [chatSnap, adminDocs] = await Promise.all([
    firestore.collection(collectionName).doc(orderId).get(),
    firestore.collection('adminUsers').listDocuments(),
  ])

  const participants = chatSnap.data()?.participants ?? []
  const recipientIds = [...new Set([...participants, ...adminDocs.map((ref) => ref.id)])].filter(
    (uid) => uid !== message.senderId,
  )
  console.log(`[chat-notify] ${kind}/${orderId}: recipients=${recipientIds.length}`)
  if (recipientIds.length === 0) return

  const result = await sendToUsers(recipientIds, {
    notification: {
      title: message.senderName || 'Nuevo mensaje',
      body: message.text,
    },
    data: { orderId, kind, tag: `chat-${kind}-${orderId}` },
  })
  console.log(`[chat-notify] ${kind}/${orderId}: sent=${result.sent} failed=${result.failed}`)
}

exports.onClientChatMessageCreated = onDocumentCreated(
  'clientChats/{orderId}/messages/{messageId}',
  (event) => notifyNewChatMessage(event, 'client'),
)

exports.onTechnicianChatMessageCreated = onDocumentCreated(
  'technicianChats/{orderId}/messages/{messageId}',
  (event) => notifyNewChatMessage(event, 'technicians'),
)

// Recomputes `uid`'s custom claims (role + permissions) straight from Data
// Connect - the single source of truth - and overwrites whatever the token
// currently has. Safe to let any signed-in user trigger for any uid: the
// claims are never taken from the caller's input, only re-derived from the
// DB, so calling this can never grant more than what's already true there.
// Called from AuthContext on every login (self-healing, catches anyone
// whose token predates a role/permission change) and from UsersAdmin right
// after an admin edits someone's role/permissions (so it takes effect
// immediately instead of waiting for their token's natural refresh).
exports.syncUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const uid = typeof request.data?.uid === 'string' && request.data.uid ? request.data.uid : request.auth.uid

  const dataConnect = getDataConnect(DATA_CONNECT_CONFIG)
  const { data } = await dataConnect.executeGraphqlRead(GET_USER_FOR_CLAIMS_QUERY, {
    variables: { id: uid },
  })

  if (!data.user) {
    throw new HttpsError('not-found', 'Usuario no encontrado.')
  }

  const role = data.user.role
  const permissions = data.user.userPermissions.map((up) => up.permission.key)
  await admin.auth().setCustomUserClaims(uid, { role, permissions })

  return { role, permissions }
})
