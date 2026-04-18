import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface PasswordStrengthProps {
  password: string
}

interface StrengthResult {
  score: number // 0-4
  label: string
  color: string
  checks: { label: string; passed: boolean }[]
}

function analysePassword(password: string): StrengthResult {
  const checks = [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'Uppercase letter', passed: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', passed: /[a-z]/.test(password) },
    { label: 'Number', passed: /[0-9]/.test(password) },
    { label: 'Special character', passed: /[^A-Za-z0-9]/.test(password) },
  ]

  const score = checks.filter((c) => c.passed).length

  const levels = [
    { label: 'Too weak', color: 'bg-red-500' },
    { label: 'Weak', color: 'bg-orange-500' },
    { label: 'Fair', color: 'bg-amber-500' },
    { label: 'Good', color: 'bg-blue-500' },
    { label: 'Strong', color: 'bg-green-500' },
  ]

  const level = levels[Math.min(score, 4)]!

  return { score, label: level.label, color: level.color, checks }
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const result = useMemo(() => analysePassword(password), [password])

  if (!password) return null

  return (
    <div className="mt-3 space-y-3">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all duration-300',
                i < result.score ? result.color : 'bg-gray-200'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500 w-16 text-right">{result.label}</span>
      </div>

      {/* Requirement checklist */}
      <div className="grid grid-cols-2 gap-1">
        {result.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5">
            <svg
              className={cn(
                'w-3.5 h-3.5 shrink-0 transition-colors duration-200',
                check.passed ? 'text-green-500' : 'text-gray-300'
              )}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <span
              className={cn(
                'text-xs transition-colors duration-200',
                check.passed ? 'text-gray-600' : 'text-gray-400'
              )}
            >
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
