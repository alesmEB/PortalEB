import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BACK_BUTTON_SLOT_ID } from './backButtonSlot'

/** Renders into the user bar's slot rather than in the page, so it doesn't
 * cost each screen a row of its own. Pages keep using it where they always
 * did - only where it ends up changes. */
export function BackButton({ to }: { to: string }) {
  const navigate = useNavigate()
  // undefined until mounted: the bar and the page commit together, so the
  // slot can only be looked up afterwards. null means there's no bar at all,
  // and the button falls back to sitting in the page as before.
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined)

  useEffect(() => {
    setSlot(document.getElementById(BACK_BUTTON_SLOT_ID))
  }, [])

  if (slot === undefined) return null

  const button = (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-eb-blue"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Volver
    </button>
  )

  return slot ? createPortal(button, slot) : <div className="mb-3">{button}</div>
}
