import { useCallback, useState } from 'react'

/** Runs an async action with a label describing it, so the screen can show a
 * veil while it's in flight. Meant to wrap the whole mutation + refetch, not
 * just the call: the list still looks untouched until the refetch lands, which
 * is exactly when it seems like nothing happened. */
export function useBusyAction() {
  const [busyLabel, setBusyLabel] = useState<string | null>(null)

  const runBusy = useCallback(async (label: string, action: () => Promise<unknown>) => {
    setBusyLabel(label)
    try {
      await action()
    } finally {
      setBusyLabel(null)
    }
  }, [])

  return { busyLabel, runBusy }
}
