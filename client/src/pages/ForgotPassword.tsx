import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/axios'
import { AuthLayout } from '@/components/ui/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
})
type FormData = z.infer<typeof schema>

export function ForgotPassword() {
  const [isSubmitted, setIsSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    // Always show success — backend never reveals if email exists
    await api.post('/auth/forgot-password', data).catch(() => {})
    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <AuthLayout title="Check your email">
        <div className="space-y-5 text-center py-2">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              className="w-7 h-7 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 10-2.636 6.364M16.5 12V8.25"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-600 leading-relaxed">
              If that email is registered, you&apos;ll receive a reset link shortly. The link
              expires in <strong>1 hour</strong>.
            </p>
          </div>
          <Alert variant="info">
            Check your spam folder if you don&apos;t see it within a few minutes.
          </Alert>
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
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
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
          label="Email address"
          placeholder="jane@example.com"
          error={errors.email?.message}
          autoComplete="email"
        />

        <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
          Send reset link
        </Button>

        <div className="text-center">
          <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
