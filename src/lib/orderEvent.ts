import { OrderEventType } from '@dataconnect/generated'

export const orderEventTypeLabel: Record<OrderEventType, string> = {
  [OrderEventType.ORDER_CREATED]: 'Creó la orden',
  [OrderEventType.QUOTE_UPLOADED]: 'Subió un presupuesto',
  [OrderEventType.QUOTE_ACCEPTED]: 'Aceptó el presupuesto',
  [OrderEventType.QUOTE_REJECTED]: 'Rechazó el presupuesto',
  [OrderEventType.ORDER_CANCELLED]: 'Canceló la orden',
  [OrderEventType.TECHNICIANS_ASSIGNED]: 'Asignó técnicos',
  [OrderEventType.TECHNICIAN_UNASSIGNED]: 'Desasignó un técnico',
  [OrderEventType.WORK_STARTED]: 'Inició el trabajo',
  [OrderEventType.WORK_STOPPED]: 'Detuvo el trabajo',
  [OrderEventType.INCIDENT_REPORTED]: 'Reportó una incidencia',
  [OrderEventType.INCIDENT_RESOLVED]: 'Resolvió una incidencia',
  [OrderEventType.PHOTO_UPLOADED]: 'Subió una foto',
  [OrderEventType.ORDER_COMPLETED]: 'Completó la orden',
  [OrderEventType.REPORT_GENERATED]: 'Generó el informe',
  [OrderEventType.TIME_LOG_EDITED]: 'Corrigió un turno',
}
