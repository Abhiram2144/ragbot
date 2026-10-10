import { useState } from 'react'
import type { Doc } from '../api/client'

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
}

export default function DocumentCard({ doc, isNew }: Props) {
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
        <StatusBadge status={doc.status} />
      </div>

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
