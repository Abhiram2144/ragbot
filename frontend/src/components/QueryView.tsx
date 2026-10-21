import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client'
import type { KnowledgeBase, Doc, QuerySource, QueryTelemetry } from '../api/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const NO_CONTEXT_PHRASE = "I don't have enough information to answer that."

// ─── Types ────────────────────────────────────────────────────────────────────

interface QAEntry {
  id: string
  question: string
  answer: string
  sources: QuerySource[]
  isStreaming: boolean
  isThinking: boolean
  queryLogId: string | null
  feedback: 'up' | 'down' | null
  feedbackReason: FeedbackReason | null
  telemetry: QueryTelemetry | null
}

type FeedbackReason = 'incorrect' | 'outdated' | 'missing_information'

// ─── ThinkingDots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <span
      role="status"
      aria-label="Thinking"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 0' }}
    >
      {[0, 150, 300].map((delay, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            display: 'inline-block',
            opacity: reducedMotion ? 0.6 : undefined,
            animation: reducedMotion
              ? 'none'
              : `thinking-pulse 1.2s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  )
}

// ─── AnswerText ───────────────────────────────────────────────────────────────

interface AnswerTextProps {
  text: string
  interactive: boolean
  onCitationActivate: (marker: string) => void
}

function AnswerText({ text, interactive, onCitationActivate }: AnswerTextProps) {
  type Segment =
    | { type: 'text'; content: string }
    | { type: 'citation'; marker: string; num: string }

  const segments: Segment[] = []
  const re = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'citation', marker: `[${match[1]}]`, num: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.content}</span>
        ) : (
          <button
            key={i}
            title={`Source ${seg.marker}`}
            style={{
              display: 'inline',
              verticalAlign: 'super',
              fontSize: '0.68em',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
              color: 'var(--color-ink)',
              border: 'none',
              borderRadius: 3,
              padding: '1px 4px',
              cursor: interactive ? 'pointer' : 'default',
              transition: 'transform 100ms ease',
              userSelect: 'none',
            }}
            onMouseEnter={
              interactive
                ? e => {
                    onCitationActivate(seg.marker)
                    e.currentTarget.style.transform = 'scale(1.1)'
                    e.currentTarget.style.textDecoration = 'underline'
                  }
                : undefined
            }
            onMouseLeave={
              interactive
                ? e => {
                    e.currentTarget.style.transform = ''
                    e.currentTarget.style.textDecoration = ''
                  }
                : undefined
            }
            onClick={interactive ? () => onCitationActivate(seg.marker) : undefined}
          >
            {seg.num}
          </button>
        )
      )}
    </>
  )
}

// ─── SourceCard ───────────────────────────────────────────────────────────────

function SourceCard({
  source,
  filename,
  animKey,
}: {
  source: QuerySource
  filename: string
  animKey: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (animKey === 0 || !ref.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    el.style.animation = 'none'
    void el.offsetWidth // force reflow to restart animation
    el.style.animation = 'source-pulse 400ms ease-out forwards'
  }, [animKey])

  const snippet =
    source.chunk_text.length > 200
      ? source.chunk_text.slice(0, 200) + '…'
      : source.chunk_text

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-stroke)',
        borderRadius: 8,
        padding: '8px 10px',
        minWidth: 160,
        maxWidth: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
        {/* File icon */}
        <svg
          width="11"
          height="13"
          viewBox="0 0 11 13"
          fill="none"
          aria-hidden
          style={{ color: 'var(--color-primary)', flexShrink: 0 }}
        >
          <path
            d="M1.5 1h5.5l2.5 2.5V12a.5.5 0 0 1-.5.5H1.5A.5.5 0 0 1 1 12V1.5A.5.5 0 0 1 1.5 1Z"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path d="M7 1v3h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--color-ink)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={filename}
        >
          {filename}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            color: 'var(--color-ink)',
            borderRadius: 3,
            padding: '1px 4px',
            flexShrink: 0,
          }}
        >
          {source.marker}
        </span>
      </div>
      <p
        style={{
          fontSize: 11,
          lineHeight: 1.5,
          color: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
          margin: 0,
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {snippet}
      </p>
    </div>
  )
}

// ─── FeedbackRow ──────────────────────────────────────────────────────────────

function ThumbIcon({ direction, filled }: { direction: 'up' | 'down'; filled: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden
      style={{ transform: direction === 'down' ? 'scaleY(-1)' : undefined }}
    >
      <path
        d="M5 7H2.6a1 1 0 0 0-1 1.1l.6 5A1 1 0 0 0 3.2 14H5m0-7v7m0-7 2.3-4.5a1.1 1.1 0 0 1 2.1.5l-.2 4h3.3a1.2 1.2 0 0 1 1.17 1.45l-.9 4.4A1.2 1.2 0 0 1 11.6 14H5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FeedbackRow({
  entry,
  onFeedback,
  onReport,
}: {
  entry: QAEntry
  onFeedback: (entryId: string, value: 'up' | 'down') => void
  onReport: (entryId: string, reason: FeedbackReason) => void
}) {
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState<FeedbackReason>('incorrect')

  const btnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 6,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: active ? 'var(--color-ink)' : 'color-mix(in srgb, var(--color-ink) 28%, transparent)',
    transition: 'color 120ms',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          title="Good answer"
          aria-label="Mark answer helpful"
          onClick={() => onFeedback(entry.id, 'up')}
          style={btnStyle(entry.feedback === 'up')}
          onMouseEnter={e => { if (entry.feedback !== 'up') e.currentTarget.style.color = 'color-mix(in srgb, var(--color-ink) 55%, transparent)' }}
          onMouseLeave={e => { if (entry.feedback !== 'up') e.currentTarget.style.color = 'color-mix(in srgb, var(--color-ink) 28%, transparent)' }}
        >
          <ThumbIcon direction="up" filled={entry.feedback === 'up'} />
        </button>
        <button
          title="Bad answer"
          aria-label="Mark answer unhelpful"
          onClick={() => onFeedback(entry.id, 'down')}
          style={btnStyle(entry.feedback === 'down')}
          onMouseEnter={e => { if (entry.feedback !== 'down') e.currentTarget.style.color = 'color-mix(in srgb, var(--color-ink) 55%, transparent)' }}
          onMouseLeave={e => { if (entry.feedback !== 'down') e.currentTarget.style.color = 'color-mix(in srgb, var(--color-ink) 28%, transparent)' }}
        >
          <ThumbIcon direction="down" filled={entry.feedback === 'down'} />
        </button>
      </div>
      <button
        onClick={() => setReportOpen(open => !open)}
        style={{ border: 'none', background: 'none', padding: '3px 0', color: 'color-mix(in srgb, var(--color-ink) 42%, transparent)', fontSize: 11, cursor: 'pointer' }}
      >
        {entry.feedbackReason ? 'Report submitted' : 'Report answer'}
      </button>
      {reportOpen && !entry.feedbackReason && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', paddingTop: 2 }}>
          <select
            value={reason}
            onChange={e => setReason(e.target.value as FeedbackReason)}
            aria-label="Report reason"
            style={{ border: '1px solid var(--color-stroke)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 11, padding: '4px 6px' }}
          >
            <option value="incorrect">Incorrect answer</option>
            <option value="outdated">Outdated information</option>
            <option value="missing_information">Missing information</option>
          </select>
          <button
            onClick={() => { onReport(entry.id, reason); setReportOpen(false) }}
            style={{ border: 'none', borderRadius: 6, background: 'var(--color-ink)', color: '#fff', fontSize: 11, padding: '5px 8px', cursor: 'pointer' }}
          >
            Send report
          </button>
        </div>
      )}
    </div>
  )
}

// ─── QAPair ───────────────────────────────────────────────────────────────────

function QAPair({
  entry,
  docs,
  onFeedback,
  onReport,
}: {
  entry: QAEntry
  docs: Doc[]
  onFeedback: (entryId: string, value: 'up' | 'down') => void
  onReport: (entryId: string, reason: FeedbackReason) => void
}) {
  const [highlightKeys, setHighlightKeys] = useState<Record<string, number>>({})

  const isNoContext =
    !entry.isStreaming &&
    !entry.isThinking &&
    entry.answer.includes(NO_CONTEXT_PHRASE)

  function activateCitation(marker: string) {
    setHighlightKeys(prev => ({ ...prev, [marker]: (prev[marker] ?? 0) + 1 }))
  }

  function getFilename(docId: string): string {
    return docs.find(d => d.id === docId)?.filename ?? 'document'
  }

  return (
    <div className="qa-enter" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Question (right-aligned) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '65%',
            background: 'var(--color-primary)',
            color: '#fff',
            borderRadius: '12px 12px 2px 12px',
            padding: '9px 13px',
            fontSize: 14,
            lineHeight: 1.55,
            fontFamily: 'var(--font-sans)',
            wordBreak: 'break-word',
          }}
        >
          {entry.question}
        </div>
      </div>

      {/* Lightweight answer quality signal; detailed retrieval scores stay in history. */}
      {!entry.isStreaming && !entry.isThinking && entry.telemetry && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 2, color: 'color-mix(in srgb, var(--color-ink) 48%, transparent)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: entry.telemetry.confidence === 'high' ? 'var(--color-primary)' : entry.telemetry.confidence === 'medium' ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-ink) 55%, transparent)', fontWeight: 600 }}>
            {entry.telemetry.confidence[0].toUpperCase() + entry.telemetry.confidence.slice(1)} confidence
          </span>
          <span>{entry.telemetry.source_count} {entry.telemetry.source_count === 1 ? 'source' : 'sources'}</span>
          {entry.telemetry.latency_ms != null && <span>{entry.telemetry.latency_ms} ms</span>}
        </div>
      )}

      {/* Answer (left-aligned) */}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <div
          style={{
            maxWidth: '82%',
            background: isNoContext
              ? 'color-mix(in srgb, var(--color-ink) 3%, transparent)'
              : 'var(--color-surface)',
            border: isNoContext
              ? '1px dashed var(--color-stroke)'
              : '1px solid var(--color-stroke)',
            borderRadius: '2px 12px 12px 12px',
            padding: '11px 14px',
            fontSize: 14,
            lineHeight: 1.65,
            fontFamily: 'var(--font-sans)',
            color: isNoContext
              ? 'color-mix(in srgb, var(--color-ink) 48%, transparent)'
              : 'var(--color-ink)',
            wordBreak: 'break-word',
          }}
        >
          {entry.isThinking ? (
            <ThinkingDots />
          ) : (
            <AnswerText
              text={entry.answer}
              interactive={!entry.isStreaming && !isNoContext}
              onCitationActivate={activateCitation}
            />
          )}
        </div>
      </div>

      {/* Sources row */}
      {!isNoContext && !entry.isStreaming && entry.sources.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            paddingLeft: 2,
            marginTop: 2,
          }}
        >
          {entry.sources.map(source => (
            <SourceCard
              key={source.marker}
              source={source}
              filename={getFilename(source.document_id)}
              animKey={highlightKeys[source.marker] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Feedback (thumbs up/down) */}
      {!entry.isStreaming && !entry.isThinking && entry.queryLogId && (
        <FeedbackRow entry={entry} onFeedback={onFeedback} onReport={onReport} />
      )}
    </div>
  )
}

// ─── EmptyTranscript ──────────────────────────────────────────────────────────

function EmptyTranscript({ kbName }: { kbName: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingBottom: 48,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 19 19"
          fill="none"
          style={{ color: 'var(--color-primary)' }}
          aria-hidden
        >
          <circle cx="9.5" cy="9.5" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M6.5 8.5C6.5 6.8 7.8 5.5 9.5 5.5c1.4 0 2.5.9 2.9 2.1.5 1.6-.6 2.7-1.8 3.1-.4.1-.6.5-.6.9V12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="9.5" cy="14" r=".75" fill="currentColor" />
        </svg>
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'color-mix(in srgb, var(--color-ink) 42%, transparent)',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Ask anything about{' '}
        <strong style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{kbName}</strong>
      </p>
    </div>
  )
}

// ─── QueryView ────────────────────────────────────────────────────────────────

export default function QueryView({ kb, docs }: { kb: KnowledgeBase; docs: Doc[] }) {
  const [entries, setEntries] = useState<QAEntry[]>([])
  const [question, setQuestion] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const autoScrollRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when entries update (tokens arriving or new entry)
  useEffect(() => {
    if (autoScrollRef.current && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [entries])

  // Stop auto-scroll if user scrolls up; resume when they return to bottom
  function handleTranscriptScroll() {
    const el = transcriptRef.current
    if (!el) return
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function handleSubmit() {
    const q = question.trim()
    if (!q || isSubmitting) return

    const entryId = crypto.randomUUID()
    setEntries(prev => [
      ...prev,
      {
        id: entryId,
        question: q,
        answer: '',
        sources: [],
        isStreaming: true,
        isThinking: true,
        queryLogId: null,
        feedback: null,
        feedbackReason: null,
        telemetry: null,
      },
    ])
    setQuestion('')
    setIsSubmitting(true)
    autoScrollRef.current = true

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const abort = api.queries.stream(kb.id, q, {
      onToken(text) {
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId ? { ...e, answer: e.answer + text, isThinking: false } : e
          )
        )
      },
      onDone(sources, queryLogId, telemetry) {
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId ? { ...e, sources, queryLogId, telemetry, isStreaming: false, isThinking: false } : e
          )
        )
        setIsSubmitting(false)
      },
      onError(err) {
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId
              ? { ...e, answer: `Error: ${err.message}`, isStreaming: false, isThinking: false }
              : e
          )
        )
        setIsSubmitting(false)
      },
    })

    abortRef.current = abort
  }

  function handleFeedback(entryId: string, value: 'up' | 'down') {
    const entry = entries.find(e => e.id === entryId)
    if (!entry?.queryLogId || entry.feedback === value) return // no queryLogId yet, or already this value

    const previous = entry.feedback
    setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, feedback: value } : e)))

    api.queries.feedback(entry.queryLogId, value).catch(err => {
      console.error(err)
      setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, feedback: previous } : e)))
    })
  }

  function handleReport(entryId: string, reason: FeedbackReason) {
    const entry = entries.find(e => e.id === entryId)
    if (!entry?.queryLogId) return
    const previous = { feedback: entry.feedback, feedbackReason: entry.feedbackReason }
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, feedback: 'down', feedbackReason: reason } : e))
    api.queries.feedback(entry.queryLogId, 'down', reason).catch(err => {
      console.error(err)
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...previous } : e))
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  const canSubmit = question.trim().length > 0 && !isSubmitting

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Transcript */}
      <div
        ref={transcriptRef}
        onScroll={handleTranscriptScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {entries.length === 0 ? (
          <EmptyTranscript kbName={kb.name} />
        ) : (
            entries.map(entry => (
            <QAPair key={entry.id} entry={entry} docs={docs} onFeedback={handleFeedback} onReport={handleReport} />
          ))
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 24px 16px',
          borderTop: '1px solid var(--color-stroke)',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: 'var(--color-surface)',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={textareaRef}
          value={question}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={isSubmitting}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--color-stroke)',
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: 'var(--font-sans)',
            background: 'var(--color-background)',
            color: 'var(--color-ink)',
            outline: 'none',
            overflowY: 'hidden',
            minHeight: 40,
            maxHeight: 120,
            transition: 'border-color 150ms',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-stroke)' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          title="Send"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            border: 'none',
            background: canSubmit
              ? 'var(--color-primary)'
              : 'color-mix(in srgb, var(--color-ink) 10%, transparent)',
            color: canSubmit
              ? '#fff'
              : 'color-mix(in srgb, var(--color-ink) 28%, transparent)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 150ms, color 150ms',
            marginBottom: 2,
          }}
        >
          {/* Send / up-arrow icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M7 12V2M2 7l5-5 5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
