import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setAuthToken } from '../api/client'
import { useAuth } from '../context/AuthContext'
import IndexCardPanel from '../components/IndexCardPanel'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { setToken } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [touched, setTouched] = useState({ email: false, password: false })

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const fieldErrors = {
    email: touched.email && !email ? 'Email is required' : touched.email && !emailValid ? 'Enter a valid email address' : '',
    password: touched.password && !password ? 'Password is required' : '',
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ email: true, password: true })

    if (!email || !emailValid || !password) return

    setLoading(true)
    setError('')
    try {
      const { access_token } = await api.login({ email, password })
      setAuthToken(access_token)
      setToken(access_token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full flex">
      {/* Left — form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 bg-surface max-w-[480px]">
        <div className="animate-auth-rise w-full max-w-sm mx-auto">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1 tracking-tight">
            RAG Platform
          </h1>
          <p className="text-sm text-ink/50 mb-8">Sign in to your organization</p>

          {error && (
            <div
              className="mb-5 px-4 py-3 rounded-lg text-sm text-ink"
              style={{ backgroundColor: 'color-mix(in srgb, #C98A3E 12%, transparent)' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink/70 uppercase tracking-wide" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                className="w-full px-3 py-2.5 rounded-lg border text-sm text-ink bg-surface outline-none transition-colors duration-150"
                style={{ borderColor: fieldErrors.email ? '#C98A3E' : 'var(--color-stroke)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlurCapture={e => {
                  if (!fieldErrors.email) e.currentTarget.style.borderColor = 'var(--color-stroke)'
                }}
                placeholder="you@company.com"
              />
              {fieldErrors.email && (
                <p className="text-xs text-accent">{fieldErrors.email}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink/70 uppercase tracking-wide" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, password: true }))}
                className="w-full px-3 py-2.5 rounded-lg border text-sm text-ink bg-surface outline-none transition-colors duration-150"
                style={{ borderColor: fieldErrors.password ? '#C98A3E' : 'var(--color-stroke)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlurCapture={e => {
                  if (!fieldErrors.password) e.currentTarget.style.borderColor = 'var(--color-stroke)'
                }}
                placeholder="••••••••"
              />
              {fieldErrors.password && (
                <p className="text-xs text-accent">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-sm font-medium text-surface bg-primary disabled:opacity-70 cursor-pointer disabled:cursor-not-allowed transition-colors duration-150"
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary)'}
              onMouseDown={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'}
              onMouseUp={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'}
            >
              {loading && <Spinner />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-ink/50 text-center">
            No account yet?{' '}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Right — index card panel */}
      <IndexCardPanel />
    </div>
  )
}
