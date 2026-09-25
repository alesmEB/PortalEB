import { useEffect, useState } from 'react'

/**
 * Whether the browser thinks it has a network. It only knows about the local
 * connection, not whether our servers answer - good enough to decide between
 * queueing and calling, because a call that fails on a dead network gets
 * queued anyway (see offlineQueue.ts).
 */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
