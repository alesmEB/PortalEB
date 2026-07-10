import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

interface SyncUserClaimsInput {
  uid?: string
}

interface SyncUserClaimsResult {
  role: string
  permissions: string[]
}

const callSyncUserClaims = httpsCallable<SyncUserClaimsInput, SyncUserClaimsResult>(
  functions,
  'syncUserClaims',
)

/** Recomputes and overwrites `uid`'s (or, if omitted, the caller's own) Auth custom claims. */
export async function syncUserClaims(uid?: string) {
  const res = await callSyncUserClaims({ uid })
  return res.data
}
