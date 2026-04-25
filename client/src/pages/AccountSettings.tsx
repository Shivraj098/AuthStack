import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/axios'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import type { ApiResponse } from '@/types/auth'
import { useToast } from '@/components/ui/Toast'

interface Session {
  id: string
  deviceInfo: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[a-z]/, 'One lowercase letter')
      .regex(/[0-9]/, 'One number')
      .regex(/[^A-Za-z0-9]/, 'One special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ChangePasswordForm = z.infer<typeof changePasswordSchema>

export function AccountSettings() {
  const { toast } = useToast()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [mfaStatus, setMfaStatus] = useState<{
    isEnabled: boolean
    backupCodesRemaining: number
  } | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) })

  const newPassword = useWatch({
    control,
    name: 'newPassword',
    defaultValue: '',
  })
  async function fetchSessions() {
    try {
      const res = await api.get<ApiResponse<Session[]>>('/account/sessions')
      setSessions(res.data.data!)
    } finally {
      setSessionsLoading(false)
    }
  }

  useEffect(() => {
    api
      .get<ApiResponse<{ isEnabled: boolean; backupCodesRemaining: number }>>('/auth/mfa/status')
      .then((res) => setMfaStatus(res.data.data!))
      .catch(() => {})
    void fetchSessions()
  }, [])

  async function handleRevokeSession(sessionId: string) {
    setRevoking(sessionId)
    try {
      await api.delete(`/account/sessions/${sessionId}`)
      toast('Session revoked successfully', 'success')
      await fetchSessions()
    } catch {
      toast('Failed to revoke session', 'error')
    } finally {
      setRevoking(null)
    }
  }

  async function handleRevokeAll() {
    setRevoking('all')
    try {
      await api.delete('/account/sessions')
      toast('All other sessions have been revoked', 'success')
      // After revoking all other sessions, the current one still works
      await fetchSessions()
    } catch {
      toast('Failed to revoke sessions', 'error')
    } finally {
      setRevoking(null)
    }
  }

  async function onPasswordSubmit(data: ChangePasswordForm) {
    setPasswordError(null)
    setPasswordSuccess(false)
    try {
      await api.post('/account/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
      toast('Password changed successfully', 'success')
      setPasswordSuccess(true)
      reset()
      // All sessions revoked — force re-login
      setTimeout(() => void logout().then(() => navigate('/login')), 2000)
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null>
        setPasswordError(d?.error?.message ?? 'Failed to change password')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Account settings</span>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-medium">
              {(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}` : user?.email}
              </p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <div className="flex gap-1.5 mt-1.5">
                {user?.roles.map((role) => (
                  <span
                    key={role}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Active sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Active sessions</h2>
            {sessions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                loading={revoking === 'all'}
                onClick={() => void handleRevokeAll()}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Revoke all others
              </Button>
            )}
          </div>

          {sessionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No active sessions found.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session, i) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {session.deviceInfo ?? 'Unknown device'}
                        {i === 0 && (
                          <span className="ml-1.5 text-xs text-blue-600 font-normal">Current</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {session.ipAddress ?? 'Unknown IP'} ·{' '}
                        {new Date(session.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  {i !== 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revoking === session.id}
                      onClick={() => void handleRevokeSession(session.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/*Activity Links*/}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Account activity</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Full history of security events on your account.
              </p>
            </div>
            <Link to="/activity">
              <Button variant="secondary" size="sm">
                View activity
              </Button>
            </Link>
          </div>
        </div>

        {/* MFA settings */}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Two-factor authentication</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {mfaStatus?.isEnabled
                  ? `Enabled · ${mfaStatus.backupCodesRemaining} backup codes remaining`
                  : 'Add an extra layer of security to your account.'}
              </p>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {mfaStatus?.isEnabled ? (
                <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  Enabled
                </span>
              ) : (
                <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                  Disabled
                </span>
              )}
            </div>
          </div>

          <div className="mt-4">
            {mfaStatus?.isEnabled ? (
              <Link to="/mfa/disable">
                <Button variant="secondary" size="sm">
                  Disable 2FA
                </Button>
              </Link>
            ) : (
              <Link to="/mfa/setup">
                <Button variant="primary" size="sm">
                  Enable 2FA
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Change password</h2>

          {passwordSuccess ? (
            <Alert variant="success">
              Password changed successfully. Redirecting you to sign in...
            </Alert>
          ) : (
            <form
              onSubmit={() => {
                handleSubmit(onPasswordSubmit)
              }}
              noValidate
              className="space-y-4"
            >
              <Input
                {...register('currentPassword')}
                type="password"
                label="Current password"
                placeholder="Your current password"
                error={errors.currentPassword?.message}
                autoComplete="current-password"
              />

              <div>
                <Input
                  {...register('newPassword')}
                  type="password"
                  label="New password"
                  placeholder="Choose a strong password"
                  error={errors.newPassword?.message}
                  autoComplete="new-password"
                />
                <PasswordStrength password={newPassword} />
              </div>

              <Input
                {...register('confirmPassword')}
                type="password"
                label="Confirm new password"
                placeholder="Repeat new password"
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
              />

              {passwordError && <Alert variant="error">{passwordError}</Alert>}

              <Alert variant="warning">
                Changing your password will sign you out from all devices.
              </Alert>

              <Button type="submit" variant="primary" size="md" loading={isSubmitting}>
                Change password
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
