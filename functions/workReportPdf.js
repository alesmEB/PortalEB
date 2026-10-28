// "Parte de trabajo" of a direct order (WorkOrder.direct): what the customer
// asked for, what the technicians wrote down as done, materials if any and
// the hours, made when the office invoices it (generateWorkReport in
// index.js). Same plain-JS React.createElement style and letterhead as
// workOrderPdf.js - see its header for why there's no JSX here.
//
// Hours are rounded the same way as the hours log PDF (roundShiftsForReport):
// both documents leave the office, and the same shift must read the same in
// either.
const fs = require('fs')
const path = require('path')
const React = require('react')
const { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } = require('@react-pdf/renderer')
const { roundShiftsForReport, formatMinutes } = require('./hoursLogPdf')

const ELIAS_BLANCO_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-elias.png'))
const BUREAU_VERITAS_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'bureau-veritas.png'))
const EB_ENGINEERING_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-eb.png'))

const TIME_ZONE = 'Europe/Madrid'

function madridDate(date) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date,
  )
}

function madridTime(date) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    date,
  )
}

function formatQuantity(quantity, unit) {
  const number = Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',')
  return unit ? `${number} ${unit}` : number
}

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 84, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerLogo: { height: 27, width: 81 },
  title: { fontSize: 18, fontWeight: 700, color: '#002f54', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#475569' },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#005565', marginBottom: 6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 140, color: '#475569' },
  value: { flex: 1 },
  listItem: { flexDirection: 'row', marginBottom: 4 },
  bullet: { width: 14 },
  lineMeta: { color: '#64748b', fontSize: 8 },
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 2 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  th: { padding: 4, fontWeight: 700, backgroundColor: '#f1f5f9' },
  td: { padding: 4 },
  colDate: { width: 70 },
  colTech: { flex: 1 },
  colTimes: { width: 90 },
  colDuration: { width: 70, textAlign: 'right' },
  colQty: { width: 90, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel: { fontWeight: 700, color: '#002f54' },
  totalValue: { fontWeight: 700, color: '#002f54' },
  muted: { color: '#94a3b8', fontSize: 8, marginTop: 4 },
  empty: { color: '#64748b', fontStyle: 'italic' },
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

function labelRow(label, value) {
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value),
  )
}

function section(title, ...children) {
  return React.createElement(
    View,
    { style: styles.section },
    React.createElement(Text, { style: styles.sectionTitle, minPresenceAhead: 30 }, title),
    ...children,
  )
}

function buildWorkReportDocument(data) {
  // Closed shifts only: one still open when it's invoiced has no end to bill.
  const shifts = roundShiftsForReport(
    data.timeLogs.filter((log) => log.clockOut).map((log) => ({ ...log, technicianName: log.technician.displayName })),
  )
  const byTechnician = new Map()
  for (const shift of shifts) {
    const entry = byTechnician.get(shift.technicianId) ?? { name: shift.technicianName, minutes: 0 }
    entry.minutes += shift.durationMinutes ?? 0
    byTechnician.set(shift.technicianId, entry)
  }
  const totalMinutes = [...byTechnician.values()].reduce((sum, t) => sum + t.minutes, 0)

  const asked = data.tasks.map((task, i) =>
    React.createElement(
      View,
      { style: styles.listItem, key: `t${i}` },
      React.createElement(Text, { style: styles.bullet }, `${i + 1}.`),
      React.createElement(Text, { style: styles.value }, task.description),
    ),
  )

  const done =
    data.workLines.length === 0
      ? [React.createElement(Text, { style: styles.empty, key: 'none' }, 'No se anotó ningún trabajo.')]
      : data.workLines.map((line, i) =>
          React.createElement(
            View,
            { style: styles.listItem, key: `w${i}`, wrap: false },
            React.createElement(Text, { style: styles.bullet }, '•'),
            React.createElement(
              View,
              { style: styles.value },
              React.createElement(Text, null, line.description),
              React.createElement(
                Text,
                { style: styles.lineMeta },
                `${line.author.displayName} · ${madridDate(new Date(line.createdAt))}`,
              ),
            ),
          ),
        )

  const materials =
    data.materials.length > 0
      ? section(
          'Materiales',
          React.createElement(
            View,
            { style: styles.table },
            React.createElement(
              View,
              { style: styles.tableRow },
              React.createElement(Text, { style: [styles.th, styles.colTech] }, 'Descripción'),
              React.createElement(Text, { style: [styles.th, styles.colQty] }, 'Cantidad'),
            ),
            ...data.materials.map((m, i) =>
              React.createElement(
                View,
                { style: styles.tableRow, key: `m${i}` },
                React.createElement(Text, { style: [styles.td, styles.colTech] }, m.description),
                React.createElement(Text, { style: [styles.td, styles.colQty] }, formatQuantity(m.quantity, m.unit)),
              ),
            ),
          ),
        )
      : null

  const hours =
    shifts.length === 0
      ? [React.createElement(Text, { style: styles.empty, key: 'none' }, 'No hay horas fichadas.')]
      : [
          React.createElement(
            View,
            { style: styles.table, key: 'shifts' },
            React.createElement(
              View,
              { style: styles.tableRow },
              React.createElement(Text, { style: [styles.th, styles.colDate] }, 'Fecha'),
              React.createElement(Text, { style: [styles.th, styles.colTech] }, 'Técnico'),
              React.createElement(Text, { style: [styles.th, styles.colTimes] }, 'Horario'),
              React.createElement(Text, { style: [styles.th, styles.colDuration] }, 'Tiempo'),
            ),
            ...shifts.map((shift) =>
              React.createElement(
                View,
                { style: styles.tableRow, key: shift.id, wrap: false },
                React.createElement(Text, { style: [styles.td, styles.colDate] }, madridDate(new Date(shift.clockIn))),
                React.createElement(Text, { style: [styles.td, styles.colTech] }, shift.technicianName),
                React.createElement(
                  Text,
                  { style: [styles.td, styles.colTimes] },
                  `${madridTime(new Date(shift.clockIn))} - ${madridTime(new Date(shift.clockOut))}`,
                ),
                React.createElement(
                  Text,
                  { style: [styles.td, styles.colDuration] },
                  formatMinutes(shift.durationMinutes ?? 0),
                ),
              ),
            ),
          ),
          ...[...byTechnician.values()].map((t, i) =>
            React.createElement(
              View,
              { style: styles.totalRow, key: `tt${i}` },
              React.createElement(Text, null, t.name),
              React.createElement(Text, null, formatMinutes(t.minutes)),
            ),
          ),
          React.createElement(
            View,
            { style: styles.totalRow, key: 'total' },
            React.createElement(Text, { style: styles.totalLabel }, 'Total'),
            React.createElement(Text, { style: styles.totalValue }, formatMinutes(totalMinutes)),
          ),
          React.createElement(
            Text,
            { style: styles.muted, key: 'note' },
            'Horas redondeadas a 5 minutos: la entrada hacia abajo y la salida hacia arriba.',
          ),
        ]

  const subtitle = [
    data.locationLabel,
    `Entrada ${madridDate(new Date(data.createdAt))}`,
    data.completedAt ? `Terminada ${madridDate(new Date(data.completedAt))}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
          React.createElement(Text, { style: styles.title }, `Parte de trabajo ${data.code}`),
          React.createElement(Text, { style: styles.subtitle }, subtitle),
          data.externalCode
            ? React.createElement(Text, { style: styles.subtitle }, `Nº de orden interno: ${data.externalCode}`)
            : null,
        ),
        React.createElement(Image, { style: styles.headerLogo, src: EB_ENGINEERING_LOGO }),
      ),
      section(
        'Cliente',
        labelRow('Empresa/particular', data.customer.name),
        labelRow('Responsable', data.customer.contactName),
        labelRow('Teléfono', data.customer.phone),
      ),
      section(
        'Embarcación / máquina',
        labelRow('Nombre', data.boat.name),
        data.boat.registrationNumber ? labelRow('Matrícula', data.boat.registrationNumber) : null,
        labelRow('Ubicación', data.assetLocation),
      ),
      section('Trabajo solicitado', ...asked, data.description ? React.createElement(Text, { style: styles.lineMeta }, data.description) : null),
      section('Trabajos realizados', ...done),
      materials,
      section('Horas', ...hours),
      React.createElement(
        Text,
        { style: styles.muted },
        `Generado el ${madridDate(data.generatedAt)} a las ${madridTime(data.generatedAt)}.`,
      ),
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

async function renderWorkReportPdfBuffer(data) {
  return renderToBuffer(buildWorkReportDocument(data))
}

module.exports = { renderWorkReportPdfBuffer }
