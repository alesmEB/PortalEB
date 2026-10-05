const { randomUUID } = require('crypto')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { defineSecret } = require('firebase-functions/params')
const { getDataConnect } = require('firebase-admin/data-connect')
const admin = require('firebase-admin')
const sanitizeHtml = require('sanitize-html')
const { GoogleGenAI, Type } = require('@google/genai')
const { renderWorkOrderPdfBuffer } = require('./workOrderPdf')
const { renderRatingsPdfBuffer } = require('./ratingsPdf')
const nodemailer = require('nodemailer')
const {
  renderHoursLogPdfBuffer,
  buildDays,
  closedMinutes,
  formatMinutes,
  formatDayHeading,
  madridDayKey,
  madridMidnight,
  addDaysToKey,
} = require('./hoursLogPdf')

admin.initializeApp()

// Matches dataconnect/dataconnect.yaml - the Admin SDK talks to this
// service directly, bypassing every @auth(level: ...) directive (same
// trust model as the Firestore Admin SDK bypassing security rules).
const DATA_CONNECT_CONFIG = { location: 'europe-southwest1', serviceId: 'portaleb-service' }
const dataConnect = getDataConnect(DATA_CONNECT_CONFIG)

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
  mutation CreateCustomerAdmin($name: String!, $contactName: String!, $phone: String!, $email: String) {
    customer_insert(data: { name: $name, contactName: $contactName, phone: $phone, email: $email })
  }
`
const CREATE_BOAT_MUTATION = `
  mutation CreateBoatAdmin(
    $ownerId: UUID!
    $name: String!
    $registrationNumber: String
    $manufacturerModel: String
    $loaMeters: Float
    $beamMeters: Float
  ) {
    boat_insert(
      data: {
        ownerId: $ownerId
        name: $name
        registrationNumber: $registrationNumber
        manufacturerModel: $manufacturerModel
        loaMeters: $loaMeters
        beamMeters: $beamMeters
      }
    )
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
const SET_WORK_ORDER_REPORT_URL_MUTATION = `
  mutation SetWorkOrderReportUrlAdmin($id: UUID!, $finalReportUrl: String!) {
    workOrder_update(id: $id, data: { finalReportUrl: $finalReportUrl })
  }
`
const LOG_ORDER_EVENT_MUTATION = `
  mutation LogOrderEventAdmin(
    $workOrderId: UUID!
    $actorId: String!
    $eventType: OrderEventType!
    $metadata: Any
  ) {
    orderTracking_insert(
      data: { workOrderId: $workOrderId, actorId: $actorId, eventType: $eventType, metadata: $metadata }
    )
  }
`
const UPSERT_ORDER_SEQUENCE_MUTATION = `
  mutation UpsertOrderSequenceAdmin($locationCode: OrderLocation!, $lastNumber: Int!) {
    orderSequence_upsert(data: { locationCode: $locationCode, lastNumber: $lastNumber })
  }
`

// See createIntervention below.
const CREATE_INTERVENTION_MUTATION = `
  mutation CreateInterventionAdmin(
    $code: String!
    $sequenceNumber: Int!
    $locationCode: OrderLocation!
    $customerId: UUID!
    $boatId: UUID!
    $receivedById: String!
    $expectedDeliveryAt: Date
    $homePort: String
    $pier: String
    $berthPosition: String
    $engineComponentInfo: String
    $keysLeft: Boolean!
    $wantsQuoteFirst: Boolean!
    $requestedWork: String!
    $observations: String
    $signatureUrl: String!
    $consentSignedAt: Timestamp!
  ) {
    intervention_insert(
      data: {
        code: $code
        sequenceNumber: $sequenceNumber
        locationCode: $locationCode
        customerId: $customerId
        boatId: $boatId
        receivedById: $receivedById
        expectedDeliveryAt: $expectedDeliveryAt
        homePort: $homePort
        pier: $pier
        berthPosition: $berthPosition
        engineComponentInfo: $engineComponentInfo
        keysLeft: $keysLeft
        wantsQuoteFirst: $wantsQuoteFirst
        requestedWork: $requestedWork
        observations: $observations
        signatureUrl: $signatureUrl
        consentSignedAt: $consentSignedAt
      }
    )
  }
`
const UPDATE_WORK_ORDER_STATUS_MUTATION = `
  mutation UpdateWorkOrderStatusAdmin($id: UUID!, $status: WorkOrderStatus!) {
    workOrder_update(id: $id, data: { status: $status })
  }
`
const GET_WORK_ORDER_STATUS_QUERY = `
  query GetWorkOrderStatusAdmin($id: UUID!) {
    workOrder(id: $id) {
      status
    }
  }
`
const UPSERT_WORK_ORDER_SCHEDULED_DATE_MUTATION = `
  mutation UpsertWorkOrderScheduledDateAdmin($workOrderId: UUID!, $date: Date!) {
    workOrderScheduledDate_upsert(data: { workOrderId: $workOrderId, date: $date })
  }
`
const DELETE_WORK_ORDER_SCHEDULED_DATE_MUTATION = `
  mutation DeleteWorkOrderScheduledDateAdmin($workOrderId: UUID!, $date: Date!) {
    workOrderScheduledDate_delete(key: { workOrderId: $workOrderId, date: $date })
  }
`

// --- Order-lifecycle mutations/queries (quote/assign/start/complete/
// incident/clock-in-out) - see the onCall functions near the bottom of this
// file. Same ad-hoc-GraphQL-via-Admin-SDK approach as createWorkOrder above:
// explicit actor ids instead of "_expr: auth.uid", explicit timestamps
// instead of "_expr: request.time", since the Admin SDK has no signed-in
// user context to resolve those expressions against.

const CREATE_QUOTE_MUTATION = `
  mutation CreateQuoteAdmin(
    $workOrderId: UUID!
    $attemptNumber: Int!
    $fileUrl: String!
    $uploadedById: String!
  ) {
    quote_insert(
      data: {
        workOrderId: $workOrderId
        attemptNumber: $attemptNumber
        fileUrl: $fileUrl
        uploadedById: $uploadedById
      }
    )
  }
`
const UPDATE_WORK_ORDER_STATUS_AND_ATTEMPTS_MUTATION = `
  mutation UpdateWorkOrderStatusAndAttemptsAdmin(
    $id: UUID!
    $status: WorkOrderStatus!
    $quoteAttempts: Int!
  ) {
    workOrder_update(id: $id, data: { status: $status, quoteAttempts: $quoteAttempts })
  }
`
const GET_ORDER_QUOTE_INFO_QUERY = `
  query GetOrderQuoteInfoAdmin($id: UUID!) {
    workOrder(id: $id) {
      status
      quoteAttempts
      quotes: quotes_on_workOrder(orderBy: { attemptNumber: DESC }, limit: 1) {
        id
      }
    }
  }
`
const DECIDE_QUOTE_MUTATION = `
  mutation DecideQuoteAdmin($id: UUID!, $decision: QuoteDecision!, $decidedAt: Timestamp!) {
    quote_update(id: $id, data: { decision: $decision, decidedAt: $decidedAt })
  }
`
const ASSIGN_TECHNICIAN_MUTATION = `
  mutation AssignTechnicianAdmin(
    $workOrderId: UUID!
    $technicianId: String!
    $assignedById: String!
    $assignedAt: Timestamp!
    $isAllowed: Boolean!
    $isLead: Boolean!
  ) {
    technicianAssignment_upsert(
      data: {
        workOrderId: $workOrderId
        technicianId: $technicianId
        assignedById: $assignedById
        assignedAt: $assignedAt
        unassignedAt: null
        isAllowed: $isAllowed
        isLead: $isLead
      }
    )
  }
`
const UNASSIGN_TECHNICIAN_MUTATION = `
  mutation UnassignTechnicianAdmin($workOrderId: UUID!, $technicianId: String!, $unassignedAt: Timestamp!) {
    technicianAssignment_update(
      key: { workOrderId: $workOrderId, technicianId: $technicianId }
      data: { unassignedAt: $unassignedAt }
    )
  }
`
const GET_ORDER_ASSIGNMENTS_QUERY = `
  query GetOrderAssignmentsAdmin($workOrderId: UUID!) {
    workOrder(id: $workOrderId) {
      status
    }
    technicianAssignments(where: { workOrderId: { eq: $workOrderId }, unassignedAt: { isNull: true } }) {
      technicianId
    }
  }
`
const GET_MY_ASSIGNMENT_QUERY = `
  query GetMyAssignmentAdmin($workOrderId: UUID!, $technicianId: String!) {
    technicianAssignments(
      where: {
        workOrderId: { eq: $workOrderId }
        technicianId: { eq: $technicianId }
        unassignedAt: { isNull: true }
      }
    ) {
      isAllowed
      isLead
    }
  }
`
const CREATE_WORK_ORDER_PHOTO_MUTATION = `
  mutation CreateWorkOrderPhotoAdmin(
    $workOrderId: UUID!
    $stage: PhotoStage!
    $storageUrl: String!
    $mediaType: MediaType!
    $uploadedById: String!
    $incidentId: UUID
  ) {
    workOrderPhoto_insert(
      data: {
        workOrderId: $workOrderId
        stage: $stage
        storageUrl: $storageUrl
        mediaType: $mediaType
        uploadedById: $uploadedById
        incidentId: $incidentId
      }
    )
  }
`
const GET_ACTIVE_TIME_LOGS_QUERY = `
  query GetActiveTimeLogsAdmin($workOrderId: UUID!) {
    timeLogs(where: { workOrderId: { eq: $workOrderId }, clockOut: { isNull: true } }) {
      id
      clockIn
    }
  }
`
const CLOCK_OUT_MUTATION = `
  mutation ClockOutAdmin($timeLogId: UUID!, $clockOut: Timestamp!, $durationMinutes: Int!) {
    timeLog_update(id: $timeLogId, data: { clockOut: $clockOut, durationMinutes: $durationMinutes })
  }
`
const COMPLETE_WORK_ORDER_MUTATION = `
  mutation CompleteWorkOrderAdmin($id: UUID!, $completedAt: Timestamp!) {
    workOrder_update(id: $id, data: { status: COMPLETED, completedAt: $completedAt })
  }
`
const SET_WORK_ORDER_DELETED_MUTATION = `
  mutation SetWorkOrderDeletedAdmin($id: UUID!, $deletedAt: Timestamp!) {
    workOrder_update(id: $id, data: { deletedAt: $deletedAt })
  }
`
const CREATE_INCIDENT_MUTATION = `
  mutation CreateIncidentAdmin($workOrderId: UUID!, $reportedById: String!, $description: String!) {
    incident_insert(
      data: { workOrderId: $workOrderId, reportedById: $reportedById, description: $description }
    )
  }
`
const CREATE_ORDER_NOTE_MUTATION = `
  mutation CreateOrderNoteAdmin($workOrderId: UUID!, $authorId: String!, $body: String!) {
    orderNote_insert(data: { workOrderId: $workOrderId, authorId: $authorId, body: $body })
  }
`
const GET_MY_ACTIVE_TIME_LOG_QUERY = `
  query GetMyActiveTimeLogAdmin($technicianId: String!) {
    timeLogs(where: { technicianId: { eq: $technicianId }, clockOut: { isNull: true } }) {
      id
      clockIn
      workOrderId
      workOrder {
        status
      }
    }
  }
`

// Completing an order clocks everyone out, so a shift still open on a
// finished one is leftover data, never a technician at work: the hours
// migrated from the old Sotogrande app came with the clock-out nobody
// pressed. Treating those as the active shift meant the next clock-in
// closed a shift opened months earlier, turning it into a shift of
// hundreds of hours. Mirrored client-side in src/lib/activeShift.ts.
const CLOSED_ORDER_STATUSES = ['COMPLETED', 'CANCELLED']

function pickActiveTimeLog(timeLogs) {
  return timeLogs.find((log) => !CLOSED_ORDER_STATUSES.includes(log.workOrder.status))
}

const CLOCK_IN_MUTATION = `
  mutation ClockInAdmin(
    $workOrderId: UUID!
    $technicianId: String!
    $clockIn: Timestamp!
    $recordedOffline: Boolean!
  ) {
    timeLog_insert(
      data: {
        workOrderId: $workOrderId
        technicianId: $technicianId
        clockIn: $clockIn
        recordedOffline: $recordedOffline
      }
    )
  }
`
// Same as CLOCK_OUT_MUTATION, but flags the shift: a clock-out replayed from
// the queue carries the phone's clock, so admin can tell it apart.
const CLOCK_OUT_OFFLINE_MUTATION = `
  mutation ClockOutOfflineAdmin($timeLogId: UUID!, $clockOut: Timestamp!, $durationMinutes: Int!) {
    timeLog_update(
      id: $timeLogId
      data: { clockOut: $clockOut, durationMinutes: $durationMinutes, recordedOffline: true }
    )
  }
`
const GET_TIME_LOG_AT_QUERY = `
  query GetTimeLogAtAdmin($technicianId: String!, $workOrderId: UUID!, $clockIn: Timestamp!) {
    timeLogs(
      where: {
        technicianId: { eq: $technicianId }
        workOrderId: { eq: $workOrderId }
        clockIn: { eq: $clockIn }
      }
    ) {
      id
    }
  }
`
function minutesBetween(fromIso, to) {
  return Math.round((to.getTime() - new Date(fromIso).getTime()) / 60000)
}

// A queued offline action carries the phone's clock instead of the server's,
// on purpose: a shift sent an hour late has to keep the hour it happened.
// Bounded all the same - a time from the future, or from last week, is a
// broken clock rather than a shift, and someone would have to unpick it by
// hand afterwards.
function clientTimestamp(value, label) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', `${label} no es válida.`)
  }
  const now = Date.now()
  if (date.getTime() > now + 10 * 60 * 1000) {
    throw new HttpsError('invalid-argument', `${label} está en el futuro.`)
  }
  if (date.getTime() < now - 7 * 24 * 60 * 60 * 1000) {
    throw new HttpsError('invalid-argument', `${label} es de hace más de una semana.`)
  }
  return date
}

function durationMinutesSince(isoTime) {
  return Math.round((Date.now() - new Date(isoTime).getTime()) / 60000)
}

// Stable per-technician tag so a re-sent "active shift" notification (clock
// in, or the notifyActiveShifts reminder) replaces the previous one instead
// of stacking - same tag-based dedup already used for chat notifications
// (see firebase-messaging-sw.js).
function activeShiftTag(technicianId) {
  return `active-shift-${technicianId}`
}

const GET_WORK_ORDER_CODE_QUERY = `
  query GetWorkOrderCodeAdmin($id: UUID!) {
    workOrder(id: $id) {
      code
    }
  }
`

async function getMyAssignment(workOrderId, technicianId) {
  const res = await dataConnect.executeGraphqlRead(GET_MY_ASSIGNMENT_QUERY, {
    variables: { workOrderId, technicianId },
  })
  return res.data.technicianAssignments[0] ?? null
}

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

// Interventions have their own global sequence (not per-location like work
// orders - the physical intake sheet's "Número O.T." box isn't split by
// branch), same bootstrap-from-max-then-Firestore-transaction shape as
// reserveOrderSequenceNumber above.
const GET_MAX_INTERVENTION_SEQUENCE_QUERY = `
  query GetMaxInterventionSequenceAdmin {
    interventions(orderBy: { sequenceNumber: DESC }, limit: 1) {
      sequenceNumber
    }
  }
`

function formatInterventionCode(sequenceNumber) {
  return `INT-${String(sequenceNumber).padStart(6, '0')}`
}

async function reserveInterventionSequenceNumber() {
  const ref = admin.firestore().collection('interventionSequenceCounters').doc('global')
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    let current = snap.data()?.lastNumber
    if (current == null) {
      const res = await dataConnect.executeGraphqlRead(GET_MAX_INTERVENTION_SEQUENCE_QUERY, {})
      current = res.data.interventions[0]?.sequenceNumber ?? 0
    }
    const next = current + 1
    tx.set(ref, { lastNumber: next }, { merge: true })
    return next
  })
}

// The Admin SDK's Storage client has no equivalent of the client SDK's
// getDownloadURL() - that URL scheme relies on a `firebaseStorageDownloadTokens`
// value the client SDK generates and attaches automatically on upload, which
// the Admin SDK knows nothing about. Replicating it by hand here (rather than
// switching to expiring signed URLs) keeps finalReportUrl behaving exactly
// like every URL already produced client-side (permanent, works directly in
// PdfViewer, no changes needed anywhere else that reads that field).
async function uploadFileAndGetDownloadUrl(storagePath, buffer, contentType) {
  const bucket = admin.storage().bucket()
  const file = bucket.file(storagePath)
  const token = randomUUID()
  await file.save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`
}

async function uploadPdfAndGetDownloadUrl(storagePath, buffer) {
  return uploadFileAndGetDownloadUrl(storagePath, buffer, 'application/pdf')
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

async function sendToUsers(userIds, { title, body, data = {} }) {
  const firestore = admin.firestore()
  const tokenDocs = []
  for (const idsChunk of chunk(userIds, 10)) {
    const snapshot = await firestore.collection('deviceTokens').where('userId', 'in', idsChunk).get()
    tokenDocs.push(...snapshot.docs)
  }
  if (tokenDocs.length === 0) return { sent: 0, failed: 0 }

  // Data-only payload - no top-level `notification` field. When one's
  // present, browsers auto-display their own system notification from it *in
  // addition* to the one firebase-messaging-sw.js's onBackgroundMessage
  // builds, doubling every single push. Keeping everything under `data`
  // (values must be strings) leaves display entirely up to our handler.
  const payloadData = { ...data }
  if (title) payloadData.title = title
  if (body) payloadData.body = body

  const response = await admin.messaging().sendEachForMulticast({
    // Pre-migration docs (keyed by the token itself, no `token` field of
    // their own) still work via this fallback until they're naturally
    // replaced by a fresh doc.id-keyed registration - see
    // getOrCreateDeviceId in src/lib/pushNotifications.ts.
    tokens: tokenDocs.map((doc) => doc.data().token ?? doc.id),
    data: payloadData,
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
// Manual push from the lab notification screen - never part of the normal
// workflow, where notifications are sent by the chat triggers and the active
// shift schedule instead.
exports.sendPushNotification = onCall(async (request) => {
  requirePermission(request, 'admin:lab')

  const { userIds, title, body, orderId } = request.data ?? {}
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpsError('invalid-argument', 'userIds es obligatorio.')
  }
  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
    throw new HttpsError('invalid-argument', 'title y body son obligatorios.')
  }

  return sendToUsers(userIds, {
    title: title.trim(),
    body: body.trim(),
    data: orderId ? { orderId } : {},
  })
})

// Lets an admin see a user's registered devices (to spot a stale/duplicate
// one - e.g. the same phone registered once from a browser tab and again
// after being installed as a PWA, see getOrCreateDeviceId) and remove it.
// Firestore's deviceTokens collection has no client-facing reads at all
// (see firestore.rules), so this - not a direct client query - is the only
// way to list them.
exports.adminListUserDevices = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { userId } = request.data ?? {}
  if (typeof userId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del usuario.')
  }

  const snapshot = await admin.firestore().collection('deviceTokens').where('userId', '==', userId).get()
  const devices = snapshot.docs.map((doc) => ({
    id: doc.id,
    userAgent: doc.data().userAgent ?? null,
    updatedAt: doc.data().updatedAt?.toDate().toISOString() ?? null,
  }))
  return { devices }
})

exports.adminDeleteUserDevice = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { deviceId } = request.data ?? {}
  if (typeof deviceId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del dispositivo.')
  }

  await admin.firestore().collection('deviceTokens').doc(deviceId).delete()
  return { success: true }
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
    title: message.senderName || 'Nuevo mensaje',
    body: message.text,
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
// Shared by syncUserClaims below and by the adminCreateUser/adminUpdateUser
// functions further down, which need the same recompute after they touch a
// user's role/permissions - saves those callers a redundant client round
// trip to syncUserClaims right after.
async function computeAndSetClaims(uid) {
  const { data } = await dataConnect.executeGraphqlRead(GET_USER_FOR_CLAIMS_QUERY, {
    variables: { id: uid },
  })
  if (!data.user) return null
  const role = data.user.role
  const permissions = data.user.userPermissions.map((up) => up.permission.key)
  await admin.auth().setCustomUserClaims(uid, { role, permissions })
  return { role, permissions }
}

exports.syncUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const uid = typeof request.data?.uid === 'string' && request.data.uid ? request.data.uid : request.auth.uid
  const result = await computeAndSetClaims(uid)
  if (!result) {
    throw new HttpsError('not-found', 'Usuario no encontrado.')
  }
  return result
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
    pdfData,
    appointmentId,
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

  // Checked before anything gets created: an order can't be un-created, and
  // one made from an appointment that's gone or already completed would leave
  // the calendar pointing at the wrong thing.
  let fromAppointment = null
  // Absent and null both mean "not from an appointment": the callable SDK
  // encodes an undefined field as null and still sends the key, so a plain
  // new order arrives here with appointmentId === null.
  if (appointmentId !== undefined && appointmentId !== null) {
    if (typeof appointmentId !== 'string') {
      throw new HttpsError('invalid-argument', 'Cita inválida.')
    }
    fromAppointment = await getCalendarAppointment(appointmentId)
    if (!fromAppointment) {
      throw new HttpsError('not-found', 'La cita de la que sale esta orden ya no existe.')
    }
    if (fromAppointment.closedAt) {
      throw new HttpsError('failed-precondition', 'Esa cita ya está completada.')
    }
  }

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
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'ORDER_CREATED',
      metadata: fromAppointment
        ? { fromAppointment: { id: fromAppointment.id, title: fromAppointment.title } }
        : null,
    },
  })

  // Completing the appointment here, with the order, is what turns its
  // calendar chip purple - so the calendar never shows one without the other,
  // and leaving the new-order form half-filled changes nothing.
  if (fromAppointment) {
    await dataConnect.executeGraphql(LINK_CALENDAR_APPOINTMENT_ORDER_MUTATION, {
      variables: { id: fromAppointment.id, workOrderId, closedAt: new Date().toISOString() },
    })
  }

  if (skipQuote) {
    await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
      variables: { id: workOrderId, status: 'AWAITING_ASSIGNMENT' },
    })
  }

  // Report generation is optional - the lab quick-create shortcut doesn't
  // send pdfData at all, keeping that path fast and report-less like before.
  // pdfData's display fields (customer/boat/engine names etc.) come from the
  // client, which already has them in memory for both new and existing
  // customers/boats - no need for an extra Data Connect read here.
  let finalReportUrl = null
  if (pdfData) {
    const buffer = await renderWorkOrderPdfBuffer({
      ...pdfData,
      code,
      createdAt: new Date(),
      assetLocation: assetLocation.trim(),
      tasks,
      comments: description || undefined,
    })
    finalReportUrl = await uploadPdfAndGetDownloadUrl(`work-orders/${code}/informe.pdf`, buffer)
    await dataConnect.executeGraphql(SET_WORK_ORDER_REPORT_URL_MUTATION, {
      variables: { id: workOrderId, finalReportUrl },
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

  return { workOrderId, code, customerId, boatId, finalReportUrl }
})

// Digitizes the front-desk "Orden de Reparación" intake sheet (see
// intervention.pdf) - lab-only for now, same admin:lab gate as the rest of
// this early pass. Same new-or-existing customer/boat resolution as
// createWorkOrder above (and reuses its mutations), but its own code
// sequence (see reserveInterventionSequenceNumber) since this isn't a
// WorkOrder yet - just the signed intake record a future step may convert
// into one. The signature is a PNG canvas snapshot sent as a base64 string
// (no data: URL prefix) and rendered to Storage server-side, the same
// "client sends raw data, server owns the upload" shape as createWorkOrder's
// PDF report - avoids needing a Storage-rules-writable path for it at all.
exports.createIntervention = onCall(async (request) => {
  requirePermission(request, 'admin:lab')

  const {
    locationCode,
    customerId: existingCustomerId,
    newCustomer,
    boatId: existingBoatId,
    newBoat,
    expectedDeliveryAt,
    homePort,
    pier,
    berthPosition,
    engineComponentInfo,
    keysLeft,
    wantsQuoteFirst,
    requestedWork,
    observations,
    signaturePngBase64,
  } = request.data ?? {}

  if (
    typeof locationCode !== 'string' ||
    typeof requestedWork !== 'string' ||
    !requestedWork.trim() ||
    typeof keysLeft !== 'boolean' ||
    typeof wantsQuoteFirst !== 'boolean' ||
    typeof signaturePngBase64 !== 'string' ||
    !signaturePngBase64
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const callerUid = request.auth.uid

  let customerId = existingCustomerId
  if (!customerId) {
    if (!newCustomer?.name || !newCustomer?.contactName || !newCustomer?.phone) {
      throw new HttpsError('invalid-argument', 'Faltan datos del cliente nuevo.')
    }
    const res = await dataConnect.executeGraphql(CREATE_CUSTOMER_MUTATION, { variables: newCustomer })
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
        manufacturerModel: newBoat.manufacturerModel ?? null,
        loaMeters: newBoat.loaMeters ?? null,
        beamMeters: newBoat.beamMeters ?? null,
      },
    })
    boatId = res.data.boat_insert.id
  }

  const sequenceNumber = await reserveInterventionSequenceNumber()
  const code = formatInterventionCode(sequenceNumber)

  const signatureUrl = await uploadFileAndGetDownloadUrl(
    `interventions/${code}/signature.png`,
    Buffer.from(signaturePngBase64, 'base64'),
    'image/png',
  )

  const now = new Date().toISOString()
  const interventionRes = await dataConnect.executeGraphql(CREATE_INTERVENTION_MUTATION, {
    variables: {
      code,
      sequenceNumber,
      locationCode,
      customerId,
      boatId,
      receivedById: callerUid,
      expectedDeliveryAt: expectedDeliveryAt || null,
      homePort: homePort || null,
      pier: pier || null,
      berthPosition: berthPosition || null,
      engineComponentInfo: engineComponentInfo || null,
      keysLeft,
      wantsQuoteFirst,
      requestedWork: requestedWork.trim(),
      observations: observations || null,
      signatureUrl,
      consentSignedAt: now,
    },
  })

  return { interventionId: interventionRes.data.intervention_insert.id, code, signatureUrl }
})

// --- Order-lifecycle actions ------------------------------------------------
// Each of these replaces a chain of 3-6 sequential client-side Data Connect
// (+ sometimes Firestore/push) calls with one Cloud Function call. The
// motivation is the same as createWorkOrder's, but sharper here: if the
// client's tab closes/hangs mid-chain today, the order can be left in an
// inconsistent state (e.g. a quote row created but the status never
// updated, or a status updated but the audit event never logged). Wrapping
// the chain server-side doesn't make it one DB transaction, but it shrinks
// the risk window from "as long as the tab stays open" to "one function
// invocation" - and file uploads (which can be large and slow) still happen
// client-side *before* the call, so a slow/interrupted upload can no longer
// leave a half-written order status behind.

// Requires quotes:upload (or admin:lab, for the lab blank-PDF shortcut) -
// same permissions the client-side buttons are already gated by.
exports.addQuote = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions) ? request.auth.token.permissions : []
  if (!permissions.includes('quotes:upload') && !permissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para subir presupuestos.')
  }

  const { workOrderId, fileUrl } = request.data ?? {}
  if (typeof workOrderId !== 'string' || typeof fileUrl !== 'string' || !fileUrl) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const callerUid = request.auth.uid
  const orderRes = await dataConnect.executeGraphqlRead(GET_ORDER_QUOTE_INFO_QUERY, {
    variables: { id: workOrderId },
  })
  if (!orderRes.data.workOrder) {
    throw new HttpsError('not-found', 'Orden no encontrada.')
  }
  const attemptNumber = orderRes.data.workOrder.quoteAttempts + 1

  await dataConnect.executeGraphql(CREATE_QUOTE_MUTATION, {
    variables: { workOrderId, attemptNumber, fileUrl, uploadedById: callerUid },
  })
  await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_AND_ATTEMPTS_MUTATION, {
    variables: { id: workOrderId, status: 'PENDING_QUOTE', quoteAttempts: attemptNumber },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'QUOTE_UPLOADED',
      metadata: { attemptNumber },
    },
  })

  return { attemptNumber }
})

// Requires quotes:approve, matching the client-side gate.
exports.acceptQuote = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions) ? request.auth.token.permissions : []
  if (!permissions.includes('quotes:approve')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para aceptar presupuestos.')
  }

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'workOrderId es obligatorio.')
  }

  const callerUid = request.auth.uid
  const orderRes = await dataConnect.executeGraphqlRead(GET_ORDER_QUOTE_INFO_QUERY, {
    variables: { id: workOrderId },
  })
  if (!orderRes.data.workOrder) {
    throw new HttpsError('not-found', 'Orden no encontrada.')
  }
  const latestQuote = orderRes.data.workOrder.quotes[0]
  const now = new Date().toISOString()

  if (latestQuote) {
    await dataConnect.executeGraphql(DECIDE_QUOTE_MUTATION, {
      variables: { id: latestQuote.id, decision: 'ACCEPTED', decidedAt: now },
    })
  }
  await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
    variables: { id: workOrderId, status: 'AWAITING_ASSIGNMENT' },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: callerUid, eventType: 'QUOTE_ACCEPTED' },
  })

  return { success: true }
})

// Requires quotes:reject, a permission of its own: rejecting records what the
// client decided, and shouldn't ride along with whoever can approve. A second
// rejection just leaves the order here again - it is never cancelled on its own.
exports.rejectQuote = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions) ? request.auth.token.permissions : []
  if (!permissions.includes('quotes:reject')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para rechazar presupuestos.')
  }

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'workOrderId es obligatorio.')
  }

  const callerUid = request.auth.uid
  const orderRes = await dataConnect.executeGraphqlRead(GET_ORDER_QUOTE_INFO_QUERY, {
    variables: { id: workOrderId },
  })
  const order = orderRes.data.workOrder
  if (!order) {
    throw new HttpsError('not-found', 'Orden no encontrada.')
  }
  // Read the state from the server instead of the screen the click came from:
  // the quote may have been accepted, or a newer one uploaded, meanwhile.
  if (order.status !== 'PENDING_QUOTE') {
    throw new HttpsError(
      'failed-precondition',
      'Esta orden no tiene un presupuesto pendiente de decisión.',
    )
  }
  const latestQuote = order.quotes[0]
  if (!latestQuote) {
    throw new HttpsError('failed-precondition', 'Esta orden no tiene ningún presupuesto que rechazar.')
  }

  await dataConnect.executeGraphql(DECIDE_QUOTE_MUTATION, {
    variables: { id: latestQuote.id, decision: 'REJECTED', decidedAt: new Date().toISOString() },
  })
  await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
    variables: { id: workOrderId, status: 'QUOTE_REJECTED' },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'QUOTE_REJECTED',
      metadata: { attemptNumber: order.quoteAttempts },
    },
  })

  return { success: true }
})

// Not permission-gated beyond being signed in - matches today's client,
// where the "Asignar técnicos"/"Añadir técnicos" buttons have no
// HasPermission wrapper either. `assignments` is the full desired end state
// (every technician that should end up assigned, with their flags); who's
// newly-assigned vs. unassigned is computed here from the order's current
// assignments rather than trusted from the client, so a stale client view
// can't mis-fire notifications or audit events.
//
// Callable again after the first assignment (ASSIGNED/IN_PROGRESS) to add or
// remove technicians mid-job - blocked once the order is COMPLETED/CANCELLED
// or hasn't reached assignment yet. Only bumps status to ASSIGNED on the
// very first call (from AWAITING_ASSIGNMENT); a later call while IN_PROGRESS
// must leave that status alone instead of regressing it.
const ASSIGNABLE_STATUSES = ['AWAITING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS']
exports.assignTechnicians = onCall(async (request) => {
  requirePermission(request, 'admin:assigntechnicians')

  const { workOrderId, code, assignments, expectedTechnicianIds } = request.data ?? {}
  if (typeof workOrderId !== 'string' || !Array.isArray(assignments)) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const callerUid = request.auth.uid
  const now = new Date().toISOString()

  const currentRes = await dataConnect.executeGraphqlRead(GET_ORDER_ASSIGNMENTS_QUERY, {
    variables: { workOrderId },
  })
  const currentStatus = currentRes.data.workOrder?.status
  if (!ASSIGNABLE_STATUSES.includes(currentStatus)) {
    throw new HttpsError(
      'failed-precondition',
      'No se pueden asignar técnicos en el estado actual de la orden.',
    )
  }
  const currentIds = new Set(currentRes.data.technicianAssignments.map((a) => a.technicianId))
  requireUnchangedSince(expectedTechnicianIds, currentIds)
  const desiredIds = new Set(assignments.map((a) => a.technicianId))
  const newlyAssigned = assignments.filter((a) => !currentIds.has(a.technicianId))
  const toUnassign = [...currentIds].filter((id) => !desiredIds.has(id))

  for (const { technicianId, isAllowed, isLead } of assignments) {
    await dataConnect.executeGraphql(ASSIGN_TECHNICIAN_MUTATION, {
      variables: {
        workOrderId,
        technicianId,
        assignedById: callerUid,
        assignedAt: now,
        isAllowed: !!isAllowed,
        isLead: !!isLead,
      },
    })
  }
  for (const technicianId of toUnassign) {
    await dataConnect.executeGraphql(UNASSIGN_TECHNICIAN_MUTATION, {
      variables: { workOrderId, technicianId, unassignedAt: now },
    })
  }

  if (newlyAssigned.length > 0) {
    await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
      variables: {
        workOrderId,
        actorId: callerUid,
        eventType: 'TECHNICIANS_ASSIGNED',
        metadata: { technicianIds: newlyAssigned.map((a) => a.technicianId) },
      },
    })
  }
  if (toUnassign.length > 0) {
    await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
      variables: {
        workOrderId,
        actorId: callerUid,
        eventType: 'TECHNICIAN_UNASSIGNED',
        metadata: { technicianIds: toUnassign },
      },
    })
  }

  if (currentStatus === 'AWAITING_ASSIGNMENT') {
    await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
      variables: { id: workOrderId, status: 'ASSIGNED' },
    })
  }

  await admin
    .firestore()
    .doc(`technicianChats/${workOrderId}`)
    .set({ participants: assignments.map((a) => a.technicianId) }, { merge: true })

  if (newlyAssigned.length > 0 && code) {
    await sendToUsers(
      newlyAssigned.map((a) => a.technicianId),
      {
        title: 'Nueva asignación',
        body: `Has sido asignado a la orden ${code}`,
        data: { orderId: workOrderId },
      },
    )
      .then((result) =>
        console.log(
          `[assign-notify] ${workOrderId}: recipients=${newlyAssigned.length} sent=${result.sent} failed=${result.failed}`,
        ),
      )
      .catch((err) => console.error(`[assign-notify] ${workOrderId}: threw`, err))
  }

  return { assigned: newlyAssigned.length, unassigned: toUnassign.length }
})

// Requires being assigned to this order with isAllowed or isLead - the same
// canManageOrder check OrderDetailPage does client-side, re-verified here
// against Data Connect rather than trusted from the client.
exports.startOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { workOrderId, photos } = request.data ?? {}
  if (typeof workOrderId !== 'string' || !Array.isArray(photos) || photos.length === 0) {
    throw new HttpsError('invalid-argument', 'Se requiere al menos 1 foto o vídeo.')
  }

  const callerUid = request.auth.uid
  const assignment = await getMyAssignment(workOrderId, callerUid)
  if (!assignment || !(assignment.isAllowed || assignment.isLead)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para empezar esta orden.')
  }

  for (const photo of photos) {
    await dataConnect.executeGraphql(CREATE_WORK_ORDER_PHOTO_MUTATION, {
      variables: {
        workOrderId,
        stage: 'START',
        storageUrl: photo.url,
        mediaType: photo.mediaType,
        uploadedById: callerUid,
        incidentId: null,
      },
    })
  }
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'PHOTO_UPLOADED',
      metadata: { stage: 'START', count: photos.length },
    },
  })
  await dataConnect.executeGraphql(UPDATE_WORK_ORDER_STATUS_MUTATION, {
    variables: { id: workOrderId, status: 'IN_PROGRESS' },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: callerUid, eventType: 'WORK_STARTED' },
  })

  return { success: true }
})

// Same canManageOrder check as startOrder. Active time logs are read fresh
// from Data Connect here (not trusted from the client's possibly-stale
// order object) before clocking each of them out.
exports.completeOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { workOrderId, photos } = request.data ?? {}
  if (typeof workOrderId !== 'string' || !Array.isArray(photos) || photos.length === 0) {
    throw new HttpsError('invalid-argument', 'Se requiere al menos 1 foto o vídeo.')
  }

  const callerUid = request.auth.uid
  const assignment = await getMyAssignment(workOrderId, callerUid)
  if (!assignment || !(assignment.isAllowed || assignment.isLead)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para terminar esta orden.')
  }

  for (const photo of photos) {
    await dataConnect.executeGraphql(CREATE_WORK_ORDER_PHOTO_MUTATION, {
      variables: {
        workOrderId,
        stage: 'FINAL',
        storageUrl: photo.url,
        mediaType: photo.mediaType,
        uploadedById: callerUid,
        incidentId: null,
      },
    })
  }
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'PHOTO_UPLOADED',
      metadata: { stage: 'FINAL', count: photos.length },
    },
  })

  const activeLogsRes = await dataConnect.executeGraphqlRead(GET_ACTIVE_TIME_LOGS_QUERY, {
    variables: { workOrderId },
  })
  const now = new Date()
  for (const log of activeLogsRes.data.timeLogs) {
    await dataConnect.executeGraphql(CLOCK_OUT_MUTATION, {
      variables: {
        timeLogId: log.id,
        clockOut: now.toISOString(),
        durationMinutes: durationMinutesSince(log.clockIn),
      },
    })
  }

  await dataConnect.executeGraphql(COMPLETE_WORK_ORDER_MUTATION, {
    variables: { id: workOrderId, completedAt: now.toISOString() },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: callerUid, eventType: 'ORDER_COMPLETED' },
  })

  return { success: true }
})

// Admin shortcut: technicians aren't using the app day-to-day, so requiring
// them to clock in/out and upload final photos before an order can be
// marked COMPLETED just blocks administración from moving the order along.
// Same effect as completeOrder's status/time-log side (skips the photo
// requirement entirely), gated by permission instead of by being the
// assigned technician.
const FORCE_COMPLETABLE_STATUSES = ['ASSIGNED', 'IN_PROGRESS']
exports.forceCompleteOrder = onCall(async (request) => {
  requirePermission(request, 'orders:forcecomplete')

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la orden.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_ORDER_ASSIGNMENTS_QUERY, {
    variables: { workOrderId },
  })
  if (!FORCE_COMPLETABLE_STATUSES.includes(res.data.workOrder?.status)) {
    throw new HttpsError(
      'failed-precondition',
      'La orden debe tener técnicos asignados para completarla directamente.',
    )
  }

  const now = new Date()
  const activeLogsRes = await dataConnect.executeGraphqlRead(GET_ACTIVE_TIME_LOGS_QUERY, {
    variables: { workOrderId },
  })
  for (const log of activeLogsRes.data.timeLogs) {
    await dataConnect.executeGraphql(CLOCK_OUT_MUTATION, {
      variables: {
        timeLogId: log.id,
        clockOut: now.toISOString(),
        durationMinutes: durationMinutesSince(log.clockIn),
      },
    })
  }

  await dataConnect.executeGraphql(COMPLETE_WORK_ORDER_MUTATION, {
    variables: { id: workOrderId, completedAt: now.toISOString() },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: request.auth.uid, eventType: 'ORDER_FORCE_COMPLETED' },
  })

  return { success: true }
})

// Soft-delete (see WorkOrder.deletedAt in schema.gql) - no status
// restriction, any order can be archived out of the default list.
exports.deleteWorkOrder = onCall(async (request) => {
  requirePermission(request, 'orders:delete')

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la orden.')
  }

  await dataConnect.executeGraphql(SET_WORK_ORDER_DELETED_MUTATION, {
    variables: { id: workOrderId, deletedAt: new Date().toISOString() },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: request.auth.uid, eventType: 'ORDER_DELETED' },
  })

  return { success: true }
})

// ---------------------------------------------------------------------------
// Post-completion admin process (Ajustada -> Protocolo de servicio ->
// Facturada) - entirely separate from `status`, which stays COMPLETED
// throughout. Gated behind the dedicated "orders:closing" permission (not
// role/assignment) so it can be granted to whoever actually does this
// bookkeeping without also handing them every other admin capability; the
// client hides all of it (including past tracking entries) from anyone
// without that permission - see OrderDetailPage.tsx.
// ---------------------------------------------------------------------------

const GET_WORK_ORDER_PROCESS_QUERY = `
  query GetWorkOrderProcessAdmin($id: UUID!) {
    workOrder(id: $id) {
      status
      adjustedAt
      serviceProtocolDone
      serviceProtocolAt
      invoicedAt
    }
  }
`
const ADJUST_WORK_ORDER_MUTATION = `
  mutation AdjustWorkOrderAdmin($id: UUID!, $adjustedAt: Timestamp!) {
    workOrder_update(id: $id, data: { adjustedAt: $adjustedAt })
  }
`
const RECORD_SERVICE_PROTOCOL_MUTATION = `
  mutation RecordServiceProtocolAdmin(
    $id: UUID!
    $serviceProtocolDone: Boolean!
    $serviceProtocolAt: Timestamp!
  ) {
    workOrder_update(
      id: $id
      data: { serviceProtocolDone: $serviceProtocolDone, serviceProtocolAt: $serviceProtocolAt }
    )
  }
`
const INVOICE_WORK_ORDER_MUTATION = `
  mutation InvoiceWorkOrderAdmin($id: UUID!, $invoicedAt: Timestamp!) {
    workOrder_update(id: $id, data: { invoicedAt: $invoicedAt })
  }
`

exports.adjustOrder = onCall(async (request) => {
  requirePermission(request, 'orders:closing')

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la orden.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_PROCESS_QUERY, {
    variables: { id: workOrderId },
  })
  const wo = res.data.workOrder
  if (!wo || wo.status !== 'COMPLETED') {
    throw new HttpsError('failed-precondition', 'La orden debe estar completada.')
  }
  if (wo.adjustedAt) {
    throw new HttpsError('failed-precondition', 'La orden ya está marcada como ajustada.')
  }

  const now = new Date().toISOString()
  await dataConnect.executeGraphql(ADJUST_WORK_ORDER_MUTATION, {
    variables: { id: workOrderId, adjustedAt: now },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: request.auth.uid, eventType: 'ORDER_ADJUSTED' },
  })

  return { success: true }
})

exports.recordServiceProtocol = onCall(async (request) => {
  requirePermission(request, 'orders:closing')

  const { workOrderId, done } = request.data ?? {}
  if (typeof workOrderId !== 'string' || typeof done !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_PROCESS_QUERY, {
    variables: { id: workOrderId },
  })
  const wo = res.data.workOrder
  if (!wo || !wo.adjustedAt) {
    throw new HttpsError('failed-precondition', 'La orden debe estar ajustada primero.')
  }
  if (wo.serviceProtocolAt) {
    throw new HttpsError('failed-precondition', 'El protocolo de servicio ya está registrado.')
  }

  const now = new Date().toISOString()
  await dataConnect.executeGraphql(RECORD_SERVICE_PROTOCOL_MUTATION, {
    variables: { id: workOrderId, serviceProtocolDone: done, serviceProtocolAt: now },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: request.auth.uid, eventType: 'SERVICE_PROTOCOL_RECORDED', metadata: { done } },
  })

  return { success: true }
})

exports.invoiceOrder = onCall(async (request) => {
  requirePermission(request, 'orders:closing')

  const { workOrderId } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la orden.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_PROCESS_QUERY, {
    variables: { id: workOrderId },
  })
  const wo = res.data.workOrder
  if (!wo || !wo.serviceProtocolAt) {
    throw new HttpsError('failed-precondition', 'El protocolo de servicio debe estar registrado primero.')
  }
  if (wo.invoicedAt) {
    throw new HttpsError('failed-precondition', 'La orden ya está marcada como facturada.')
  }

  const now = new Date().toISOString()
  await dataConnect.executeGraphql(INVOICE_WORK_ORDER_MUTATION, {
    variables: { id: workOrderId, invoicedAt: now },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: { workOrderId, actorId: request.auth.uid, eventType: 'ORDER_INVOICED' },
  })

  return { success: true }
})

// ---------------------------------------------------------------------------
// Undoing those three steps. Separate permission from "orders:closing": being
// the person who records the process day to day isn't the same as being able
// to rewrite it afterwards. Only the last recorded step can be undone, which
// keeps the three fields in a state the forward path could have produced (no
// "facturada pero sin ajustar"), and every undo is logged with its actor - a
// reverted step leaves a trail in the historial rather than disappearing.
// ---------------------------------------------------------------------------

const REVERT_ADJUST_MUTATION = `
  mutation RevertAdjustAdmin($id: UUID!) {
    workOrder_update(id: $id, data: { adjustedAt: null })
  }
`
const REVERT_SERVICE_PROTOCOL_MUTATION = `
  mutation RevertServiceProtocolAdmin($id: UUID!) {
    workOrder_update(id: $id, data: { serviceProtocolDone: null, serviceProtocolAt: null })
  }
`
const REVERT_INVOICE_MUTATION = `
  mutation RevertInvoiceAdmin($id: UUID!) {
    workOrder_update(id: $id, data: { invoicedAt: null })
  }
`

const REVERTIBLE_STEPS = {
  adjust: {
    mutation: REVERT_ADJUST_MUTATION,
    eventType: 'ORDER_ADJUST_REVERTED',
    notRecorded: 'La orden no está marcada como ajustada.',
    blockedBy: (wo) =>
      wo.serviceProtocolAt ? 'Revierte antes el protocolo de servicio.' : null,
    isRecorded: (wo) => !!wo.adjustedAt,
  },
  protocol: {
    mutation: REVERT_SERVICE_PROTOCOL_MUTATION,
    eventType: 'SERVICE_PROTOCOL_REVERTED',
    notRecorded: 'El protocolo de servicio no está registrado.',
    blockedBy: (wo) => (wo.invoicedAt ? 'Revierte antes la facturación.' : null),
    isRecorded: (wo) => !!wo.serviceProtocolAt,
    metadata: (wo) => ({ previousDone: wo.serviceProtocolDone }),
  },
  invoice: {
    mutation: REVERT_INVOICE_MUTATION,
    eventType: 'ORDER_INVOICE_REVERTED',
    notRecorded: 'La orden no está marcada como facturada.',
    blockedBy: () => null,
    isRecorded: (wo) => !!wo.invoicedAt,
  },
}

exports.revertAdminProcessStep = onCall(async (request) => {
  requirePermission(request, 'admin:reopen')

  const { workOrderId, step } = request.data ?? {}
  if (typeof workOrderId !== 'string' || !Object.hasOwn(REVERTIBLE_STEPS, step)) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  const spec = REVERTIBLE_STEPS[step]

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_PROCESS_QUERY, {
    variables: { id: workOrderId },
  })
  const wo = res.data.workOrder
  if (!wo) {
    throw new HttpsError('not-found', 'La orden no existe.')
  }
  if (!spec.isRecorded(wo)) {
    throw new HttpsError('failed-precondition', spec.notRecorded)
  }
  const blocked = spec.blockedBy(wo)
  if (blocked) {
    throw new HttpsError('failed-precondition', blocked)
  }

  await dataConnect.executeGraphql(spec.mutation, { variables: { id: workOrderId } })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: request.auth.uid,
      eventType: spec.eventType,
      metadata: spec.metadata ? spec.metadata(wo) : null,
    },
  })

  return { success: true }
})

// The order's number in the company's separate internal management system -
// free text, filled in (and editable later) by an admin, unlike the process
// steps above this isn't hidden from anyone; it's just admin-only to write.
const SET_WORK_ORDER_EXTERNAL_CODE_MUTATION = `
  mutation SetWorkOrderExternalCodeAdmin($id: UUID!, $externalCode: String) {
    workOrder_update(id: $id, data: { externalCode: $externalCode })
  }
`

exports.setWorkOrderExternalCode = onCall(async (request) => {
  requireAdminOrLab(request)

  const { workOrderId, externalCode } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la orden.')
  }
  const trimmed = typeof externalCode === 'string' ? externalCode.trim() : ''

  await dataConnect.executeGraphql(SET_WORK_ORDER_EXTERNAL_CODE_MUTATION, {
    variables: { id: workOrderId, externalCode: trimmed || null },
  })
  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: request.auth.uid,
      eventType: 'EXTERNAL_CODE_UPDATED',
      metadata: { externalCode: trimmed || null },
    },
  })

  return { success: true }
})

// Requires any active (non-unassigned) assignment - matches the client's
// `!!myAssignment` check (technicians without isAllowed/isLead can still
// report incidents, just not start/complete the order).
exports.reportIncident = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { workOrderId, description, photos } = request.data ?? {}
  if (typeof workOrderId !== 'string' || typeof description !== 'string' || !description.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const callerUid = request.auth.uid
  const assignment = await getMyAssignment(workOrderId, callerUid)
  if (!assignment) {
    throw new HttpsError('permission-denied', 'No estás asignado a esta orden.')
  }

  const incidentRes = await dataConnect.executeGraphql(CREATE_INCIDENT_MUTATION, {
    variables: { workOrderId, reportedById: callerUid, description: description.trim() },
  })
  const incidentId = incidentRes.data.incident_insert.id

  for (const photo of photos ?? []) {
    await dataConnect.executeGraphql(CREATE_WORK_ORDER_PHOTO_MUTATION, {
      variables: {
        workOrderId,
        stage: 'INCIDENT',
        storageUrl: photo.url,
        mediaType: photo.mediaType,
        uploadedById: callerUid,
        incidentId,
      },
    })
  }

  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: callerUid,
      eventType: 'INCIDENT_REPORTED',
      metadata: { description: description.trim() },
    },
  })
  if (photos?.length > 0) {
    await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
      variables: {
        workOrderId,
        actorId: callerUid,
        eventType: 'PHOTO_UPLOADED',
        metadata: { stage: 'INCIDENT', count: photos.length },
      },
    })
  }

  return { incidentId }
})

// Gated by the "orders:notes" permission (not assignment/role) since these
// are internal notes about the order, not part of doing the actual work -
// who should read/write them is a separate concern from who's assigned.
exports.addOrderNote = onCall(async (request) => {
  requirePermission(request, 'orders:notes')

  const { workOrderId, body } = request.data ?? {}
  if (typeof workOrderId !== 'string' || typeof body !== 'string' || !body.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const res = await dataConnect.executeGraphql(CREATE_ORDER_NOTE_MUTATION, {
    variables: { workOrderId, authorId: request.auth.uid, body: body.trim() },
  })
  return { noteId: res.data.orderNote_insert.id }
})

const GET_TASK_FOR_TOGGLE_QUERY = `
  query GetTaskForToggleAdmin($taskId: UUID!) {
    workOrderTask(id: $taskId) {
      workOrderId
      workOrder {
        status
      }
    }
  }
`
const UPDATE_WORK_ORDER_TASK_MUTATION = `
  mutation UpdateWorkOrderTaskAdmin($id: UUID!, $isCompleted: Boolean!) {
    workOrderTask_update(id: $id, data: { isCompleted: $isCompleted })
  }
`

// Any technician actually assigned to the order can check off a task (not
// just isAllowed/isLead, unlike starting/completing the order) - this is
// just progress tracking, not a lifecycle transition. Only while the order
// is IN_PROGRESS: checking things off before work has started or after the
// order is already COMPLETED wouldn't mean anything. Not logged to
// OrderTracking, same reasoning as clock in/out - would get noisy fast with
// several tasks toggled back and forth, and workOrderTask.isCompleted is
// itself the authoritative record.
exports.toggleWorkOrderTask = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { taskId, isCompleted } = request.data ?? {}
  if (typeof taskId !== 'string' || typeof isCompleted !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const taskRes = await dataConnect.executeGraphqlRead(GET_TASK_FOR_TOGGLE_QUERY, {
    variables: { taskId },
  })
  const task = taskRes.data.workOrderTask
  if (!task) {
    throw new HttpsError('not-found', 'La tarea no existe.')
  }
  if (task.workOrder.status !== 'IN_PROGRESS') {
    throw new HttpsError(
      'failed-precondition',
      'Solo se pueden marcar tareas mientras la orden está en progreso.',
    )
  }

  const assignment = await getMyAssignment(task.workOrderId, request.auth.uid)
  if (!assignment) {
    throw new HttpsError('permission-denied', 'No estás asignado a esta orden.')
  }

  await dataConnect.executeGraphql(UPDATE_WORK_ORDER_TASK_MUTATION, {
    variables: { id: taskId, isCompleted },
  })
  return { success: true }
})

// Correcting the list of jobs after the order exists - people do get them
// wrong, and recreating the whole order to fix a description is worse than
// editing one. Tasks are matched by id rather than replaced wholesale so a
// task the technician already ticked keeps its isCompleted; only the ones
// actually dropped from the list are deleted. Gated on "orders:create" -
// the same people who typed them in the first place - and logged, since this
// rewrites what the order says it's for.
const GET_WORK_ORDER_TASKS_QUERY = `
  query GetWorkOrderTasksAdmin($workOrderId: UUID!) {
    workOrder(id: $workOrderId) {
      code
      status
      locationCode
      assetLocation
      description
      createdAt
      finalReportUrl
      customer {
        name
        contactName
        phone
      }
      boat {
        name
        registrationNumber
        engines: engines_on_boat {
          engineType
          chassisNumber
          propellerSerialNumber
        }
      }
      tasks: workOrderTasks_on_workOrder(orderBy: { createdAt: ASC }) {
        id
        description
        isCompleted
      }
    }
  }
`
const ORDER_LOCATION_LABEL = {
  ALGECIRAS: 'Algeciras',
  LA_LINEA: 'La Línea',
  SOTOGRANDE: 'Sotogrande',
}
const UPDATE_WORK_ORDER_TASK_DESCRIPTION_MUTATION = `
  mutation UpdateWorkOrderTaskDescriptionAdmin($id: UUID!, $description: String!) {
    workOrderTask_update(id: $id, data: { description: $description })
  }
`
const DELETE_WORK_ORDER_TASK_MUTATION = `
  mutation DeleteWorkOrderTaskAdmin($id: UUID!) {
    workOrderTask_delete(id: $id)
  }
`

const TASK_EDITABLE_STATUSES = [
  'PENDING_QUOTE',
  'QUOTE_REJECTED',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'IN_PROGRESS',
]

exports.updateWorkOrderTasks = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const callerPermissions = Array.isArray(request.auth.token?.permissions)
    ? request.auth.token.permissions
    : []
  if (!callerPermissions.includes('orders:create') && !callerPermissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para editar los trabajos.')
  }

  const { workOrderId, tasks } = request.data ?? {}
  if (typeof workOrderId !== 'string' || !Array.isArray(tasks)) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  const incoming = tasks
    .map((task) => ({
      id: typeof task?.id === 'string' ? task.id : null,
      description: typeof task?.description === 'string' ? task.description.trim() : '',
    }))
    .filter((task) => task.description)
  if (incoming.length === 0) {
    throw new HttpsError('invalid-argument', 'La orden necesita al menos un trabajo.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_TASKS_QUERY, {
    variables: { workOrderId },
  })
  const workOrder = res.data.workOrder
  if (!workOrder) {
    throw new HttpsError('not-found', 'La orden no existe.')
  }
  if (!TASK_EDITABLE_STATUSES.includes(workOrder.status)) {
    throw new HttpsError(
      'failed-precondition',
      'No se pueden editar los trabajos de una orden completada o cancelada.',
    )
  }

  const existingById = new Map(workOrder.tasks.map((task) => [task.id, task]))
  const keptIds = new Set()
  const added = []
  const renamed = []

  for (const task of incoming) {
    const existing = task.id ? existingById.get(task.id) : null
    if (!existing) {
      await dataConnect.executeGraphql(CREATE_WORK_ORDER_TASK_MUTATION, {
        variables: { workOrderId, description: task.description },
      })
      added.push(task.description)
      continue
    }
    keptIds.add(existing.id)
    if (existing.description !== task.description) {
      await dataConnect.executeGraphql(UPDATE_WORK_ORDER_TASK_DESCRIPTION_MUTATION, {
        variables: { id: existing.id, description: task.description },
      })
      renamed.push({ from: existing.description, to: task.description })
    }
  }

  const removed = []
  for (const existing of workOrder.tasks) {
    if (keptIds.has(existing.id)) continue
    await dataConnect.executeGraphql(DELETE_WORK_ORDER_TASK_MUTATION, {
      variables: { id: existing.id },
    })
    removed.push({ description: existing.description, wasCompleted: existing.isCompleted })
  }

  if (added.length === 0 && removed.length === 0 && renamed.length === 0) {
    return { success: true, changed: false }
  }

  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId,
      actorId: request.auth.uid,
      eventType: 'ORDER_TASKS_UPDATED',
      metadata: { added, removed, renamed },
    },
  })

  // The order's PDF is rendered once, when the order is created (see
  // createWorkOrder), and lists the jobs - so editing them leaves it saying
  // something the order no longer says. Re-render it from the stored data,
  // reading the tasks back rather than reusing the request's list so the PDF
  // and the app show them in the same order. Same storage path, but the
  // download token is new, so finalReportUrl has to be rewritten too.
  let finalReportUrl = workOrder.finalReportUrl ?? null
  if (finalReportUrl) {
    const after = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_TASKS_QUERY, {
      variables: { workOrderId },
    })
    const wo = after.data.workOrder
    const buffer = await renderWorkOrderPdfBuffer({
      code: wo.code,
      locationLabel: ORDER_LOCATION_LABEL[wo.locationCode] ?? wo.locationCode,
      createdAt: new Date(wo.createdAt),
      customerName: wo.customer.name,
      contactName: wo.customer.contactName,
      phone: wo.customer.phone,
      boatName: wo.boat.name,
      registrationNumber: wo.boat.registrationNumber ?? undefined,
      assetLocation: wo.assetLocation,
      engines: wo.boat.engines,
      tasks: wo.tasks.map((task) => task.description),
      comments: wo.description || undefined,
    })
    finalReportUrl = await uploadPdfAndGetDownloadUrl(
      `work-orders/${wo.code}/informe.pdf`,
      buffer,
    )
    await dataConnect.executeGraphql(SET_WORK_ORDER_REPORT_URL_MUTATION, {
      variables: { id: workOrderId, finalReportUrl },
    })
  }

  return { success: true, changed: true, finalReportUrl }
})

// Individual clock in/out isn't logged to OrderTracking (see
// OrderDetailPage's comment on the client side) - the TimeLog table is the
// authoritative record. The "already working elsewhere, switch shifts?"
// confirmation is still a client-side UX concern (it needs to ask the user
// before acting), but the actual clock-out-then-clock-in is now one call
// instead of two, and reads the caller's active log fresh rather than
// trusting the client's possibly-stale copy.
exports.startWorking = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const { workOrderId, clockIn: clientClockIn } = request.data ?? {}
  if (typeof workOrderId !== 'string') {
    throw new HttpsError('invalid-argument', 'workOrderId es obligatorio.')
  }
  // Only the offline queue sends a time; a live clock-in is stamped here.
  const recordedOffline = clientClockIn !== undefined && clientClockIn !== null
  const clockIn = recordedOffline
    ? clientTimestamp(clientClockIn, 'La hora de entrada')
    : new Date()

  const callerUid = request.auth.uid

  // Same technician, same order, same instant: the queue is replaying an
  // action that already went through, not opening a second shift.
  const existingRes = await dataConnect.executeGraphqlRead(GET_TIME_LOG_AT_QUERY, {
    variables: {
      technicianId: callerUid,
      workOrderId,
      clockIn: clockIn.toISOString(),
    },
  })
  if (existingRes.data.timeLogs.length > 0) {
    return { skipped: true }
  }

  const activeRes = await dataConnect.executeGraphqlRead(GET_MY_ACTIVE_TIME_LOG_QUERY, {
    variables: { technicianId: callerUid },
  })
  const active = pickActiveTimeLog(activeRes.data.timeLogs)
  if (active) {
    // The open shift ends where this one starts, not "now": a shift replayed
    // late must not swallow the hours in between.
    const previousEnd = new Date(Math.max(clockIn.getTime(), new Date(active.clockIn).getTime()))
    await dataConnect.executeGraphql(CLOCK_OUT_MUTATION, {
      variables: {
        timeLogId: active.id,
        clockOut: previousEnd.toISOString(),
        durationMinutes: minutesBetween(active.clockIn, previousEnd),
      },
    })
  }
  await dataConnect.executeGraphql(CLOCK_IN_MUTATION, {
    variables: {
      workOrderId,
      technicianId: callerUid,
      clockIn: clockIn.toISOString(),
      recordedOffline,
    },
  })

  // Best-effort "turno activo" push so a technician who isn't watching the
  // app still gets reminded which order they're clocked into (in-app, this
  // is covered instead by ActiveShiftBanner). Re-sent on every switch with
  // the same per-technician tag, so it replaces rather than stacks; also
  // re-sent unchanged by the notifyActiveShifts scheduled job below.
  const orderRes = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_CODE_QUERY, {
    variables: { id: workOrderId },
  })
  const code = orderRes.data.workOrder?.code
  if (code) {
    await sendToUsers([callerUid], {
      title: 'Turno activo',
      body: `Estás trabajando en la orden ${code}`,
      data: { orderId: workOrderId, tag: activeShiftTag(callerUid) },
    }).catch(() => {})
  }

  return { switchedFrom: active?.workOrderId ?? null }
})

exports.stopWorking = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { clockOut: clientClockOut } = request.data ?? {}
  const recordedOffline = clientClockOut !== undefined && clientClockOut !== null
  const clockOut = recordedOffline
    ? clientTimestamp(clientClockOut, 'La hora de salida')
    : new Date()

  const callerUid = request.auth.uid
  const activeRes = await dataConnect.executeGraphqlRead(GET_MY_ACTIVE_TIME_LOG_QUERY, {
    variables: { technicianId: callerUid },
  })
  const active = pickActiveTimeLog(activeRes.data.timeLogs)
  if (!active) {
    // Replaying a clock-out whose shift is already closed is not a failure -
    // it usually means the queue sent it twice. Pressed live, it still is.
    if (recordedOffline) {
      return { skipped: true }
    }
    throw new HttpsError('failed-precondition', 'No tienes ningún turno activo.')
  }

  // A phone clock running behind could close a shift before it started.
  const end = new Date(Math.max(clockOut.getTime(), new Date(active.clockIn).getTime()))
  await dataConnect.executeGraphql(
    recordedOffline ? CLOCK_OUT_OFFLINE_MUTATION : CLOCK_OUT_MUTATION,
    {
      variables: {
        timeLogId: active.id,
        clockOut: end.toISOString(),
        durationMinutes: minutesBetween(active.clockIn, end),
      },
    },
  )

  // Data-only message (no `notification` field) - the service worker
  // recognizes action: 'close' and closes the matching-tag notification
  // instead of showing a new one (see firebase-messaging-sw.js).
  await sendToUsers([callerUid], {
    data: { tag: activeShiftTag(callerUid), action: 'close' },
  }).catch(() => {})

  return { success: true }
})

const GET_TIME_LOG_FOR_EDIT_QUERY = `
  query GetTimeLogForEditAdmin($timeLogId: UUID!) {
    timeLog(id: $timeLogId) {
      workOrderId
      technicianId
      clockIn
      clockOut
      durationMinutes
      workOrder {
        status
      }
    }
  }
`
const UPDATE_TIME_LOG_MUTATION = `
  mutation UpdateTimeLogAdmin($id: UUID!, $clockIn: Timestamp!, $clockOut: Timestamp!, $durationMinutes: Int!) {
    timeLog_update(
      id: $id
      data: { clockIn: $clockIn, clockOut: $clockOut, durationMinutes: $durationMinutes }
    )
  }
`
const DELETE_TIME_LOG_MUTATION = `
  mutation DeleteTimeLogAdmin($id: UUID!) {
    timeLog_delete(id: $id)
  }
`

// Lets an admin correct a technician's already-finished shift (they forgot
// to clock out, left it running overnight, etc.), and close one left open on
// an order that is already finished; an active/ongoing shift should go
// through the real clock-out flow, not this correction path.
// Logged to OrderTracking (unlike the routine clock in/out itself) since
// this is a correction of what's meant to be the authoritative hours
// record, not routine noise.
exports.adminUpdateTimeLog = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { timeLogId, clockIn, clockOut } = request.data ?? {}
  if (typeof timeLogId !== 'string' || typeof clockIn !== 'string' || typeof clockOut !== 'string') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  const clockInDate = new Date(clockIn)
  const clockOutDate = new Date(clockOut)
  if (Number.isNaN(clockInDate.getTime()) || Number.isNaN(clockOutDate.getTime())) {
    throw new HttpsError('invalid-argument', 'Fechas inválidas.')
  }
  if (clockOutDate.getTime() <= clockInDate.getTime()) {
    throw new HttpsError('invalid-argument', 'La hora de salida debe ser posterior a la de entrada.')
  }

  const timeLogRes = await dataConnect.executeGraphqlRead(GET_TIME_LOG_FOR_EDIT_QUERY, {
    variables: { timeLogId },
  })
  const timeLog = timeLogRes.data.timeLog
  if (!timeLog) {
    throw new HttpsError('not-found', 'El turno no existe.')
  }
  // An open shift can be corrected only once its order is finished, which
  // means it is a leftover with no clock-out (see pickActiveTimeLog) - a
  // technician's ongoing shift still has to go through the real clock-out.
  if (!timeLog.clockOut && !CLOSED_ORDER_STATUSES.includes(timeLog.workOrder.status)) {
    throw new HttpsError('failed-precondition', 'No se puede editar un turno en curso.')
  }

  const durationMinutes = Math.round((clockOutDate.getTime() - clockInDate.getTime()) / 60000)
  await dataConnect.executeGraphql(UPDATE_TIME_LOG_MUTATION, {
    variables: {
      id: timeLogId,
      clockIn: clockInDate.toISOString(),
      clockOut: clockOutDate.toISOString(),
      durationMinutes,
    },
  })

  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId: timeLog.workOrderId,
      actorId: request.auth.uid,
      eventType: 'TIME_LOG_EDITED',
      metadata: {
        technicianId: timeLog.technicianId,
        clockIn: clockInDate.toISOString(),
        clockOut: clockOutDate.toISOString(),
        durationMinutes,
      },
    },
  })

  return { durationMinutes }
})

// Lets an admin remove a shift entirely (duplicate clock-in, test entry,
// etc.) - same scope as adminUpdateTimeLog, for the same reason (an active
// shift should be stopped via the real clock-out flow, not deleted out from
// under the technician). The shift's own data is captured in the audit
// metadata since the row itself won't exist afterwards to look it up from.
exports.adminDeleteTimeLog = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { timeLogId } = request.data ?? {}
  if (typeof timeLogId !== 'string') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const timeLogRes = await dataConnect.executeGraphqlRead(GET_TIME_LOG_FOR_EDIT_QUERY, {
    variables: { timeLogId },
  })
  const timeLog = timeLogRes.data.timeLog
  if (!timeLog) {
    throw new HttpsError('not-found', 'El turno no existe.')
  }
  if (!timeLog.clockOut && !CLOSED_ORDER_STATUSES.includes(timeLog.workOrder.status)) {
    throw new HttpsError('failed-precondition', 'No se puede eliminar un turno en curso.')
  }

  await dataConnect.executeGraphql(DELETE_TIME_LOG_MUTATION, { variables: { id: timeLogId } })

  await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
    variables: {
      workOrderId: timeLog.workOrderId,
      actorId: request.auth.uid,
      eventType: 'TIME_LOG_DELETED',
      metadata: {
        technicianId: timeLog.technicianId,
        clockIn: timeLog.clockIn,
        clockOut: timeLog.clockOut,
        durationMinutes: timeLog.durationMinutes,
      },
    },
  })

  return { success: true }
})

// Same fields for both ways into the hours log (a range of days, or one
// order), so the page groups them the same way whichever was asked for.
const HOURS_LOG_TIME_LOG_FIELDS = `
  id
  clockIn
  clockOut
  durationMinutes
  recordedOffline
  technicianId
  technician {
    displayName
  }
  workOrder {
    id
    code
    externalCode
    deletedAt
    boat {
      name
    }
  }
`
const LIST_TIME_LOGS_IN_RANGE_QUERY = `
  query ListTimeLogsInRangeAdmin($from: Timestamp!, $to: Timestamp!) {
    timeLogs(where: { clockIn: { ge: $from, lt: $to } }, orderBy: { clockIn: ASC }, limit: 5000) {
      ${HOURS_LOG_TIME_LOG_FIELDS}
    }
  }
`
const LIST_ORDER_TIME_LOGS_QUERY = `
  query ListOrderTimeLogsAdmin($code: String!) {
    workOrders(where: { code: { eq: $code } }, limit: 1) {
      id
      code
      externalCode
      timeLogs: timeLogs_on_workOrder(orderBy: { clockIn: ASC }, limit: 2000) {
        ${HOURS_LOG_TIME_LOG_FIELDS}
      }
    }
  }
`
const LIST_TECHNICIANS_TIME_LOGS_IN_RANGE_QUERY = `
  query ListTechniciansTimeLogsInRangeAdmin($technicianIds: [String!]!, $from: Timestamp!, $to: Timestamp!) {
    timeLogs(
      where: { technicianId: { in: $technicianIds }, clockIn: { ge: $from, le: $to } }
      orderBy: { clockIn: ASC }
      limit: 5000
    ) {
      id
      technicianId
      clockIn
      clockOut
    }
  }
`
const LIST_ACTIVE_USERS_WITH_PERMISSIONS_QUERY = `
  query ListActiveUsersWithPermissionsAdmin {
    users(where: { isActive: { eq: true } }, orderBy: { displayName: ASC }, limit: 1000) {
      id
      displayName
      userPermissions: userPermissions_on_user {
        permission {
          key
        }
      }
    }
  }
`

// A range this long already means thousands of shifts on one page; past it
// the page stops being readable long before the query gets slow.
const HOURS_LOG_MAX_DAYS = 93

// Every technician's shifts, either between two instants or for one order -
// what the "Registro de horas" page shows and its PDF prints.
async function loadHoursLog({ from, to, orderCode }) {
  let order = null
  let timeLogs
  if (typeof orderCode === 'string' && orderCode.trim()) {
    const code = orderCode.trim().toUpperCase()
    const res = await dataConnect.executeGraphqlRead(LIST_ORDER_TIME_LOGS_QUERY, { variables: { code } })
    const found = res.data.workOrders[0]
    if (!found) {
      throw new HttpsError('not-found', `No existe ninguna orden con el código ${code}.`)
    }
    order = { id: found.id, code: found.code, externalCode: found.externalCode ?? null }
    timeLogs = found.timeLogs
  } else {
    const fromDate = new Date(from)
    const toDate = new Date(to)
    if (typeof from !== 'string' || typeof to !== 'string' || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new HttpsError('invalid-argument', 'Fechas no válidas.')
    }
    if (toDate.getTime() <= fromDate.getTime()) {
      throw new HttpsError('invalid-argument', 'La fecha final es anterior a la inicial.')
    }
    // A day of slack for the hour lost or gained at a DST change.
    if (toDate.getTime() - fromDate.getTime() > (HOURS_LOG_MAX_DAYS + 1) * 24 * 60 * 60 * 1000) {
      throw new HttpsError('invalid-argument', `Elige como mucho ${HOURS_LOG_MAX_DAYS} días.`)
    }
    const res = await dataConnect.executeGraphqlRead(LIST_TIME_LOGS_IN_RANGE_QUERY, {
      variables: { from: fromDate.toISOString(), to: toDate.toISOString() },
    })
    timeLogs = res.data.timeLogs
  }

  const usersRes = await dataConnect.executeGraphqlRead(LIST_ACTIVE_USERS_WITH_PERMISSIONS_QUERY, {})
  const technicians = usersRes.data.users
    .filter((user) => user.userPermissions.some((up) => up.permission.key === 'orders:assignable'))
    .map((user) => ({ id: user.id, displayName: user.displayName }))

  return {
    technicians,
    order,
    timeLogs: timeLogs.map((log) => ({
      id: log.id,
      clockIn: log.clockIn,
      clockOut: log.clockOut,
      durationMinutes: log.durationMinutes,
      recordedOffline: log.recordedOffline,
      technicianId: log.technicianId,
      technicianName: log.technician.displayName,
      workOrder: {
        id: log.workOrder.id,
        code: log.workOrder.code,
        externalCode: log.workOrder.externalCode ?? null,
        boatName: log.workOrder.boat?.name ?? null,
        deleted: !!log.workOrder.deletedAt,
      },
    })),
  }
}

// One order's log doesn't include what its technicians did on other orders,
// but the PDF's rounding needs it: a shift that follows another one starts
// where that one's rounded end is (see roundShiftsForReport in
// hoursLogPdf.js). Without this, the same shift would print five minutes
// longer in the order's PDF than in the day's.
async function loadNeighbourShifts(timeLogs) {
  if (timeLogs.length === 0) return []
  const clockIns = timeLogs.map((log) => new Date(log.clockIn).getTime())
  const res = await dataConnect.executeGraphqlRead(LIST_TECHNICIANS_TIME_LOGS_IN_RANGE_QUERY, {
    variables: {
      technicianIds: [...new Set(timeLogs.map((log) => log.technicianId))],
      // A day back is plenty: only the shift ended minutes before matters.
      from: new Date(Math.min(...clockIns) - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(Math.max(...clockIns)).toISOString(),
    },
  })
  return res.data.timeLogs
}

// Backs the "Registro de horas" page. The day boundaries come from the
// browser (local midnight as ISO) because the office reads days in Spanish
// time, and the server's clock is UTC. Everyone's hours, so it's gated on the
// server too, not only by hiding the button, behind its own permission.
exports.listTimeLogs = onCall(async (request) => {
  requirePermission(request, 'admin:hourslog')
  const { from, to, orderCode } = request.data ?? {}
  return loadHoursLog({ from, to, orderCode })
})

// The page's "Descargar PDF": the same selection it has on screen, re-read
// here rather than sent from the browser, so the report is always built from
// the database. Days arrive as "YYYY-MM-DD" and are turned into Madrid
// midnights here (hoursLogPdf.js), the same way the daily e-mail will pick
// "yesterday" - the browser's clock plays no part in what a day is.
exports.exportTimeLogsPdf = onCall(async (request) => {
  requirePermission(request, 'admin:hourslog')

  const { fromDay, toDay, orderCode, technicianId } = request.data ?? {}
  if (technicianId !== undefined && technicianId !== null && typeof technicianId !== 'string') {
    throw new HttpsError('invalid-argument', 'Técnico no válido.')
  }

  let log
  let dayKeys = null
  let neighbourLogs = []
  if (typeof orderCode === 'string' && orderCode.trim()) {
    log = await loadHoursLog({ orderCode })
    neighbourLogs = await loadNeighbourShifts(log.timeLogs)
  } else {
    const dayPattern = /^\d{4}-\d{2}-\d{2}$/
    if (!dayPattern.test(fromDay ?? '') || !dayPattern.test(toDay ?? '') || toDay < fromDay) {
      throw new HttpsError('invalid-argument', 'Fechas no válidas.')
    }
    log = await loadHoursLog({
      from: madridMidnight(fromDay).toISOString(),
      to: madridMidnight(addDaysToKey(toDay, 1)).toISOString(),
    })
    dayKeys = []
    for (let day = fromDay; day <= toDay; day = addDaysToKey(day, 1)) dayKeys.push(day)
  }

  const technicianName = technicianId
    ? (log.technicians.find((t) => t.id === technicianId)?.displayName ??
      log.timeLogs.find((s) => s.technicianId === technicianId)?.technicianName ??
      null)
    : null

  const buffer = await renderHoursLogPdfBuffer({
    ...log,
    neighbourLogs,
    dayKeys,
    technicianId: technicianId || null,
    technicianName,
    orderCode: log.order?.code ?? null,
    orderExternalCode: log.order?.externalCode ?? null,
    generatedAt: new Date(),
  })
  return { pdfBase64: buffer.toString('base64') }
})

// The workshop's own mail server; the password lives in Secret Manager
// (firebase functions:secrets:set SMTP_PASSWORD), never in the code.
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD')
const HOURS_LOG_MAIL = {
  host: 'eliasblanco.com',
  port: 465,
  from: 'portal@eliasblanco.com',
  to: ['alejandro.segura@eliasblanco.com', 'andres@eliasblanco.com'],
}

// Every morning, the day before's hours to the office, as the same PDF the
// "Registro de horas" page prints. 05:00 because nobody is on a shift then,
// so the day is closed - and a shift still open at that hour is a forgotten
// clock-out, which the e-mail points out. Sent on days without shifts too:
// an e-mail that only comes on working days can't tell "nobody worked" from
// "the job broke".
exports.sendDailyHoursLog = onSchedule(
  { schedule: '0 5 * * *', timeZone: 'Europe/Madrid', secrets: [SMTP_PASSWORD], retryCount: 2 },
  async () => {
    // Yesterday in Madrid, whatever the server's UTC clock says.
    const day = addDaysToKey(madridDayKey(new Date()), -1)
    const log = await loadHoursLog({
      from: madridMidnight(day).toISOString(),
      to: madridMidnight(addDaysToKey(day, 1)).toISOString(),
    })
    const pdf = await renderHoursLogPdfBuffer({
      ...log,
      dayKeys: [day],
      technicianId: null,
      technicianName: null,
      orderCode: null,
      generatedAt: new Date(),
    })

    const [summary] = buildDays({ ...log, dayKeys: [day], technicianId: null })
    const heading = formatDayHeading(day)
    const openShifts = log.timeLogs.filter((shift) => !shift.clockOut).length
    const lines =
      summary.shiftCount === 0
        ? [`${heading}: nadie fichó.`]
        : [
            `${heading}: ${summary.shiftCount} ${summary.shiftCount === 1 ? 'turno' : 'turnos'}, ${formatMinutes(summary.minutes)} en total.`,
            '',
            ...summary.worked.map((t) => `- ${t.name}: ${formatMinutes(closedMinutes(t.shifts))}`),
          ]
    if (openShifts > 0) {
      lines.push(
        '',
        `Atención: ${openShifts} ${openShifts === 1 ? 'turno sigue abierto' : 'turnos siguen abiertos'} a las 5 de la mañana. Probablemente alguien olvidó fichar la salida; sus horas no cuentan en el total hasta que se cierre.`,
      )
    }
    lines.push('', 'El detalle de cada turno va en el PDF adjunto.', '', 'PortalEB')

    const transporter = nodemailer.createTransport({
      host: HOURS_LOG_MAIL.host,
      port: HOURS_LOG_MAIL.port,
      secure: true,
      auth: { user: HOURS_LOG_MAIL.from, pass: SMTP_PASSWORD.value() },
    })
    await transporter.sendMail({
      from: `"PortalEB" <${HOURS_LOG_MAIL.from}>`,
      to: HOURS_LOG_MAIL.to.join(', '),
      subject: `Registro de horas · ${heading}`,
      text: lines.join('\n'),
      attachments: [{ filename: `registro-horas-${day}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })
    console.log(`Registro de horas del ${day} enviado a ${HOURS_LOG_MAIL.to.join(', ')}: ${summary.shiftCount} turnos.`)
  },
)

// ---------------------------------------------------------------------------
// Workshop orders: one per location and month, for work done in the workshop
// itself (see WorkOrder.workshopMonth in schema.gql). Nobody creates them by
// hand - syncWorkshopOrders below does, and keeps them in step every night.
// ---------------------------------------------------------------------------

// The customer every workshop order hangs from. WorkOrder needs a customer
// and a boat, and the workshop is neither, so there's one of each made for
// it (a "boat" per location: its name is what the hours log prints next to
// the order's code).
const WORKSHOP_CUSTOMER_NAME = 'Taller Elías Blanco'
const WORKSHOP_LOCATION_LABEL = { ALGECIRAS: 'Algeciras', LA_LINEA: 'La Línea', SOTOGRANDE: 'Sotogrande' }

function workshopOrderCode(locationCode, month) {
  return `TALLER-${ORDER_CODE_PREFIX[locationCode]}-${month}`
}

const GET_WORKSHOP_ORDER_QUERY = `
  query GetWorkshopOrderAdmin($code: String!) {
    workOrders(where: { code: { eq: $code } }, limit: 1) {
      id
      assignments: technicianAssignments_on_workOrder(limit: 1000) {
        technicianId
      }
    }
  }
`
const LIST_OPEN_WORKSHOP_ORDERS_QUERY = `
  query ListOpenWorkshopOrdersAdmin {
    workOrders(where: { workshopMonth: { isNull: false }, status: { eq: IN_PROGRESS } }, limit: 500) {
      id
      code
      workshopMonth
    }
  }
`
// Stands in as the author of what the system does on its own: createdById and
// assignedById need a real user, and the oldest active admin is as close to
// "the system" as there is - and doesn't change from one night to the next.
const GET_SYSTEM_ACTOR_QUERY = `
  query GetSystemActorAdmin {
    users(where: { role: { eq: ADMIN }, isActive: { eq: true } }, orderBy: { createdAt: ASC }, limit: 1) {
      id
    }
  }
`
const FIND_CUSTOMER_BY_NAME_QUERY = `
  query FindCustomerByNameAdmin($name: String!) {
    customers(where: { name: { eq: $name } }, limit: 1) {
      id
    }
  }
`
const FIND_BOAT_BY_NAME_QUERY = `
  query FindBoatByNameAdmin($ownerId: UUID!, $name: String!) {
    boats(where: { ownerId: { eq: $ownerId }, name: { eq: $name } }, limit: 1) {
      id
    }
  }
`
// sequenceNumber 0 keeps these out of the per-location numbering: the real
// orders' counter bootstraps from the highest sequenceNumber in use.
const CREATE_WORKSHOP_ORDER_MUTATION = `
  mutation CreateWorkshopOrderAdmin(
    $code: String!
    $locationCode: OrderLocation!
    $customerId: UUID!
    $boatId: UUID!
    $createdById: String!
    $workshopMonth: String!
  ) {
    workOrder_insert(
      data: {
        code: $code
        locationCode: $locationCode
        sequenceNumber: 0
        customerId: $customerId
        boatId: $boatId
        createdById: $createdById
        assetLocation: "Taller"
        status: IN_PROGRESS
        workshopMonth: $workshopMonth
      }
    )
  }
`

async function workshopCustomerAndBoat(locationCode) {
  const customerRes = await dataConnect.executeGraphqlRead(FIND_CUSTOMER_BY_NAME_QUERY, {
    variables: { name: WORKSHOP_CUSTOMER_NAME },
  })
  let customerId = customerRes.data.customers[0]?.id
  if (!customerId) {
    const created = await dataConnect.executeGraphql(CREATE_CUSTOMER_MUTATION, {
      variables: { name: WORKSHOP_CUSTOMER_NAME, contactName: 'Taller', phone: '-', email: null },
    })
    customerId = created.data.customer_insert.id
  }

  const boatName = `Taller ${WORKSHOP_LOCATION_LABEL[locationCode]}`
  const boatRes = await dataConnect.executeGraphqlRead(FIND_BOAT_BY_NAME_QUERY, {
    variables: { ownerId: customerId, name: boatName },
  })
  let boatId = boatRes.data.boats[0]?.id
  if (!boatId) {
    const created = await dataConnect.executeGraphql(CREATE_BOAT_MUTATION, {
      variables: {
        ownerId: customerId,
        name: boatName,
        registrationNumber: null,
        manufacturerModel: null,
        loaMeters: null,
        beamMeters: null,
      },
    })
    boatId = created.data.boat_insert.id
  }
  return { customerId, boatId }
}

// Idempotent, so it can run every night instead of once a month: it makes
// this month's three orders if they aren't there, puts on them whoever holds
// orders:assignable and isn't on them yet (a technician who joins mid-month
// gets them the next morning, not next month), and completes the ones left
// from earlier months.
//
// A shift still open on a month being closed is left open on purpose: on a
// completed order it stops counting as anyone's active shift (see
// pickActiveTimeLog) and shows in the order's Turnos with "Cerrar", so admin
// gives it its real end instead of the system inventing one at midnight.
async function syncWorkshopOrders(now = new Date()) {
  const month = madridDayKey(now).slice(0, 7)
  const summary = { month, created: [], assigned: 0, completed: [] }

  const actorRes = await dataConnect.executeGraphqlRead(GET_SYSTEM_ACTOR_QUERY, {})
  const actorId = actorRes.data.users[0]?.id
  if (!actorId) throw new Error('No hay ningún administrador activo para firmar las órdenes de taller.')

  const usersRes = await dataConnect.executeGraphqlRead(LIST_ACTIVE_USERS_WITH_PERMISSIONS_QUERY, {})
  const assignableIds = usersRes.data.users
    .filter((user) => user.userPermissions.some((up) => up.permission.key === 'orders:assignable'))
    .map((user) => user.id)

  for (const locationCode of ORDER_LOCATIONS) {
    const code = workshopOrderCode(locationCode, month)
    const existing = await dataConnect.executeGraphqlRead(GET_WORKSHOP_ORDER_QUERY, { variables: { code } })
    let order = existing.data.workOrders[0]
    if (!order) {
      const { customerId, boatId } = await workshopCustomerAndBoat(locationCode)
      const created = await dataConnect.executeGraphql(CREATE_WORKSHOP_ORDER_MUTATION, {
        variables: { code, locationCode, customerId, boatId, createdById: actorId, workshopMonth: month },
      })
      order = { id: created.data.workOrder_insert.id, assignments: [] }
      await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
        variables: {
          workOrderId: order.id,
          actorId,
          eventType: 'ORDER_CREATED',
          metadata: { automatic: true, workshopMonth: month },
        },
      })
      summary.created.push(code)
    }

    // Anyone already on it is left alone, unassigned or not: this only adds.
    const alreadyOn = new Set(order.assignments.map((a) => a.technicianId))
    for (const technicianId of assignableIds) {
      if (alreadyOn.has(technicianId)) continue
      await dataConnect.executeGraphql(ASSIGN_TECHNICIAN_MUTATION, {
        variables: {
          workOrderId: order.id,
          technicianId,
          assignedById: actorId,
          assignedAt: now.toISOString(),
          isAllowed: false,
          isLead: false,
        },
      })
      summary.assigned += 1
    }
  }

  const openRes = await dataConnect.executeGraphqlRead(LIST_OPEN_WORKSHOP_ORDERS_QUERY, {})
  for (const order of openRes.data.workOrders) {
    if (order.workshopMonth >= month) continue
    await dataConnect.executeGraphql(COMPLETE_WORK_ORDER_MUTATION, {
      variables: { id: order.id, completedAt: now.toISOString() },
    })
    await dataConnect.executeGraphql(LOG_ORDER_EVENT_MUTATION, {
      variables: {
        workOrderId: order.id,
        actorId,
        eventType: 'ORDER_COMPLETED',
        metadata: { automatic: true, workshopMonth: order.workshopMonth },
      },
    })
    summary.completed.push(order.code)
  }

  return summary
}

// Five past midnight, Spanish time: on the 1st that's when the new month's
// orders appear and the old ones close; every other night it only picks up
// newly assignable technicians.
exports.ensureWorkshopOrders = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Europe/Madrid', retryCount: 2 },
  async () => {
    const summary = await syncWorkshopOrders()
    console.log(`Órdenes de taller de ${summary.month}: ${JSON.stringify(summary)}`)
  },
)

const SCHEDULABLE_STATUSES = ['ASSIGNED', 'IN_PROGRESS']

// Adds/removes one day a work order is placed on in the weekly calendar - a
// work order can be scheduled on several (possibly non-consecutive) days, so
// this toggles a single day rather than setting one field. Editing is
// admin/admin:lab only - technicians and clients can view the calendar
// (CalendarPage.tsx) but never call this. Re-checks the order's current
// status server-side (rather than trusting the client's possibly-stale
// copy) since scheduling only makes sense once technicians are assigned and
// stops being editable once the order is COMPLETED - see schema.gql's
// WorkOrderScheduledDate comment.
exports.setWorkOrderScheduledDate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions)
    ? request.auth.token.permissions
    : []
  if (request.auth.token?.role !== 'ADMIN' && !permissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para editar el calendario.')
  }

  const { workOrderId, date, scheduled } = request.data ?? {}
  if (typeof workOrderId !== 'string' || typeof scheduled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'Fecha inválida.')
  }

  const res = await dataConnect.executeGraphqlRead(GET_WORK_ORDER_STATUS_QUERY, {
    variables: { id: workOrderId },
  })
  const order = res.data.workOrder
  if (!order) {
    throw new HttpsError('not-found', 'La orden no existe.')
  }
  if (!SCHEDULABLE_STATUSES.includes(order.status)) {
    throw new HttpsError(
      'failed-precondition',
      'Solo se pueden programar órdenes con técnicos asignados y no completadas.',
    )
  }

  if (scheduled) {
    await dataConnect.executeGraphql(UPSERT_WORK_ORDER_SCHEDULED_DATE_MUTATION, {
      variables: { workOrderId, date },
    })
  } else {
    await dataConnect.executeGraphql(DELETE_WORK_ORDER_SCHEDULED_DATE_MUTATION, {
      variables: { workOrderId, date },
    })
  }

  return { success: true }
})

// ---------------------------------------------------------------------------
// Calendar appointments - days blocked out for something with no work order
// behind it yet ("Mirar problema barco X"). Same edit rule as the calendar
// itself (admin, or the admin:lab bypass): technicians can see them but never
// write. See schema.gql's CalendarAppointment.
// ---------------------------------------------------------------------------

const CREATE_CALENDAR_APPOINTMENT_MUTATION = `
  mutation CreateCalendarAppointmentAdmin(
    $title: String!
    $boatDetails: String
    $locationCode: OrderLocation
    $customLocation: String
    $notes: String
    $createdById: String!
  ) {
    calendarAppointment_insert(
      data: {
        title: $title
        boatDetails: $boatDetails
        locationCode: $locationCode
        customLocation: $customLocation
        notes: $notes
        createdById: $createdById
      }
    )
  }
`
// Two versions because switching an appointment between one of our locations
// and a free-text one has to clear the other field, and a null only clears in
// an _update when it's written as a literal.
const UPDATE_CALENDAR_APPOINTMENT_MUTATION = `
  mutation UpdateCalendarAppointmentAdmin(
    $id: UUID!
    $title: String!
    $boatDetails: String
    $locationCode: OrderLocation!
    $notes: String
  ) {
    calendarAppointment_update(
      id: $id
      data: {
        title: $title
        boatDetails: $boatDetails
        locationCode: $locationCode
        customLocation: null
        notes: $notes
      }
    )
  }
`
const UPDATE_CALENDAR_APPOINTMENT_CUSTOM_LOCATION_MUTATION = `
  mutation UpdateCalendarAppointmentCustomLocationAdmin(
    $id: UUID!
    $title: String!
    $boatDetails: String
    $customLocation: String!
    $notes: String
  ) {
    calendarAppointment_update(
      id: $id
      data: {
        title: $title
        boatDetails: $boatDetails
        locationCode: null
        customLocation: $customLocation
        notes: $notes
      }
    )
  }
`
const SET_CALENDAR_APPOINTMENT_CLOSED_MUTATION = `
  mutation SetCalendarAppointmentClosedAdmin($id: UUID!, $closedAt: Timestamp) {
    calendarAppointment_update(id: $id, data: { closedAt: $closedAt })
  }
`
const DELETE_CALENDAR_APPOINTMENT_MUTATION = `
  mutation DeleteCalendarAppointmentAdmin($id: UUID!) {
    calendarAppointment_delete(id: $id)
  }
`
const DELETE_CALENDAR_APPOINTMENT_DATES_MUTATION = `
  mutation DeleteCalendarAppointmentDatesAdmin($appointmentId: UUID!) {
    calendarAppointmentDate_deleteMany(where: { appointmentId: { eq: $appointmentId } })
  }
`
const UPSERT_CALENDAR_APPOINTMENT_DATE_MUTATION = `
  mutation UpsertCalendarAppointmentDateAdmin($appointmentId: UUID!, $date: Date!) {
    calendarAppointmentDate_upsert(data: { appointmentId: $appointmentId, date: $date })
  }
`
const DELETE_CALENDAR_APPOINTMENT_DATE_MUTATION = `
  mutation DeleteCalendarAppointmentDateAdmin($appointmentId: UUID!, $date: Date!) {
    calendarAppointmentDate_delete(key: { appointmentId: $appointmentId, date: $date })
  }
`
const GET_CALENDAR_APPOINTMENT_QUERY = `
  query GetCalendarAppointmentAdmin($id: UUID!) {
    calendarAppointment(id: $id) {
      id
      title
      closedAt
      workOrderId
    }
  }
`
const LINK_CALENDAR_APPOINTMENT_ORDER_MUTATION = `
  mutation LinkCalendarAppointmentOrderAdmin($id: UUID!, $workOrderId: UUID!, $closedAt: Timestamp!) {
    calendarAppointment_update(id: $id, data: { workOrderId: $workOrderId, closedAt: $closedAt })
  }
`

const ORDER_LOCATIONS = ['ALGECIRAS', 'LA_LINEA', 'SOTOGRANDE']

async function getCalendarAppointment(appointmentId) {
  const res = await dataConnect.executeGraphqlRead(GET_CALENDAR_APPOINTMENT_QUERY, {
    variables: { id: appointmentId },
  })
  return res.data.calendarAppointment
}

const CUSTOM_LOCATION_MAX_LENGTH = 80

// Either `locationCode` (one of ours) or `customLocation` (free text), never
// both: the other one always comes back null.
function appointmentFields(data) {
  const { title, boatDetails, locationCode, customLocation, notes } = data ?? {}
  if (typeof title !== 'string' || !title.trim()) {
    throw new HttpsError('invalid-argument', 'La cita necesita un título.')
  }
  const custom = typeof customLocation === 'string' ? customLocation.trim() : ''
  if (custom.length > CUSTOM_LOCATION_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `La localización no puede pasar de ${CUSTOM_LOCATION_MAX_LENGTH} caracteres.`)
  }
  if (!custom && !ORDER_LOCATIONS.includes(locationCode)) {
    throw new HttpsError('invalid-argument', 'Elige una localización o escribe cuál es.')
  }
  return {
    title: title.trim(),
    boatDetails: typeof boatDetails === 'string' && boatDetails.trim() ? boatDetails.trim() : null,
    locationCode: custom ? null : locationCode,
    customLocation: custom || null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  }
}

exports.createCalendarAppointment = onCall(async (request) => {
  requireAdminOrLab(request)

  const res = await dataConnect.executeGraphql(CREATE_CALENDAR_APPOINTMENT_MUTATION, {
    variables: { ...appointmentFields(request.data), createdById: request.auth.uid },
  })
  return { appointmentId: res.data.calendarAppointment_insert.id }
})

exports.updateCalendarAppointment = onCall(async (request) => {
  requireAdminOrLab(request)

  const { appointmentId } = request.data ?? {}
  if (typeof appointmentId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la cita.')
  }

  const { locationCode, customLocation, ...fields } = appointmentFields(request.data)
  if (customLocation) {
    await dataConnect.executeGraphql(UPDATE_CALENDAR_APPOINTMENT_CUSTOM_LOCATION_MUTATION, {
      variables: { id: appointmentId, ...fields, customLocation },
    })
  } else {
    await dataConnect.executeGraphql(UPDATE_CALENDAR_APPOINTMENT_MUTATION, {
      variables: { id: appointmentId, ...fields, locationCode },
    })
  }
  return { success: true }
})

exports.setCalendarAppointmentClosed = onCall(async (request) => {
  requireAdminOrLab(request)

  const { appointmentId, closed } = request.data ?? {}
  if (typeof appointmentId !== 'string' || typeof closed !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  // One that became an order stays completed: reopening it would leave the
  // order standing next to an appointment that claims to still be pending.
  if (!closed) {
    const appointment = await getCalendarAppointment(appointmentId)
    if (appointment?.workOrderId) {
      throw new HttpsError(
        'failed-precondition',
        'Esta cita ya generó una orden de trabajo; no se puede reabrir.',
      )
    }
  }

  await dataConnect.executeGraphql(SET_CALENDAR_APPOINTMENT_CLOSED_MUTATION, {
    variables: { id: appointmentId, closedAt: closed ? new Date().toISOString() : null },
  })
  return { success: true }
})

// Wipes the appointment's days first - PostgreSQL would refuse the delete
// while they still reference it, and an appointment created by mistake has no
// history worth keeping (that's what closing is for).
// Two mutations because a null variable doesn't clear a field in an
// _update - it has to be a literal (see CLAUDE.md).
const SET_CALENDAR_APPOINTMENT_REMARKS_MUTATION = `
  mutation SetCalendarAppointmentRemarksAdmin($id: UUID!, $remarks: String!) {
    calendarAppointment_update(id: $id, data: { remarks: $remarks })
  }
`
const CLEAR_CALENDAR_APPOINTMENT_REMARKS_MUTATION = `
  mutation ClearCalendarAppointmentRemarksAdmin($id: UUID!) {
    calendarAppointment_update(id: $id, data: { remarks: null })
  }
`

// An appointment's notes, editable in any state: unlike its other fields,
// they're mostly written after the visit, including once it's completed or
// turned into an order - which the reopen/delete guards otherwise lock down.
// Same who-can-edit rule as the rest of the calendar.
exports.setCalendarAppointmentRemarks = onCall(async (request) => {
  requireAdminOrLab(request)

  const { appointmentId, remarks } = request.data ?? {}
  if (typeof appointmentId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la cita.')
  }
  if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
    throw new HttpsError('invalid-argument', 'Las notas no son válidas.')
  }
  const text = typeof remarks === 'string' ? remarks.trim() : ''
  if (text.length > 2000) {
    throw new HttpsError('invalid-argument', 'Las notas no pueden pasar de 2000 caracteres.')
  }
  if (!(await getCalendarAppointment(appointmentId))) {
    throw new HttpsError('not-found', 'La cita ya no existe.')
  }

  if (text) {
    await dataConnect.executeGraphql(SET_CALENDAR_APPOINTMENT_REMARKS_MUTATION, {
      variables: { id: appointmentId, remarks: text },
    })
  } else {
    await dataConnect.executeGraphql(CLEAR_CALENDAR_APPOINTMENT_REMARKS_MUTATION, {
      variables: { id: appointmentId },
    })
  }
  return { success: true }
})

exports.deleteCalendarAppointment = onCall(async (request) => {
  requireAdminOrLab(request)

  const { appointmentId } = request.data ?? {}
  if (typeof appointmentId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la cita.')
  }

  const appointment = await getCalendarAppointment(appointmentId)
  if (appointment?.workOrderId) {
    throw new HttpsError(
      'failed-precondition',
      'Esta cita generó una orden de trabajo; no se puede eliminar.',
    )
  }

  await dataConnect.executeGraphql(DELETE_CALENDAR_APPOINTMENT_DATES_MUTATION, {
    variables: { appointmentId },
  })
  await dataConnect.executeGraphql(DELETE_CALENDAR_APPOINTMENT_MUTATION, {
    variables: { id: appointmentId },
  })
  return { success: true }
})

exports.setCalendarAppointmentScheduledDate = onCall(async (request) => {
  requireAdminOrLab(request)

  const { appointmentId, date, scheduled } = request.data ?? {}
  if (typeof appointmentId !== 'string' || typeof scheduled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'Fecha inválida.')
  }

  if (scheduled) {
    await dataConnect.executeGraphql(UPSERT_CALENDAR_APPOINTMENT_DATE_MUTATION, {
      variables: { appointmentId, date },
    })
  } else {
    await dataConnect.executeGraphql(DELETE_CALENDAR_APPOINTMENT_DATE_MUTATION, {
      variables: { appointmentId, date },
    })
  }
  return { success: true }
})

const GET_ALL_ACTIVE_TIME_LOGS_QUERY = `
  query GetAllActiveTimeLogsAdmin {
    timeLogs(where: { clockOut: { isNull: true } }, limit: 200) {
      technicianId
      workOrder {
        id
        code
        status
      }
    }
  }
`

// Reads the wall-clock hour/minute in a given IANA timezone - deliberately
// not new Date().getHours() (that's the Cloud Functions container's local
// time, i.e. UTC), and Intl handles the CET/CEST switch automatically so
// this needs no manual DST bookkeeping.
function timeInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(date)
  return {
    hour: Number(parts.find((p) => p.type === 'hour').value),
    minute: Number(parts.find((p) => p.type === 'minute').value),
  }
}

// Re-sends the "turno activo" push (see startWorking) every 30 minutes to
// every technician still clocked in, so it comes back even if they swiped
// the previous one away - the closest a web push can get to a native app's
// non-dismissible "ongoing" notification. Same per-technician tag as
// startWorking/stopWorking, so this replaces rather than stacks.
//
// Cron's minute/hour fields can't express "every 30 min, but only :00 on the
// last hour" in one expression, so this fires for 8:00-16:30 Madrid time and
// skips the spurious 16:30 tick in code to land the last real reminder at
// 16:00 as requested.
exports.notifyActiveShifts = onSchedule(
  { schedule: '0,30 8-16 * * *', timeZone: 'Europe/Madrid' },
  async () => {
    const { hour, minute } = timeInZone(new Date(), 'Europe/Madrid')
    if (hour === 16 && minute !== 0) return

    const res = await dataConnect.executeGraphqlRead(GET_ALL_ACTIVE_TIME_LOGS_QUERY, {})
    const active = res.data.timeLogs.filter(
      (log) => !CLOSED_ORDER_STATUSES.includes(log.workOrder.status),
    )
    await Promise.all(
      active.map((log) =>
        sendToUsers([log.technicianId], {
          title: 'Turno activo',
          body: `Sigues trabajando en la orden ${log.workOrder.code}`,
          data: { orderId: log.workOrder.id, tag: activeShiftTag(log.technicianId) },
        }).catch(() => {}),
      ),
    )
  },
)

// ---------------------------------------------------------------------------
// Admin CRUD (users, permissions, customers, boats, engines) - previously
// called directly from the client via the named mutations in
// dataconnect/connector/mutations.gql, all of which only enforce
// @auth(level: USER) (any signed-in user, not just admins). The "Administración"
// section was only ever hidden client-side by HasPermission, so any signed-in
// account (even a CLIENT with zero grants) could call e.g. grantPermission on
// themselves directly against the Data Connect endpoint and self-escalate to
// admin:manage - these functions close that gap with a real server-side check.
// The old named mutations are removed from the connector once every client
// call site below has switched over (see mutations.gql).
// ---------------------------------------------------------------------------

function requirePermission(request, permission) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions) ? request.auth.token.permissions : []
  if (!permissions.includes(permission)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para realizar esta acción.')
  }
}

// Same "role, or the usual lab bypass" shape as the calendar's access rule
// (see setWorkOrderScheduledDate) - used for "EB Engineering" management
// (clients/products/news/FAQ), which any ADMIN should be able to do, not
// just accounts that happen to also hold the admin:lab testing flag.
function requireAdminOrLab(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }
  const permissions = Array.isArray(request.auth.token?.permissions) ? request.auth.token.permissions : []
  if (request.auth.token?.role !== 'ADMIN' && !permissions.includes('admin:lab')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para realizar esta acción.')
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

// Optimistic-concurrency guard for the "client sends the full desired state,
// server diffs against current" endpoints (assignTechnicians, adminUpdateUser
// permissions): if what the client started editing from no longer matches
// what's actually there, its diff would silently clobber whatever changed in
// between - reject instead of guessing.
function requireUnchangedSince(expectedIds, currentIds) {
  if (!Array.isArray(expectedIds)) return
  if (!setsEqual(new Set(expectedIds), currentIds)) {
    throw new HttpsError(
      'aborted',
      'Esto ha cambiado mientras lo editabas. Recarga la página e inténtalo de nuevo.',
    )
  }
}

const CREATE_USER_PROFILE_MUTATION = `
  mutation CreateUserProfileAdmin($id: String!, $email: String!, $displayName: String!, $role: UserRole!) {
    user_insert(data: { id: $id, email: $email, displayName: $displayName, role: $role })
  }
`
const UPDATE_USER_PROFILE_MUTATION = `
  mutation UpdateUserProfileAdmin($id: String!, $displayName: String!, $role: UserRole!, $isActive: Boolean!) {
    user_update(id: $id, data: { displayName: $displayName, role: $role, isActive: $isActive })
  }
`
const CREATE_PERMISSION_MUTATION = `
  mutation CreatePermissionAdmin($key: String!, $description: String!) {
    permission_insert(data: { key: $key, description: $description })
  }
`
const DELETE_PERMISSION_GRANTS_MUTATION = `
  mutation DeletePermissionGrantsAdmin($permissionId: UUID!) {
    userPermission_deleteMany(where: { permissionId: { eq: $permissionId } })
  }
`
const DELETE_PERMISSION_MUTATION = `
  mutation DeletePermissionAdmin($id: UUID!) {
    permission_delete(id: $id)
  }
`
const GRANT_PERMISSION_MUTATION = `
  mutation GrantPermissionAdmin($userId: String!, $permissionId: UUID!, $grantedById: String!) {
    userPermission_insert(data: { userId: $userId, permissionId: $permissionId, grantedById: $grantedById })
  }
`
const REVOKE_PERMISSION_MUTATION = `
  mutation RevokePermissionAdmin($userId: String!, $permissionId: UUID!) {
    userPermission_delete(key: { userId: $userId, permissionId: $permissionId })
  }
`
const GET_USER_PERMISSIONS_QUERY = `
  query GetUserPermissionsAdmin($userId: String!) {
    userPermissions(where: { userId: { eq: $userId } }) {
      permissionId
    }
  }
`
const GET_PERMISSION_HOLDERS_QUERY = `
  query GetPermissionHoldersAdmin($key: String!) {
    permissions(where: { key: { eq: $key } }) {
      id
      holders: userPermissions_on_permission {
        userId
        user {
          isActive
        }
      }
    }
  }
`
const UPDATE_CUSTOMER_MUTATION = `
  mutation UpdateCustomerAdmin(
    $id: UUID!
    $name: String!
    $contactName: String!
    $phone: String!
    $email: String
    $linkedUserId: String
  ) {
    customer_update(
      id: $id
      data: { name: $name, contactName: $contactName, phone: $phone, email: $email, linkedUserId: $linkedUserId }
    )
  }
`
const UPDATE_BOAT_MUTATION = `
  mutation UpdateBoatAdmin($id: UUID!, $ownerId: UUID!, $name: String!, $registrationNumber: String) {
    boat_update(id: $id, data: { ownerId: $ownerId, name: $name, registrationNumber: $registrationNumber })
  }
`
const UPDATE_ENGINE_MUTATION = `
  mutation UpdateEngineAdmin(
    $id: UUID!
    $engineType: String!
    $chassisNumber: String!
    $propellerSerialNumber: String!
  ) {
    engine_update(
      id: $id
      data: { engineType: $engineType, chassisNumber: $chassisNumber, propellerSerialNumber: $propellerSerialNumber }
    )
  }
`
const DELETE_ENGINE_MUTATION = `
  mutation DeleteEngineAdmin($id: UUID!) {
    engine_delete(id: $id)
  }
`

// Replaces createAuthUser (client-side secondary-Firebase-app workaround) +
// createUserProfile + a grantPermission loop + a trailing syncUserClaims
// call - one round trip instead of up to 2+N, and no window where the Auth
// account exists without its Data Connect profile (rolled back on failure).
exports.adminCreateUser = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { email, password, displayName, role, permissionIds } = request.data ?? {}
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof displayName !== 'string' ||
    typeof role !== 'string' ||
    !email.trim() ||
    !displayName.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.')
  }

  let userRecord
  try {
    userRecord = await admin.auth().createUser({ email: email.trim(), password, displayName: displayName.trim() })
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ese email ya está en uso.')
    }
    if (err.code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'El email no es válido.')
    }
    if (err.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'La contraseña no es válida.')
    }
    throw new HttpsError('internal', 'No se pudo crear el usuario.', err.message)
  }

  try {
    await dataConnect.executeGraphql(CREATE_USER_PROFILE_MUTATION, {
      variables: { id: userRecord.uid, email: email.trim(), displayName: displayName.trim(), role },
    })
    for (const permissionId of Array.isArray(permissionIds) ? permissionIds : []) {
      await dataConnect.executeGraphql(GRANT_PERMISSION_MUTATION, {
        variables: { userId: userRecord.uid, permissionId, grantedById: request.auth.uid },
      })
    }
    await computeAndSetClaims(userRecord.uid)
  } catch (err) {
    console.error('[adminCreateUser]', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    await admin.auth().deleteUser(userRecord.uid).catch(() => {})
    throw new HttpsError('internal', 'No se pudo crear el usuario.', err.message)
  }

  return { uid: userRecord.uid }
})

// Replaces updateUserProfile + a grant/revoke diff loop + a trailing
// syncUserClaims call. `permissionIds` is the full desired set (same
// "client sends the end state, server diffs against current" shape as
// assignTechnicians) - `expectedPermissionIds` is what the client started
// editing from, checked against the live state so a stale edit can't
// silently clobber a grant/revoke someone else made in the meantime.
exports.adminUpdateUser = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { userId, displayName, role, isActive, permissionIds, expectedPermissionIds } = request.data ?? {}
  if (
    typeof userId !== 'string' ||
    typeof displayName !== 'string' ||
    typeof role !== 'string' ||
    typeof isActive !== 'boolean' ||
    !Array.isArray(permissionIds)
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const currentRes = await dataConnect.executeGraphqlRead(GET_USER_PERMISSIONS_QUERY, {
    variables: { userId },
  })
  const currentIds = new Set(currentRes.data.userPermissions.map((p) => p.permissionId))
  requireUnchangedSince(expectedPermissionIds, currentIds)
  const desiredIds = new Set(permissionIds)

  // Safety net: never leave the system with zero active users holding
  // admin:manage, whether that's this update revoking the permission,
  // deactivating the account, or both - there'd be no way back into the
  // Admin section for anyone.
  const adminManageRes = await dataConnect.executeGraphqlRead(GET_PERMISSION_HOLDERS_QUERY, {
    variables: { key: 'admin:manage' },
  })
  const adminManage = adminManageRes.data.permissions[0]
  if (adminManage) {
    const otherActiveHolders = adminManage.holders.filter(
      (h) => h.userId !== userId && h.user.isActive,
    ).length
    const targetWillHoldIt = isActive && desiredIds.has(adminManage.id)
    if (otherActiveHolders === 0 && !targetWillHoldIt) {
      throw new HttpsError(
        'failed-precondition',
        'Esto dejaría el sistema sin ningún administrador con acceso al panel. Concede admin:manage a otro usuario antes de continuar.',
      )
    }
  }

  await dataConnect.executeGraphql(UPDATE_USER_PROFILE_MUTATION, {
    variables: { id: userId, displayName: displayName.trim(), role, isActive },
  })

  for (const permissionId of permissionIds) {
    if (!currentIds.has(permissionId)) {
      await dataConnect.executeGraphql(GRANT_PERMISSION_MUTATION, {
        variables: { userId, permissionId, grantedById: request.auth.uid },
      })
    }
  }
  for (const permissionId of currentIds) {
    if (!desiredIds.has(permissionId)) {
      await dataConnect.executeGraphql(REVOKE_PERMISSION_MUTATION, { variables: { userId, permissionId } })
    }
  }

  await computeAndSetClaims(userId)
  return { success: true }
})

exports.adminCreatePermission = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { key, description } = request.data ?? {}
  if (typeof key !== 'string' || typeof description !== 'string' || !description.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (!/^[a-z]+:[a-z]+$/.test(key.trim())) {
    throw new HttpsError('invalid-argument', 'La clave debe tener el formato "área:acción", en minúsculas.')
  }

  await dataConnect.executeGraphql(CREATE_PERMISSION_MUTATION, {
    variables: { key: key.trim(), description: description.trim() },
  })
  return { success: true }
})

// Revokes the permission from every user who held it, then removes it from
// the catalog - for retiring a permission that's no longer checked anywhere
// in code (e.g. calendar:manage, superseded by role-based calendar access).
// Affected users' custom claims still list it until their token naturally
// refreshes or they call syncUserClaims, same as any other revoke.
exports.adminDeletePermission = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { permissionId } = request.data ?? {}
  if (typeof permissionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del permiso.')
  }

  await dataConnect.executeGraphql(DELETE_PERMISSION_GRANTS_MUTATION, { variables: { permissionId } })
  await dataConnect.executeGraphql(DELETE_PERMISSION_MUTATION, { variables: { id: permissionId } })
  return { success: true }
})

exports.adminCreateCustomer = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { name, contactName, phone, email } = request.data ?? {}
  if (
    typeof name !== 'string' ||
    typeof contactName !== 'string' ||
    typeof phone !== 'string' ||
    !name.trim() ||
    !contactName.trim() ||
    !phone.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_CUSTOMER_MUTATION, {
    variables: { name: name.trim(), contactName: contactName.trim(), phone: phone.trim(), email: email || null },
  })
  return { success: true }
})

exports.adminUpdateCustomer = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { customerId, name, contactName, phone, email, linkedUserId } = request.data ?? {}
  if (
    typeof customerId !== 'string' ||
    typeof name !== 'string' ||
    typeof contactName !== 'string' ||
    typeof phone !== 'string' ||
    !name.trim() ||
    !contactName.trim() ||
    !phone.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(UPDATE_CUSTOMER_MUTATION, {
    variables: {
      id: customerId,
      name: name.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email || null,
      linkedUserId: linkedUserId || null,
    },
  })
  return { success: true }
})

// Optionally seeds the boat's initial engines in the same call (mirrors
// createWorkOrder's new-boat path) instead of a separate createEngine per
// row from the client.
exports.adminCreateBoat = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { ownerId, name, registrationNumber, engines } = request.data ?? {}
  if (typeof ownerId !== 'string' || typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const res = await dataConnect.executeGraphql(CREATE_BOAT_MUTATION, {
    variables: { ownerId, name: name.trim(), registrationNumber: registrationNumber || null },
  })
  const boatId = res.data.boat_insert.id

  for (const engine of Array.isArray(engines) ? engines : []) {
    await dataConnect.executeGraphql(CREATE_ENGINE_MUTATION, {
      variables: {
        boatId,
        engineType: engine.engineType,
        chassisNumber: engine.chassisNumber,
        propellerSerialNumber: engine.propellerSerialNumber,
      },
    })
  }

  return { boatId }
})

exports.adminUpdateBoat = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { boatId, ownerId, name, registrationNumber } = request.data ?? {}
  if (typeof boatId !== 'string' || typeof ownerId !== 'string' || typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(UPDATE_BOAT_MUTATION, {
    variables: { id: boatId, ownerId, name: name.trim(), registrationNumber: registrationNumber || null },
  })
  return { success: true }
})

exports.adminCreateEngine = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { boatId, engineType, chassisNumber, propellerSerialNumber } = request.data ?? {}
  if (
    typeof boatId !== 'string' ||
    typeof engineType !== 'string' ||
    typeof chassisNumber !== 'string' ||
    typeof propellerSerialNumber !== 'string' ||
    !engineType.trim() ||
    !chassisNumber.trim() ||
    !propellerSerialNumber.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_ENGINE_MUTATION, {
    variables: { boatId, engineType, chassisNumber, propellerSerialNumber },
  })
  return { success: true }
})

exports.adminUpdateEngine = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { engineId, engineType, chassisNumber, propellerSerialNumber } = request.data ?? {}
  if (
    typeof engineId !== 'string' ||
    typeof engineType !== 'string' ||
    typeof chassisNumber !== 'string' ||
    typeof propellerSerialNumber !== 'string'
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(UPDATE_ENGINE_MUTATION, {
    variables: { id: engineId, engineType, chassisNumber, propellerSerialNumber },
  })
  return { success: true }
})

exports.adminDeleteEngine = onCall(async (request) => {
  requirePermission(request, 'admin:manage')

  const { engineId } = request.data ?? {}
  if (typeof engineId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del motor.')
  }

  await dataConnect.executeGraphql(DELETE_ENGINE_MUTATION, { variables: { id: engineId } })
  return { success: true }
})

// ---------------------------------------------------------------------------
// "EB Engineering" intranet (clients/products directory, news, FAQ) - see
// schema.gql for the tables. Management writes require ADMIN role or
// admin:lab (requireAdminOrLab) - matches the client's access gate
// (EbEngineeringPage.tsx). A linked EbClient's own portal account reads
// only their own products (ListMyEbClientProducts, gated to their own
// clientId - see EbMyProductsPage.tsx), no elevated permission needed.
// ---------------------------------------------------------------------------

const CREATE_EB_CLIENT_MUTATION = `
  mutation CreateEbClientAdmin(
    $email: String!
    $companyName: String!
    $contactName: String!
    $phone: String!
    $country: String!
    $distributorId: UUID
    $linkedUserId: String
    $createdById: String!
  ) {
    ebClient_insert(
      data: {
        email: $email
        companyName: $companyName
        contactName: $contactName
        phone: $phone
        country: $country
        distributorId: $distributorId
        linkedUserId: $linkedUserId
        createdById: $createdById
      }
    )
  }
`
const UPDATE_EB_CLIENT_MUTATION = `
  mutation UpdateEbClientAdmin(
    $id: UUID!
    $email: String!
    $companyName: String!
    $contactName: String!
    $phone: String!
    $country: String!
    $distributorId: UUID
    $linkedUserId: String
  ) {
    ebClient_update(
      id: $id
      data: {
        email: $email
        companyName: $companyName
        contactName: $contactName
        phone: $phone
        country: $country
        distributorId: $distributorId
        linkedUserId: $linkedUserId
      }
    )
  }
`
const DELETE_EB_CLIENT_MUTATION = `
  mutation DeleteEbClientAdmin($id: UUID!) {
    ebClient_delete(id: $id)
  }
`
const CREATE_EB_CABLE_TYPE_MUTATION = `
  mutation CreateEbCableTypeAdmin($code: String!, $name: String!) {
    ebCableType_insert(data: { code: $code, name: $name })
  }
`
const CREATE_EB_CLIENT_PRODUCT_MUTATION = `
  mutation CreateEbClientProductAdmin(
    $clientId: UUID!
    $serialNumber: String!
    $hardwareNumber: String!
    $softwareVersion: String
    $purchasedAt: Date
    $programFileUrl: String
    $wallpaperUrl: String
    $observations: String
    $internalUse: Boolean!
    $createdById: String!
  ) {
    ebClientProduct_insert(
      data: {
        clientId: $clientId
        serialNumber: $serialNumber
        hardwareNumber: $hardwareNumber
        softwareVersion: $softwareVersion
        purchasedAt: $purchasedAt
        programFileUrl: $programFileUrl
        wallpaperUrl: $wallpaperUrl
        observations: $observations
        internalUse: $internalUse
        createdById: $createdById
      }
    )
  }
`
const UPDATE_EB_CLIENT_PRODUCT_MUTATION = `
  mutation UpdateEbClientProductAdmin(
    $id: UUID!
    $clientId: UUID!
    $serialNumber: String!
    $hardwareNumber: String!
    $softwareVersion: String
    $purchasedAt: Date
    $programFileUrl: String
    $wallpaperUrl: String
    $observations: String
    $soldToEndUserAt: Date
    $internalUse: Boolean!
  ) {
    ebClientProduct_update(
      id: $id
      data: {
        clientId: $clientId
        serialNumber: $serialNumber
        hardwareNumber: $hardwareNumber
        softwareVersion: $softwareVersion
        purchasedAt: $purchasedAt
        programFileUrl: $programFileUrl
        wallpaperUrl: $wallpaperUrl
        observations: $observations
        soldToEndUserAt: $soldToEndUserAt
        internalUse: $internalUse
      }
    )
  }
`
const DELETE_EB_CLIENT_PRODUCT_MUTATION = `
  mutation DeleteEbClientProductAdmin($id: UUID!) {
    ebClientProduct_delete(id: $id)
  }
`
const GET_EB_CLIENT_PRODUCT_RETIRED_QUERY = `
  query GetEbClientProductRetiredAdmin($id: UUID!) {
    ebClientProduct(id: $id) {
      retiredAt
    }
  }
`
const RETIRE_EB_CLIENT_PRODUCT_MUTATION = `
  mutation RetireEbClientProductAdmin($id: UUID!, $retiredAt: Timestamp) {
    ebClientProduct_update(id: $id, data: { retiredAt: $retiredAt })
  }
`
const ADD_EB_CLIENT_PRODUCT_CABLE_MUTATION = `
  mutation AddEbClientProductCableAdmin($productId: UUID!, $cableTypeId: UUID!) {
    ebClientProductCable_insert(data: { productId: $productId, cableTypeId: $cableTypeId })
  }
`
const DELETE_EB_CLIENT_PRODUCT_CABLES_MUTATION = `
  mutation DeleteEbClientProductCablesAdmin($productId: UUID!) {
    ebClientProductCable_deleteMany(where: { productId: { eq: $productId } })
  }
`
// Registered-cable assignment (a specific ESP32-tested CableCheck row, as
// opposed to the generic EbCableType checkboxes above) - a plain field
// update rather than a join table, since CableCheck.productId is nullable
// and a check must stay a single row either way (it's a real test event log,
// not a link row to delete/recreate).
const GET_ASSIGNED_CABLE_CHECKS_QUERY = `
  query GetAssignedCableChecksAdmin($productId: UUID!) {
    cableChecks(where: { productId: { eq: $productId } }) {
      id
    }
  }
`
const SET_CABLE_CHECK_PRODUCT_MUTATION = `
  mutation SetCableCheckProductAdmin($id: UUID!, $productId: UUID) {
    cableCheck_update(id: $id, data: { productId: $productId })
  }
`
const CREATE_EB_SCREEN_MUTATION = `
  mutation CreateEbScreenAdmin(
    $reference: String!
    $model: String!
    $serialNumber: String!
    $registeredById: String!
  ) {
    ebScreen_insert(
      data: {
        reference: $reference
        model: $model
        serialNumber: $serialNumber
        registeredById: $registeredById
      }
    )
  }
`
// Assigning to a sale also clears any "went somewhere else" marking - the two
// are mutually exclusive (see EbScreen in schema.gql), and unassigning puts
// the unit straight back into stock.
const SET_EB_SCREEN_PRODUCT_MUTATION = `
  mutation SetEbScreenProductAdmin($id: UUID!, $productId: UUID) {
    ebScreen_update(
      id: $id
      data: { productId: $productId, unavailableReason: null, unavailableAt: null }
    )
  }
`
const SET_EB_SCREEN_UNAVAILABLE_MUTATION = `
  mutation SetEbScreenUnavailableAdmin($id: UUID!, $unavailableReason: String, $unavailableAt: Timestamp) {
    ebScreen_update(
      id: $id
      data: { unavailableReason: $unavailableReason, unavailableAt: $unavailableAt }
    )
  }
`
const GET_EB_SCREEN_PRODUCT_QUERY = `
  query GetEbScreenProductAdmin($id: UUID!) {
    ebScreen(id: $id) {
      productId
    }
  }
`
const UPDATE_EB_SCREEN_MUTATION = `
  mutation UpdateEbScreenAdmin($id: UUID!, $reference: String!, $model: String!, $serialNumber: String!) {
    ebScreen_update(
      id: $id
      data: { reference: $reference, model: $model, serialNumber: $serialNumber }
    )
  }
`
const DELETE_EB_SCREEN_MUTATION = `
  mutation DeleteEbScreenAdmin($id: UUID!) {
    ebScreen_delete(id: $id)
  }
`
const GET_EB_SCREEN_SERIAL_QUERY = `
  query GetEbScreenSerialAdmin($id: UUID!) {
    ebScreen(id: $id) {
      serialNumber
    }
  }
`
const GET_ASSIGNED_EB_SCREENS_QUERY = `
  query GetAssignedEbScreensAdmin($productId: UUID!) {
    ebScreens(where: { productId: { eq: $productId } }) {
      id
    }
  }
`
const GET_CABLE_CHECK_PRODUCT_QUERY = `
  query GetCableCheckProductAdmin($id: UUID!) {
    cableCheck(id: $id) {
      productId
    }
  }
`
const DELETE_CABLE_CHECK_MUTATION = `
  mutation DeleteCableCheckAdmin($id: UUID!) {
    cableCheck_delete(id: $id)
  }
`
const CREATE_EB_NEWS_POST_MUTATION = `
  mutation CreateEbNewsPostAdmin($title: String!, $body: String!, $authorId: String!) {
    ebNewsPost_insert(data: { title: $title, body: $body, authorId: $authorId })
  }
`
const DELETE_EB_NEWS_POST_MUTATION = `
  mutation DeleteEbNewsPostAdmin($id: UUID!) {
    ebNewsPost_delete(id: $id)
  }
`
const CREATE_EB_FAQ_ITEM_MUTATION = `
  mutation CreateEbFaqItemAdmin($question: String!, $answer: String!, $createdById: String!) {
    ebFaqItem_insert(data: { question: $question, answer: $answer, createdById: $createdById })
  }
`
const DELETE_EB_FAQ_ITEM_MUTATION = `
  mutation DeleteEbFaqItemAdmin($id: UUID!) {
    ebFaqItem_delete(id: $id)
  }
`
const GET_EB_NEWS_POST_FOR_TRANSLATION_QUERY = `
  query GetEbNewsPostForTranslation($id: UUID!) {
    ebNewsPost(id: $id) {
      title
      body
      translations
    }
  }
`
const SET_EB_NEWS_POST_TRANSLATIONS_MUTATION = `
  mutation SetEbNewsPostTranslations($id: UUID!, $translations: Any) {
    ebNewsPost_update(id: $id, data: { translations: $translations })
  }
`
const GET_EB_FAQ_ITEM_FOR_TRANSLATION_QUERY = `
  query GetEbFaqItemForTranslation($id: UUID!) {
    ebFaqItem(id: $id) {
      question
      answer
      translations
    }
  }
`
const SET_EB_FAQ_ITEM_TRANSLATIONS_MUTATION = `
  mutation SetEbFaqItemTranslations($id: UUID!, $translations: Any) {
    ebFaqItem_update(id: $id, data: { translations: $translations })
  }
`

exports.ebCreateClient = onCall(async (request) => {
  requireAdminOrLab(request)

  const { email, companyName, contactName, phone, country, distributorId, linkedUserId } = request.data ?? {}
  if (
    typeof email !== 'string' || !email.trim() ||
    typeof companyName !== 'string' || !companyName.trim() ||
    typeof contactName !== 'string' || !contactName.trim() ||
    typeof phone !== 'string' || !phone.trim() ||
    typeof country !== 'string' || !country.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_EB_CLIENT_MUTATION, {
    variables: {
      email: email.trim(),
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      country: country.trim(),
      distributorId: distributorId || null,
      linkedUserId: linkedUserId || null,
      createdById: request.auth.uid,
    },
  })
  return { success: true }
})

exports.ebUpdateClient = onCall(async (request) => {
  requireAdminOrLab(request)

  const { clientId, email, companyName, contactName, phone, country, distributorId, linkedUserId } =
    request.data ?? {}
  if (
    typeof clientId !== 'string' ||
    typeof email !== 'string' || !email.trim() ||
    typeof companyName !== 'string' || !companyName.trim() ||
    typeof contactName !== 'string' || !contactName.trim() ||
    typeof phone !== 'string' || !phone.trim() ||
    typeof country !== 'string' || !country.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }
  if (distributorId && distributorId === clientId) {
    throw new HttpsError('invalid-argument', 'Un cliente no puede ser su propio distribuidor.')
  }

  await dataConnect.executeGraphql(UPDATE_EB_CLIENT_MUTATION, {
    variables: {
      id: clientId,
      email: email.trim(),
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      country: country.trim(),
      distributorId: distributorId || null,
      linkedUserId: linkedUserId || null,
    },
  })
  return { success: true }
})

// Client's own products cascade-delete at the DB level (see the
// ebClient_id foreign key in schema.gql/the migration), so there's nothing
// else to clean up here.
exports.ebDeleteClient = onCall(async (request) => {
  requireAdminOrLab(request)

  const { clientId } = request.data ?? {}
  if (typeof clientId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del cliente.')
  }

  await dataConnect.executeGraphql(DELETE_EB_CLIENT_MUTATION, { variables: { id: clientId } })
  return { success: true }
})

exports.ebCreateCableType = onCall(async (request) => {
  requireAdminOrLab(request)

  const { code, name } = request.data ?? {}
  if (typeof code !== 'string' || !code.trim() || typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_EB_CABLE_TYPE_MUTATION, {
    variables: { code: code.trim(), name: name.trim() },
  })
  return { success: true }
})

// The ESP32 tester (see esp32RegisterCableCheck) misfires sometimes and logs
// several checks for what was really one cable - only lets an admin clean up
// a check that was never claimed by a sale (productId null), re-verified
// server-side rather than trusted from the client, so a stale product-picker
// view can't be used to delete a cable that's actually assigned.
// A cable type created by mistake used to be permanent - there was no way to
// remove it, so the catalog only ever grew. Deleting is refused while anything
// points at the type: the checks are the shop's own record of tested cables,
// and a sale's list of included cables is part of what was sold.
const COUNT_CABLE_TYPE_USES_QUERY = `
  query CountCableTypeUsesAdmin($cableTypeId: UUID!) {
    ebCableType(id: $cableTypeId) {
      code
      name
    }
    checks: cableChecks(where: { cableTypeId: { eq: $cableTypeId } }, limit: 1000) {
      id
    }
    sales: ebClientProductCables(where: { cableTypeId: { eq: $cableTypeId } }, limit: 1000) {
      productId
    }
  }
`
const DELETE_EB_CABLE_TYPE_MUTATION = `
  mutation DeleteEbCableTypeAdmin($id: UUID!) {
    ebCableType_delete(id: $id)
  }
`

exports.ebDeleteCableType = onCall(async (request) => {
  requireAdminOrLab(request)

  const { cableTypeId } = request.data ?? {}
  if (typeof cableTypeId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del tipo de cable.')
  }

  const res = await dataConnect.executeGraphqlRead(COUNT_CABLE_TYPE_USES_QUERY, {
    variables: { cableTypeId },
  })
  if (!res.data.ebCableType) {
    throw new HttpsError('not-found', 'Ese tipo de cable no existe.')
  }
  const checks = res.data.checks.length
  const sales = res.data.sales.length
  if (checks > 0 || sales > 0) {
    const usos = [
      checks > 0 ? `${checks} cable${checks > 1 ? 's' : ''} comprobado${checks > 1 ? 's' : ''}` : null,
      sales > 0 ? `${sales} venta${sales > 1 ? 's' : ''}` : null,
    ]
      .filter(Boolean)
      .join(' y ')
    throw new HttpsError(
      'failed-precondition',
      `No se puede eliminar: este tipo de cable se usa en ${usos}.`,
    )
  }

  await dataConnect.executeGraphql(DELETE_EB_CABLE_TYPE_MUTATION, {
    variables: { id: cableTypeId },
  })
  return { success: true }
})

exports.ebDeleteCableCheck = onCall(async (request) => {
  requireAdminOrLab(request)

  const { cableCheckId } = request.data ?? {}
  if (typeof cableCheckId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del cable.')
  }

  const current = await dataConnect.executeGraphqlRead(GET_CABLE_CHECK_PRODUCT_QUERY, {
    variables: { id: cableCheckId },
  })
  if (current.data.cableCheck?.productId) {
    throw new HttpsError(
      'failed-precondition',
      'Este cable está asignado a un producto - desasígnalo antes de eliminarlo.',
    )
  }

  await dataConnect.executeGraphql(DELETE_CABLE_CHECK_MUTATION, { variables: { id: cableCheckId } })
  return { success: true }
})

// Display units (PV450 and friends) are stock like cables, but each is
// individually serial-numbered and isn't a cable - see EbScreen in schema.gql.
// A unit carries at most one display, and that display is what gives the sale
// its serial number - so anything past the first is dropped here rather than
// silently assigned, keeping the rule true of the stored rows and not just of
// the form that submitted them (see ScreenPicker in EbProductsTab.tsx).
function oneScreenId(screenIds) {
  if (!Array.isArray(screenIds)) return null
  return screenIds.length > 0 ? screenIds.slice(0, 1) : []
}

// The display physically carries the unit's serial number, so a sale that
// includes one takes that serial rather than whatever was typed in - the form
// disables the field in that case.
async function serialNumberForSale(screenIds, typedSerialNumber) {
  const ids = oneScreenId(screenIds)
  if (!ids || ids.length === 0) return typedSerialNumber
  const res = await dataConnect.executeGraphqlRead(GET_EB_SCREEN_SERIAL_QUERY, {
    variables: { id: ids[0] },
  })
  return res.data.ebScreen?.serialNumber ?? typedSerialNumber
}

exports.ebRegisterScreen = onCall(async (request) => {
  requireAdminOrLab(request)

  const { reference, model, serialNumber } = request.data ?? {}
  if (
    typeof reference !== 'string' || !reference.trim() ||
    typeof model !== 'string' || !model.trim() ||
    typeof serialNumber !== 'string' || !serialNumber.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_EB_SCREEN_MUTATION, {
    variables: {
      reference: reference.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      registeredById: request.auth.uid,
    },
  })
  return { success: true }
})

// Takes a unit out of stock for something other than an EBcontroller sale
// (or, with an empty reason, puts it back). A unit already claimed by a sale
// has to be removed from that sale first - re-checked here rather than
// trusted from the client, so a stale stock view can't silently detach it.
exports.ebSetScreenUnavailable = onCall(async (request) => {
  requireAdminOrLab(request)

  const { screenId, reason } = request.data ?? {}
  if (typeof screenId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la pantalla.')
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : ''

  const current = await dataConnect.executeGraphqlRead(GET_EB_SCREEN_PRODUCT_QUERY, {
    variables: { id: screenId },
  })
  if (current.data.ebScreen?.productId) {
    throw new HttpsError(
      'failed-precondition',
      'Esta pantalla está asignada a una venta - quítala de la venta antes de marcarla como no disponible.',
    )
  }

  await dataConnect.executeGraphql(SET_EB_SCREEN_UNAVAILABLE_MUTATION, {
    variables: {
      id: screenId,
      unavailableReason: trimmed || null,
      unavailableAt: trimmed ? new Date().toISOString() : null,
    },
  })
  return { success: true }
})

// Corrects a mistyped registration. Allowed even for a unit already attached
// to a sale - this only fixes how the same physical unit is identified, it
// doesn't move it in or out of stock the way assigning/unavailable do.
exports.ebUpdateScreen = onCall(async (request) => {
  requireAdminOrLab(request)

  const { screenId, reference, model, serialNumber } = request.data ?? {}
  if (
    typeof screenId !== 'string' ||
    typeof reference !== 'string' || !reference.trim() ||
    typeof model !== 'string' || !model.trim() ||
    typeof serialNumber !== 'string' || !serialNumber.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(UPDATE_EB_SCREEN_MUTATION, {
    variables: {
      id: screenId,
      reference: reference.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
    },
  })
  return { success: true }
})

// For fixing a mistyped registration. Same rule as ebDeleteCableCheck: a unit
// already claimed by a sale has to be removed from that sale first, re-checked
// here rather than trusted from the client. A unit marked unavailable can be
// deleted - it's still just a stock record, and the "where it went" note isn't
// history anything else points at.
exports.ebDeleteScreen = onCall(async (request) => {
  requireAdminOrLab(request)

  const { screenId } = request.data ?? {}
  if (typeof screenId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la pantalla.')
  }

  const current = await dataConnect.executeGraphqlRead(GET_EB_SCREEN_PRODUCT_QUERY, {
    variables: { id: screenId },
  })
  if (current.data.ebScreen?.productId) {
    throw new HttpsError(
      'failed-precondition',
      'Esta pantalla está asignada a una venta - quítala de la venta antes de eliminarla.',
    )
  }

  await dataConnect.executeGraphql(DELETE_EB_SCREEN_MUTATION, { variables: { id: screenId } })
  return { success: true }
})

// Every admin opening the sales list loads this as an <img>, so it has to be
// one of our own uploads (uploadEbWallpaper), not whatever URL a caller sends.
function wallpaperUrlOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${admin.storage().bucket().name}/o/eb-wallpapers%2F`
  if (typeof value !== 'string' || !value.startsWith(prefix)) {
    throw new HttpsError('invalid-argument', 'El fondo de pantalla no es válido.')
  }
  return value
}

exports.ebAddClientProduct = onCall(async (request) => {
  requireAdminOrLab(request)

  const {
    clientId,
    serialNumber,
    hardwareNumber,
    softwareVersion,
    purchasedAt,
    programFileUrl,
    wallpaperUrl,
    observations,
    internalUse,
    cableTypeIds,
    cableCheckIds,
    screenIds,
  } = request.data ?? {}
  if (
    typeof clientId !== 'string' ||
    typeof serialNumber !== 'string' || !serialNumber.trim() ||
    typeof hardwareNumber !== 'string' || !hardwareNumber.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const res = await dataConnect.executeGraphql(CREATE_EB_CLIENT_PRODUCT_MUTATION, {
    variables: {
      clientId,
      serialNumber: await serialNumberForSale(screenIds, serialNumber.trim()),
      hardwareNumber: hardwareNumber.trim(),
      softwareVersion: softwareVersion?.trim() || null,
      purchasedAt: purchasedAt || null,
      programFileUrl: programFileUrl || null,
      wallpaperUrl: wallpaperUrlOrNull(wallpaperUrl),
      observations: observations || null,
      internalUse: internalUse === true,
      createdById: request.auth.uid,
    },
  })
  const productId = res.data.ebClientProduct_insert.id

  for (const cableTypeId of Array.isArray(cableTypeIds) ? cableTypeIds : []) {
    await dataConnect.executeGraphql(ADD_EB_CLIENT_PRODUCT_CABLE_MUTATION, {
      variables: { productId, cableTypeId },
    })
  }
  for (const cableCheckId of Array.isArray(cableCheckIds) ? cableCheckIds : []) {
    await dataConnect.executeGraphql(SET_CABLE_CHECK_PRODUCT_MUTATION, {
      variables: { id: cableCheckId, productId },
    })
  }
  for (const screenId of oneScreenId(screenIds) ?? []) {
    await dataConnect.executeGraphql(SET_EB_SCREEN_PRODUCT_MUTATION, {
      variables: { id: screenId, productId },
    })
  }

  return { productId }
})

// clientId is reassignable here on purpose: when a distributor reports
// having resold a unit to one of their own end clients, the admin repoints
// this same purchase record at that end client (creating it first if it's
// new - see ebCreateClient's distributorId) rather than creating a
// duplicate record, since it's still the same physical unit.
exports.ebUpdateClientProduct = onCall(async (request) => {
  requireAdminOrLab(request)

  const {
    productId,
    clientId,
    serialNumber,
    hardwareNumber,
    softwareVersion,
    purchasedAt,
    programFileUrl,
    wallpaperUrl,
    observations,
    soldToEndUserAt,
    internalUse,
    cableTypeIds,
    cableCheckIds,
    screenIds,
  } = request.data ?? {}
  if (
    typeof productId !== 'string' ||
    typeof clientId !== 'string' ||
    typeof serialNumber !== 'string' || !serialNumber.trim() ||
    typeof hardwareNumber !== 'string' || !hardwareNumber.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(UPDATE_EB_CLIENT_PRODUCT_MUTATION, {
    variables: {
      id: productId,
      clientId,
      serialNumber: await serialNumberForSale(screenIds, serialNumber.trim()),
      hardwareNumber: hardwareNumber.trim(),
      softwareVersion: softwareVersion?.trim() || null,
      purchasedAt: purchasedAt || null,
      programFileUrl: programFileUrl || null,
      wallpaperUrl: wallpaperUrlOrNull(wallpaperUrl),
      observations: observations || null,
      soldToEndUserAt: soldToEndUserAt || null,
      internalUse: internalUse === true,
    },
  })

  if (Array.isArray(cableTypeIds)) {
    await dataConnect.executeGraphql(DELETE_EB_CLIENT_PRODUCT_CABLES_MUTATION, { variables: { productId } })
    for (const cableTypeId of cableTypeIds) {
      await dataConnect.executeGraphql(ADD_EB_CLIENT_PRODUCT_CABLE_MUTATION, {
        variables: { productId, cableTypeId },
      })
    }
  }

  if (Array.isArray(cableCheckIds)) {
    const assignedRes = await dataConnect.executeGraphql(GET_ASSIGNED_CABLE_CHECKS_QUERY, {
      variables: { productId },
    })
    const currentIds = assignedRes.data.cableChecks.map((c) => c.id)
    const nextIds = new Set(cableCheckIds)
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        await dataConnect.executeGraphql(SET_CABLE_CHECK_PRODUCT_MUTATION, {
          variables: { id, productId: null },
        })
      }
    }
    for (const id of cableCheckIds) {
      if (!currentIds.includes(id)) {
        await dataConnect.executeGraphql(SET_CABLE_CHECK_PRODUCT_MUTATION, {
          variables: { id, productId },
        })
      }
    }
  }

  const desiredScreenIds = oneScreenId(screenIds)
  if (desiredScreenIds) {
    const assignedRes = await dataConnect.executeGraphql(GET_ASSIGNED_EB_SCREENS_QUERY, {
      variables: { productId },
    })
    const currentIds = assignedRes.data.ebScreens.map((s) => s.id)
    const nextIds = new Set(desiredScreenIds)
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        await dataConnect.executeGraphql(SET_EB_SCREEN_PRODUCT_MUTATION, {
          variables: { id, productId: null },
        })
      }
    }
    for (const id of desiredScreenIds) {
      if (!currentIds.includes(id)) {
        await dataConnect.executeGraphql(SET_EB_SCREEN_PRODUCT_MUTATION, {
          variables: { id, productId },
        })
      }
    }
  }

  return { success: true }
})

// Marks a unit decommissioned (e.g. broken) or reactivates it, without
// touching any of its other fields - kept separate from ebUpdateClientProduct
// so editing e.g. its observations doesn't reset how long it's been retired.
// Preserves the original retiredAt if it was already retired, rather than
// bumping it to "now" on every unrelated no-op toggle.
exports.ebSetClientProductRetired = onCall(async (request) => {
  requireAdminOrLab(request)

  const { productId, retired } = request.data ?? {}
  if (typeof productId !== 'string' || typeof retired !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  let retiredAt = null
  if (retired) {
    const current = await dataConnect.executeGraphqlRead(GET_EB_CLIENT_PRODUCT_RETIRED_QUERY, {
      variables: { id: productId },
    })
    retiredAt = current.data.ebClientProduct?.retiredAt ?? new Date().toISOString()
  }

  await dataConnect.executeGraphql(RETIRE_EB_CLIENT_PRODUCT_MUTATION, { variables: { id: productId, retiredAt } })
  return { success: true }
})

exports.ebDeleteClientProduct = onCall(async (request) => {
  requireAdminOrLab(request)

  const { productId } = request.data ?? {}
  if (typeof productId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador del producto.')
  }

  await dataConnect.executeGraphql(DELETE_EB_CLIENT_PRODUCT_MUTATION, { variables: { id: productId } })
  return { success: true }
})

// The rich text editor (RichTextEditor.tsx) already only produces this
// subset, but the sanitizer is what actually keeps stored posts safe - any
// caller can invoke this function directly with arbitrary HTML, and this
// section is expected to end up visible to far more than admin:lab once
// it's opened up (see EbEngineeringPage.tsx). Images always come from our
// own Storage upload (uploadEbNewsImage), so only http(s) is allowed - no
// data: URIs.
const EB_NEWS_BODY_SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3',
    'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true),
  },
}

exports.ebCreateNewsPost = onCall(async (request) => {
  requireAdminOrLab(request)

  const { title, body } = request.data ?? {}
  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string') {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  const sanitizedBody = sanitizeHtml(body, EB_NEWS_BODY_SANITIZE_OPTIONS)
  if (!sanitizeHtml(sanitizedBody, { allowedTags: [] }).trim() && !sanitizedBody.includes('<img')) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_EB_NEWS_POST_MUTATION, {
    variables: { title: title.trim(), body: sanitizedBody, authorId: request.auth.uid },
  })
  return { success: true }
})

exports.ebDeleteNewsPost = onCall(async (request) => {
  requireAdminOrLab(request)

  const { postId } = request.data ?? {}
  if (typeof postId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la noticia.')
  }

  await dataConnect.executeGraphql(DELETE_EB_NEWS_POST_MUTATION, { variables: { id: postId } })
  return { success: true }
})

exports.ebCreateFaqItem = onCall(async (request) => {
  requireAdminOrLab(request)

  const { question, answer } = request.data ?? {}
  if (typeof question !== 'string' || !question.trim() || typeof answer !== 'string' || !answer.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.')
  }

  await dataConnect.executeGraphql(CREATE_EB_FAQ_ITEM_MUTATION, {
    variables: { question: question.trim(), answer: answer.trim(), createdById: request.auth.uid },
  })
  return { success: true }
})

exports.ebDeleteFaqItem = onCall(async (request) => {
  requireAdminOrLab(request)

  const { faqId } = request.data ?? {}
  if (typeof faqId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador de la pregunta.')
  }

  await dataConnect.executeGraphql(DELETE_EB_FAQ_ITEM_MUTATION, { variables: { id: faqId } })
  return { success: true }
})

// Matches EbLang in src/lib/ebI18n.tsx (minus "es", the language everything
// is authored in - nothing to translate for that one).
const EB_LANGUAGE_NAMES = {
  en: 'English',
  fr: 'French',
  it: 'Italian',
  tr: 'Turkish',
  sv: 'Swedish',
  bg: 'Bulgarian',
  hr: 'Croatian',
  el: 'Greek',
  nl: 'Dutch',
  no: 'Norwegian',
  de: 'German',
  sr: 'Serbian',
  pt: 'Portuguese',
  ja: 'Japanese',
}

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

async function translateFields(fields, targetLanguageName) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() })
  const keys = Object.keys(fields)
  const properties = {}
  for (const key of keys) properties[key] = { type: Type.STRING }

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Translate the string values of this JSON object from Spanish into ${targetLanguageName}. ` +
              'Preserve any HTML tags and attributes exactly as-is, translating only the visible text ' +
              'between them. Do not translate the product/brand names "EBcontroller", "EB Engineering" ' +
              `or "Elías Blanco". Return a JSON object with exactly the same keys.\n\n${JSON.stringify(fields)}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: { type: Type.OBJECT, properties, required: keys },
    },
  })

  return JSON.parse(response.text)
}

// Lazily translates a news post or FAQ item into `lang` via Gemini and
// caches the result on the row itself (EbNewsPost/EbFaqItem.translations,
// keyed by language code) so it's only ever translated once per language -
// see the `lang` prop on EbNewsTab/EbFaqTab. Any signed-in user can call
// this (not just admins) since EB Engineering clients are the ones actually
// switching languages on "Mis productos".
exports.ebTranslateEbContent = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  }

  const { kind, id, lang } = request.data ?? {}
  const languageName = EB_LANGUAGE_NAMES[lang]
  if (!languageName) {
    throw new HttpsError('invalid-argument', 'Idioma no soportado.')
  }
  if (typeof id !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el identificador.')
  }

  if (kind === 'news') {
    const res = await dataConnect.executeGraphqlRead(GET_EB_NEWS_POST_FOR_TRANSLATION_QUERY, {
      variables: { id },
    })
    const post = res.data.ebNewsPost
    if (!post) throw new HttpsError('not-found', 'Noticia no encontrada.')

    const cached = post.translations?.[lang]
    if (cached) return cached

    const translated = await translateFields({ title: post.title, body: post.body }, languageName)
    await dataConnect.executeGraphql(SET_EB_NEWS_POST_TRANSLATIONS_MUTATION, {
      variables: { id, translations: { ...(post.translations ?? {}), [lang]: translated } },
    })
    return translated
  }

  if (kind === 'faq') {
    const res = await dataConnect.executeGraphqlRead(GET_EB_FAQ_ITEM_FOR_TRANSLATION_QUERY, {
      variables: { id },
    })
    const item = res.data.ebFaqItem
    if (!item) throw new HttpsError('not-found', 'Pregunta no encontrada.')

    const cached = item.translations?.[lang]
    if (cached) return cached

    const translated = await translateFields({ question: item.question, answer: item.answer }, languageName)
    await dataConnect.executeGraphql(SET_EB_FAQ_ITEM_TRANSLATIONS_MUTATION, {
      variables: { id, translations: { ...(item.translations ?? {}), [lang]: translated } },
    })
    return translated
  }

  throw new HttpsError('invalid-argument', 'Tipo de contenido no soportado.')
})

// --- Cable tester (ESP32 device) --------------------------------------------
// The tester has no interactive sign-in, so it can't use the normal
// onCall + Firebase-Auth-ID-token flow every other write in this file goes
// through. These are plain HTTP endpoints instead, gated by a shared secret
// (set via `firebase functions:secrets:set CABLE_CHECK_DEVICE_SECRET` -
// see the deploy guide) sent as the `x-device-secret` header. Everything
// else (looking up the cable/user, reserving the sequence number, writing
// the row) still goes through Data Connect via the Admin SDK, same as the
// rest of this file.

const CABLE_CHECK_DEVICE_SECRET = defineSecret('CABLE_CHECK_DEVICE_SECRET')

const GET_MAX_CABLE_CHECK_SEQUENCE_QUERY = `
  query GetMaxCableCheckSequenceAdmin {
    cableChecks(orderBy: { sequenceNumber: DESC }, limit: 1) {
      sequenceNumber
    }
  }
`
const GET_CABLE_TYPE_BY_CODE_QUERY = `
  query GetCableTypeByCodeAdmin($code: String!) {
    ebCableTypes(where: { code: { eq: $code } }, limit: 1) {
      id
    }
  }
`
const GET_USER_FOR_CABLE_CHECK_QUERY = `
  query GetUserForCableCheckAdmin($id: String!) {
    user(id: $id) {
      id
      isActive
    }
  }
`
const CREATE_CABLE_CHECK_MUTATION = `
  mutation CreateCableCheckAdmin($sequenceNumber: Int!, $cableTypeId: UUID!, $checkedById: String!) {
    cableCheck_insert(
      data: { sequenceNumber: $sequenceNumber, cableTypeId: $cableTypeId, checkedById: $checkedById }
    )
  }
`

// Same bootstrap-from-max-then-Firestore-transaction shape as
// reserveOrderSequenceNumber/reserveInterventionSequenceNumber above - one
// global counter, no per-cable-type split.
async function reserveCableCheckSequenceNumber() {
  const ref = admin.firestore().collection('cableCheckSequenceCounters').doc('global')
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    let current = snap.data()?.lastNumber
    if (current == null) {
      const res = await dataConnect.executeGraphqlRead(GET_MAX_CABLE_CHECK_SEQUENCE_QUERY, {})
      current = res.data.cableChecks[0]?.sequenceNumber ?? 0
    }
    const next = current + 1
    tx.set(ref, { lastNumber: next }, { merge: true })
    return next
  })
}

function checkDeviceSecret(req, res) {
  const provided = req.get('x-device-secret')
  if (!provided || provided !== CABLE_CHECK_DEVICE_SECRET.value()) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

// GET, header `x-device-secret` - returns the sequence number of the most
// recently registered check (0 if there isn't one yet), so the device can
// display/log "next will be N+1" without having to track it itself.
exports.esp32GetLastCableCheck = onRequest({ secrets: [CABLE_CHECK_DEVICE_SECRET] }, async (req, res) => {
  if (!checkDeviceSecret(req, res)) return
  const res1 = await dataConnect.executeGraphqlRead(GET_MAX_CABLE_CHECK_SEQUENCE_QUERY, {})
  res.status(200).json({ lastSequenceNumber: res1.data.cableChecks[0]?.sequenceNumber ?? 0 })
})

// POST, header `x-device-secret`, JSON body { cableCode, userEmail } - e.g.
// { "cableCode": "EBEN180100", "userEmail": "tecnico@eliasblanco.com" }.
// userEmail (not a raw uid) so whoever sets up the device firmware can use
// something they actually know - resolved to the matching User row here.
exports.esp32RegisterCableCheck = onRequest({ secrets: [CABLE_CHECK_DEVICE_SECRET] }, async (req, res) => {
  if (!checkDeviceSecret(req, res)) return

  const { cableCode, userEmail } = req.body ?? {}
  if (typeof cableCode !== 'string' || !cableCode.trim() || typeof userEmail !== 'string' || !userEmail.trim()) {
    res.status(400).json({ error: 'cableCode y userEmail son obligatorios.' })
    return
  }

  const cableRes = await dataConnect.executeGraphqlRead(GET_CABLE_TYPE_BY_CODE_QUERY, {
    variables: { code: cableCode.trim() },
  })
  const cableTypeId = cableRes.data.ebCableTypes[0]?.id
  if (!cableTypeId) {
    res.status(404).json({ error: `No existe ningún cable con el código "${cableCode}".` })
    return
  }

  let userId
  try {
    userId = (await admin.auth().getUserByEmail(userEmail.trim())).uid
  } catch {
    res.status(404).json({ error: `No existe ningún usuario con el email "${userEmail}".` })
    return
  }
  const userRes = await dataConnect.executeGraphqlRead(GET_USER_FOR_CABLE_CHECK_QUERY, {
    variables: { id: userId },
  })
  if (!userRes.data.user?.isActive) {
    res.status(403).json({ error: 'El usuario no existe o está desactivado.' })
    return
  }

  const sequenceNumber = await reserveCableCheckSequenceNumber()
  const insertRes = await dataConnect.executeGraphql(CREATE_CABLE_CHECK_MUTATION, {
    variables: { sequenceNumber, cableTypeId, checkedById: userId },
  })

  res.status(200).json({ id: insertRes.data.cableCheck_insert.id, sequenceNumber })
})

// Manual counterpart to esp32RegisterCableCheck for stock that doesn't go
// through the tester (e.g. the EBcontroller case itself, or an EBups cable) -
// same sequence counter and insert shape, just admin/admin:lab-authenticated
// through the normal app sign-in instead of the device secret.
exports.ebRegisterCableCheck = onCall(async (request) => {
  requireAdminOrLab(request)

  const { cableTypeId } = request.data ?? {}
  if (typeof cableTypeId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el tipo de cable.')
  }

  const sequenceNumber = await reserveCableCheckSequenceNumber()
  const insertRes = await dataConnect.executeGraphql(CREATE_CABLE_CHECK_MUTATION, {
    variables: { sequenceNumber, cableTypeId, checkedById: request.auth.uid },
  })

  return { id: insertRes.data.cableCheck_insert.id, sequenceNumber }
})

// ---------------------------------------------------------------------------
// Service ratings - the tablets in the workshops run a separate Flutter app
// ("EB Rating App") that writes to its own Firebase project (ebratingapp),
// not to this one. Read with the Admin SDK against that project rather than
// its public web API key: the key is embedded in the tablet app, so it can't
// be the thing that guards this data - ebratingapp's Firestore rules are
// create-only, and the Admin SDK bypasses rules using this project's runtime
// service account, which was granted read access on ebratingapp via IAM.
// Proxied through here (instead of read from the browser) so the ratings
// screen sits behind the same permission model as everything else.
// ---------------------------------------------------------------------------

let ratingsDb = null
function getRatingsDb() {
  if (!ratingsDb) {
    const app = admin.initializeApp({ projectId: 'ebratingapp' }, 'ebratingapp')
    ratingsDb = admin.firestore(app)
  }
  return ratingsDb
}

// The tablet app writes `date` as a Firestore timestamp; older rows can be
// missing it, so fall back to the document's own creation time.
function toIsoDate(value, fallback) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'string') return value
  return fallback
}

async function fetchAllServiceRatings() {
  const snapshot = await getRatingsDb().collection('Ratings').get()
  const ratings = snapshot.docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      rating: typeof d.rating === 'number' ? d.rating : 0,
      comments: typeof d.comments === 'string' ? d.comments : '',
      // See enum Location { none, menachaAlgeciras, varaderoLaLinea } and the
      // serviceType toggle in the rating app's Rating.dart - both are stored
      // as the raw index, mapped to labels in the frontend.
      location: typeof d.location === 'number' ? d.location : 0,
      serviceType: typeof d.serviceType === 'number' ? d.serviceType : 0,
      date: toIsoDate(d.date, doc.createTime.toDate().toISOString()),
    }
  })
  ratings.sort((a, b) => (a.date < b.date ? 1 : -1))
  return ratings
}

exports.listServiceRatings = onCall(async (request) => {
  requirePermission(request, 'ratings:view')
  return { ratings: await fetchAllServiceRatings() }
})

// Returns the report inline as base64 rather than uploading it to Storage:
// it's regenerated per requested period, so keeping copies of every export
// would just accumulate files nobody points at.
exports.exportRatingsPdf = onCall(async (request) => {
  requirePermission(request, 'ratings:view')

  const { from, to } = request.data ?? {}
  if ((from && typeof from !== 'string') || (to && typeof to !== 'string')) {
    throw new HttpsError('invalid-argument', 'Fechas no válidas.')
  }

  const all = await fetchAllServiceRatings()
  // `to` is an inclusive day, so compare against its end rather than midnight.
  const fromTime = from ? new Date(`${from}T00:00:00.000Z`).getTime() : null
  const toTime = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null
  const ratings = all.filter((r) => {
    const t = new Date(r.date).getTime()
    if (fromTime !== null && t < fromTime) return false
    if (toTime !== null && t > toTime) return false
    return true
  })

  const buffer = await renderRatingsPdfBuffer({
    ratings,
    from: from || null,
    to: to || null,
    generatedAt: new Date().toISOString(),
  })

  return { pdfBase64: buffer.toString('base64'), count: ratings.length }
})
