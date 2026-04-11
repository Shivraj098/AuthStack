import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios'

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}
// The access token lives here — in memory only
// Never written to localStorage or sessionStorage
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

// Create the main Axios instance
export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true, // Sends httpOnly refresh token cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor ──────────────────────────────────────────
// Attaches the access token to every outgoing request
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error instanceof Error ? error : new Error(String(error)))
)

// ── Response interceptor ─────────────────────────────────────────
// Handles token refresh on 401 responses

// Queue of requests waiting for a token refresh
// Prevents multiple simultaneous refresh calls
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string | null) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token)
    } else {
      reject(error)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  // Success — pass through unchanged
  (response: AxiosResponse) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig

    // Only handle 401s, and only once per request
    // _retry flag prevents infinite loops
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }

    // Don't try to refresh if the failing request IS the refresh call
    // That would cause an infinite loop
    if (originalRequest.url === '/auth/refresh') {
      setAccessToken(null)
      // Dispatch a custom event so AuthContext knows to clear state
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${String(token)}`
        return api(originalRequest)
      })
    }

    // This request will perform the refresh
    originalRequest._retry = true
    isRefreshing = true

    try {
      const response = await api.post<{ data: { accessToken: string } }>('/auth/refresh')
      const newToken = response.data.data.accessToken

      setAccessToken(newToken)
      originalRequest.headers.Authorization = `Bearer ${newToken}`

      // Replay all queued requests with the new token
      processQueue(null, newToken)

      return api(originalRequest)
    } catch (refreshError) {
      // Refresh failed — clear everything, send user to login
      processQueue(refreshError, null)
      setAccessToken(null)
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return Promise.reject(
        refreshError instanceof Error ? refreshError : new Error(String(refreshError))
      )
    } finally {
      isRefreshing = false
    }
  }
)
