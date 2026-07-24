import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  // Mirrors the `admin` Firebase custom claim (same one firestore.rules'
  // isAdmin() checks) off the signed-in user's ID token. Client-side only —
  // gates which UI is shown (AdminRoute, the sidebar's Admin link); every
  // admin backend call is re-verified server-side (requireAdmin), and every
  // admin Firestore write is re-verified by firestore.rules. Never treat
  // this flag alone as an authorization boundary.
  isAdmin: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (!u) {
        setIsAdmin(false)
        setLoading(false)
        return
      }
      u.getIdTokenResult()
        .then((token) => setIsAdmin(token.claims.admin === true))
        .catch(() => setIsAdmin(false))
        .finally(() => setLoading(false))
    })
  }, [])

  const signOut = () => firebaseSignOut(auth)

  return <AuthContext.Provider value={{ user, loading, isAdmin, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
