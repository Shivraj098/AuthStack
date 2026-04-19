import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import type { ApiResponse } from '@/types/auth'

interface SetupData {
  secret: string
  qrCodeDataUrl: string
  backupCodes: string[]
}

type Step = 'loading' | 'scan' | 'verify' | 'backup' | 'done'

const codeSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
})

type CodeForm = z.infer<typeof codeSchema>

export function MfaSetup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('loading')
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError: setFormError,
  } = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })

  useEffect(() => {
    async function initSetup() {
      try {
        const res = await api.post<ApiResponse<SetupData>>('/auth/mfa/setup')
        setSetupData(res.data.data!)
        setStep('scan')
      } catch (err: unknown) {
        if (isAxiosError(err)) {
          const d = err.response?.data as ApiResponse<null>
          setError(d?.error?.message ?? 'Failed to initialize MFA setup')
        }
      }
    }
    void initSetup()
  }, [])

  async function onVerify(data: CodeForm) {
    setError(null)
    try {
      await api.post('/auth/mfa/verify-setup', { code: data.code })
      setStep('backup')
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const d = err.response?.data as ApiResponse<null>
        setFormError('code', { message: d?.error?.message ?? 'Invalid code' })
      }
    }
  }

  async function copySecret() {
    if (!setupData) return
    await navigator.clipboard.writeText(setupData.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Setting up 2FA...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            Set up two-factor authentication
          </span>
          <button
            onClick={() => void navigate('/account')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-8">
            {['Scan', 'Verify', 'Save codes'].map((label, i) => {
              const stepIndex = ['scan', 'verify', 'backup'].indexOf(
                step === 'done' ? 'backup' : step
              )
              const isComplete = i < stepIndex
              const isCurrent = i === stepIndex

              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                      isComplete
                        ? 'bg-green-500 text-white'
                        : isCurrent
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {isComplete ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${isCurrent ? 'text-gray-900' : 'text-gray-400'}`}
                  >
                    {label}
                  </span>
                  {i < 2 && (
                    <div className={`h-px flex-1 ${isComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-7">
            {/* Step 1: Scan QR code */}
            {step === 'scan' && setupData && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Scan with your authenticator app
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Use Google Authenticator, Authy, or any TOTP app.
                  </p>
                </div>

                <div className="flex justify-center py-2">
                  <div className="p-3 bg-white border-2 border-gray-100 rounded-2xl">
                    <img src={setupData.qrCodeDataUrl} alt="MFA QR Code" className="w-44 h-44" />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Can&apos;t scan? Enter this key manually
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <code className="text-xs text-gray-700 flex-1 break-all font-mono">
                      {setupData.secret}
                    </code>
                    <button
                      onClick={() => void copySecret()}
                      className="text-xs text-gray-500 hover:text-gray-700 shrink-0 transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {error && <Alert variant="error">{error}</Alert>}

                <Button className="w-full" size="lg" onClick={() => setStep('verify')}>
                  I&apos;ve scanned the QR code →
                </Button>
              </div>
            )}

            {/* Step 2: Verify first code */}
            {step === 'verify' && (
              <form onSubmit={void handleSubmit(onVerify)} noValidate className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Enter the 6-digit code</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Open your authenticator app and enter the code for AuthApp.
                  </p>
                </div>

                <Input
                  {...register('code')}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  label="Authentication code"
                  placeholder="000000"
                  error={errors.code?.message}
                  autoComplete="one-time-code"
                  autoFocus
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />

                {error && <Alert variant="error">{error}</Alert>}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    onClick={() => setStep('scan')}
                  >
                    Back
                  </Button>
                  <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
                    Verify
                  </Button>
                </div>
              </form>
            )}

            {/* Step 3: Save backup codes */}
            {step === 'backup' && setupData && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Save your backup codes</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    These 10 codes can be used if you lose your phone. Each code works once only.
                  </p>
                </div>

                <Alert variant="warning">
                  Save these now — you won&apos;t be able to see them again.
                </Alert>

                <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  {setupData.backupCodes.map((code) => (
                    <code key={code} className="text-sm font-mono text-gray-700 text-center py-1">
                      {code}
                    </code>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      const text = setupData.backupCodes.join('\n')
                      const blob = new Blob([text], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'authapp-backup-codes.txt'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(setupData.backupCodes.join('\n'))
                    }}
                  >
                    Copy all
                  </Button>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void navigate('/account?mfa=enabled')}
                >
                  I&apos;ve saved my codes — finish setup
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function isAxiosError(e: unknown): e is { response?: { data: unknown } } {
  return typeof e === 'object' && e !== null && 'response' in e
}
