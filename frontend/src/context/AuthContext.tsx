import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { AUTH_TOKEN_KEY, setAuthToken } from '../api/client'

interface AuthContextValue {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const stored = localStorage.getItem(AUTH_TOKEN_KEY)
    setAuthToken(stored)
    return stored
  })

  const setToken = useCallback((nextToken: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    setAuthToken(nextToken)
    setTokenState(nextToken)
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    setAuthToken(null)
    setTokenState(null)
  }, [])

  useEffect(() => {
    function handleExpired() {
      clearToken()
    }

    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [clearToken])

  return (
    <AuthContext.Provider value={{ token, setToken, clearToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
