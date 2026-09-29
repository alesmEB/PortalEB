export const EB_WALLPAPER_WIDTH = 480
export const EB_WALLPAPER_HEIGHT = 272

/**
 * Why a picked file can't be a sale's wallpaper, or null if it can. The
 * EBcontroller's display is 480x272 and the background is made for it pixel
 * for pixel, so an image of any other size is the wrong file - better caught
 * here than on the unit. Storage rules can't see dimensions, only type and size.
 */
export async function checkEbWallpaper(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return 'El fondo tiene que ser una imagen.'
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    if (img.naturalWidth !== EB_WALLPAPER_WIDTH || img.naturalHeight !== EB_WALLPAPER_HEIGHT) {
      return `El fondo tiene que medir ${EB_WALLPAPER_WIDTH} × ${EB_WALLPAPER_HEIGHT} píxeles, y esta imagen mide ${img.naturalWidth} × ${img.naturalHeight}.`
    }
    return null
  } catch {
    return 'No se ha podido leer la imagen.'
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Uploads a sale's display background (see storage.rules). */
export async function uploadEbWallpaper(file: File): Promise<string> {
  const { storage } = await import('./firebase')
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')

  const storageRef = ref(storage, `eb-wallpapers/${Date.now()}-${file.name}`)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(storageRef)
}
