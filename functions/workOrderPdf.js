// Server-side twin of src/lib/pdf/WorkOrderPdf.tsx. Kept as a separate,
// plain-JS (no JSX) file since functions/ has no build step to transpile
// TSX - React.createElement calls mirror that file's JSX 1:1.
const React = require('react')
const { Document, Page, Text, View, StyleSheet, renderToBuffer } = require('@react-pdf/renderer')

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  title: { fontSize: 18, fontWeight: 700, color: '#002f54', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#475569', marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#005565',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 140, color: '#475569' },
  value: { flex: 1 },
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 2 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tableHeaderCell: { flex: 1, padding: 4, fontWeight: 700, backgroundColor: '#f1f5f9' },
  tableCell: { flex: 1, padding: 4 },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 12 },
})

function labelRow(label, value) {
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value),
  )
}

function buildWorkOrderDocument(data) {
  const engineRows = data.engines.map((engine, index) =>
    React.createElement(
      View,
      { style: styles.tableRow, key: index },
      React.createElement(Text, { style: styles.tableCell }, engine.engineType),
      React.createElement(Text, { style: styles.tableCell }, engine.chassisNumber),
      React.createElement(Text, { style: styles.tableCell }, engine.propellerSerialNumber),
    ),
  )

  const taskRows = data.tasks.map((task, index) =>
    React.createElement(
      View,
      { style: styles.listItem, key: index },
      React.createElement(Text, { style: styles.bullet }, `${index + 1}.`),
      React.createElement(Text, { style: styles.value }, task),
    ),
  )

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, `Orden de trabajo ${data.code}`),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `${data.locationLabel} · ${data.createdAt.toLocaleDateString('es-ES')}`,
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Cliente'),
        labelRow('Empresa/particular', data.customerName),
        labelRow('Responsable', data.contactName),
        labelRow('Teléfono', data.phone),
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Embarcación / máquina'),
        labelRow('Nombre', data.boatName),
        data.registrationNumber ? labelRow('Matrícula', data.registrationNumber) : null,
        labelRow('Ubicación', data.assetLocation),
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Motores'),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Tipo'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Nº chasis'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Nº serie propulsor'),
          ),
          ...engineRows,
        ),
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Trabajos a realizar'),
        ...taskRows,
      ),
      data.comments
        ? React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: styles.sectionTitle }, 'Comentarios adicionales'),
            React.createElement(Text, null, data.comments),
          )
        : null,
    ),
  )
}

async function renderWorkOrderPdfBuffer(data) {
  return renderToBuffer(buildWorkOrderDocument(data))
}

module.exports = { renderWorkOrderPdfBuffer }
