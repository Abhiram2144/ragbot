import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setAuthToken } from '../api/client'
import type { KnowledgeBase, Doc, OrgInfo, PublicationStatus } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import type { WorkspaceNav } from '../components/Sidebar'
import CreateKBModal from '../components/CreateKBModal'
import UploadDropzone from '../components/UploadDropzone'
import DocumentCard from '../components/DocumentCard'
import QueryView from '../components/QueryView'
import QueryHistoryView from '../components/QueryHistoryView'
import AnalyticsView from '../components/AnalyticsView'
import QualityCenter from '../components/QualityCenter'

// ─── Empty states ──────────────────────────────────────────────────────────────

function NoKBSelected({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: 'var(--color-primary)' }} aria-hidden>
          <rect x="2" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 4V2M15 4V2M2 9h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-ink">No knowledge base selected</p>
        <p className="text-xs mt-1" style={{ color: 'color-mix(in srgb, var(--color-ink) 40%, transparent)' }}>
          Create one to get started
        </p>
      </div>
      <button
        onClick={onCreateClick}
        className="text-sm font-medium cursor-pointer transition-colors"
        style={{ color: 'var(--color-primary)' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        + New knowledge base
      </button>
    </div>
  )
}

function EmptyDocList({ kbName }: { kbName: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm text-ink/60">{kbName} has no documents yet.</p>
      <p className="text-xs text-ink/40">Upload a file above to get started.</p>
    </div>
  )
}

function WorkspaceLoading() {
  return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-ink/45">Loading your workspace…</p></div>
}

function WorkspaceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <p className="text-sm text-ink/65">We could not load your workspace.</p>
      <button onClick={onRetry} className="text-sm font-medium cursor-pointer" style={{ color: 'var(--color-primary)' }}>Try again</button>
    </div>
  )
}

// ─── KB content area ────────────────────────────────────────────────────────────

type ViewMode = 'documents' | 'query' | 'history' | 'analytics' | 'quality'

interface KBViewProps {
  kb: KnowledgeBase
  docs: Doc[]
  newDocIds: Set<string>
  docsLoading: boolean
  onDocUploaded: (doc: Doc) => void
  onDocUpdated: (doc: Doc) => void
  initialQueryId: string | null
  onOpenQuery: (id: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

function KBView({ kb, docs, newDocIds, docsLoading, onDocUploaded, onDocUpdated, initialQueryId, onOpenQuery, viewMode, onViewModeChange }: KBViewProps) {
  const [filter, setFilter] = useState<'all' | PublicationStatus | 'stale'>('all')
  const sorted = [...docs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const visibleDocs = sorted.filter(doc => {
    if (filter === 'all') return true
    if (filter === 'stale') return Boolean(doc.review_date && new Date(`${doc.review_date}T23:59:59`) < new Date() && doc.publication_status === 'published')
    return doc.publication_status === filter
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-7 pb-0" style={{ borderBottom: '1px solid var(--color-stroke)' }}>
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">{kb.name}</h1>
        {kb.description && (
          <p className="text-sm mt-1" style={{ color: 'color-mix(in srgb, var(--color-ink) 50%, transparent)' }}>
            {kb.description}
          </p>
        )}

      </div>

      {/* Content */}
      {viewMode === 'query' ? (
        <QueryView kb={kb} docs={docs} />
      ) : viewMode === 'history' ? (
        <QueryHistoryView kb={kb} initialQueryId={initialQueryId} />
      ) : viewMode === 'analytics' ? (
        <AnalyticsView
          kb={kb}
          onOpenQuery={onOpenQuery}
          onOpenDocuments={() => onViewModeChange('documents')}
        />
      ) : viewMode === 'quality' ? (
        <QualityCenter kb={kb} />
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
          {/* Upload */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: 'color-mix(in srgb, var(--color-ink) 45%, transparent)' }}>
              Upload document
            </h2>
            <UploadDropzone kbId={kb.id} onUploaded={onDocUploaded} />
          </section>

          {/* Document list */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'color-mix(in srgb, var(--color-ink) 45%, transparent)' }}>
                Documents{docs.length > 0 && ` · ${docs.length}`}
              </h2>
              <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label="Filter documents" className="rounded-md border border-stroke bg-surface px-2 py-1 text-xs text-ink/60 outline-none">
                <option value="all">All documents</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
                <option value="archived">Archived</option>
                <option value="stale">Needs review</option>
              </select>
            </div>

            {docsLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" style={{ border: '1px solid var(--color-stroke)' }} />
                ))}
              </div>
            ) : visibleDocs.length === 0 ? (
              <EmptyDocList kbName={kb.name} />
            ) : (
              <div className="flex flex-col gap-3">
                {visibleDocs.map(doc => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isNew={newDocIds.has(doc.id)}
                    onUpdated={onDocUpdated}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { clearToken } = useAuth()
  const navigate = useNavigate()

  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [contentVisible, setContentVisible] = useState(true)
  const [newDocIds, setNewDocIds] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('documents')
  const [activeNav, setActiveNav] = useState<WorkspaceNav>('knowledge')
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState(false)
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null)

  function loadWorkspace() {
    setWorkspaceLoading(true)
    setWorkspaceError(false)
    api.kbs.list()
      .then(data => {
        setKbs(data)
        if (data.length > 0) setSelectedKbId(data[0].id)
      })
      .then(() => api.organization.get())
      .then(setOrg)
      .catch(() => setWorkspaceError(true))
      .finally(() => setWorkspaceLoading(false))
  }

  useEffect(() => { loadWorkspace() }, [])

  // Load documents when selected KB changes
  useEffect(() => {
    if (!selectedKbId) {
      setDocs([])
      return
    }
    setDocsLoading(true)
    api.documents.list(selectedKbId)
      .then(data => {
        setDocs(data)
        setDocsLoading(false)
      })
      .catch(() => setDocsLoading(false))
  }, [selectedKbId])

  // Poll non-terminal documents every 2s
  const pendingDocKey = useMemo(
    () =>
      docs
        .filter(d => d.status !== 'complete' && d.status !== 'failed')
        .map(d => d.id)
        .join(','),
    [docs]
  )

  useEffect(() => {
    if (!selectedKbId || !pendingDocKey) return
    const ids = pendingDocKey.split(',')

    const interval = setInterval(async () => {
      for (const docId of ids) {
        try {
          const updated = await api.documents.get(selectedKbId, docId)
          setDocs(prev => prev.map(d => d.id === updated.id ? updated : d))
        } catch (_) {}
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [selectedKbId, pendingDocKey])

  // ── Handlers ──

  function handleKbSelect(kbId: string) {
    if (kbId === selectedKbId) return
    setViewMode('documents')
    setActiveNav('knowledge')
    setContentVisible(false)
    setTimeout(() => {
      setSelectedKbId(kbId)
      setDocs([])
      setContentVisible(true)
    }, 180)
  }

  function handleKbCreated(kb: KnowledgeBase) {
    setKbs(prev => [kb, ...prev])
    setShowCreateModal(false)
    // Cross-fade to the new KB
    setContentVisible(false)
    setTimeout(() => {
      setSelectedKbId(kb.id)
      setDocs([])
      setContentVisible(true)
    }, 180)
  }

  function handleDocUploaded(doc: Doc) {
    setDocs(prev => [doc, ...prev])
    setNewDocIds(prev => new Set([...prev, doc.id]))
    setTimeout(() => {
      setNewDocIds(prev => {
        const next = new Set(prev)
        next.delete(doc.id)
        return next
      })
    }, 500)
  }

  function handleDocUpdated(updated: Doc) {
    setDocs(prev => prev.map(doc => doc.id === updated.id ? updated : doc))
  }

  function logout() {
    setAuthToken(null)
    clearToken()
    navigate('/login', { replace: true })
  }

  const selectedKb = kbs.find(kb => kb.id === selectedKbId) ?? null

  function handleNavigate(nav: WorkspaceNav) {
    if (nav === 'settings') {
      navigate('/settings')
      return
    }
    setActiveNav(nav)
    if (nav === 'ask') setViewMode('query')
    if (nav === 'knowledge') setViewMode('documents')
    if (nav === 'overview') setViewMode('analytics')
    if (nav === 'quality') setViewMode('quality')
  }

  function openQueryDetail(queryId: string) {
    setSelectedQueryId(queryId)
    setViewMode('history')
    setActiveNav('overview')
  }

  return (
    <div className="flex h-full bg-background">
      <Sidebar
        kbs={kbs}
        selectedKbId={selectedKbId}
        onSelect={handleKbSelect}
        onCreateClick={() => setShowCreateModal(true)}
        onLogout={logout}
        onSettingsClick={() => navigate('/settings')}
        settingsActive={false}
        activeNav={activeNav}
        onNavigate={handleNavigate}
        organizationName={org?.name}
      />

      {/* Main area with cross-fade */}
      <main
        className="flex-1 overflow-hidden flex flex-col transition-opacity"
        style={{
          opacity: contentVisible ? 1 : 0,
          transitionDuration: '200ms',
        }}
      >
        {workspaceLoading ? <WorkspaceLoading /> : workspaceError ? <WorkspaceError onRetry={loadWorkspace} /> : selectedKb ? (
          <>
            <header className="flex items-center justify-between px-8 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-surface)' }}>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink/40">{org?.name ?? 'Workspace'}</p>
                <p className="text-sm font-medium text-ink mt-0.5">{selectedKb.name}</p>
              </div>
              <span className="text-xs text-ink/40">{activeNav === 'ask' ? 'Employee knowledge portal' : activeNav === 'quality' ? 'Retrieval quality' : activeNav === 'overview' ? 'Workspace overview' : 'Knowledge management'}</span>
            </header>
            <div className="flex-1 min-h-0 overflow-hidden">
              <KBView
                kb={selectedKb}
                docs={docs}
                newDocIds={newDocIds}
                docsLoading={docsLoading}
                onDocUploaded={handleDocUploaded}
                onDocUpdated={handleDocUpdated}
                initialQueryId={selectedQueryId}
                onOpenQuery={openQueryDetail}
                viewMode={viewMode}
                onViewModeChange={mode => { setViewMode(mode); setActiveNav(mode === 'query' ? 'ask' : mode === 'documents' ? 'knowledge' : mode === 'analytics' ? activeNav : activeNav) }}
              />
            </div>
          </>
        ) : (
          <NoKBSelected onCreateClick={() => setShowCreateModal(true)} />
        )}
      </main>

      {showCreateModal && (
        <CreateKBModal
          onCreated={handleKbCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}
