import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/** One shift as the hours log shows it (see listTimeLogs in functions/index.js). */
export interface HoursLogShift {
  id: string
  clockIn: string
  /** Null while the shift is still open. */
  clockOut: string | null
  durationMinutes: number | null
  /** Replayed from the phone's offline queue, so the times are the phone's. */
  recordedOffline: boolean
  technicianId: string
  technicianName: string
  workOrder: { id: string; code: string; boatName: string | null; deleted: boolean }
}

export interface HoursLogResult {
  /** Active users holding orders:assignable, alphabetically. */
  technicians: { id: string; displayName: string }[]
  /** Set when the log was asked for one order. */
  order: { id: string; code: string } | null
  /** Oldest first. */
  timeLogs: HoursLogShift[]
}

/** Longest range of days one request can ask for (mirrors HOURS_LOG_MAX_DAYS on the server). */
export const HOURS_LOG_MAX_DAYS = 93

const callListTimeLogs = httpsCallable<
  { from: string; to: string } | { orderCode: string },
  HoursLogResult
>(functions, 'listTimeLogs')

/**
 * Either a range (from inclusive, to exclusive, both ISO instants) or one
 * order's code. Requires "admin:hourslog".
 */
export async function listTimeLogs(input: { from: string; to: string } | { orderCode: string }) {
  const res = await callListTimeLogs(input)
  return res.data
}
