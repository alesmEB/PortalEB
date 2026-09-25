/**
 * The technician's own copy of what they last read, kept in the phone so the
 * app still shows their orders with no coverage - Data Connect has no local
 * cache of its own, so without this a screen opened out of range is empty.
 *
 * Everything is scoped by user id: a shared phone must never show one
 * technician's orders to another.
 */

const PREFIX = 'portaleb:offline'

export interface Snapshot<T> {
  /** When the copy was taken, so the screen can say how old it is. */
  at: string
  data: T
}

function key(uid: string, name: string) {
  return `${PREFIX}:${uid}:${name}`
}

export function readSnapshot<T>(uid: string, name: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(key(uid, name))
    return raw ? (JSON.parse(raw) as Snapshot<T>) : null
  } catch {
    // A corrupt or unreadable copy is no worse than not having one.
    return null
  }
}

export function writeSnapshot<T>(uid: string, name: string, data: T) {
  try {
    localStorage.setItem(key(uid, name), JSON.stringify({ at: new Date().toISOString(), data }))
  } catch {
    // Storage full or blocked: the app keeps working, just without a copy.
  }
}

export function readList<T>(uid: string, name: string): T[] {
  try {
    const raw = localStorage.getItem(key(uid, name))
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

export function writeList<T>(uid: string, name: string, items: T[]) {
  try {
    localStorage.setItem(key(uid, name), JSON.stringify(items))
  } catch {
    // Nothing sensible to do here: see enqueue's caller, which warns the user.
  }
}

export function formatSnapshotTime(at: string) {
  return new Date(at).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
