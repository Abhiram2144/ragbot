import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setAuthToken } from '../api/client'
import type { KnowledgeBase, OrgInfo, Member } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function SettingsPage() {
  const { clearToken } = useAuth()
  const navigate = useNavigate()

  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.kbs.list(), api.organization.get(), api.organization.members()])
      .then(([kbList, orgInfo, memberList]) => {
        setKbs(kbList)
        setOrg(orgInfo)
        setMembers(memberList)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function logout() {
    setAuthToken(null)
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full bg-background">
      <Sidebar
        kbs={kbs}
        selectedKbId={null}
        onSelect={() => navigate('/dashboard')}
        onCreateClick={() => navigate('/dashboard')}
        onLogout={logout}
        onSettingsClick={() => {}}
        settingsActive={true}
        activeNav="settings"
        organizationName={org?.name}
      />

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'color-mix(in srgb, var(--color-ink) 35%, transparent)' }}>
              Loading…
            </p>
          </div>
        ) : org ? (
          <div
            className="animate-auth-rise"
            style={{ padding: '40px 40px 64px', maxWidth: 680 }}
          >
            {/* Page heading */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 36 }}>
              <h1
                className="font-display text-2xl font-semibold text-ink tracking-tight"
              >
                {org.name}
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  background: 'var(--color-background)',
                  border: '1px solid var(--color-stroke)',
                  color: 'color-mix(in srgb, var(--color-ink) 55%, transparent)',
                  borderRadius: 4,
                  padding: '2px 7px',
                  textTransform: 'capitalize',
                  letterSpacing: '0.02em',
                  lineHeight: 1,
                }}
              >
                {org.plan}
              </span>
            </div>

            {/* Members section */}
            <section>
              {/* Section header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <h2
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'color-mix(in srgb, var(--color-ink) 45%, transparent)' }}
                >
                  Members{members.length > 0 && ` · ${members.length}`}
                </h2>

                {/* Invite stub */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    disabled
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--color-stroke)',
                      background: 'color-mix(in srgb, var(--color-ink) 4%, transparent)',
                      color: 'color-mix(in srgb, var(--color-ink) 25%, transparent)',
                      cursor: 'not-allowed',
                    }}
                  >
                    Invite member
                  </button>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-sans)',
                      color: 'color-mix(in srgb, var(--color-ink) 32%, transparent)',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Coming soon
                  </span>
                </div>
              </div>

              {/* Members list */}
              <div
                style={{
                  border: '1px solid var(--color-stroke)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {members.length === 0 ? (
                  <div
                    style={{
                      padding: '20px 16px',
                      background: 'var(--color-surface)',
                      fontSize: 13,
                      color: 'color-mix(in srgb, var(--color-ink) 35%, transparent)',
                    }}
                  >
                    No members found.
                  </div>
                ) : (
                  members.map((member, idx) => (
                    <div
                      key={member.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '11px 16px',
                        borderTop: idx > 0 ? '1px solid var(--color-stroke)' : 'none',
                        background: 'var(--color-surface)',
                        gap: 12,
                      }}
                    >
                      {/* Initial avatar */}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--color-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {member.email[0].toUpperCase()}
                        </span>
                      </div>

                      {/* Email */}
                      <span
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: 'var(--color-ink)',
                          fontFamily: 'var(--font-sans)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {member.email}
                      </span>

                      {/* Role */}
                      <span
                        style={{
                          fontSize: 12,
                          color: 'color-mix(in srgb, var(--color-ink) 42%, transparent)',
                          fontFamily: 'var(--font-sans)',
                          textTransform: 'capitalize',
                          minWidth: 52,
                          textAlign: 'right',
                        }}
                      >
                        {member.role}
                      </span>

                      {/* Joined date */}
                      <span
                        style={{
                          fontSize: 11,
                          color: 'color-mix(in srgb, var(--color-ink) 32%, transparent)',
                          fontFamily: 'var(--font-mono)',
                          minWidth: 90,
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        {formatDate(member.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  )
}
