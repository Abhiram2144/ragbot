import { useState } from 'react'
import { api } from '../api/client'
import type { Doc, PublicationStatus } from '../api/client'

const BAR_WIDTHS = [88, 72, 93, 68, 81] // percent

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function ChunkBars() {
  return (
    <div className="flex flex-col gap-2 mt-3 pb-0.5" aria-label="Processing document">
      {BAR_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="h-0.5 rounded-full"
          style={{
            width: `${w}%`,
            animation: reducedMotion
              ? undefined
              : `chunk-bar 1.5s ease-in-out ${i * 150}ms infinite`,
            backgroundColor: reducedMotion ? 'var(--color-stroke)' : undefined,
          }}
        />
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: Doc['status'] }) {
  const styles: Record<Doc['status'], { label: string; color: string; bg: string }> = {
    pending:    { label: 'pending',    color: 'color-mix(in srgb, var(--color-ink) 35%, transparent)', bg: 'color-mix(in srgb, var(--color-stroke) 60%, transparent)' },
    processing: { label: 'processing', color: 'var(--color-primary)', bg: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' },
    complete:   { label: 'complete',   color: 'var(--color-primary)', bg: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' },
    failed:     { label: 'failed',     color: 'var(--color-accent)',  bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' },
  }
  const s = styles[status]
  return (
    <span
      className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  )
}

function PublicationBadge({ status }: { status: PublicationStatus }) {
  const styles: Record<PublicationStatus, { color: string; bg: string }> = {
    draft: { color: 'color-mix(in srgb, var(--color-ink) 55%, transparent)', bg: 'color-mix(in srgb, var(--color-stroke) 70%, transparent)' },
    published: { color: 'var(--color-primary)', bg: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' },
    archived: { color: 'color-mix(in srgb, var(--color-ink) 45%, transparent)', bg: 'color-mix(in srgb, var(--color-ink) 7%, transparent)' },
  }
  const style = styles[status]
  return <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: style.color, background: style.bg }}>{status}</span>
}

function FailedSection({ message }: { message: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const text = message ?? 'Unknown error'
  const isTruncated = text.length > 100
  const displayed = !expanded && isTruncated ? text.slice(0, 100) + '…' : text

  return (
    <div
      className="mt-3 text-xs text-ink px-3 py-2.5 rounded-lg leading-relaxed"
      style={{ background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
    >
      {displayed}
      {isTruncated && (
        <button
          className="ml-1 font-medium cursor-pointer hover:underline"
          style={{ color: 'var(--color-accent)' }}
          onClick={() => setExpanded(x => !x)}
        >
          {expanded ? 'less' : 'show more'}
        </button>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

interface Props {
  doc: Doc
  isNew: boolean
  onUpdated: (doc: Doc) => void
}

export default function DocumentCard({ doc, isNew, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    department: doc.department,
    owner: doc.owner ?? '',
    effective_date: doc.effective_date ?? '',
    review_date: doc.review_date ?? '',
    publication_status: doc.publication_status,
  })
  const stale = Boolean(doc.review_date && new Date(`${doc.review_date}T23:59:59`) < new Date() && doc.publication_status === 'published')

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.documents.update(doc.kb_id, doc.id, {
        ...form,
        owner: form.owner || null,
        effective_date: form.effective_date || null,
        review_date: form.review_date || null,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save metadata')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`bg-surface rounded-xl p-4 ${isNew && !reducedMotion ? 'doc-enter' : ''}`}
      style={{ border: '1px solid var(--color-stroke)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-ink) 35%, transparent)' }}>
            {formatDate(doc.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={doc.status} />
          <PublicationBadge status={doc.publication_status} />
        </div>
      </div>

      {stale && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}>
          Review date passed. This policy may be outdated.
        </div>
      )}

      {editing ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-ink/55">Department<input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Owner<input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" placeholder="name or email" /></label>
          <label className="text-xs text-ink/55">Effective date<input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Review date<input type="date" value={form.review_date} onChange={e => setForm({ ...form, review_date: e.target.value })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none" /></label>
          <label className="text-xs text-ink/55">Lifecycle status<select value={form.publication_status} onChange={e => setForm({ ...form, publication_status: e.target.value as PublicationStatus })} className="mt-1 w-full rounded-md border border-stroke bg-background px-2 py-1.5 text-sm text-ink outline-none"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <div className="col-span-2 flex items-center justify-end gap-2 pt-1">
            {error && <span className="mr-auto text-xs text-accent">{error}</span>}
            <button onClick={() => setEditing(false)} disabled={saving} className="rounded-md border border-stroke px-3 py-1.5 text-xs text-ink/60 cursor-pointer">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : 'Save metadata'}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3 text-xs text-ink/45">
          <span>{doc.department}</span>
          <span>{doc.owner || 'No owner'}</span>
          <span>Review {doc.review_date ? formatDate(doc.review_date) : 'not set'}</span>
          <button onClick={() => setEditing(true)} className="ml-auto cursor-pointer font-medium text-primary">Edit metadata</button>
        </div>
      )}

      {/* Status visual */}
      {doc.status === 'processing' && <ChunkBars />}

      {doc.status === 'pending' && (
        <p className="mt-3 text-xs" style={{ color: 'color-mix(in srgb, var(--color-ink) 35%, transparent)' }}>
          Queued for processing…
        </p>
      )}

      {doc.status === 'complete' && (
        <div
          className={`mt-3 flex items-center gap-1.5 text-xs ${!reducedMotion ? 'check-pop' : ''}`}
          style={{ color: 'var(--color-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Indexed and ready
        </div>
      )}

      {doc.status === 'failed' && <FailedSection message={doc.error_message} />}
    </div>
  )
}
