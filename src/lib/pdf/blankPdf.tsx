import { Document, Page, pdf } from '@react-pdf/renderer'

/** A blank A4 PDF, for the admin:lab "add quote" shortcut. */
export async function createBlankPdfBlob(): Promise<Blob> {
  return pdf(
    <Document>
      <Page size="A4" />
    </Document>,
  ).toBlob()
}
