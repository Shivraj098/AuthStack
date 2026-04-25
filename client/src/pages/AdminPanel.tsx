import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/axios'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { ApiResponse } from '@/types/auth'
import { useToast } from '@/components/ui/Toast'

interface AdminUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  isVerified: boolean
  isActive: boolean
  createdAt: string
  roles: string[]
  activeSessions: number
}

interface PaginatedUsers {
  users: AdminUser[]
  pagination: {
    total: number
    page: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

const ALL_ROLES = ['admin', 'moderator', 'user']

export function AdminPanel() {
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const [data, setData] = useState<PaginatedUsers | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function fetchUsersApi(page: number, search: string) {
    const params = new URLSearchParams({
      page: String(page),
      limit: '15',
      ...(search && { search }),
    })

    return await api.get<ApiResponse<PaginatedUsers>>(`/admin/users?${params}`)
  }

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchUsersApi(page, search)
        setData(result.data.data!)
      } catch (error: unknown) {
        if (error instanceof Error) {
          setError(error.message)
        } else {
          setError('Failed to load users')
        }
      }
    }

    void load()
  }, [page, search])

  const handleRoleToggle = useCallback(
    async (userId: string, role: string, hasRole: boolean) => {
      setActionLoading(`${userId}-${role}`)
      try {
        if (hasRole) {
          await api.delete(`/admin/users/${userId}/roles`, { data: { role } })
        } else {
          await api.post(`/admin/users/${userId}/roles`, { role })
        }
        toast(`Role ${hasRole ? 'removed' : 'assigned'} successfully`, 'success')
        await fetchUsersApi(page, search)
      } catch (err: unknown) {
        if (isAxiosError(err)) {
          const d = err.response?.data as ApiResponse<null>
          setError(d?.error?.message ?? 'Action failed')
          toast(d?.error?.message ?? 'Action failed', 'error')
        }
      } finally {
        setActionLoading(null)
      }
    },
    [toast, fetchUsersApi]
  )

  const handleToggleActive = useCallback(
    async (userId: string) => {
      setActionLoading(`active-${userId}`)
      try {
        await api.patch(`/admin/users/${userId}/toggle-active`)
        toast('User status updated', 'success')
        await fetchUsersApi(page, search)
      } catch {
        setError('Failed to update user status')
      } finally {
        setActionLoading(null)
      }
    },
    [toast, fetchUsersApi]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">AuthApp</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-600">Admin</span>
          </div>
          <span className="text-xs text-gray-400">Signed in as {currentUser?.email}</span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">User management</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data?.pagination.total ?? '—'} total users
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full max-w-sm px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    User
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Roles
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Sessions
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Joined
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.users.map((user) => {
                  const isSelf = user.id === currentUser?.id

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* User info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                            {(user.firstName?.[0] ?? user.email[0] ?? '?').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {user.firstName ? `${user.firstName} ${user.lastName ?? ''}` : '—'}
                              {isSelf && (
                                <span className="ml-1.5 text-xs text-blue-600 font-normal">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="text-gray-400 text-xs">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                              user.isActive
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`}
                            />
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {!user.isVerified && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                              Unverified
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Roles */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ALL_ROLES.map((role) => {
                            const hasRole = user.roles.includes(role)
                            const loadingKey = `${user.id}-${role}`
                            const isLoading = actionLoading === loadingKey

                            return (
                              <button
                                key={role}
                                onClick={() => void handleRoleToggle(user.id, role, hasRole)}
                                disabled={isLoading || isSelf}
                                title={
                                  isSelf
                                    ? 'Cannot modify your own roles'
                                    : hasRole
                                      ? `Remove ${role} role`
                                      : `Add ${role} role`
                                }
                                className={`text-xs px-2 py-0.5 rounded-full border transition-all duration-150 ${
                                  hasRole
                                    ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-700'
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                {isLoading ? '...' : role}
                              </button>
                            )
                          })}
                        </div>
                      </td>

                      {/* Sessions */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{user.activeSessions} active</span>
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <Button
                          variant={user.isActive ? 'secondary' : 'ghost'}
                          size="sm"
                          loading={actionLoading === `active-${user.id}`}
                          disabled={isSelf}
                          onClick={() => void handleToggleActive(user.id)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
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
        </div>
      </main>
    </div>
  )
}
function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
