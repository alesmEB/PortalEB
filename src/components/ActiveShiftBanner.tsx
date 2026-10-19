import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyActiveTimeLog } from '@dataconnect/generated'
import { useAuth } from '../contexts/AuthContext'
import { onActiveShiftAnnounced, pickActiveShift, type ActiveShiftSummary } from '../lib/activeShift'
import { FRESH } from '../lib/dataConnectOptions'

function formatElapsed(clockIn: string, now: number) {
  const totalSeconds = Math.max(0, Math.floor((now - new Date(clockIn).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * Sticky reminder of the technician's active shift, shown on every page -
 * covers the case where they have the app open (the push notification in
 * functions/index.js covers the case where they don't).
 */
export function ActiveShiftBanner() {
  const { firebaseUser } = useAuth()
  const navigate = useNavigate()
  const [activeLog, setActiveLog] = useState<ActiveShiftSummary | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!firebaseUser) {
      setActiveLog(null)
      return
    }
    let cancelled = false
    function load() {
      getMyActiveTimeLog(FRESH).then((res) => {
        if (!cancelled) setActiveLog(pickActiveShift(res.data.timeLogs))
      })
    }
    load()
    const interval = setInterval(load, 30_000)
    // `focus` alone can be unreliable on some installed-PWA/mobile setups
    // when switching back into the app - visibilitychange is the more
    // dependable signal there, so both are wired to the same refetch.
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    // A clock-in or clock-out on the order page shows here at once.
    const unsubscribe = onActiveShiftAnnounced((shift) => {
      if (!cancelled) setActiveLog(shift)
    })
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(interval)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [firebaseUser])

  useEffect(() => {
    if (!activeLog) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [activeLog])

  if (!activeLog) return null

  return (
    <button
      onClick={() => navigate(`/orders/${activeLog.workOrderId}`)}
      className="sticky bottom-0 z-40 flex w-full items-center justify-between gap-2 bg-eb-teal px-4 py-2 text-sm font-semibold text-white shadow-lg"
    >
      <span>Turno activo: {activeLog.workOrder.code}</span>
      <span className="font-mono">{formatElapsed(activeLog.clockIn, now)}</span>
    </button>
  )
}
