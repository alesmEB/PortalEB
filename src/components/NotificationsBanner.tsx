import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { getPushSupport, type PushSupport } from '../lib/firebase'
import { enablePushNotifications } from '../lib/pushNotifications'

// Remembered per device: "blocked" and "not supported" are the device's state,
// not something that changes from one visit to the next, so once someone has
// read how to fix it the note can go away.
const HIDDEN_KEY = 'portaleb-notifications-note-hidden'

function readHidden(): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY)
  } catch {
    return null
  }
}

function writeHidden(status: string) {
  try {
    localStorage.setItem(HIDDEN_KEY, status)
  } catch {
    // Private mode or blocked storage: the note just comes back next time.
  }
}

/**
 * Asks for notification permission from a tap, which is the only way Chrome
 * reliably shows its dialog (see requestPushNotificationToken), and explains
 * what to do when the device can't or won't notify. Shows nothing once
 * notifications are on.
 *
 * Only for whoever can be assigned to orders: they're the ones clocking in,
 * and the shift reminders go to them. Role doesn't draw that line (several
 * workshop technicians are ADMIN), and the office staff without the
 * permission have no use for the prompt.
 */
export function NotificationsBanner() {
  const { profile } = useAuth()
  const canBeAssigned = usePermission('orders:assignable')
  const [status, setStatus] = useState<PushSupport | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justEnabled, setJustEnabled] = useState(false)
  const [askedWithoutDialog, setAskedWithoutDialog] = useState(false)
  const [hiddenFor, setHiddenFor] = useState(readHidden)

  useEffect(() => {
    getPushSupport()
      .then(setStatus)
      .catch(() => setStatus('unsupported'))
  }, [])

  if (!profile || !canBeAssigned || status === null) return null

  async function handleEnable() {
    if (!profile) return
    setEnabling(true)
    setError(null)
    try {
      const result = await enablePushNotifications(profile.id)
      setStatus(result)
      if (result === 'granted') setJustEnabled(true)
      // Still undecided after asking: the dialog was closed, or Chrome never
      // showed one - either way the tap alone won't fix it.
      if (result === 'default') setAskedWithoutDialog(true)
    } catch {
      setError('No se han podido activar las notificaciones. Comprueba la conexión y vuelve a intentarlo.')
    } finally {
      setEnabling(false)
    }
  }

  function hide() {
    if (!status) return
    writeHidden(status)
    setHiddenFor(status)
  }

  const box = 'mb-3 rounded-xl border p-3 text-sm'

  if (justEnabled) {
    return (
      <div className={`${box} border-emerald-200 bg-emerald-50 text-emerald-800`}>
        Notificaciones activadas en este dispositivo.
      </div>
    )
  }

  if (status === 'granted') return null

  if (status === 'unsupported') {
    // In a normal browser tab this is expected (an iPhone that hasn't added
    // the app to its home screen, say) and not worth a note; an installed app
    // that can't notify, though, was installed from the wrong browser.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    if (!standalone || hiddenFor === 'unsupported') return null
    return (
      <div className={`${box} border-slate-200 bg-white/90 text-slate-600`}>
        <p>
          Esta instalación de PortalEB no puede recibir notificaciones. Desinstálala e instálala de
          nuevo desde Google Chrome.
        </p>
        <button onClick={hide} className="mt-2 text-xs underline">
          Ocultar
        </button>
      </div>
    )
  }

  if (status === 'denied') {
    if (hiddenFor === 'denied') return null
    return (
      <div className={`${box} border-amber-200 bg-amber-50 text-amber-900`}>
        <p className="font-semibold">Las notificaciones están bloqueadas en este dispositivo.</p>
        <p className="mt-1 text-xs">
          Desde la app no se pueden volver a pedir. En el móvil: mantén pulsado el icono de
          PortalEB → Información de la aplicación → Notificaciones → Permitir. En el navegador:
          pulsa el candado junto a la dirección → Permisos → Notificaciones. Después vuelve a
          abrir PortalEB.
        </p>
        <button onClick={hide} className="mt-2 text-xs underline">
          Ocultar
        </button>
      </div>
    )
  }

  return (
    <div className={`${box} border-eb-blue/20 bg-white/90`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-slate-700">
          <BellRing className="h-4 w-4 shrink-0 text-eb-blue" />
          Activa las notificaciones para recibir en este dispositivo los avisos de turnos y chats.
        </p>
        <button
          onClick={handleEnable}
          disabled={enabling}
          className="shrink-0 rounded-lg bg-eb-blue px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enabling ? 'Activando...' : 'Activar notificaciones'}
        </button>
      </div>
      {askedWithoutDialog && (
        <p className="mt-2 text-xs text-amber-800">
          No se ha concedido el permiso. Si no ha salido ninguna ventana, actívalo a mano: mantén
          pulsado el icono de PortalEB → Información de la aplicación → Notificaciones → Permitir.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
