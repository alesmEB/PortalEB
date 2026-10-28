import { httpsCallable } from 'firebase/functions'
import type { OrderLocation } from '@dataconnect/generated'
import { functions } from './firebase'
import { orderLocationLabel } from './orderCode'

/** One of our three locations, or the free text of one elsewhere ("Cádiz"). */
export function appointmentLocationLabel(appointment: {
  locationCode?: OrderLocation | null
  customLocation?: string | null
}) {
  if (appointment.customLocation) return appointment.customLocation
  return appointment.locationCode ? orderLocationLabel[appointment.locationCode] : ''
}

interface SetWorkOrderScheduledDateInput {
  workOrderId: string
  /** ISO "YYYY-MM-DD". */
  date: string
  /** true to add the day, false to remove it. */
  scheduled: boolean
}

const callSetWorkOrderScheduledDate = httpsCallable<
  SetWorkOrderScheduledDateInput,
  { success: boolean }
>(functions, 'setWorkOrderScheduledDate')

/** Adds/removes one calendar day for a work order - requires calendar:manage. */
export async function setWorkOrderScheduledDate(workOrderId: string, date: string, scheduled: boolean) {
  const res = await callSetWorkOrderScheduledDate({ workOrderId, date, scheduled })
  return res.data
}

export interface CalendarAppointmentInput {
  title: string
  /** Free text - these are boats with no record in the system yet. */
  boatDetails?: string
  /** One of these two: our own location, or free text for anywhere else. */
  locationCode?: 'ALGECIRAS' | 'LA_LINEA' | 'SOTOGRANDE'
  customLocation?: string
  /** The billing system's order number, if the job already has one there. */
  externalCode?: string
  notes?: string
}

const callCreateCalendarAppointment = httpsCallable<
  CalendarAppointmentInput,
  { appointmentId: string }
>(functions, 'createCalendarAppointment')

/** A calendar entry with no work order behind it - admin (or admin:lab) only. */
export async function createCalendarAppointment(input: CalendarAppointmentInput) {
  const res = await callCreateCalendarAppointment(input)
  return res.data
}

const callUpdateCalendarAppointment = httpsCallable<
  CalendarAppointmentInput & { appointmentId: string },
  { success: boolean }
>(functions, 'updateCalendarAppointment')

export async function updateCalendarAppointment(
  appointmentId: string,
  input: CalendarAppointmentInput,
) {
  const res = await callUpdateCalendarAppointment({ appointmentId, ...input })
  return res.data
}

const callSetCalendarAppointmentClosed = httpsCallable<
  { appointmentId: string; closed: boolean },
  { success: boolean }
>(functions, 'setCalendarAppointmentClosed')

/** Completing (closed: true) keeps the appointment's days in the calendar but
 * drops it from the panel - this is the "sin orden" path, shown grey. The
 * "crea orden" path completes it from createWorkOrder instead. */
export async function setCalendarAppointmentClosed(appointmentId: string, closed: boolean) {
  const res = await callSetCalendarAppointmentClosed({ appointmentId, closed })
  return res.data
}

const callSetCalendarAppointmentRemarks = httpsCallable<
  { appointmentId: string; remarks: string },
  { success: boolean }
>(functions, 'setCalendarAppointmentRemarks')

/** The appointment's free notes, in any state; an empty string clears them. */
export async function setCalendarAppointmentRemarks(appointmentId: string, remarks: string) {
  const res = await callSetCalendarAppointmentRemarks({ appointmentId, remarks })
  return res.data
}

const callOpenAppointmentVisit = httpsCallable<{ appointmentId: string }, { workOrderId: string }>(
  functions,
  'openAppointmentVisit',
)

/** The appointment's visit order (made on first use) - where technicians
 * are assigned and clock in. Requires admin:assigntechnicians. */
export async function openAppointmentVisit(appointmentId: string) {
  const res = await callOpenAppointmentVisit({ appointmentId })
  return res.data
}

const callAddAppointmentPhotos = httpsCallable<
  { appointmentId: string; photos: { url: string; mediaType: 'PHOTO' | 'VIDEO' }[] },
  { added: number }
>(functions, 'addAppointmentPhotos')

/** The office on any appointment; a technician on one they're assigned to. */
export async function addAppointmentPhotos(
  appointmentId: string,
  photos: { url: string; mediaType: 'PHOTO' | 'VIDEO' }[],
) {
  const res = await callAddAppointmentPhotos({ appointmentId, photos })
  return res.data
}

const callDeleteAppointmentPhoto = httpsCallable<{ photoId: string }, { success: boolean }>(
  functions,
  'deleteAppointmentPhoto',
)

/** Admin (or lab) only. */
export async function deleteAppointmentPhoto(photoId: string) {
  const res = await callDeleteAppointmentPhoto({ photoId })
  return res.data
}

const callMarkAppointmentDone = httpsCallable<
  { appointmentId: string; done: boolean },
  { success: boolean }
>(functions, 'markAppointmentDone')

/** "Realizada": the visit is over and the office can decide how it ends.
 * Clocks the caller out of the visit if they're still on it. */
export async function markAppointmentDone(appointmentId: string, done: boolean) {
  const res = await callMarkAppointmentDone({ appointmentId, done })
  return res.data
}

const callDeleteCalendarAppointment = httpsCallable<
  { appointmentId: string },
  { success: boolean }
>(functions, 'deleteCalendarAppointment')

/** Removes the appointment and every day it was on - for entries created by mistake. */
export async function deleteCalendarAppointment(appointmentId: string) {
  const res = await callDeleteCalendarAppointment({ appointmentId })
  return res.data
}

const callSetCalendarAppointmentScheduledDate = httpsCallable<
  { appointmentId: string; date: string; scheduled: boolean },
  { success: boolean }
>(functions, 'setCalendarAppointmentScheduledDate')

/** Adds/removes one calendar day for an appointment. */
export async function setCalendarAppointmentScheduledDate(
  appointmentId: string,
  date: string,
  scheduled: boolean,
) {
  const res = await callSetCalendarAppointmentScheduledDate({ appointmentId, date, scheduled })
  return res.data
}
