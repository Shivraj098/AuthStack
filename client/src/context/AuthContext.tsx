import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { api, setAccessToken } from '@/lib/axios'
import type { User } from '@/types/auth'

// ── State shape ──────────────────────────────────────────────────
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  // isLoading is true during the initial silent refresh check
  // While true, we show a spinner — not the login page
  // Without this, authenticated users see a flash of the login page on refresh
  isLoading: boolean
}

// ── Actions ──────────────────────────────────────────────────────
type AuthAction =
  | { type: 'AUTH_INIT_START' }
  | { type: 'AUTH_INIT_DONE'; payload: User }
  | { type: 'AUTH_INIT_FAIL' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGOUT' }

// ── Reducer ──────────────────────────────────────────────────────
// useReducer instead of useState because auth state has multiple
// fields that always update together. A reducer makes invalid states
// impossible — you can't have isAuthenticated=true with user=null.
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_INIT_START':
      return { ...state, isLoading: true }

    case 'AUTH_INIT_DONE':
      return {
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
      }

    case 'AUTH_INIT_FAIL':
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }

    case 'LOGIN_SUCCESS':
      return {
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
      }

    case 'LOGOUT':
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }

    default:
      return state
  }
}

// ── Context ──────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (accessToken: string, user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start as loading — we don't know session state yet
  })

  // Silent refresh on mount — restores session after page refresh
  // Uses the httpOnly cookie automatically (withCredentials: true)
  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      dispatch({ type: 'AUTH_INIT_START' })

      try {
        const response = await api.post<{
          data: { accessToken: string }
        }>('/auth/refresh')

        const { accessToken } = response.data.data
        setAccessToken(accessToken)

        // Now fetch the user profile with the new access token
        const meResponse = await api.get<{ data: User }>('/auth/me')

        if (!cancelled) {
          dispatch({ type: 'AUTH_INIT_DONE', payload: meResponse.data.data })
        }
      } catch {
        // No valid session — that's fine, user is not logged in
        if (!cancelled) {
          dispatch({ type: 'AUTH_INIT_FAIL' })
        }
      }
    }

    void initAuth()

    // Listen for the logout event dispatched by the Axios interceptor
    // when a refresh fails mid-session
    function handleForcedLogout() {
      dispatch({ type: 'LOGOUT' })
    }

    window.addEventListener('auth:logout', handleForcedLogout)

    return () => {
      cancelled = true
      window.removeEventListener('auth:logout', handleForcedLogout)
    }
  }, [])

  const login = useCallback((accessToken: string, user: User) => {
    setAccessToken(accessToken)
    dispatch({ type: 'LOGIN_SUCCESS', payload: user })
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      // Always clear local state even if the API call fails
      setAccessToken(null)
      dispatch({ type: 'LOGOUT' })
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isLoading: state.isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
