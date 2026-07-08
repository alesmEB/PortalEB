import { OrderLocation } from '@dataconnect/generated'

export const orderLocationLabel: Record<OrderLocation, string> = {
  [OrderLocation.ALGECIRAS]: 'Algeciras',
  [OrderLocation.LA_LINEA]: 'La Línea',
  [OrderLocation.SOTOGRANDE]: 'Sotogrande',
}

const orderLocationPrefix: Record<OrderLocation, string> = {
  [OrderLocation.ALGECIRAS]: 'A',
  [OrderLocation.LA_LINEA]: 'V',
  [OrderLocation.SOTOGRANDE]: 'S',
}

export function formatOrderCode(locationCode: OrderLocation, sequenceNumber: number): string {
  return `${orderLocationPrefix[locationCode]}-${String(sequenceNumber).padStart(6, '0')}`
}
