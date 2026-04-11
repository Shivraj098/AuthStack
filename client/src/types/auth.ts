export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  isVerified: boolean
  roles: string[]
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
}

export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string[]>
  requestId?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
  message?: string
}
