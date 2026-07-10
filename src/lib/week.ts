/** Monday-start week helpers for the calendar page - no date library needed for this. */

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 (Sun) - 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day // shift back to Monday
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** "YYYY-MM-DD" in local time, matching Data Connect's Date scalar format. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth()
  const startLabel = weekStart.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  })
  const endLabel = weekEnd.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${startLabel} - ${endLabel}`
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function formatMonthLabel(monthStart: Date): string {
  const label = monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Full Monday-start weeks covering every day of the month (may include a
 * few leading/trailing days from the adjacent months to complete the grid). */
export function monthGridDays(monthStart: Date): Date[] {
  const gridStart = startOfWeek(monthStart)
  const lastDayOfMonth = addDays(addMonths(monthStart, 1), -1)
  const gridEnd = addDays(startOfWeek(lastDayOfMonth), 7) // exclusive
  const days: Date[] = []
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) {
    days.push(d)
  }
  return days
}
