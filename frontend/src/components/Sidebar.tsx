import type { KnowledgeBase } from '../api/client'

export type WorkspaceNav = 'overview' | 'ask' | 'knowledge' | 'quality' | 'settings'

interface Props {
  kbs: KnowledgeBase[]
  selectedKbId: string | null
  onSelect: (id: string) => void
  onCreateClick: () => void
  onLogout: () => void
  onSettingsClick?: () => void
  settingsActive?: boolean
  activeNav?: WorkspaceNav
  onNavigate?: (nav: WorkspaceNav) => void
  organizationName?: string | null
}

export default function Sidebar({
  kbs,
  selectedKbId,
  onSelect,
  onCreateClick,
  onLogout,
  onSettingsClick,
  settingsActive = false,
  activeNav = 'knowledge',
  onNavigate,
  organizationName,
}: Props) {
  return (
    <aside className="w-64 shrink-0 h-full flex flex-col bg-surface" style={{ borderRight: '1px solid var(--color-stroke)', boxShadow: '8px 0 30px color-mix(in srgb, var(--color-ink) 4%, transparent)' }}>
      {/* Brand + logout */}
      <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: '1px solid var(--color-stroke)' }}>
        <div style={{ minWidth: 0 }}>
          <span className="font-display font-semibold text-lg text-ink tracking-tight">AnswerDesk</span>
          {organizationName && (
            <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'color-mix(in srgb, var(--color-ink) 42%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {organizationName}
            </span>
          )}
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          className="text-ink/30 hover:text-ink/70 transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Primary navigation */}
      <nav style={{ padding: '18px 10px 14px', borderBottom: '1px solid var(--color-stroke)' }} aria-label="Workspace navigation">
        {([
          ['overview', 'Overview'],
          ['ask', 'Ask AI'],
          ['knowledge', 'Knowledge Base'],
          ['quality', 'Quality Center'],
        ] as const).map(([nav, label]) => {
          const active = activeNav === nav
          return (
            <button
              key={nav}
              onClick={() => onNavigate?.(nav)}
              className="w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer"
              style={{ color: active ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-ink) 58%, transparent)', fontWeight: active ? 600 : 400, background: active ? 'color-mix(in srgb, var(--color-primary) 9%, transparent)' : 'transparent', borderRadius: 8, boxShadow: active ? 'inset 3px 0 var(--color-primary)' : 'none' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-ink) 4%, transparent)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {label}
            </button>
          )
        })}
      </nav>

      {/* New KB */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-stroke)' }}>
        <button
          onClick={onCreateClick}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          style={{ color: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 6%, transparent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New knowledge base
        </button>
      </div>

      {/* KB list */}
      <div className="flex-1 overflow-y-auto py-3">
        <p className="px-5 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-ink/35">Knowledge bases</p>
        {kbs.length === 0 && (
          <p className="px-4 py-3 text-xs text-ink/40">No knowledge bases yet</p>
        )}
        {kbs.map(kb => {
          const isActive = kb.id === selectedKbId
          return (
            <button
              key={kb.id}
              onClick={() => onSelect(kb.id)}
              className="w-full text-left px-5 py-2.5 text-sm transition-colors cursor-pointer truncate"
              style={{
                color: isActive ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-ink) 60%, transparent)',
                fontWeight: isActive ? 500 : 400,
                background: isActive ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-ink) 4%, transparent)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {kb.name}
            </button>
          )
        })}
      </div>

      {/* Settings footer */}
      <div style={{ borderTop: '1px solid var(--color-stroke)', padding: '10px 0' }}>
        <button
          onClick={() => { onSettingsClick?.(); onNavigate?.('settings') }}
          className="w-full text-left px-5 py-2.5 text-sm transition-colors cursor-pointer flex items-center gap-2.5"
          style={{
            color: settingsActive || activeNav === 'settings'
              ? 'var(--color-primary)'
              : 'color-mix(in srgb, var(--color-ink) 50%, transparent)',
            fontWeight: settingsActive || activeNav === 'settings' ? 500 : 400,
            background: settingsActive || activeNav === 'settings'
              ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
              : 'transparent',
          }}
          onMouseEnter={e => {
            if (!settingsActive && activeNav !== 'settings') e.currentTarget.style.background = 'color-mix(in srgb, var(--color-ink) 4%, transparent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = settingsActive || activeNav === 'settings'
              ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
              : 'transparent'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M7 1v1.2M7 11.8V13M1 7h1.2M11.8 7H13M2.76 2.76l.85.85M10.39 10.39l.85.85M2.76 11.24l.85-.85M10.39 3.61l.85-.85"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          Settings
        </button>
      </div>
    </aside>
  )
}
