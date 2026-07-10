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
