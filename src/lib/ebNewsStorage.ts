/** Uploads an image embedded in an EB Engineering news post (see storage.rules). */
export async function uploadEbNewsImage(file: File): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const fileName = `${Date.now()}-${file.name}`
  const storageRef = ref(storage, `eb-news/${fileName}`)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(storageRef)
}
