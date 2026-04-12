import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/lib/axios'
import { useAuth } from '@/context/AuthContext'
import { loginSchema, type LoginFormData } from '@/lib/schemas'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { ApiResponse, User } from '@/types/auth'
import { OAuthButtons } from '@/components/ui/OauthButtons'
import { useSearchParams } from 'react-router-dom'

export function SignIn() {
  const [serverError, setServerError] = useState<string | null>(null)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const oauthError = searchParams.get('error')
  // Add inside SignIn, after const location line:
  const successMessage = (location.state as { message?: string })?.message
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)
    try {
      const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>(
        '/auth/login',
        data
      )
      login(res.data.data!.accessToken, res.data.data!.user)
      void navigate(from, { replace: true })
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null>
        setServerError(d?.error?.message ?? 'Invalid email or password')
      } else {
        setServerError('Unable to connect. Please try again.')
      }
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          No account?{' '}
          <Link to="/register" className="text-gray-900 font-medium hover:underline">
            Sign up free
          </Link>
        </>
      }
    >
      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      {oauthError === 'oauth_denied' && (
        <Alert variant="warning">
          Sign in was cancelled. You can try again or use your email and password.
        </Alert>
      )}
      {oauthError === 'oauth_failed' && (
        <Alert variant="error">Something went wrong with social sign in. Please try again.</Alert>
      )}
      <form
        onSubmit={() => {
          handleSubmit(onSubmit)
        }}
        noValidate
        className="space-y-4"
      >
        <Input
          {...register('email')}
          type="email"
          label="Email"
          placeholder="jane@example.com"
          error={errors.email?.message}
          autoComplete="email"
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <Link
              to="/forgot-password"
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            {...register('password')}
            type="password"
            placeholder="Your password"
            error={errors.password?.message}
            autoComplete="current-password"
          />
        </div>

        {serverError && <Alert variant="error">{serverError}</Alert>}

        <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
          Sign in
        </Button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-400">or continue with</span>
          </div>
        </div>

        <OAuthButtons mode="signin" />
      </form>
    </AuthLayout>
  )
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
