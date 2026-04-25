import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import type { ApiResponse } from '@/types/auth'

interface AuditLog {
  id: string
  event: string
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  user: { id: string; email: string; firstName: string | null } | null
}

interface PaginatedLogs {
  logs: AuditLog[]
  pagination: {
    total: number
    page: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Event categories for color coding
const eventColors: Record<string, string> = {
  USER_REGISTERED: 'bg-blue-50 text-blue-700',
  USER_LOGIN: 'bg-green-50 text-green-700',
  USER_LOGOUT: 'bg-gray-100 text-gray-600',
  USER_LOGIN_MFA_REQUIRED: 'bg-blue-50 text-blue-700',
  USER_LOGIN_MFA_COMPLETED: 'bg-green-50 text-green-700',
  USER_LOGIN_OAUTH: 'bg-purple-50 text-purple-700',
  USER_REGISTERED_OAUTH: 'bg-purple-50 text-purple-700',
  EMAIL_VERIFIED: 'bg-teal-50 text-teal-700',
  PASSWORD_RESET_REQUESTED: 'bg-amber-50 text-amber-700',
  PASSWORD_RESET_COMPLETED: 'bg-amber-50 text-amber-700',
  PASSWORD_CHANGED: 'bg-amber-50 text-amber-700',
  MFA_ENABLED: 'bg-green-50 text-green-700',
  MFA_DISABLED: 'bg-red-50 text-red-700',
  MFA_BACKUP_CODE_USED: 'bg-orange-50 text-orange-700',
  ROLE_ASSIGNED: 'bg-indigo-50 text-indigo-700',
  ROLE_REMOVED: 'bg-indigo-50 text-indigo-700',
  USER_DEACTIVATED: 'bg-red-50 text-red-700',
  USER_ACTIVATED: 'bg-green-50 text-green-700',
  USER_LOGOUT_ALL: 'bg-gray-100 text-gray-600',
}

export function AuditLogs() {
  const [data, setData] = useState<PaginatedLogs | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    event: '',
    userId: '',
    ip: '',
    startDate: '',
    endDate: '',
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function fetchLogsApi(page: number, filters: Record<string, string | undefined>) {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '25',
      ...(filters.event && { event: filters.event }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.ip && { ip: filters.ip }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
    })

    return await api.get<ApiResponse<PaginatedLogs>>(`/admin/audit-logs?${params.toString()}`)
  }

  useEffect(() => {
    async function load() {
      const res = await fetchLogsApi(page, filters)
      setData(res.data.data!)
      setLoading(false)
    }
    void load()
  }, [page, filters])

  function formatUserAgent(ua: string | null): string {
    if (!ua) return 'Unknown'
    // Extract browser name from user agent
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('curl')) return 'curl'
    return ua.slice(0, 30)
  }

  function formatEvent(event: string): string {
    return event
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/admin" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← Admin
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700">Audit logs</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Audit logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.pagination.total.toLocaleString() ?? '—'} total events
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Event type..."
              value={filters.event}
              onChange={(e) => {
                setFilters((f) => ({ ...f, event: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
            <input
              type="text"
              placeholder="User ID..."
              value={filters.userId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, userId: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
            <input
              type="text"
              placeholder="IP address..."
              value={filters.ip}
              onChange={(e) => {
                setFilters((f) => ({ ...f, ip: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setFilters((f) => ({ ...f, startDate: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setFilters((f) => ({ ...f, endDate: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
          </div>

          {Object.values(filters).some(Boolean) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Active filters</span>
              <button
                onClick={() => {
                  setFilters({ event: '', userId: '', ip: '', startDate: '', endDate: '' })
                  setPage(1)
                }}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Logs table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
            </div>
          ) : data?.logs.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              No audit logs match the current filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      {['Timestamp', 'Event', 'User', 'IP address', 'Client', ''].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data?.logs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          {/* Timestamp */}
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>

                          {/* Event badge */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                                eventColors[log.event] ?? 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {formatEvent(log.event)}
                            </span>
                          </td>

                          {/* User */}
                          <td className="px-4 py-3">
                            {log.user ? (
                              <div>
                                <p className="text-xs font-medium text-gray-700">
                                  {log.user.firstName ?? 'Unknown'}
                                </p>
                                <p className="text-xs text-gray-400">{log.user.email}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">System</span>
                            )}
                          </td>

                          {/* IP */}
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                            {log.ipAddress ?? '—'}
                          </td>

                          {/* User agent */}
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {formatUserAgent(log.userAgent)}
                          </td>

                          {/* Expand toggle */}
                          <td className="px-4 py-3">
                            {log.metadata && (
                              <span
                                className={`text-xs text-gray-400 transition-transform inline-block ${
                                  expandedId === log.id ? 'rotate-180' : ''
                                }`}
                              >
                                ▼
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded metadata row */}
                        {expandedId === log.id && log.metadata && (
                          <tr key={`${log.id}-expanded`} className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-3">
                              <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Showing {(data.pagination.page - 1) * 25 + 1}–
                    {Math.min(data.pagination.page * 25, data.pagination.total)} of{' '}
                    {data.pagination.total.toLocaleString()} events
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!data.pagination.hasPrev}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!data.pagination.hasNext}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
