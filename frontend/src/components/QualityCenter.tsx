import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { EvaluationRun, KnowledgeBase } from '../api/client'

const MUTED = 'color-mix(in srgb, var(--color-ink) 45%, transparent)'
const FAINT = 'color-mix(in srgb, var(--color-ink) 32%, transparent)'

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function formatNumber(value: number | null): string {
  return value == null ? '—' : value.toFixed(3)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Metric({ label, value, comparison }: { label: string; value: string; comparison?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, border: '1px solid var(--color-stroke)', borderRadius: 10, background: 'var(--color-surface)', padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>{value}</div>
      {comparison && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{comparison}</div>}
    </div>
  )
}

export default function QualityCenter({ kb }: { kb: KnowledgeBase }) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [mode, setMode] = useState<'dense' | 'hybrid'>('hybrid')
  const [faithfulness, setFaithfulness] = useState(false)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.quality.listRuns(kb.id).then(setRuns).catch(err => setError(err instanceof Error ? err.message : 'Could not load evaluation runs')).finally(() => setLoading(false))
  }, [kb.id])

  useEffect(() => { load() }, [load])

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const result = await api.quality.run(kb.id, mode, faithfulness)
      setRuns(previous => [result, ...previous])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed')
    } finally {
      setRunning(false)
    }
  }

  const latestDense = runs.find(run => run.search_mode === 'dense')
  const latestHybrid = runs.find(run => run.search_mode === 'hybrid')
  const selected = mode === 'dense' ? latestDense : latestHybrid
  const baseline = latestDense?.aggregate_metrics
  const current = latestHybrid?.aggregate_metrics
  const delta = (key: 'hit_rate' | 'mrr' | 'citation_accuracy') => baseline && current && baseline[key] != null && current[key] != null
    ? `${current[key]! >= baseline[key]! ? '+' : ''}${Math.round((current[key]! - baseline[key]!) * 100)} pts vs dense`
    : undefined

  const comparisons = current && baseline ? current.per_question.map(question => {
    const denseQuestion = baseline.per_question.find(item => item.id === question.id)
    return denseQuestion ? { ...question, delta: question.mrr - denseQuestion.mrr } : null
  }).filter(Boolean) as Array<{ id: string; question: string; delta: number }> : []
  const improved = comparisons.filter(item => item.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4)
  const regressed = comparisons.filter(item => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="animate-auth-rise" style={{ padding: '28px 32px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 22 }}>
          <div>
            <h2 className="font-display" style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-ink)' }}>Quality Center</h2>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: MUTED }}>Measure whether hybrid retrieval improves {kb.name}.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <select value={mode} onChange={event => setMode(event.target.value as 'dense' | 'hybrid')} style={{ border: '1px solid var(--color-stroke)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12, padding: '7px 9px' }}>
              <option value="hybrid">Hybrid + rerank</option>
              <option value="dense">Dense baseline</option>
            </select>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: MUTED }}><input type="checkbox" checked={faithfulness} onChange={event => setFaithfulness(event.target.checked)} /> LLM faithfulness judge</label>
            <button onClick={run} disabled={running} style={{ border: 'none', borderRadius: 7, background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '8px 12px', cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}>{running ? 'Running…' : 'Run evaluation'}</button>
          </div>
        </div>

        {error && <div style={{ marginBottom: 16, borderRadius: 8, padding: '10px 12px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: 13 }}>{error}</div>}
        {loading ? <p style={{ color: MUTED, fontSize: 13 }}>Loading evaluation history…</p> : !selected ? (
          <div style={{ border: '1px dashed var(--color-stroke)', borderRadius: 10, padding: '36px 18px', textAlign: 'center', color: MUTED, fontSize: 13 }}>No {mode} evaluation yet. Run one to create a measured baseline.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Metric label="Recall @ 5" value={formatPercent(selected.aggregate_metrics.recall_at_5)} comparison={delta('hit_rate')} />
              <Metric label="MRR" value={formatNumber(selected.aggregate_metrics.mrr)} comparison={delta('mrr')} />
              <Metric label="Citation accuracy" value={formatPercent(selected.aggregate_metrics.citation_accuracy)} comparison={delta('citation_accuracy')} />
              <Metric label="Avg latency" value={`${selected.aggregate_metrics.latency_ms_mean ?? '—'} ms`} />
              <Metric label="Cost / query" value={`$${selected.aggregate_metrics.estimated_cost_usd_mean?.toFixed(6) ?? '—'}`} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED }}>
              <span>{selected.aggregate_metrics.dataset_size} questions · {selected.aggregate_metrics.num_succeeded} succeeded</span>
              <span>Last {selected.search_mode} run: {formatDate(selected.created_at)}</span>
            </div>

            {latestDense && latestHybrid && (
              <section>
                <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Dense vs hybrid + rerank</h3>
                <div style={{ border: '1px solid var(--color-stroke)', borderRadius: 10, overflow: 'hidden' }}>
                  {([['Recall @ 5', 'recall_at_5'], ['MRR', 'mrr'], ['Citation accuracy', 'citation_accuracy'], ['Avg latency', 'latency_ms_mean']] as const).map(([label, key]) => <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px', gap: 12, padding: '10px 14px', borderTop: key === 'recall_at_5' ? 'none' : '1px solid var(--color-stroke)', fontSize: 13 }}><span>{label}</span><span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{key === 'latency_ms_mean' ? `${latestDense.aggregate_metrics[key] ?? '—'} ms` : formatNumber(latestDense.aggregate_metrics[key])}</span><span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-primary)' }}>{key === 'latency_ms_mean' ? `${latestHybrid.aggregate_metrics[key] ?? '—'} ms` : formatNumber(latestHybrid.aggregate_metrics[key])}</span></div>)}
                </div>
              </section>
            )}

            {latestDense && latestHybrid && (improved.length > 0 || regressed.length > 0) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <section><h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Improved questions</h3>{improved.map(item => <div key={item.id} style={{ padding: '9px 12px', marginBottom: 6, border: '1px solid var(--color-stroke)', borderRadius: 8, fontSize: 13, background: 'var(--color-surface)' }}>{item.question}<span style={{ display: 'block', marginTop: 3, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>MRR +{item.delta.toFixed(2)}</span></div>)}</section>
              <section><h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.02em', color: FAINT, marginBottom: 10 }}>Regressed questions</h3>{regressed.map(item => <div key={item.id} style={{ padding: '9px 12px', marginBottom: 6, border: '1px solid var(--color-stroke)', borderRadius: 8, fontSize: 13, background: 'var(--color-surface)' }}>{item.question}<span style={{ display: 'block', marginTop: 3, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>MRR {item.delta.toFixed(2)}</span></div>)}</section>
            </div>}

            {selected.aggregate_metrics.faithfulness_enabled && <p style={{ margin: 0, fontSize: 11, color: MUTED }}>Faithfulness is an LLM-judge estimate, not ground truth.</p>}
          </div>
        )}
      </div>
    </div>
  )
}