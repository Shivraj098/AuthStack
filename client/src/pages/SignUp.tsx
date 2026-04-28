import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWatch, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/lib/axios'
import { registerSchema, type RegisterFormData } from '@/lib/schemas'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import type { ApiResponse } from '@/types/auth'
import { OAuthButtons } from '@/components/ui/OauthButtons'

export function SignUp() {
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) })

  const password = useWatch({
    control,
    name: 'password',
    defaultValue: '',
  })

  async function onSubmit(data: RegisterFormData) {
    setServerMessage(null)
    try {
      const res = await api.post<ApiResponse<null>>('/auth/register', {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      })
      setIsSuccess(true)
      setServerMessage(res.data.message ?? 'Check your email.')
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null>
        if (d?.error?.fields) {
          Object.entries(d.error.fields).forEach(([field, msgs]) =>
            setError(field as keyof RegisterFormData, { message: msgs[0] })
          )
        } else {
          setServerMessage(d?.error?.message ?? 'Something went wrong')
        }
      }
    }
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Check your inbox">
        <div className="text-center py-4 space-y-4">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              className="w-7 h-7 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{serverMessage}</p>
          <Link
            to="/login"
            className="inline-block text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to sign in →
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link to="/login" className="text-gray-900 font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={void handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            {...register('firstName')}
            label="First name"
            placeholder="Jane"
            error={errors.firstName?.message}
            autoComplete="given-name"
          />
          <Input
            {...register('lastName')}
            label="Last name"
            placeholder="Doe"
            error={errors.lastName?.message}
            autoComplete="family-name"
          />
        </div>

        <Input
          {...register('email')}
          type="email"
          label="Email"
          placeholder="jane@example.com"
          error={errors.email?.message}
          autoComplete="email"
        />

        <div>
          <Input
            {...register('password')}
            type="password"
            label="Password"
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
          placeholder="Repeat your password"
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
        />

        {serverMessage && <Alert variant="error">{serverMessage}</Alert>}

        <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
          Create account
        </Button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-400">or continue with</span>
          </div>
        </div>

        <OAuthButtons mode="signup" />
      </form>
    </AuthLayout>
  )
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
