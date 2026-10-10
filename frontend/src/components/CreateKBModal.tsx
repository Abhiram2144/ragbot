import { useState, useEffect, type FormEvent } from 'react'
import { api, type KnowledgeBase } from '../api/client'

interface Props {
  onCreated: (kb: KnowledgeBase) => void
  onClose: () => void
}

export default function CreateKBModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const kb = await api.kbs.create({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onCreated(kb)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const nameError = touched && !name.trim() ? 'Name is required' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--color-ink) 30%, transparent)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-surface rounded-xl w-full max-w-md mx-4 p-6 animate-modal-in" style={{ boxShadow: '0 20px 40px color-mix(in srgb, var(--color-ink) 15%, transparent)' }}>
        <h2 className="font-display text-xl font-semibold text-ink mb-1">New knowledge base</h2>
        <p className="text-sm text-ink/50 mb-5">Give it a name so you can find it later.</p>

        {error && (
          <div
            className="mb-4 px-3 py-2.5 rounded-lg text-sm text-ink"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/60" htmlFor="kb-name">
              Name
            </label>
            <input
              id="kb-name"
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Product documentation"
              className="w-full border rounded-lg px-3 py-2.5 text-sm text-ink bg-surface outline-none transition-colors duration-150 focus:border-primary"
              style={{ borderColor: nameError ? 'var(--color-accent)' : 'var(--color-stroke)' }}
            />
            {nameError && <p className="text-xs text-accent">{nameError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/60" htmlFor="kb-desc">
              Description <span className="normal-case font-normal text-ink/40">(optional)</span>
            </label>
            <textarea
              id="kb-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this knowledge base about?"
              rows={3}
              className="w-full border border-stroke rounded-lg px-3 py-2.5 text-sm text-ink bg-surface outline-none transition-colors duration-150 focus:border-primary resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink/60 hover:text-ink transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface bg-primary disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed transition-colors"
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary)'}
            >
              {loading && (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
