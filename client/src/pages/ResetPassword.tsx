import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/axios'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import type { ApiResponse } from '@/types/auth'

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[a-z]/, 'One lowercase letter')
      .regex(/[0-9]/, 'One number')
      .regex(/[^A-Za-z0-9]/, 'One special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const token = searchParams.get('token')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const password = watch('password', '')

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <div className="text-center space-y-4 py-2">
          <Alert variant="error">This reset link is invalid or has expired.</Alert>
          <Link
            to="/forgot-password"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            Request a new link →
          </Link>
        </div>
      </AuthLayout>
    )
  }

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      await api.post('/auth/reset-password', {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })
      // Redirect to login with success message
      void navigate('/login', {
        state: { message: 'Password reset successfully. Please sign in.' },
      })
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null>
        setServerError(d?.error?.message ?? 'Something went wrong')
      }
    }
  }

  return (
    <AuthLayout title="Set new password" subtitle="Choose a strong password for your account.">
      <form
        onSubmit={() => {
          handleSubmit(onSubmit)
        }}
        noValidate
        className="space-y-4"
      >
        <div>
          <Input
            {...register('password')}
            type="password"
            label="New password"
            placeholder="Create a strong password"
            error={errors.password?.message}
            autoComplete="new-password"
          />
          <PasswordStrength password={password} />
        </div>

        <Input
          {...register('confirmPassword')}
          type="password"
          label="Confirm password"
          placeholder="Repeat your new password"
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
        />

        {serverError && <Alert variant="error">{serverError}</Alert>}

        <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  )
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
