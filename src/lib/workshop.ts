import { OrderLocation } from '@dataconnect/generated'

/** The order the three workshop orders are always shown in. */
export const WORKSHOP_LOCATIONS: OrderLocation[] = [
  OrderLocation.ALGECIRAS,
  OrderLocation.LA_LINEA,
  OrderLocation.SOTOGRANDE,
]

/** "2026-10" -> "Octubre de 2026" (see WorkOrder.workshopMonth). */
export function formatWorkshopMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const text = new Date(year, monthNumber - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return hours === 0 ? `${minutes} min` : `${hours} h ${String(minutes).padStart(2, '0')} min`
}
