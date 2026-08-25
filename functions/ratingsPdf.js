// Period report for the workshop tablets' service ratings (see
// listServiceRatings/exportRatingsPdf in index.js). Same plain-JS
// React.createElement style and shared letterhead as workOrderPdf.js - see
// that file's header for why there's no JSX here.
const fs = require('fs')
const path = require('path')
const React = require('react')
const { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } = require('@react-pdf/renderer')

const ELIAS_BLANCO_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-elias.png'))
const BUREAU_VERITAS_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'bureau-veritas.png'))
const EB_ENGINEERING_LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo-eb.png'))

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 84, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLogo: { height: 27, width: 81 },
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
  title: { fontSize: 18, fontWeight: 700, color: '#002f54', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#475569' },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#005565',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  summaryRow: { flexDirection: 'row', marginBottom: 14 },
  averageBox: {
    width: 120,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 2,
    padding: 10,
    alignItems: 'center',
    marginRight: 12,
  },
  averageValue: { fontSize: 30, fontWeight: 700, color: '#002f54' },
  averageCaption: { fontSize: 8, color: '#475569', marginTop: 4, textAlign: 'center' },
  distributionCol: { flex: 1, justifyContent: 'center' },
  distributionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  distributionLabel: { width: 34, color: '#475569' },
  barTrack: { flex: 1, height: 7, backgroundColor: '#f1f5f9', borderRadius: 4 },
  barFill: { height: 7, backgroundColor: '#fbbf24', borderRadius: 4 },
  distributionCount: { width: 26, textAlign: 'right', color: '#475569' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 160, color: '#475569' },
  value: { flex: 1 },
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 2 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tableHeaderCell: { padding: 4, fontWeight: 700, backgroundColor: '#f1f5f9' },
  tableCell: { padding: 4 },
  colDate: { width: 78 },
  colScore: { width: 42 },
  colLocation: { width: 100 },
  colService: { width: 86 },
  colComment: { flex: 1 },
  emptyNote: { color: '#475569', fontStyle: 'italic' },
})

const LOCATION_LABEL = { 1: 'Menacha (Algeciras)', 2: 'Varadero (La Línea)' }
const SERVICE_TYPE_LABEL = { 1: 'Servicio de venta', 2: 'Servicio técnico' }

function formatDate(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function labelRow(label, value, key) {
  return React.createElement(
    View,
    { style: styles.row, key },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value),
  )
}

function countBy(ratings, key, labels) {
  const counts = new Map()
  for (const r of ratings) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => [labels[value] ?? 'Sin especificar', count])
}

function averageOf(ratings) {
  if (!ratings.length) return 0
  return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
}

function buildRatingsDocument({ ratings, from, to, generatedAt }) {
  // Scores of 0 come from rows saved before the tablet app required picking
  // one; counting them as "zero stars" would drag the average down, so every
  // average here is over scored rows only and the header says how many were
  // left out.
  const scored = ratings.filter((r) => r.rating > 0)
  const average = averageOf(scored)

  const distributionRows = [5, 4, 3, 2, 1].map((n) => {
    const count = scored.filter((r) => r.rating === n).length
    const pct = scored.length ? (count / scored.length) * 100 : 0
    return React.createElement(
      View,
      { style: styles.distributionRow, key: n },
      React.createElement(Text, { style: styles.distributionLabel }, `${n} *`),
      React.createElement(
        View,
        { style: styles.barTrack },
        React.createElement(View, { style: [styles.barFill, { width: `${pct}%` }] }),
      ),
      React.createElement(Text, { style: styles.distributionCount }, String(count)),
    )
  })

  const byLocation = countBy(ratings, 'location', LOCATION_LABEL).map(([label, count], i) => {
    const subset = scored.filter((r) => (LOCATION_LABEL[r.location] ?? 'Sin especificar') === label)
    return labelRow(
      `${label}`,
      `${count} valoración${count === 1 ? '' : 'es'}${subset.length ? ` · media ${averageOf(subset).toFixed(2)}` : ''}`,
      i,
    )
  })

  const byServiceType = countBy(ratings, 'serviceType', SERVICE_TYPE_LABEL).map(([label, count], i) => {
    const subset = scored.filter(
      (r) => (SERVICE_TYPE_LABEL[r.serviceType] ?? 'Sin especificar') === label,
    )
    return labelRow(
      `${label}`,
      `${count} valoración${count === 1 ? '' : 'es'}${subset.length ? ` · media ${averageOf(subset).toFixed(2)}` : ''}`,
      i,
    )
  })

  const detailRows = ratings.map((r, index) =>
    React.createElement(
      View,
      { style: styles.tableRow, key: index, wrap: false },
      React.createElement(Text, { style: [styles.tableCell, styles.colDate] }, formatDate(r.date)),
      React.createElement(
        Text,
        { style: [styles.tableCell, styles.colScore] },
        r.rating > 0 ? `${r.rating}/5` : '-',
      ),
      React.createElement(
        Text,
        { style: [styles.tableCell, styles.colLocation] },
        LOCATION_LABEL[r.location] ?? 'Sin especificar',
      ),
      React.createElement(
        Text,
        { style: [styles.tableCell, styles.colService] },
        SERVICE_TYPE_LABEL[r.serviceType] ?? 'Sin especificar',
      ),
      React.createElement(Text, { style: [styles.tableCell, styles.colComment] }, r.comments || '-'),
    ),
  )

  const periodLabel =
    from || to
      ? `Periodo: ${from ? formatDate(from) : 'inicio'} - ${to ? formatDate(to) : 'hoy'}`
      : 'Periodo: todas las valoraciones'

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
          React.createElement(Text, { style: styles.title }, 'Valoraciones del servicio'),
          React.createElement(Text, { style: styles.subtitle }, periodLabel),
          React.createElement(
            Text,
            { style: styles.subtitle },
            `Generado el ${formatDate(generatedAt)}`,
          ),
        ),
        React.createElement(Image, { style: styles.headerLogo, src: EB_ENGINEERING_LOGO }),
      ),

      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(
          View,
          { style: styles.averageBox },
          React.createElement(
            Text,
            { style: styles.averageValue },
            scored.length ? average.toFixed(2) : '-',
          ),
          React.createElement(
            Text,
            { style: styles.averageCaption },
            `${scored.length} con nota${
              ratings.length !== scored.length ? ` · ${ratings.length - scored.length} sin nota` : ''
            }`,
          ),
        ),
        React.createElement(View, { style: styles.distributionCol }, ...distributionRows),
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Por ubicación'),
        ...byLocation,
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Por tipo de servicio'),
        ...byServiceType,
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'Detalle'),
        ratings.length === 0
          ? React.createElement(
              Text,
              { style: styles.emptyNote },
              'No hay valoraciones en el periodo seleccionado.',
            )
          : React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.tableRow, fixed: true },
                React.createElement(Text, { style: [styles.tableHeaderCell, styles.colDate] }, 'Fecha'),
                React.createElement(Text, { style: [styles.tableHeaderCell, styles.colScore] }, 'Nota'),
                React.createElement(
                  Text,
                  { style: [styles.tableHeaderCell, styles.colLocation] },
                  'Ubicación',
                ),
                React.createElement(
                  Text,
                  { style: [styles.tableHeaderCell, styles.colService] },
                  'Servicio',
                ),
                React.createElement(
                  Text,
                  { style: [styles.tableHeaderCell, styles.colComment] },
                  'Comentario',
                ),
              ),
              ...detailRows,
            ),
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Image, { style: styles.footerLogo, src: ELIAS_BLANCO_LOGO }),
        React.createElement(Image, { style: styles.footerCertification, src: BUREAU_VERITAS_LOGO }),
      ),
    ),
  )
}

async function renderRatingsPdfBuffer(data) {
  return renderToBuffer(buildRatingsDocument(data))
}

module.exports = { renderRatingsPdfBuffer }
