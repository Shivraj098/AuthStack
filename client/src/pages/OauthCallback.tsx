import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/axios'
import { setAccessToken } from '@/lib/axios'
import type { User, ApiResponse } from '@/types/auth'

export function OAuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const processed = useRef(false)

  useEffect(() => {
    // Prevent double-execution in React strict mode
    if (processed.current) return
    processed.current = true

    async function handleCallback() {
      const hash = window.location.hash.slice(1) // Remove the '#'
      const params = new URLSearchParams(hash)
      const token = params.get('token')
      const isNew = params.get('new') === 'true'

      // Immediately clean the token from the URL — security hygiene
      window.history.replaceState(null, '', '/oauth/callback')

      if (!token) {
        void navigate('/login?error=oauth_failed', { replace: true })
        return
      }

      try {
        // Set token in memory so the /me request is authenticated
        setAccessToken(token)

        // Fetch the user profile
        const res = await api.get<ApiResponse<User>>('/auth/me')
        const user = res.data.data!

        // Store in AuthContext
        login(token, user)

        // New users could go to onboarding — for now, dashboard
        void navigate(isNew ? '/dashboard?welcome=true' : '/dashboard', {
          replace: true,
        })
      } catch {
        setAccessToken(null)
        void navigate('/login?error=oauth_failed', { replace: true })
      }
    }

    void handleCallback()
  }, [login, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">Completing sign in...</p>
      </div>
    </div>
  )
}
