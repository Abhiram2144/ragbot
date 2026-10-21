const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const AUTH_TOKEN_KEY = 'answerdesk_access_token'

let _token: string | null = null

export function setAuthToken(token: string | null) {
  _token = token
}

function expireAuth(path: string, status: number) {
  if (status === 401 && !path.startsWith('/auth/')) {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    setAuthToken(null)
    window.dispatchEvent(new Event('auth:expired'))
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    expireAuth(path, res.status)
    const message = (data as { detail?: string }).detail ?? `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

// Multipart upload — browser sets Content-Type + boundary automatically
async function upload<T>(path: string, body: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    expireAuth(path, res.status)
    const message = (data as { detail?: string }).detail ?? `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
}

export interface OrgInfo {
  id: string
  name: string
  plan: string
  created_at: string
}

export interface Member {
  id: string
  email: string
  role: string
  created_at: string
}

export interface QuerySource {
  marker: string
  document_id: string
  chunk_text: string
}

export interface StreamCallbacks {
  onToken: (text: string) => void
  onDone: (sources: QuerySource[], queryLogId: string | null, telemetry: QueryTelemetry | null) => void
  onError: (err: Error) => void
}

export interface QueryTelemetry {
  latency_ms: number | null
  source_count: number
  confidence: 'high' | 'medium' | 'low'
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type SearchMode = 'dense' | 'hybrid'

export interface QueryLogListItem {
  id: string
  question: string
  created_at: string
  search_mode: SearchMode | null
  latency_ms: number | null
  feedback: 'up' | 'down' | null
}

export interface QueryLogListResponse {
  items: QueryLogListItem[]
  total: number
  limit: number
  offset: number
}

export interface StageLatencies {
  rewrite_ms: number | null
  embed_query_ms: number | null
  retrieve_ms: number | null
  rerank_ms: number | null
  generate_ms: number | null
  total_ms: number | null
}

export interface ChunkScoreEntry {
  chunk_id: string | null
  document_id: string
  dense_score: number | null
  sparse_score: number | null
  rrf_score: number | null
  rerank_score: number | null
  final_rank: number
}

export interface QueryLogDetail {
  id: string
  question: string
  prompt: Array<{ role: string; content: string }> | null
  response: string | null
  stage_latencies: StageLatencies | null
  chunk_scores: ChunkScoreEntry[] | null
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost_usd: number | null
  search_mode: SearchMode | null
  feedback: 'up' | 'down' | null
  confidence: 'high' | 'medium' | 'low'
  source_count: number
  created_at: string
}

export interface DailyAnalytics {
  date: string
  query_count: number
  avg_latency_ms: number | null
  helpful_rate: number | null
}

export interface QuestionSignal {
  question: string
  count: number
  query_log_id: string
  kb_id: string
  created_at: string
}

export interface KnowledgeBaseSignal {
  kb_id: string
  name: string
  query_count: number
}

export interface StaleDocumentSignal {
  document_id: string
  kb_id: string
  filename: string
  review_date: string
  publication_status: string
}

export interface AnalyticsResponse {
  total_queries: number
  avg_latency_ms: number | null
  avg_cost_usd: number | null
  feedback_ratio: number | null
  feedback_reasons: Record<string, number>
  daily: DailyAnalytics[]
  low_confidence_questions: QuestionSignal[]
  common_questions: QuestionSignal[]
  knowledge_bases: KnowledgeBaseSignal[]
  stale_documents: StaleDocumentSignal[]
}

export interface EvaluationQuestionResult {
  id: string
  question: string
  hit_rate: number
  recall_at_5: number
  precision_at_5: number
  mrr: number
  citation_accuracy: number
  latency_ms: number
  estimated_cost_usd: number
  faithfulness_score?: number
}

export interface EvaluationAggregate {
  dataset_size: number
  num_succeeded: number
  hit_rate: number | null
  recall_at_5: number | null
  precision_at_5: number | null
  mrr: number | null
  citation_accuracy: number | null
  latency_ms_mean: number | null
  estimated_cost_usd_mean: number | null
  faithfulness_score: number | null
  faithfulness_enabled: boolean
  per_question: EvaluationQuestionResult[]
}

export interface EvaluationRun {
  id: string
  search_mode: 'dense' | 'hybrid'
  aggregate_metrics: EvaluationAggregate
  created_at: string
}

export type DocStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type PublicationStatus = 'draft' | 'published' | 'archived'

export interface Doc {
  id: string
  kb_id: string
  filename: string
  status: DocStatus
  publication_status: PublicationStatus
  department: string
  owner: string | null
  effective_date: string | null
  review_date: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    signup: (body: { org_name: string; email: string; password: string }) =>
      request<TokenResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  },

  kbs: {
    list: () => request<KnowledgeBase[]>('/knowledge-bases'),
    create: (body: { name: string; description?: string }) =>
      request<KnowledgeBase>('/knowledge-bases', { method: 'POST', body: JSON.stringify(body) }),
  },

  documents: {
    list: (kbId: string, filters?: { publication_status?: PublicationStatus; stale_only?: boolean }) => {
      const params = new URLSearchParams()
      if (filters?.publication_status) params.set('publication_status', filters.publication_status)
      if (filters?.stale_only) params.set('stale_only', 'true')
      const query = params.toString()
      return request<Doc[]>(`/knowledge-bases/${kbId}/documents${query ? `?${query}` : ''}`)
    },
    upload: (kbId: string, file: File, metadata?: {
      department?: string
      owner?: string
      effective_date?: string
      review_date?: string
      publication_status?: PublicationStatus
    }) => {
      const form = new FormData()
      form.append('file', file)
      if (metadata?.department) form.append('department', metadata.department)
      if (metadata?.owner) form.append('owner', metadata.owner)
      if (metadata?.effective_date) form.append('effective_date', metadata.effective_date)
      if (metadata?.review_date) form.append('review_date', metadata.review_date)
      if (metadata?.publication_status) form.append('publication_status', metadata.publication_status)
      return upload<Doc>(`/knowledge-bases/${kbId}/documents`, form)
    },
    get: (kbId: string, docId: string) =>
      request<Doc>(`/knowledge-bases/${kbId}/documents/${docId}`),
    update: (kbId: string, docId: string, body: {
      publication_status?: PublicationStatus
      department?: string
      owner?: string | null
      effective_date?: string | null
      review_date?: string | null
    }) => request<Doc>(`/knowledge-bases/${kbId}/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  },

  organization: {
    get: () => request<OrgInfo>('/organization'),
    members: () => request<Member[]>('/organization/members'),
  },

  queryLogs: {
    list: (kbId: string, limit = 20, offset = 0) =>
      request<QueryLogListResponse>(
        `/knowledge-bases/${kbId}/queries?limit=${limit}&offset=${offset}`
      ),
    get: (kbId: string, queryLogId: string) =>
      request<QueryLogDetail>(`/knowledge-bases/${kbId}/queries/${queryLogId}`),
  },

  analytics: {
    get: (kbId: string, days = 30) =>
      request<AnalyticsResponse>(`/knowledge-bases/${kbId}/analytics?days=${days}`),
  },

  quality: {
    listRuns: (kbId: string) => request<EvaluationRun[]>(`/knowledge-bases/${kbId}/quality/runs`),
    run: (kbId: string, searchMode: 'dense' | 'hybrid', useFaithfulness = false) =>
      request<EvaluationRun>(`/knowledge-bases/${kbId}/quality/evaluate?search_mode=${searchMode}`, {
        method: 'POST',
        body: JSON.stringify({ use_faithfulness: useFaithfulness }),
      }),
  },

  queries: {
    stream: (kbId: string, question: string, callbacks: StreamCallbacks): (() => void) => {
      const controller = new AbortController()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (_token) headers['Authorization'] = `Bearer ${_token}`

      ;(async () => {
        try {
          const res = await fetch(`${BASE}/knowledge-bases/${kbId}/query`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ question, stream: true }),
            signal: controller.signal,
          })
          if (!res.ok) {
            expireAuth(`/knowledge-bases/${kbId}/query`, res.status)
            const data = await res.json().catch(() => ({}))
            throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`)
          }
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop()!
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const payload = JSON.parse(line.slice(6))
                if (payload.type === 'token') callbacks.onToken(payload.text as string)
                else if (payload.type === 'done')
                  callbacks.onDone(
                    payload.sources as QuerySource[],
                    (payload.query_log_id as string) ?? null,
                    (payload.telemetry as QueryTelemetry) ?? null,
                  )
              } catch (_) { /* ignore malformed SSE lines */ }
            }
          }
          // flush decoder and any remaining buffer
          buf += decoder.decode()
          const remaining = buf.trim()
          if (remaining.startsWith('data: ')) {
            try {
              const payload = JSON.parse(remaining.slice(6))
              if (payload.type === 'done')
                callbacks.onDone(
                  payload.sources as QuerySource[],
                  (payload.query_log_id as string) ?? null,
                  (payload.telemetry as QueryTelemetry) ?? null,
                )
            } catch (_) {}
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') callbacks.onError(err as Error)
        }
      })()

      return () => controller.abort()
    },
    feedback: (
      queryLogId: string,
      feedback: 'up' | 'down',
      reason?: 'incorrect' | 'outdated' | 'missing_information',
    ) =>
      request<{ id: string; feedback: string | null; reason: string | null }>(`/queries/${queryLogId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback, reason }),
      }),
  },
}
