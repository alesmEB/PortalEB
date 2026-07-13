import { MediaType } from '@dataconnect/generated'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_SECONDS = 20

export function mediaTypeOf(file: File): typeof MediaType.PHOTO | typeof MediaType.VIDEO {
  return file.type.startsWith('video/') ? MediaType.VIDEO : MediaType.PHOTO
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer el vídeo'))
    }
    video.src = url
  })
}

/** Returns an error message if the file fails size/duration limits, or null if it's fine. */
export async function validateMediaFile(file: File): Promise<string | null> {
  if (mediaTypeOf(file) === MediaType.VIDEO) {
    if (file.size > MAX_VIDEO_BYTES) return `${file.name}: supera los 20 MB`
    try {
      const duration = await getVideoDuration(file)
      if (duration > MAX_VIDEO_SECONDS) return `${file.name}: supera los 20 segundos`
    } catch {
      return `${file.name}: no se pudo leer el vídeo`
    }
    return null
  }
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: supera los 15 MB`
  return null
}

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

// Kept in sync by hand with storage.rules' chat-media allowed content types.
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'

/** Returns an error message if the document fails the size limit, or null if it's fine. */
export function validateDocumentFile(file: File): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) return `${file.name}: supera los 20 MB`
  return null
}
