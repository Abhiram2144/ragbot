import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import { api } from '../api/client'
import type { KnowledgeBase, AnalyticsResponse, DailyAnalytics } from '../api/client'

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatLatency(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`
}

function formatCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(6)}`
}

function formatRatio(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

function formatAxisDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MUTED = 'color-mix(in srgb, var(--color-ink) 45%, transparent)'
const FAINT = 'color-mix(in srgb, var(--color-ink) 32%, transparent)'

const RANGE_OPTIONS = [7, 30, 90] as const

// ─── StatTile ────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid var(--color-stroke)',
        borderRadius: 10,
        background: 'var(--color-surface)',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          color: FAINT,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>{value}</div>
    </div>
  )
}

// ─── Chart tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload as DailyAnalytics
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-stroke)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 4px 14px color-mix(in srgb, var(--color-ink) 10%, transparent)',
      }}
    >
      <div style={{ fontWeight: 500, color: 'var(--color-ink)', marginBottom: 3 }}>
        {formatAxisDate(point.date)}
      </div>
      <div style={{ color: MUTED, fontFamily: 'var(--font-mono)' }}>
        {point.query_count} {point.query_count === 1 ? 'query' : 'queries'}
      </div>
      <div style={{ color: MUTED, fontFamily: 'var(--font-mono)' }}>
        avg {formatLatency(point.avg_latency_ms)}
      </div>
    </div>
  )
}

// ─── AnalyticsView ───────────────────────────────────────────────────────────

export default function AnalyticsView({ kb, onOpenQuery, onOpenDocuments }: { kb: KnowledgeBase; onOpenQuery?: (id: string) => void; onOpenDocuments?: () => void }) {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((kbId: string, d: number) => {
    setLoading(true)
    api.analytics
      .get(kbId, d)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(kb.id, days)
  }, [kb.id, days, load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="animate-auth-rise" style={{ padding: '28px 32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
            Analytics
          </h2>

          {/* Date-range selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setDays(opt)}
                style={{
                  fontSize: 12,
                  fontWeight: days === opt ? 500 : 400,
                  padding: '4px 11px',
                  borderRadius: 6,
                  border: '1px solid var(--color-stroke)',
                  background: days === opt ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-surface)',
                  color: days === opt ? 'var(--color-primary)' : MUTED,
                  cursor: 'pointer',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {opt}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: MUTED }}>Loading…</p>
        ) : !data ? (
          <div
            style={{
              border: '1px dashed var(--color-stroke)',
              borderRadius: 10,
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: 13,
              color: MUTED,
            }}
          >
            No queries logged for {kb.name} in the last {days} days.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Summary tiles */}
            <div style={{ display: 'flex', gap: 14 }}>
              <StatTile label="Total queries" value={String(data.total_queries)} />
              <StatTile label="Avg latency" value={formatLatency(data.avg_latency_ms)} />
              <StatTile label="Avg cost / query" value={formatCost(data.avg_cost_usd)} />
              <StatTile label="Helpful-answer rate" value={formatRatio(data.feedback_ratio)} />
              <StatTile label="Low-confidence" value={String(data.low_confidence_questions.length)} />
            </div>

            {Object.keys(data.feedback_reasons).length > 0 && (
              <section>
                <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>
                  Report reasons
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(data.feedback_reasons).map(([reason, count]) => (
                    <div key={reason} style={{ border: '1px solid var(--color-stroke)', borderRadius: 8, background: 'var(--color-surface)', padding: '9px 12px', fontSize: 12, color: MUTED }}>
                      {reason.replace('_', ' ')} <strong style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-mono)', marginLeft: 5 }}>{count}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Daily query volume */}
            <section>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  color: FAINT,
                  marginBottom: 10,
                }}
              >
                Daily query volume
              </h3>
              <div
                style={{
                  border: '1px solid var(--color-stroke)',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  padding: '16px 16px 8px',
                  height: 240,
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily} barCategoryGap={data.daily.length > 40 ? '10%' : '30%'}>
                    <CartesianGrid vertical={false} stroke="var(--color-stroke)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatAxisDate}
                      tick={{ fontSize: 11, fill: MUTED, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'var(--color-stroke)' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: MUTED, fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      content={props => <ChartTooltip {...props} />}
                      cursor={{ fill: 'color-mix(in srgb, var(--color-ink) 4%, transparent)' }}
                    />
                    <Bar dataKey="query_count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>
                Questions and helpful-answer trend
              </h3>
              <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, background: 'var(--color-surface)', padding: '16px 16px 8px', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid vertical={false} stroke="var(--color-stroke)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 11, fill: MUTED, fontFamily: 'var(--font-mono)' }} axisLine={{ stroke: 'var(--color-stroke)' }} tickLine={false} minTickGap={24} />
                    <YAxis yAxisId="queries" allowDecimals={false} tick={{ fontSize: 11, fill: MUTED, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={28} />
                    <YAxis yAxisId="rate" orientation="right" domain={[0, 1]} tickFormatter={value => `${Math.round(value * 100)}%`} tick={{ fontSize: 11, fill: MUTED, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={props => <ChartTooltip {...props} />} />
                    <Line yAxisId="queries" type="monotone" dataKey="query_count" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Queries" />
                    <Line yAxisId="rate" type="monotone" dataKey="helpful_rate" stroke="var(--color-accent)" strokeWidth={2} dot={false} name="Helpful rate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <section>
                <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Knowledge gaps detected</h3>
                <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, overflow: 'hidden' }}>
                  {data.low_confidence_questions.length === 0 ? <p style={{ padding: 14, margin: 0, fontSize: 13, color: MUTED }}>No low-confidence questions.</p> : data.low_confidence_questions.map(item => (
                    <button key={item.query_log_id} onClick={() => onOpenQuery?.(item.query_log_id)} style={{ display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left', border: 'none', borderTop: '1px solid var(--color-stroke)', background: 'var(--color-surface)', cursor: onOpenQuery ? 'pointer' : 'default' }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--color-ink)' }}>{item.question}</span>
                      <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--color-accent)' }}>No confident answer recorded</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Needs review</h3>
                <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, overflow: 'hidden' }}>
                  {data.stale_documents.length === 0 ? <p style={{ padding: 14, margin: 0, fontSize: 13, color: MUTED }}>No stale published documents.</p> : data.stale_documents.map(doc => (
                    <button key={doc.document_id} onClick={onOpenDocuments} style={{ display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left', border: 'none', borderTop: '1px solid var(--color-stroke)', background: 'var(--color-surface)', cursor: onOpenDocuments ? 'pointer' : 'default' }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--color-ink)' }}>{doc.filename}</span>
                      <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--color-accent)' }}>Review date passed: {doc.review_date}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section>
              <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Most common questions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.common_questions.slice(0, 5).map(item => <div key={item.query_log_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 12px', border: '1px solid var(--color-stroke)', borderRadius: 8, background: 'var(--color-surface)', fontSize: 13 }}><span style={{ color: 'var(--color-ink)' }}>{item.question}</span><span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', color: MUTED }}>{item.count}×</span></div>)}
              </div>
            </section>

            <section>
              <h3 style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Questions by knowledge base</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.knowledge_bases.length === 0 ? <span style={{ fontSize: 13, color: MUTED }}>No questions recorded.</span> : data.knowledge_bases.map(item => <div key={item.kb_id} style={{ border: '1px solid var(--color-stroke)', borderRadius: 8, background: 'var(--color-surface)', padding: '9px 12px', fontSize: 13, color: 'var(--color-ink)' }}>{item.name} <strong style={{ fontFamily: 'var(--font-mono)', color: MUTED, marginLeft: 5 }}>{item.query_count}</strong></div>)}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
