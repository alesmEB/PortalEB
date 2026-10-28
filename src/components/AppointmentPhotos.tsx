import { useState } from 'react'
import { Camera, X } from 'lucide-react'
import { MediaType } from '@dataconnect/generated'
import { BusyOverlay } from './BusyOverlay'
import { MediaPicker } from './MediaPicker'
import { addAppointmentPhotos, deleteAppointmentPhoto } from '../lib/calendar'
import { mediaTypeOf } from '../lib/media'
import { uploadAppointmentPhoto } from '../lib/photoStorage'

export interface AppointmentPhoto {
  id: string
  storageUrl: string
  mediaType: MediaType
  uploadedBy: { displayName: string }
}

/**
 * An appointment's photos and videos (CalendarAppointmentPhoto), with the way
 * to add more. Used from the appointment itself (the office) and from its
 * visit order (the technicians sent there) - the server decides who may.
 */
export function AppointmentPhotos({
  appointmentId,
  photos,
  canAdd,
  canDelete,
  onChanged,
}: {
  appointmentId: string
  photos: AppointmentPhoto[]
  canAdd: boolean
  canDelete: boolean
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  async function handleUpload() {
    setError(null)
    setBusyLabel(`Subiendo ${files.length === 1 ? 'la foto' : `${files.length} fotos`}...`)
    try {
      const uploaded = []
      for (const file of files) {
        const url = await uploadAppointmentPhoto(appointmentId, file)
        uploaded.push({ url, mediaType: mediaTypeOf(file) })
      }
      await addAppointmentPhotos(appointmentId, uploaded)
      setFiles([])
      setAdding(false)
      onChanged()
    } catch (err) {
      // The dialog stays open with the files still picked, so trying again
      // doesn't mean choosing them all over.
      setError(err instanceof Error ? err.message : 'No se han podido subir las fotos.')
    } finally {
      setBusyLabel(null)
    }
  }

  async function handleDelete(photoId: string) {
    setError(null)
    setBusyLabel('Quitando la foto...')
    try {
      await deleteAppointmentPhoto(photoId)
      setConfirmingDeleteId(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido quitar la foto.')
    } finally {
      setBusyLabel(null)
    }
  }

  if (photos.length === 0 && !canAdd) return null

  return (
    <div>
      <BusyOverlay label={busyLabel} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          Fotos de la cita{photos.length > 0 ? ` (${photos.length})` : ''}
        </p>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-eb-blue hover:border-eb-blue"
          >
            <Camera className="h-3.5 w-3.5" />
            Añadir fotos
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              {photo.mediaType === MediaType.VIDEO ? (
                <video
                  src={photo.storageUrl}
                  controls
                  title={photo.uploadedBy.displayName}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ) : (
                <a href={photo.storageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={photo.storageUrl}
                    alt="Foto de la cita"
                    title={photo.uploadedBy.displayName}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </a>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(photo.id)}
                  title="Quitar la foto"
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-500 shadow hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {confirmingDeleteId === photo.id && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-white/95 p-1 text-center">
                  <p className="text-[11px] text-red-700">¿Quitar esta foto?</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.id)}
                      className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
          <MediaPicker files={files} onFilesChange={setFiles} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setFiles([])
                setError(null)
              }}
              className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={files.length === 0}
              onClick={handleUpload}
              className="flex-1 rounded-lg bg-eb-blue py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Subir
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
