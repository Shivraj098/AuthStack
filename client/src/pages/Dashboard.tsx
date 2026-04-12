import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'

export function Dashboard() {
  const { user, logout } = useAuth()

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    '?'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          </div>

          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-medium">
              {initials}
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {user?.firstName ? `Hello, ${user.firstName}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your account is active and secure.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: 'Email',
              value: user?.email,
              badge: user?.isVerified
                ? { text: 'Verified', color: 'bg-green-50 text-green-700' }
                : { text: 'Unverified', color: 'bg-amber-50 text-amber-700' },
            },
            {
              label: 'Roles',
              value: user?.roles.join(', '),
              badge: null,
            },
            {
              label: 'Member since',
              value: user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—',
              badge: null,
            },
          ].map(({ label, value, badge }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                {label}
              </p>
              <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
              {badge && (
                <span
                  className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}
                >
                  {badge.text}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Security status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Security status</h2>
          <div className="space-y-3">
            {[
              'Access token stored in memory — not accessible to scripts',
              'Refresh token in httpOnly cookie — invisible to JavaScript',
              'Token rotates on every refresh — stolen tokens self-invalidate',
              'All requests use HTTPS with security headers',
            ].map((text) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-green-600" viewBox="0 0 12 12" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
