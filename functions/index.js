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

// Ad-hoc mutations for createWorkOrder below - written directly against the
// schema's auto-generated CRUD surface (not the named operations in
// dataconnect/connector/mutations.gql, which hardcode `_expr: "auth.uid"`
// for the actor fields; the Admin SDK has no signed-in user context to
// resolve that expression against, so the caller's uid is passed explicitly
// as a plain variable instead).
const CREATE_CUSTOMER_MUTATION = `
  mutation CreateCustomerAdmin($name: String!, $contactName: String!, $phone: String!) {
    customer_insert(data: { name: $name, contactName: $contactName, phone: $phone })
  }
`
const CREATE_BOAT_MUTATION = `
  mutation CreateBoatAdmin($ownerId: UUID!, $name: String!, $registrationNumber: String) {
    boat_insert(data: { ownerId: $ownerId, name: $name, registrationNumber: $registrationNumber })
  }
`
const CREATE_ENGINE_MUTATION = `
  mutation CreateEngineAdmin(
    $boatId: UUID!
    $engineType: String!
    $chassisNumber: String!
    $propellerSerialNumber: String!
  ) {
    engine_insert(
      data: {
        boatId: $boatId
        engineType: $engineType
        chassisNumber: $chassisNumber
        propellerSerialNumber: $propellerSerialNumber
      }
    )
  }
`
const CREATE_WORK_ORDER_MUTATION = `
  mutation CreateWorkOrderAdmin(
    $code: String!
    $locationCode: OrderLocation!
    $sequenceNumber: Int!
    $customerId: UUID!
    $boatId: UUID!
    $createdById: String!
    $assetLocation: String!
    $description: String
  ) {
    workOrder_insert(
      data: {
        code: $code
        locationCode: $locationCode
        sequenceNumber: $sequenceNumber
        customerId: $customerId
        boatId: $boatId
        createdById: $createdById
        assetLocation: $assetLocation
        description: $description
      }
    )
  }
`
const CREATE_WORK_ORDER_TASK_MUTATION = `
  mutation CreateWorkOrderTaskAdmin($workOrderId: UUID!, $description: String!) {
    workOrderTask_insert(data: { workOrderId: $workOrderId, description: $description })
  }
`
const LOG_ORDER_EVENT_MUTATION = `
  mutation LogOrderEventAdmin($workOrderId: UUID!, $actorId: String!, $eventType: OrderEventType!) {
    orderTracking_insert(
      data: { workOrderId: $workOrderId, actorId: $actorId, eventType: $eventType }
    )
  }
`
const UPSERT_ORDER_SEQUENCE_MUTATION = `
  mutation UpsertOrderSequenceAdmin($locationCode: OrderLocation!, $lastNumber: Int!) {
    orderSequence_upsert(data: { locationCode: $locationCode, lastNumber: $lastNumber })
  }
`
const UPDATE_WORK_ORDER_STATUS_MUTATION = `
  mutation UpdateWorkOrderStatusAdmin($id: UUID!, $status: WorkOrderStatus!) {
    workOrder_update(id: $id, data: { status: $status })
  }
`
// Bootstraps from the actual max sequenceNumber among existing work orders,
// not the separate order_sequences bookkeeping table - that table turned
// out to be stale/inconsistent with real data (probably from the original
// client-side read-then-write races this whole function exists to fix), so
// it can't be trusted as a source of truth for where numbering left off.
const GET_MAX_WORK_ORDER_SEQUENCE_QUERY = `
  query GetMaxWorkOrderSequenceAdmin($locationCode: OrderLocation!) {
    workOrders(
      where: { locationCode: { eq: $locationCode } }
      orderBy: { sequenceNumber: DESC }
      limit: 1
    ) {
      sequenceNumber
    }
  }
`

const ORDER_CODE_PREFIX = { ALGECIRAS: 'A', LA_LINEA: 'V', SOTOGRANDE: 'S' }

function formatOrderCode(locationCode, sequenceNumber) {
  return `${ORDER_CODE_PREFIX[locationCode]}-${String(sequenceNumber).padStart(6, '0')}`
}

// The actual fix for the race this whole function exists to close: reserving
// a sequence number is a Firestore transaction (real optimistic-concurrency
// retries), not a Data Connect read-then-write like the old client-side
// flow. Data Connect's OrderSequence table is still updated afterwards
// (best-effort) purely so it stays readable for any future reporting -
// this Firestore doc is what actually guarantees uniqueness.
async function reserveOrderSequenceNumber(locationCode) {
  const ref = admin.firestore().collection('orderSequenceCounters').doc(locationCode)
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    let current = snap.data()?.lastNumber
    if (current == null) {
      // First reservation for this location - bootstrap from the actual
      // max sequenceNumber in use so we don't reissue a code already used
      // by an order created before this counter existed.
      const dataConnect = getDataConnect(DATA_CONNECT_CONFIG)
      const res = await dataConnect.executeGraphqlRead(GET_MAX_WORK_ORDER_SEQUENCE_QUERY, {
        variables: { locationCode },
      })
      current = res.data.workOrders[0]?.sequenceNumber ?? 0
    }
    const next = current + 1
    tx.set(ref, { lastNumber: next }, { merge: true })
    return next
  })
}

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

// Lets an admin set a user's password directly, bypassing the reset-email
// flow. Gated by its own "users:changepassword" permission tag (deliberately
// separate from admin:manage) so it can be granted/restricted independently -
// this is a real account-takeover shortcut (no proof the requester still
// controls the target's email, no notification to the affected user), so
// keep the grant list for this permission as small as possible. Enforced
// server-side via the caller's custom claims (see syncUserClaims) - this is
// exactly the kind of check that couldn't be done safely before that existed.
exports.changeUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const permissions = request.auth.token?.permissions
  if (!Array.isArray(permissions) || !permissions.includes('users:changepassword')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para cambiar contraseñas.')
  }

  const { uid, newPassword } = request.data ?? {}
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'uid es obligatorio.')
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.')
  }

  await admin.auth().updateUser(uid, { password: newPassword })
  // Force any device already logged in as this user to re-authenticate,
  // since a password change alone doesn't end existing sessions.
  await admin.auth().revokeRefreshTokens(uid)

  console.log(`[change-password] ${request.auth.uid} changed the password for ${uid}`)
  return { success: true }
})

// Replaces the client-side "read lastNumber, then write lastNumber+1" flow
// (a real race: two orders created at once in the same location could get
// the same code) and consolidates order creation - previously duplicated
// between NewOrderPage and the dashboard's lab quick-create shortcut - into
// one place. Requires orders:create or admin:lab (checked via custom claims,
// same as the client-side HasPermission gate on the "Nueva orden" button);
// skipQuote (used by the lab shortcut to jump straight to
// AWAITING_ASSIGNMENT) additionally requires admin:lab specifically.
//
// Note this isn't one atomic DB transaction end to end - only the sequence
// number reservation is. An interrupted invocation could still leave an
// orphan customer/boat row with no order, same risk the old client-side
// flow had, just a much smaller window (a Cloud Function completes in
// milliseconds; a browser tab can sit mid-flow indefinitely).
exports.createWorkOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const callerPermissions = request.auth.token?.permissions
  const permissions = Array.isArray(callerPermissions) ? callerPermissions : []
  if (!permissions.includes('orders:create') && !permissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para crear órdenes.')
  }

  const {
    locationCode,
    customerId: existingCustomerId,
    newCustomer,
    customerLinkedUserId,
    boatId: existingBoatId,
    newBoat,
    newEngines,
    assetLocation,
    description,
    tasks,
    skipQuote,
  } = request.data ?? {}

  if (
    typeof locationCode !== 'string' ||
    typeof assetLocation !== 'string' ||
    !assetLocation.trim() ||
    !Array.isArray(tasks) ||
    tasks.length === 0
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (skipQuote && !permissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'skipQuote requiere admin:lab.')
  }

  const dataConnect = getDataConnect(DATA_CONNECT_CONFIG)
  const callerUid = request.auth.uid

  let customerId = existingCustomerId
  if (!customerId) {
    if (!newCustomer?.name || !newCustomer?.contactName || !newCustomer?.phone) {
      throw new HttpsError('invalid-argument', 'Faltan datos del cliente nuevo.')
    }
    const res = await dataConnect.executeGraphql(CREATE_CUSTOMER_MUTATION, {
      variables: newCustomer,
    })
    customerId = res.data.customer_insert.id
  }

  let boatId = existingBoatId
  if (!boatId) {
    if (!newBoat?.name) {
      throw new HttpsError('invalid-argument', 'Faltan datos de la embarcación/máquina nueva.')
    }
    const res = await dataConnect.executeGraphql(CREATE_BOAT_MUTATION, {
      variables: {
        ownerId: customerId,
        name: newBoat.name,
        registrationNumber: newBoat.registrationNumber ?? null,
      },
    })
    boatId = res.data.boat_insert.id
  }

  for (const engine of newEngines ?? []) {
    await dataConnect.executeGraphql(CREATE_ENGINE_MUTATION, { variables: { boatId, ...engine } })
  }

  const sequenceNumber = await reserveOrderSequenceNumber(locationCode)
  const code = formatOrderCode(locationCode, sequenceNumber)
  await dataConnect
    .executeGraphql(UPSERT_ORDER_SEQUENCE_MUTATION, { variables: { locationCode, lastNumber: sequenceNumber } })
    .catch(() => {})

  const workOrderRes = await dataConnect.executeGraphql(CREATE_WORK_ORDER_MUTATION, {
    variables: {
      code,
      locationCode,
      sequenceNumber,
      customerId,
      boatId,
      createdById: callerUid,
      assetLocation: assetLocation.trim(),
      description: description || null,
    },
  })
  const workOrderId = workOrderRes.data.workOrder_insert.id

  for (const task of tasks) {
    await dataConnect.executeGraphql(CREATE_WORK_ORDER_TASK_MUTATION, {
      variables: { workOrderId, description: task },
    })
  }

  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: callerUid, eventType: 'ORDER_CREATED' },
  })

  if (skipQuote) {
    await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
      variables: { id: workOrderId, status: 'AWAITING_ASSIGNMENT' },
    })
  }

  // Seed both per-order chats (see src/lib/chat.ts) directly via the Admin
  // SDK, which bypasses firestore.rules the same way it bypasses Data
  // Connect's @auth. customerLinkedUserId comes straight from the client
  // (same trust level as the pre-existing purely client-side chat seeding -
  // not a new gap).
  const firestore = admin.firestore()
  await firestore.doc(`clientChats/${workOrderId}`).set(
    { participants: customerLinkedUserId ? [customerLinkedUserId] : [], lastMessageAt: null, lastRead: {} },
    { merge: true },
  )
  await firestore.doc(`technicianChats/${workOrderId}`).set(
    { participants: [], lastMessageAt: null, lastRead: {} },
    { merge: true },
  )

  return { workOrderId, code, customerId, boatId }
})
