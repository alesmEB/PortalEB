import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

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
  locationCode: 'ALGECIRAS' | 'LA_LINEA' | 'SOTOGRANDE'
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
