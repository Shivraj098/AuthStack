import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/axios'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Alert } from '@/components/ui/Alert'
import type { ApiResponse } from '@/types/auth'

type State = 'loading' | 'success' | 'error'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) return
    let isMounted = true

    const verify = async () => {
      try {
        const res = await api.get<ApiResponse<null>>(
          `/auth/verify-email?token=${encodeURIComponent(token)}`
        )

        if (!isMounted) return
        setMessage(res.data.message ?? 'Email verified.')
        setState('success')
      } catch (err: unknown) {
        if (!isMounted) return

        if (isAxiosError(err)) {
          const d = err.response?.data as ApiResponse<null>
          setMessage(d?.error?.message ?? 'Verification failed.')
        } else {
          setMessage('Unable to verify. Please try again.')
        }
        setState('error')
      }
    }

    void verify()

    return () => {
      isMounted = false
    }
  }, [token])

  if (!token) {
    return (
      <AuthLayout title="Email verification">
        <div className="py-4 space-y-5 text-center">
          {state === 'loading' && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Verifying your email...
            </div>
          )}

          {state === 'success' && (
            <>
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
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <Alert variant="success">{message}</Alert>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                Continue to sign in →
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg
                  className="w-7 h-7 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <Alert variant="error">{message}</Alert>
              <div className="flex flex-col gap-2 items-center">
                <Link
                  to="/login"
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </AuthLayout>
    )
  }
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
