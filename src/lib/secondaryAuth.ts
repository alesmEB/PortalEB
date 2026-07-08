import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { firebaseApp } from './firebase'

/**
 * Creates a Firebase Auth account on a throwaway secondary app instance so
 * it doesn't touch the admin's own signed-in session - createUserWithEmail
 * AndPassword on the primary app would otherwise sign the admin out and into
 * the new account.
 */
export async function createAuthUser(email: string, password: string): Promise<string> {
  const secondaryApp = initializeApp(firebaseApp.options, `secondary-${Date.now()}`)
  try {
    const secondaryAuth = getAuth(secondaryApp)
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    await signOut(secondaryAuth)
    return credential.user.uid
  } finally {
    await deleteApp(secondaryApp)
  }
}
