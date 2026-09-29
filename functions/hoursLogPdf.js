// "Registro de horas" report: every technician's shifts, day by day (see
// listTimeLogs/exportTimeLogsPdf in index.js). Same plain-JS
// React.createElement style and letterhead as ratingsPdf.js - see
// workOrderPdf.js's header for why there's no JSX here.
//
// Days and times are Madrid's, not the server's (UTC): the office reads the
// log in Spanish time, and a shift at 01:00 UTC belongs to the Spanish day
// before only half the year. The same helpers decide which day the daily
// e-mail covers, so both agree on where a day starts.
const fs = require('fs')
const path = require('path')
const React = require('react')
const { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } = require('@react-pdf/renderer')

const ELIAS_BLANCO_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-elias.png'))
const BUREAU_VERITAS_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'bureau-veritas.png'))
const EB_ENGINEERING_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-eb.png'))

const TIME_ZONE = 'Europe/Madrid'

/** "YYYY-MM-DD" of the Madrid day an instant falls on. */
function madridDayKey(date) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function madridTime(date) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

/** The instant a Madrid day starts. */
function madridMidnight(dayKey) {
  // Madrid is UTC+1 in winter and UTC+2 in summer, and the clocks change at
  // 02:00/03:00, never at midnight - so exactly one of the two offsets lands
  // on 00:00 of that day.
  for (const offset of ['+01:00', '+02:00']) {
    const candidate = new Date(`${dayKey}T00:00:00${offset}`)
    if (madridDayKey(candidate) === dayKey && madridTime(candidate) === '00:00') return candidate
  }
  throw new Error(`No se pudo calcular el inicio del día ${dayKey}.`)
}

/** Calendar arithmetic on "YYYY-MM-DD", no time zone involved. */
function addDaysToKey(dayKey, days) {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function formatDayKey(dayKey) {
  const [y, m, d] = dayKey.split('-')
  return `${d}/${m}/${y}`
}

function formatDayHeading(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMinutes(total) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return hours === 0 ? `${minutes} min` : `${hours} h ${String(minutes).padStart(2, '0')} min`
}

function closedMinutes(shifts) {
  return shifts.reduce((sum, shift) => sum + (shift.durationMinutes ?? 0), 0)
}

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 84, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  headerLogo: { height: 27, width: 81 },
  title: { fontSize: 18, fontWeight: 700, color: '#002f54', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#475569' },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 2,
    padding: 8,
    marginBottom: 14,
  },
  totalLabel: { fontSize: 10, color: '#475569' },
  totalValue: { fontSize: 12, fontWeight: 700, color: '#002f54' },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: '#005565', marginBottom: 6, textTransform: 'uppercase' },
  summaryRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryName: { flex: 1 },
  summaryCount: { width: 70, textAlign: 'right', color: '#475569' },
  summaryTotal: { width: 80, textAlign: 'right', fontWeight: 700 },
  day: { marginBottom: 12 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 2,
    marginBottom: 6,
  },
  dayTitle: { fontSize: 11, fontWeight: 700, color: '#005565' },
  dayTotal: { color: '#475569' },
  technician: { marginBottom: 6, paddingLeft: 6, borderLeftWidth: 2, borderLeftColor: '#99d5d0' },
  technicianHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  technicianName: { fontWeight: 700, color: '#002f54' },
  technicianTotal: { fontWeight: 700, color: '#475569' },
  shiftRow: { flexDirection: 'row', paddingVertical: 1 },
  colTimes: { width: 110 },
  colDuration: { width: 60, color: '#64748b' },
  colOrder: { width: 62, fontWeight: 700, color: '#0369a1' },
  colBoat: { flex: 1, color: '#475569' },
  colNote: { width: 70, color: '#b45309', textAlign: 'right' },
  muted: { color: '#94a3b8' },
  emptyNote: { color: '#64748b', fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  footerLogo: { height: 30, width: 75 },
  footerCertification: { height: 38, width: 75 },
  pageNumber: { color: '#94a3b8', fontSize: 8 },
})

function shiftRow(shift) {
  const clockIn = new Date(shift.clockIn)
  const clockOut = shift.clockOut ? new Date(shift.clockOut) : null
  let times = `${madridTime(clockIn)} - `
  if (!clockOut) times += 'en curso'
  else {
    times += madridTime(clockOut)
    const outDay = madridDayKey(clockOut)
    if (outDay !== madridDayKey(clockIn)) times += ` (${formatDayKey(outDay)})`
  }
  return React.createElement(
    View,
    { style: styles.shiftRow, key: shift.id },
    React.createElement(Text, { style: styles.colTimes }, times),
    React.createElement(
      Text,
      { style: styles.colDuration },
      shift.durationMinutes != null ? formatMinutes(shift.durationMinutes) : '',
    ),
    React.createElement(
      Text,
      { style: styles.colOrder },
      shift.workOrder.deleted ? `${shift.workOrder.code}*` : shift.workOrder.code,
    ),
    React.createElement(Text, { style: styles.colBoat }, shift.workOrder.boatName ?? ''),
    React.createElement(Text, { style: styles.colNote }, shift.recordedOffline ? 'sin conexión' : ''),
  )
}

/**
 * Groups the shifts the same way the page does (src/pages/HoursLogPage.tsx):
 * a range lists every assignable technician each day (the empty ones in one
 * line, since who didn't clock in is information too); one order's log only
 * lists who worked on it.
 */
function buildDays({ technicians, timeLogs, dayKeys, technicianId }) {
  const shifts = technicianId ? timeLogs.filter((s) => s.technicianId === technicianId) : timeLogs
  const names = new Map(technicians.map((t) => [t.id, t.displayName]))
  for (const s of timeLogs) if (!names.has(s.technicianId)) names.set(s.technicianId, s.technicianName)
  const nameOrder = [...names.keys()]

  const byDay = new Map()
  for (const shift of shifts) {
    const day = madridDayKey(new Date(shift.clockIn))
    const byTechnician = byDay.get(day) ?? new Map()
    const list = byTechnician.get(shift.technicianId) ?? []
    list.push(shift)
    byTechnician.set(shift.technicianId, list)
    byDay.set(day, byTechnician)
  }

  const keys = dayKeys ?? [...byDay.keys()].sort()
  return keys.map((dayKey) => {
    const byTechnician = byDay.get(dayKey) ?? new Map()
    const worked = nameOrder
      .filter((id) => byTechnician.has(id))
      .map((id) => ({ id, name: names.get(id), shifts: byTechnician.get(id) }))
    let idle = []
    if (dayKeys && !technicianId) {
      idle = technicians.filter((t) => !byTechnician.has(t.id)).map((t) => t.displayName)
    }
    const dayShifts = worked.flatMap((t) => t.shifts)
    return { dayKey, worked, idle, shiftCount: dayShifts.length, minutes: closedMinutes(dayShifts) }
  })
}

function buildHoursLogDocument(data) {
  const { orderCode, dayKeys, technicianName, generatedAt } = data
  const days = buildDays(data)
  const totalShifts = days.reduce((sum, d) => sum + d.shiftCount, 0)
  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0)
  const hasDeleted = days.some((d) => d.worked.some((t) => t.shifts.some((s) => s.workOrder.deleted)))

  let period
  if (orderCode) period = `Orden ${orderCode}`
  else if (dayKeys.length === 1) period = formatDayHeading(dayKeys[0])
  else period = `Del ${formatDayKey(dayKeys[0])} al ${formatDayKey(dayKeys[dayKeys.length - 1])}`

  // Per-technician totals only pay off across several days; for a single day
  // they would repeat the day's own blocks.
  const summary = new Map()
  if (days.length > 1) {
    for (const day of days) {
      for (const t of day.worked) {
        const entry = summary.get(t.id) ?? { name: t.name, shifts: 0, minutes: 0 }
        entry.shifts += t.shifts.length
        entry.minutes += closedMinutes(t.shifts)
        summary.set(t.id, entry)
      }
    }
  }

  const dayViews = days.map((day) =>
    React.createElement(
      View,
      { style: styles.day, key: day.dayKey },
      React.createElement(
        View,
        { style: styles.dayHeader, minPresenceAhead: 40 },
        React.createElement(Text, { style: styles.dayTitle }, formatDayHeading(day.dayKey)),
        React.createElement(
          Text,
          { style: styles.dayTotal },
          day.shiftCount > 0
            ? `${day.shiftCount} ${day.shiftCount === 1 ? 'turno' : 'turnos'} · ${formatMinutes(day.minutes)}`
            : '',
        ),
      ),
      day.shiftCount === 0
        ? React.createElement(Text, { style: styles.emptyNote }, 'Sin turnos este día.')
        : null,
      ...day.worked.map((t) =>
        React.createElement(
          View,
          { style: styles.technician, key: t.id, wrap: false },
          React.createElement(
            View,
            { style: styles.technicianHeader },
            React.createElement(Text, { style: styles.technicianName }, t.name),
            React.createElement(Text, { style: styles.technicianTotal }, formatMinutes(closedMinutes(t.shifts))),
          ),
          ...t.shifts.map(shiftRow),
        ),
      ),
      day.shiftCount > 0 && day.idle.length > 0
        ? React.createElement(Text, { style: styles.muted }, `Sin turnos: ${day.idle.join(', ')}`)
        : null,
    ),
  )

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.title }, 'Registro de horas'),
          React.createElement(Text, { style: styles.subtitle }, period),
          technicianName ? React.createElement(Text, { style: styles.subtitle }, `Técnico: ${technicianName}`) : null,
          React.createElement(
            Text,
            { style: styles.subtitle },
            `Generado el ${formatDayKey(madridDayKey(generatedAt))} a las ${madridTime(generatedAt)}`,
          ),
        ),
        React.createElement(Image, { style: styles.headerLogo, src: EB_ENGINEERING_LOGO }),
      ),

      React.createElement(
        View,
        { style: styles.totalBox },
        React.createElement(Text, { style: styles.totalLabel }, `${totalShifts} ${totalShifts === 1 ? 'turno' : 'turnos'}`),
        React.createElement(Text, { style: styles.totalValue }, formatMinutes(totalMinutes)),
      ),

      summary.size > 0
        ? React.createElement(
            View,
            { style: { marginBottom: 14 } },
            React.createElement(Text, { style: styles.sectionTitle }, 'Total por técnico'),
            ...[...summary.values()].map((entry, i) =>
              React.createElement(
                View,
                { style: styles.summaryRow, key: i },
                React.createElement(Text, { style: styles.summaryName }, entry.name),
                React.createElement(
                  Text,
                  { style: styles.summaryCount },
                  `${entry.shifts} ${entry.shifts === 1 ? 'turno' : 'turnos'}`,
                ),
                React.createElement(Text, { style: styles.summaryTotal }, formatMinutes(entry.minutes)),
              ),
            ),
          )
        : null,

      days.length === 0
        ? React.createElement(Text, { style: styles.emptyNote }, 'Nadie ha fichado en esta orden.')
        : null,
      ...dayViews,

      hasDeleted
        ? React.createElement(Text, { style: [styles.muted, { marginTop: 4 }] }, '* Orden eliminada.')
        : null,

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Image, { style: styles.footerLogo, src: ELIAS_BLANCO_LOGO }),
        React.createElement(Text, {
          style: styles.pageNumber,
          render: ({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`,
        }),
        React.createElement(Image, { style: styles.footerCertification, src: BUREAU_VERITAS_LOGO }),
      ),
    ),
  )
}

async function renderHoursLogPdfBuffer(data) {
  return renderToBuffer(buildHoursLogDocument(data))
}

module.exports = {
  renderHoursLogPdfBuffer,
  buildDays,
  closedMinutes,
  formatMinutes,
  formatDayHeading,
  madridDayKey,
  madridMidnight,
  addDaysToKey,
}
