import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { KnowledgeBase, QueryLogListItem, QueryLogDetail, StageLatencies } from '../api/client'

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMs(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)} ms`
}

function formatScore(v: number | null): string {
  return v == null ? '—' : v.toFixed(4)
}

function formatCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(6)}`
}

function shortId(id: string | null): string {
  if (!id) return '—'
  return id.length > 8 ? id.slice(0, 8) + '…' : id
}

const MUTED = 'color-mix(in srgb, var(--color-ink) 45%, transparent)'
const FAINT = 'color-mix(in srgb, var(--color-ink) 32%, transparent)'

const STAGE_LABELS: { key: keyof StageLatencies; label: string }[] = [
  { key: 'rewrite_ms', label: 'Rewrite query' },
  { key: 'embed_query_ms', label: 'Embed query' },
  { key: 'retrieve_ms', label: 'Retrieve' },
  { key: 'rerank_ms', label: 'Rerank' },
  { key: 'generate_ms', label: 'Generate answer' },
]

// ─── SearchModeBadge ─────────────────────────────────────────────────────────

function SearchModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <span style={{ color: FAINT }}>—</span>
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: mode === 'hybrid' ? 'var(--color-primary)' : MUTED,
        background:
          mode === 'hybrid' ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-background)',
        border: '1px solid var(--color-stroke)',
        borderRadius: 4,
        padding: '2px 6px',
      }}
    >
      {mode}
    </span>
  )
}

function FeedbackIcon({ feedback }: { feedback: 'up' | 'down' | null }) {
  if (feedback === 'up') return <span title="Thumbs up" style={{ color: 'var(--color-primary)' }}>👍</span>
  if (feedback === 'down') return <span title="Thumbs down" style={{ color: 'var(--color-accent)' }}>👎</span>
  return <span style={{ color: FAINT }}>—</span>
}

// ─── List view ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

function QueryLogTable({
  kb,
  onSelect,
}: {
  kb: KnowledgeBase
  onSelect: (id: string) => void
}) {
  const [items, setItems] = useState<QueryLogListItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    (off: number) => {
      setLoading(true)
      api.queryLogs
        .list(kb.id, PAGE_SIZE, off)
        .then(res => {
          setItems(res.items)
          setTotal(res.total)
          setOffset(res.offset)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    },
    [kb.id]
  )

  useEffect(() => {
    load(0)
  }, [load])

  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + PAGE_SIZE, total)

  return (
    <div className="animate-auth-rise" style={{ padding: '28px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: MUTED }}
        >
          Query history{total > 0 && ` · ${total}`}
        </h2>
      </div>

      <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 130px 90px 80px 60px',
            gap: 12,
            padding: '9px 16px',
            background: 'var(--color-background)',
            borderBottom: '1px solid var(--color-stroke)',
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            color: FAINT,
          }}
        >
          <span>Question</span>
          <span>Time</span>
          <span style={{ textAlign: 'right' }}>Latency</span>
          <span>Mode</span>
          <span style={{ textAlign: 'right' }}>Feedback</span>
        </div>

        {loading ? (
          <div style={{ padding: '24px 16px', fontSize: 13, color: MUTED, background: 'var(--color-surface)' }}>
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '24px 16px', fontSize: 13, color: MUTED, background: 'var(--color-surface)' }}>
            No queries logged yet for this knowledge base.
          </div>
        ) : (
          items.map((row, idx) => (
            <button
              key={row.id}
              onClick={() => onSelect(row.id)}
              className="cursor-pointer"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 130px 90px 80px 60px',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '11px 16px',
                borderTop: idx > 0 ? '1px solid var(--color-stroke)' : 'none',
                background: 'var(--color-surface)',
                border: 'none',
                borderTopWidth: idx > 0 ? 1 : 0,
                fontFamily: 'var(--font-sans)',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-ink) 4%, transparent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface)')}
            >
              <span
                style={{
                  fontSize: 13.5,
                  color: 'var(--color-ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.question}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: MUTED }}>
                {formatDateTime(row.created_at)}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: MUTED, textAlign: 'right' }}>
                {row.latency_ms == null ? '—' : `${row.latency_ms} ms`}
              </span>
              <span>
                <SearchModeBadge mode={row.search_mode} />
              </span>
              <span style={{ textAlign: 'right' }}>
                <FeedbackIcon feedback={row.feedback} />
              </span>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: MUTED }}>
            {rangeStart}–{rangeEnd} of {total}
          </span>
          <button
            disabled={offset === 0}
            onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-stroke)',
              background: 'var(--color-surface)',
              color: offset === 0 ? FAINT : 'var(--color-ink)',
              cursor: offset === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Prev
          </button>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => load(offset + PAGE_SIZE)}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-stroke)',
              background: 'var(--color-surface)',
              color: offset + PAGE_SIZE >= total ? FAINT : 'var(--color-ink)',
              cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Trace detail view ───────────────────────────────────────────────────────

function ResolvedResponse({ detail }: { detail: QueryLogDetail }) {
  const text = detail.response ?? ''
  const scoresByRank = new Map((detail.chunk_scores ?? []).map(c => [c.final_rank, c]))

  type Segment = { type: 'text'; content: string } | { type: 'citation'; num: string }
  const segments: Segment[] = []
  const re = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    segments.push({ type: 'citation', num: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ type: 'text', content: text.slice(lastIndex) })

  const citedNums = Array.from(new Set(segments.filter(s => s.type === 'citation').map(s => (s as { num: string }).num)))

  return (
    <div>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--color-ink)', margin: 0 }}>
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <span key={i}>{seg.content}</span>
          ) : (
            <span
              key={i}
              style={{
                display: 'inline',
                verticalAlign: 'super',
                fontSize: '0.68em',
                lineHeight: 1,
                fontFamily: 'var(--font-mono)',
                background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                color: 'var(--color-ink)',
                borderRadius: 3,
                padding: '1px 4px',
              }}
            >
              {seg.num}
            </span>
          )
        )}
      </p>

      {citedNums.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {citedNums.map(num => {
            const chunk = scoresByRank.get(Number(num))
            return (
              <div key={num} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: MUTED }}>
                [{num}] → document {shortId(chunk?.document_id ?? null)}
                {chunk?.chunk_id ? ` · chunk ${shortId(chunk.chunk_id)}` : ''}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QueryTraceDetail({ kb, queryLogId, onBack }: { kb: KnowledgeBase; queryLogId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<QueryLogDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.queryLogs
      .get(kb.id, queryLogId)
      .then(setDetail)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [kb.id, queryLogId])

  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: FAINT,
    marginBottom: 10,
  }

  const card: React.CSSProperties = {
    border: '1px solid var(--color-stroke)',
    borderRadius: 10,
    background: 'var(--color-surface)',
    padding: '14px 16px',
  }

  return (
    <div className="animate-auth-rise" style={{ padding: '28px 32px 48px', maxWidth: 760 }}>
      <button
        onClick={onBack}
        className="cursor-pointer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--color-primary)',
          background: 'none',
          border: 'none',
          padding: 0,
          marginBottom: 18,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M7.5 2 3 6l4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to history
      </button>

      {loading ? (
        <p style={{ fontSize: 13, color: MUTED }}>Loading…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: 'var(--color-accent)' }}>{error}</p>
      ) : detail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Question header */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <SearchModeBadge mode={detail.search_mode} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: MUTED }}>
                {formatDateTime(detail.created_at)}
              </span>
            </div>
            <p className="font-display" style={{ fontSize: 18, color: 'var(--color-ink)', margin: 0 }}>
              {detail.question}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: detail.confidence === 'high' ? 'var(--color-primary)' : detail.confidence === 'medium' ? 'var(--color-accent)' : 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', borderRadius: 5, padding: '3px 7px' }}>
                {detail.confidence} confidence
              </span>
              <span style={{ fontSize: 11, color: MUTED, fontFamily: 'var(--font-mono)', padding: '3px 0' }}>
                {detail.source_count} {detail.source_count === 1 ? 'source' : 'sources'}
              </span>
              {detail.feedback && <span style={{ fontSize: 11, color: MUTED, padding: '3px 0' }}>Feedback: {detail.feedback}</span>}
            </div>
          </div>

          {/* Stage latencies */}
          <section>
            <h3 style={sectionTitle}>Pipeline stages</h3>
            <div style={card}>
              {STAGE_LABELS.filter(s => detail.stage_latencies?.[s.key] != null).map((s, idx) => (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderTop: idx > 0 ? '1px solid var(--color-stroke)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: MUTED }}>
                    {formatMs(detail.stage_latencies![s.key])}
                  </span>
                </div>
              ))}
              {STAGE_LABELS.every(s => detail.stage_latencies?.[s.key] == null) && (
                <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>No stage timing recorded.</p>
              )}
            </div>
          </section>

          {/* Retrieved chunks */}
          <section>
            <h3 style={sectionTitle}>Retrieved chunks</h3>
            {detail.chunk_scores && detail.chunk_scores.length > 0 ? (
              <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-background)' }}>
                      {['Rank', 'Chunk', 'Document', 'Dense', 'Sparse', 'RRF', 'Rerank'].map(h => (
                        <th
                          key={h}
                          style={{
                            textAlign: h === 'Rank' ? 'left' : 'right',
                            padding: '8px 12px',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            fontSize: 10.5,
                            letterSpacing: '0.02em',
                            color: FAINT,
                            borderBottom: '1px solid var(--color-stroke)',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.chunk_scores]
                      .sort((a, b) => a.final_rank - b.final_rank)
                      .map(c => (
                        <tr key={`${c.final_rank}-${c.chunk_id ?? c.document_id}`} style={{ background: 'var(--color-surface)' }}>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid var(--color-stroke)', color: 'var(--color-ink)' }}>
                            {c.final_rank}
                          </td>
                          <td
                            style={{
                              padding: '7px 12px',
                              borderTop: '1px solid var(--color-stroke)',
                              fontFamily: 'var(--font-mono)',
                              color: MUTED,
                              textAlign: 'right',
                            }}
                          >
                            {shortId(c.chunk_id)}
                          </td>
                          <td
                            style={{
                              padding: '7px 12px',
                              borderTop: '1px solid var(--color-stroke)',
                              fontFamily: 'var(--font-mono)',
                              color: MUTED,
                              textAlign: 'right',
                            }}
                          >
                            {shortId(c.document_id)}
                          </td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid var(--color-stroke)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-ink)' }}>
                            {formatScore(c.dense_score)}
                          </td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid var(--color-stroke)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-ink)' }}>
                            {formatScore(c.sparse_score)}
                          </td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid var(--color-stroke)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-ink)' }}>
                            {formatScore(c.rrf_score)}
                          </td>
                          <td style={{ padding: '7px 12px', borderTop: '1px solid var(--color-stroke)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-ink)' }}>
                            {formatScore(c.rerank_score)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: MUTED }}>No chunk scores recorded.</p>
            )}
          </section>

          {/* Final response */}
          <section>
            <h3 style={sectionTitle}>Response</h3>
            <div style={card}>
              <ResolvedResponse detail={detail} />
            </div>
          </section>

          {/* Summary line */}
          <section
            style={{
              display: 'flex',
              gap: 24,
              padding: '12px 16px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
            }}
          >
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT }}>
                Total latency
              </div>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>
                {formatMs(detail.stage_latencies?.total_ms ?? null)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT }}>
                Total tokens
              </div>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>
                {detail.input_tokens == null && detail.output_tokens == null
                  ? '—'
                  : (detail.input_tokens ?? 0) + (detail.output_tokens ?? 0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT }}>
                Estimated cost
              </div>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>
                {formatCost(detail.estimated_cost_usd)}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

// ─── QueryHistoryView ────────────────────────────────────────────────────────

export default function QueryHistoryView({ kb, initialQueryId }: { kb: KnowledgeBase; initialQueryId?: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initialQueryId ?? null)

  // Reset to list view when switching KBs
  useEffect(() => {
    setSelectedId(initialQueryId ?? null)
  }, [kb.id, initialQueryId])

  return (
    <div className="flex-1 overflow-y-auto">
      {selectedId ? (
        <QueryTraceDetail kb={kb} queryLogId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <QueryLogTable kb={kb} onSelect={setSelectedId} />
      )}
    </div>
  )
}
