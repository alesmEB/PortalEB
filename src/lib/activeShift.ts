import { WorkOrderStatus } from '@dataconnect/generated'

// A finished order has no shifts left open: completeWorkOrder clocks everyone
// out. So an open shift on one can only be leftover data - the Sotogrande
// hours migrated from the old app kept the clock-out the technician never
// pressed, and that had Pedro shown as "working" on an order closed in
// January, with the half-hourly reminder pushing it all day. Same filter runs
// server-side in functions/index.js (pickActiveTimeLog).
const CLOSED_STATUSES: WorkOrderStatus[] = [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED]

export function isLeftoverShift(log: { workOrder: { status: WorkOrderStatus } }) {
  return CLOSED_STATUSES.includes(log.workOrder.status)
}

export function pickActiveShift<T extends { workOrder: { status: WorkOrderStatus } }>(
  logs: readonly T[],
): T | null {
  return logs.find((log) => !isLeftoverShift(log)) ?? null
}
