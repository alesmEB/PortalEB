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
import { getCurrentUser, UserRole } from '@dataconnect/generated'
import { auth } from '../lib/firebase'
import { FRESH } from '../lib/dataConnectOptions'
import { registerDeviceToken } from '../lib/pushNotifications'

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
        if (profile) registerDeviceToken(profile.id)
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
