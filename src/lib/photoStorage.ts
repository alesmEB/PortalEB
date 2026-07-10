/** Uploads a work order photo into its Storage folder (see storage.rules). */
export async function uploadWorkOrderPhoto(
  code: string,
  stage: 'start' | 'incident' | 'final',
  file: File,
): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const fileName = `${Date.now()}-${file.name}`
  const storageRef = ref(storage, `work-orders/${code}/photos/${stage}/${fileName}`)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(storageRef)
}
