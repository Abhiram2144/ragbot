import { useAuth } from '../context/AuthContext'
import { setAuthToken } from '../api/client'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const { token, clearToken } = useAuth()
  const navigate = useNavigate()

  function logout() {
    setAuthToken(null)
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-full bg-background flex flex-col items-center justify-center gap-6">
      <div className="bg-surface rounded-xl border border-stroke px-8 py-6 max-w-md w-full shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-2">Dashboard</h1>
        <p className="text-sm text-ink/60 mb-4">
          JWT present in context — placeholder until knowledge base UI (phase 3.2).
        </p>
        <div
          className="font-mono text-xs text-ink/50 bg-background rounded-lg p-3 break-all border border-stroke"
        >
          {token}
        </div>
        <button
          onClick={logout}
          className="mt-5 text-sm text-primary hover:underline font-medium cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
