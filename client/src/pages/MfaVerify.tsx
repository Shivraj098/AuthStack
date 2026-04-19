import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { api } from '@/lib/axios'
import { useAuth } from '@/context/AuthContext'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { ApiResponse, User } from '@/types/auth'

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(10),
})

type FormData = z.infer<typeof schema>

export function MfaVerify() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [useBackupCode, setUseBackupCode] = useState(false)

  // The pending token was passed via navigation state from SignIn
  const mfaPendingToken = (location.state as { mfaPendingToken?: string } | undefined)
    ?.mfaPendingToken

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // No pending token — they navigated here directly, send them back
  if (!mfaPendingToken) {
    void navigate('/login', { replace: true })
    return null
  }

  // Narrow type for later use (guard above ensures this is defined)
  const token = mfaPendingToken

  async function onSubmit(data: FormData) {
    setServerError(null)

    try {
      const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>(
        '/auth/mfa/complete',
        {
          mfaPendingToken: token,
          code: data.code.replace(/\s/g, ''),
        }
      )

      const payload = res.data
      if (!payload || !payload.success || !payload.data) {
        setServerError(payload?.error?.message ?? payload?.message ?? 'Invalid response')
        return
      }

      login(payload.data.accessToken, payload.data.user)
      void navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null> | undefined
        setServerError(d?.error?.message ?? d?.message ?? 'Invalid code')
      } else {
        setServerError(err instanceof Error ? err.message : 'An unknown error occurred')
      }
    }
  }

  return (
    <AuthLayout
      title="Two-factor authentication"
      subtitle={
        useBackupCode
          ? 'Enter one of your backup codes.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
    >
      <form onSubmit={void handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          {...register('code')}
          type="text"
          inputMode={useBackupCode ? 'text' : 'numeric'}
          maxLength={useBackupCode ? 11 : 6}
          label={useBackupCode ? 'Backup code' : 'Authentication code'}
          placeholder={useBackupCode ? 'XXXXX-XXXXX' : '000000'}
          error={errors.code?.message}
          autoComplete="one-time-code"
          autoFocus
          className={!useBackupCode ? 'text-center text-2xl tracking-[0.5em] font-mono' : ''}
        />

        {serverError && <Alert variant="error">{serverError}</Alert>}

        <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
          Verify
        </Button>

        <button
          type="button"
          onClick={() => setUseBackupCode((v) => !v)}
          className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
        </button>
      </form>
    </AuthLayout>
  )
}

/* axios.isAxiosError is used instead of a local type-guard */
