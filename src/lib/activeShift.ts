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

/** What the "Turno activo" bar needs to show a shift. */
export interface ActiveShiftSummary {
  workOrderId: string
  clockIn: string
  workOrder: { code: string }
}

const ACTIVE_SHIFT_CHANGED = 'portaleb:active-shift-changed'

/**
 * Tells the "Turno activo" bar (ActiveShiftBanner) that a clock-in or
 * clock-out just happened, with the shift now open (null if none). Without
 * it the bar only noticed on its next 30-second poll, and kept counting a
 * shift that was already closed.
 */
export function announceActiveShift(shift: ActiveShiftSummary | null) {
  window.dispatchEvent(new CustomEvent(ACTIVE_SHIFT_CHANGED, { detail: shift }))
}

export function onActiveShiftAnnounced(listener: (shift: ActiveShiftSummary | null) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<ActiveShiftSummary | null>).detail)
  window.addEventListener(ACTIVE_SHIFT_CHANGED, handler)
  return () => window.removeEventListener(ACTIVE_SHIFT_CHANGED, handler)
}
