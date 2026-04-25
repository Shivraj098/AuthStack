import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/axios'
import type { ApiResponse } from '@/types/auth'

interface ActivityLog {
  id: string
  event: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

// Human-readable descriptions for each event type
const eventDescriptions: Record<string, { label: string; icon: string; color: string }> = {
  USER_LOGIN: {
    label: 'Signed in',
    icon: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
    color: 'text-green-600 bg-green-50',
  },
  USER_LOGOUT: {
    label: 'Signed out',
    icon: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
    color: 'text-gray-500 bg-gray-100',
  },
  USER_LOGIN_OAUTH: {
    label: 'Signed in with social account',
    icon: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
    color: 'text-purple-600 bg-purple-50',
  },
  PASSWORD_CHANGED: {
    label: 'Password changed',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    color: 'text-amber-600 bg-amber-50',
  },
  PASSWORD_RESET_REQUESTED: {
    label: 'Password reset requested',
    icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
    color: 'text-amber-600 bg-amber-50',
  },
  PASSWORD_RESET_COMPLETED: {
    label: 'Password reset completed',
    icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'text-green-600 bg-green-50',
  },
  MFA_ENABLED: {
    label: 'Two-factor authentication enabled',
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    color: 'text-green-600 bg-green-50',
  },
  MFA_DISABLED: {
    label: 'Two-factor authentication disabled',
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    color: 'text-red-600 bg-red-50',
  },
  MFA_BACKUP_CODE_USED: {
    label: 'Backup code used to sign in',
    icon: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
    color: 'text-orange-600 bg-orange-50',
  },
  EMAIL_VERIFIED: {
    label: 'Email address verified',
    icon: 'M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51',
    color: 'text-blue-600 bg-blue-50',
  },
  USER_LOGOUT_ALL: {
    label: 'Signed out from all devices',
    icon: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
    color: 'text-gray-500 bg-gray-100',
  },
}

const defaultEvent = {
  label: 'Account activity',
  icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  color: 'text-gray-500 bg-gray-100',
}

export function ActivityLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function fetchActivity() {
      setLoading(true)
      try {
        const res = await api.get<
          ApiResponse<{
            logs: ActivityLog[]
            pagination: { totalPages: number }
          }>
        >(`/account/activity?page=${page}&limit=20`)

        setLogs(res.data.data!.logs)
        setTotalPages(res.data.data!.pagination.totalPages)
      } finally {
        setLoading(false)
      }
    }

    void fetchActivity()
  }, [page])

  function formatRelativeTime(dateStr: string, now: number): string {
    const diff = now - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatUserAgent(ua: string | null): string {
    if (!ua) return ''
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('curl')) return 'API'
    return 'Unknown browser'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link
            to="/account"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Settings
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700">Account activity</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Account activity</h1>
          <p className="text-sm text-gray-500 mt-1">
            A record of all security events on your account.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const meta = eventDescriptions[log.event] ?? defaultEvent

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4"
                >
                  {/* Icon */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{meta.label}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {log.ipAddress && (
                        <span className="text-xs text-gray-400 font-mono">{log.ipAddress}</span>
                      )}
                      {log.userAgent && (
                        <span className="text-xs text-gray-400">
                          {formatUserAgent(log.userAgent)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <time
                    className="text-xs text-gray-400 shrink-0"
                    dateTime={log.createdAt}
                    title={new Date(log.createdAt).toLocaleString()}
                  >
                    {formatRelativeTime(log.createdAt, now)}
                  </time>
                </div>
              )
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
