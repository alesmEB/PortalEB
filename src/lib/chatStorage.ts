import type { ChatKind } from './chat'

/** Uploads a photo/video attached to a chat message (see storage.rules). */
export async function uploadChatMedia(kind: ChatKind, orderId: string, file: File): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const fileName = `${Date.now()}-${file.name}`
  const storageRef = ref(storage, `chat-media/${orderId}/${kind}/${fileName}`)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(storageRef)
}
