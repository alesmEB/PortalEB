import { httpsCallable } from 'firebase/functions'
import type { MediaType } from '@dataconnect/generated'
import { functions } from './firebase'

interface PhotoInput {
  url: string
  mediaType: MediaType
}

const callAddQuote = httpsCallable<
  { workOrderId: string; fileUrl: string },
  { attemptNumber: number }
>(functions, 'addQuote')

export async function addQuote(workOrderId: string, fileUrl: string) {
  const res = await callAddQuote({ workOrderId, fileUrl })
  return res.data
}

const callAcceptQuote = httpsCallable<{ workOrderId: string }, { success: boolean }>(
  functions,
  'acceptQuote',
)

export async function acceptQuote(workOrderId: string) {
  const res = await callAcceptQuote({ workOrderId })
  return res.data
}

interface AssignTechniciansInput {
  workOrderId: string
  code: string
  assignments: { technicianId: string; isAllowed: boolean; isLead: boolean }[]
  /** Technician ids the modal was opened with - lets the server detect a concurrent edit. */
  expectedTechnicianIds: string[]
}

const callAssignTechnicians = httpsCallable<
  AssignTechniciansInput,
  { assigned: number; unassigned: number }
>(functions, 'assignTechnicians')

export async function assignTechnicians(input: AssignTechniciansInput) {
  const res = await callAssignTechnicians(input)
  return res.data
}

const callStartOrder = httpsCallable<
  { workOrderId: string; photos: PhotoInput[] },
  { success: boolean }
>(functions, 'startOrder')

export async function startOrder(workOrderId: string, photos: PhotoInput[]) {
  const res = await callStartOrder({ workOrderId, photos })
  return res.data
}

const callCompleteOrder = httpsCallable<
  { workOrderId: string; photos: PhotoInput[] },
  { success: boolean }
>(functions, 'completeOrder')

export async function completeOrder(workOrderId: string, photos: PhotoInput[]) {
  const res = await callCompleteOrder({ workOrderId, photos })
  return res.data
}

interface ReportIncidentInput {
  workOrderId: string
  description: string
  photos: PhotoInput[]
}

const callReportIncident = httpsCallable<ReportIncidentInput, { incidentId: string }>(
  functions,
  'reportIncident',
)

export async function reportIncident(input: ReportIncidentInput) {
  const res = await callReportIncident(input)
  return res.data
}

interface AddOrderNoteInput {
  workOrderId: string
  body: string
}

const callAddOrderNote = httpsCallable<AddOrderNoteInput, { noteId: string }>(functions, 'addOrderNote')

/** Requires the "orders:notes" permission. */
export async function addOrderNote(input: AddOrderNoteInput) {
  const res = await callAddOrderNote(input)
  return res.data
}

const callAdjustOrder = httpsCallable<{ workOrderId: string }, { success: boolean }>(
  functions,
  'adjustOrder',
)

/** Requires "orders:closing" and the order being COMPLETED. */
export async function adjustOrder(workOrderId: string) {
  const res = await callAdjustOrder({ workOrderId })
  return res.data
}

const callRecordServiceProtocol = httpsCallable<
  { workOrderId: string; done: boolean },
  { success: boolean }
>(functions, 'recordServiceProtocol')

/** Requires "orders:closing" and the order already being adjusted. */
export async function recordServiceProtocol(workOrderId: string, done: boolean) {
  const res = await callRecordServiceProtocol({ workOrderId, done })
  return res.data
}

const callInvoiceOrder = httpsCallable<{ workOrderId: string }, { success: boolean }>(
  functions,
  'invoiceOrder',
)

/** Requires "orders:closing" and the service protocol already being recorded. */
export async function invoiceOrder(workOrderId: string) {
  const res = await callInvoiceOrder({ workOrderId })
  return res.data
}

const callToggleWorkOrderTask = httpsCallable<
  { taskId: string; isCompleted: boolean },
  { success: boolean }
>(functions, 'toggleWorkOrderTask')

/** Requires being assigned to the order and the order being IN_PROGRESS. */
export async function toggleWorkOrderTask(taskId: string, isCompleted: boolean) {
  const res = await callToggleWorkOrderTask({ taskId, isCompleted })
  return res.data
}

const callStartWorking = httpsCallable<{ workOrderId: string }, { switchedFrom: string | null }>(
  functions,
  'startWorking',
)

export async function startWorking(workOrderId: string) {
  const res = await callStartWorking({ workOrderId })
  return res.data
}

const callStopWorking = httpsCallable<undefined, { success: boolean }>(functions, 'stopWorking')

export async function stopWorking() {
  const res = await callStopWorking()
  return res.data
}

interface AdminUpdateTimeLogInput {
  timeLogId: string
  /** ISO datetime strings. */
  clockIn: string
  clockOut: string
}

const callAdminUpdateTimeLog = httpsCallable<AdminUpdateTimeLogInput, { durationMinutes: number }>(
  functions,
  'adminUpdateTimeLog',
)

/** Corrects an already-finished shift's times - requires admin:manage. */
export async function adminUpdateTimeLog(input: AdminUpdateTimeLogInput) {
  const res = await callAdminUpdateTimeLog(input)
  return res.data
}

const callAdminDeleteTimeLog = httpsCallable<{ timeLogId: string }, { success: boolean }>(
  functions,
  'adminDeleteTimeLog',
)

/** Removes an already-finished shift entirely - requires admin:manage. */
export async function adminDeleteTimeLog(timeLogId: string) {
  const res = await callAdminDeleteTimeLog({ timeLogId })
  return res.data
}
