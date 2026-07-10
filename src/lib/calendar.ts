import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

interface ScheduleWorkOrderInput {
  workOrderId: string
  /** ISO "YYYY-MM-DD", or null to remove the order from the calendar. */
  scheduledDate: string | null
}

const callScheduleWorkOrder = httpsCallable<ScheduleWorkOrderInput, { success: boolean }>(
  functions,
  'scheduleWorkOrder',
)

/** Sets/clears a work order's calendar day - requires calendar:manage. */
export async function scheduleWorkOrder(workOrderId: string, scheduledDate: string | null) {
  const res = await callScheduleWorkOrder({ workOrderId, scheduledDate })
  return res.data
}
