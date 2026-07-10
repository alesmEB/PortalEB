import { WorkOrderStatus } from '@dataconnect/generated'

export const workOrderStatusLabel: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.PENDING_QUOTE]: 'Pendiente de presupuesto',
  [WorkOrderStatus.QUOTE_REJECTED]: 'Presupuesto rechazado',
  [WorkOrderStatus.AWAITING_ASSIGNMENT]: 'Esperando asignación',
  [WorkOrderStatus.ASSIGNED]: 'Técnicos asignados',
  [WorkOrderStatus.IN_PROGRESS]: 'En progreso',
  [WorkOrderStatus.COMPLETED]: 'Completada',
  [WorkOrderStatus.CANCELLED]: 'Cancelada',
}

/** Tailwind classes for the status pill, one distinct color per status. */
export const workOrderStatusColor: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.PENDING_QUOTE]: 'bg-amber-100 text-amber-800',
  [WorkOrderStatus.QUOTE_REJECTED]: 'bg-red-100 text-red-700',
  [WorkOrderStatus.AWAITING_ASSIGNMENT]: 'bg-orange-100 text-orange-700',
  [WorkOrderStatus.ASSIGNED]: 'bg-sky-100 text-sky-700',
  [WorkOrderStatus.IN_PROGRESS]: 'bg-eb-teal/10 text-eb-teal-dark',
  [WorkOrderStatus.COMPLETED]: 'bg-green-100 text-green-700',
  [WorkOrderStatus.CANCELLED]: 'bg-slate-200 text-slate-600',
}
