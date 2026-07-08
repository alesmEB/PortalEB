import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

export interface WorkOrderPdfEngine {
  engineType: string
  chassisNumber: string
  propellerSerialNumber: string
}

export interface WorkOrderPdfData {
  code: string
  locationLabel: string
  createdAt: Date
  customerName: string
  contactName: string
  phone: string
  boatName: string
  registrationNumber?: string
  engines: WorkOrderPdfEngine[]
  assetLocation: string
  tasks: string[]
  comments?: string
}

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
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    fontWeight: 700,
    backgroundColor: '#f1f5f9',
  },
  tableCell: { flex: 1, padding: 4 },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 12 },
})

function WorkOrderDocument({ data }: { data: WorkOrderPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Orden de trabajo {data.code}</Text>
        <Text style={styles.subtitle}>
          {data.locationLabel} · {data.createdAt.toLocaleDateString('es-ES')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Empresa/particular</Text>
            <Text style={styles.value}>{data.customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Responsable</Text>
            <Text style={styles.value}>{data.contactName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Teléfono</Text>
            <Text style={styles.value}>{data.phone}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Embarcación / máquina</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{data.boatName}</Text>
          </View>
          {data.registrationNumber && (
            <View style={styles.row}>
              <Text style={styles.label}>Matrícula</Text>
              <Text style={styles.value}>{data.registrationNumber}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Ubicación</Text>
            <Text style={styles.value}>{data.assetLocation}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Motores</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeaderCell}>Tipo</Text>
              <Text style={styles.tableHeaderCell}>Nº chasis</Text>
              <Text style={styles.tableHeaderCell}>Nº serie propulsor</Text>
            </View>
            {data.engines.map((engine, index) => (
              <View style={styles.tableRow} key={index}>
                <Text style={styles.tableCell}>{engine.engineType}</Text>
                <Text style={styles.tableCell}>{engine.chassisNumber}</Text>
                <Text style={styles.tableCell}>{engine.propellerSerialNumber}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trabajos a realizar</Text>
          {data.tasks.map((task, index) => (
            <View style={styles.listItem} key={index}>
              <Text style={styles.bullet}>{index + 1}.</Text>
              <Text style={styles.value}>{task}</Text>
            </View>
          ))}
        </View>

        {data.comments && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comentarios adicionales</Text>
            <Text>{data.comments}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}

/**
 * Uploads the report into the order's own Storage folder
 * ("work-orders/{code}/informe.pdf") rather than downloading it locally -
 * photos and other order documents will land alongside it in that same
 * folder as those features are built.
 */
export async function uploadWorkOrderPdf(data: WorkOrderPdfData): Promise<string> {
  const { storage } = await import('../firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const blob = await pdf(<WorkOrderDocument data={data} />).toBlob()
  const storageRef = ref(storage, `work-orders/${data.code}/informe.pdf`)
  await uploadBytes(storageRef, blob, { contentType: 'application/pdf' })
  return getDownloadURL(storageRef)
}
