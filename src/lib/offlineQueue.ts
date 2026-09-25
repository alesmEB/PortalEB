import { startWorking, stopWorking, toggleWorkOrderTask } from './orderWorkflow'
import { readList, writeList } from './offlineStore'

/**
 * Actions a technician can take with no coverage, kept in the phone until
 * they can be sent. Only the two that can't wait: clocking in and out, and
 * ticking a job off. Everything else still needs the server there and then.
 *
 * Each one carries the time it happened, from the phone's clock, because a
 * shift sent an hour late has to keep the hour it really happened. The server
 * accepts that time and flags the shift (TimeLog.recordedOffline).
 */
export type QueuedActionInput =
  | { kind: 'startWorking'; workOrderId: string; orderCode: string }
  | { kind: 'stopWorking'; workOrderId: string; orderCode: string }
  | {
      kind: 'toggleTask'
      workOrderId: string
      orderCode: string
      taskId: string
      description: string
      isCompleted: boolean
    }

/** `at` is when it happened on the technician's phone, `id` only keeps the
 * queue addressable while it waits. */
export type QueuedAction = QueuedActionInput & { id: string; at: string }

export interface RejectedAction {
  action: QueuedAction
  reason: string
}

const QUEUE = 'queue'
const REJECTED = 'rejected'

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** Also fires for changes made in another tab of the same phone. */
export function subscribeToQueue(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('portaleb:offline:')) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getQueue(uid: string) {
  return readList<QueuedAction>(uid, QUEUE)
}

export function getRejected(uid: string) {
  return readList<RejectedAction>(uid, REJECTED)
}

export function enqueue(uid: string, action: QueuedActionInput) {
  const queued: QueuedAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  }
  writeList(uid, QUEUE, [...getQueue(uid), queued])
  notify()
  return queued
}

export function dismissRejected(uid: string) {
  writeList<RejectedAction>(uid, REJECTED, [])
  notify()
}

/**
 * A call that never reached the server: the SDK reports these as "internal"
 * or "unavailable" with no message of its own. Those stay in the queue; a
 * real answer from the server (permission, wrong state, bad time) means the
 * action will never work, so it's dropped and shown to the technician.
 */
export function isConnectivityError(err: unknown) {
  if (!navigator.onLine) return true
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return true
  return ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'].includes(code)
}

function reasonOf(err: unknown) {
  return err instanceof Error && err.message ? err.message : 'No se pudo enviar.'
}

async function send(action: QueuedAction) {
  if (action.kind === 'startWorking') return startWorking(action.workOrderId, action.at)
  if (action.kind === 'stopWorking') return stopWorking(action.at)
  return toggleWorkOrderTask(action.taskId, action.isCompleted)
}

let flushing = false

/**
 * Sends what's queued, oldest first, stopping at the first one that can't
 * reach the server so the order in which things happened is preserved.
 */
export async function flushQueue(uid: string) {
  if (flushing) return { sent: 0, rejected: 0, pending: getQueue(uid).length }
  flushing = true
  let sent = 0
  let rejected = 0
  try {
    for (;;) {
      const queue = getQueue(uid)
      const next = queue[0]
      if (!next) break
      try {
        await send(next)
        writeList(uid, QUEUE, queue.slice(1))
        sent++
      } catch (err) {
        if (isConnectivityError(err)) break
        writeList(uid, QUEUE, queue.slice(1))
        writeList<RejectedAction>(uid, REJECTED, [
          ...getRejected(uid),
          { action: next, reason: reasonOf(err) },
        ])
        rejected++
      }
      notify()
    }
  } finally {
    flushing = false
    notify()
  }
  return { sent, rejected, pending: getQueue(uid).length }
}

export function describeAction(action: QueuedAction) {
  if (action.kind === 'startWorking') return `Entrada en ${action.orderCode}`
  if (action.kind === 'stopWorking') return `Salida de ${action.orderCode}`
  return `${action.isCompleted ? 'Trabajo hecho' : 'Trabajo sin hacer'}: ${action.description}`
}
