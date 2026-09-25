import { useCallback, useEffect, useState } from 'react'
import { CloudOff, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../hooks/useOnline'
import {
  describeAction,
  dismissRejected,
  flushQueue,
  getQueue,
  getRejected,
  subscribeToQueue,
  type QueuedAction,
  type RejectedAction,
} from '../lib/offlineQueue'

/**
 * The technician's only window onto the offline queue: whether there's
 * coverage, what's still waiting to be sent, and what the server turned down
 * once it could answer. Sits above the active-shift banner because a pending
 * clock-in is exactly what makes that banner look wrong.
 */
export function OfflineBanner() {
  const { profile } = useAuth()
  const online = useOnline()
  const uid = profile?.id ?? null
  const [queue, setQueue] = useState<QueuedAction[]>([])
  const [rejected, setRejected] = useState<RejectedAction[]>([])
  const [sending, setSending] = useState(false)

  const reload = useCallback(() => {
    if (!uid) {
      setQueue([])
      setRejected([])
      return
    }
    setQueue(getQueue(uid))
    setRejected(getRejected(uid))
  }, [uid])

  useEffect(() => {
    reload()
    return subscribeToQueue(reload)
  }, [reload])

  // Sent when coverage comes back, when the app opens with things already
  // queued, and every minute after that in case "online" lied - phones report
  // a connection long before it actually carries anything.
  useEffect(() => {
    if (!uid || !online) return
    let cancelled = false
    const run = async () => {
      if (cancelled || getQueue(uid).length === 0) return
      setSending(true)
      try {
        await flushQueue(uid)
      } finally {
        if (!cancelled) setSending(false)
      }
    }
    run()
    const interval = setInterval(run, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [uid, online, queue.length])

  if (!uid) return null
  if (online && queue.length === 0 && rejected.length === 0) return null

  return (
    <div className="sticky bottom-0 z-40 w-full">
      {rejected.length > 0 && (
        <div className="flex items-start gap-2 bg-red-600 px-4 py-2 text-xs text-white">
          <div className="flex-1">
            <p className="font-semibold">
              {rejected.length === 1
                ? 'No se pudo registrar 1 acción:'
                : `No se pudieron registrar ${rejected.length} acciones:`}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {rejected.map(({ action, reason }) => (
                <li key={action.id}>
                  {describeAction(action)} — {reason}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => dismissRejected(uid)}
            aria-label="Descartar"
            className="shrink-0 rounded p-0.5 hover:bg-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(!online || queue.length > 0) && (
        <div
          className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-white ${
            online ? 'bg-eb-blue' : 'bg-slate-600'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {online ? (
              <RefreshCw className={`h-3.5 w-3.5 ${sending ? 'animate-spin' : ''}`} />
            ) : (
              <CloudOff className="h-3.5 w-3.5" />
            )}
            {online ? 'Enviando lo pendiente...' : 'Sin conexión'}
          </span>
          {queue.length > 0 && (
            <span title={queue.map(describeAction).join(' · ')}>
              {queue.length === 1 ? '1 pendiente' : `${queue.length} pendientes`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
