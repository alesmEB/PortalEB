import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getCurrentUser, UserRole } from '@dataconnect/generated'
import { auth, firestore } from '../lib/firebase'
import { FRESH } from '../lib/dataConnectOptions'
import { registerDeviceToken } from '../lib/pushNotifications'

/**
 * Firestore security rules (chat) can't read Data Connect, so a user's
 * "is admin" status is mirrored here as doc existence - self-healing on
 * every login since there's no Cloud Function reacting to role changes yet.
 */
async function syncAdminMirror(profile: AuthUserProfile) {
  const ref = doc(firestore, 'adminUsers', profile.id)
  if (profile.role === UserRole.ADMIN) {
    await setDoc(ref, { syncedAt: serverTimestamp() })
  } else {
    await deleteDoc(ref).catch(() => {})
  }
}

export type { UserRole }

export interface AuthUserProfile {
  id: string
  email: string
  displayName: string
  role: UserRole
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null
  profile: AuthUserProfile | null
  permissions: string[]
  loading: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadProfile(): Promise<{ profile: AuthUserProfile | null; permissions: string[] }> {
  const { data } = await getCurrentUser(FRESH)
  if (!data.user) return { profile: null, permissions: [] }

  return {
    profile: {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.displayName,
      role: data.user.role,
    },
    permissions: data.user.userPermissions.map((entry) => entry.permission.key),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<AuthUserProfile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)

      if (!user) {
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const { profile, permissions } = await loadProfile()
        setProfile(profile)
        setPermissions(permissions)
        if (profile) {
          registerDeviceToken(profile.id)
          syncAdminMirror(profile).catch(() => {})
        }
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const value: AuthContextValue = {
    firebaseUser,
    profile,
    permissions,
    loading,
    refreshProfile: async () => {
      const { profile, permissions } = await loadProfile()
      setProfile(profile)
      setPermissions(permissions)
    },
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password)
    },
    signOut: async () => {
      await firebaseSignOut(auth)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
