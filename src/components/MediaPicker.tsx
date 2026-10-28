import { useState, type ChangeEvent } from 'react'
import { Camera, Images, Video } from 'lucide-react'
import { validateMediaFile } from '../lib/media'

/** Shared photo/video picker with size/duration validation (see lib/media.ts). */
export function MediaPicker({
  files,
  onFilesChange,
}: {
  files: File[]
  onFilesChange: (files: File[]) => void
}) {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    setValidating(true)
    setError(null)
    try {
      const errors: string[] = []
      const valid: File[] = []
      for (const file of picked) {
        const err = await validateMediaFile(file)
        if (err) errors.push(err)
        else valid.push(file)
      }
      setError(errors.length > 0 ? errors.join(' · ') : null)
      if (valid.length > 0) onFilesChange([...files, ...valid])
    } finally {
      setValidating(false)
    }
  }

  return (
    <div>
      {/* Separate single-mimetype inputs for photo vs video capture -
          `capture` only reliably jumps straight to the camera/camcorder app
          when `accept` is unambiguous; combining "image/*,video/*" on one
          input leaves Android unsure which capture mode to launch, so it
          falls back to the gallery picker instead. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Camera className="h-5 w-5" />
          {validating ? '...' : 'Foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Video className="h-5 w-5" />
          {validating ? '...' : 'Vídeo'}
          <input
            type="file"
            accept="video/*"
            capture="environment"
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Images className="h-5 w-5" />
          {validating ? '...' : 'Galería'}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((file, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
            >
              <span className="truncate">{file.name}</span>
              <button
                onClick={() => onFilesChange(files.filter((_, idx) => idx !== i))}
                className="ml-2 text-slate-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
