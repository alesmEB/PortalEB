/** Uploads an EBcontroller unit's custom program file (see storage.rules). */
export async function uploadEbProgramFile(file: File): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const fileName = `${Date.now()}-${file.name}`
  const storageRef = ref(storage, `eb-products/${fileName}`)
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(storageRef)
}
