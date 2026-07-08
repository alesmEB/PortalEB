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
