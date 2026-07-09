/** Uploads a quote PDF into the order's own Storage folder (see storage.rules). */
export async function uploadQuotePdf(
  code: string,
  attemptNumber: number,
  file: Blob,
): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const storageRef = ref(storage, `work-orders/${code}/quotes/presupuesto-${attemptNumber}.pdf`)
  await uploadBytes(storageRef, file, { contentType: 'application/pdf' })
  return getDownloadURL(storageRef)
}
