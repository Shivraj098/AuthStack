import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken'
import crypto from 'node:crypto'
import { z } from 'zod'

import { env } from '../config/env.js'
import { AuthenticationError } from '../utils/error.js'

// ==============================
// Payload Types
// ==============================

export interface AccessTokenPayload {
  sub: string // User ID (standard JWT claim)
  email: string
  roles: string[]
  type: 'access'
  tokenId: string
  jti: string // JWT ID for revocation/blacklisting
}

export interface RefreshTokenPayload {
  sub: string
  tokenId: string
  type: 'refresh'
}

// ==============================
// Runtime Validation Schemas (Zod)
// ==============================

const accessTokenSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  roles: z.array(z.string()),
  type: z.literal('access'),
  tokenId: z.string(),
  jti: z.string(),
})

const refreshTokenSchema = z.object({
  sub: z.string(),
  tokenId: z.string(),
  type: z.literal('refresh'),
})

// ... your payload interfaces and Zod schemas remain the same

// ==============================
// Sign Tokens (Fixed for exactOptionalPropertyTypes)
// ==============================

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type' | 'jti'>): string {
  const jti = crypto.randomUUID()

  const fullPayload: AccessTokenPayload = { ...payload, type: 'access', jti }

  return jwt.sign(
    fullPayload,
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN, // string like "15m", "1h", "7d"
      issuer: 'auth-app',
      audience: 'auth-app-client',
      algorithm: 'HS256',
    } as jwt.SignOptions // This assertion is the cleanest & safest solution
  )
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  const fullPayload = { ...payload, type: 'refresh' }
  return jwt.sign(fullPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'auth-app',
    audience: 'auth-app-client',
    algorithm: 'HS256',

    jwtid: crypto.randomUUID(), // Always include a unique ID for refresh tokens (useful for rotation and revocation)
  } as jwt.SignOptions)
}
// ==============================
// Verify Tokens
// ==============================

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'auth-app',
      audience: 'auth-app-client',
      algorithms: ['HS256'],
      clockTolerance: 5,
    })

    const payload = accessTokenSchema.parse(decoded)

    if (payload.type !== 'access') {
      throw new AuthenticationError('Invalid token type')
    }

    return payload
  } catch (err) {
    if (err instanceof AuthenticationError) throw err

    if (err instanceof TokenExpiredError) {
      throw new AuthenticationError('Access token expired')
    }

    if (err instanceof JsonWebTokenError) {
      throw new AuthenticationError('Invalid access token')
    }

    throw new AuthenticationError('Token verification failed')
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'auth-app',
      audience: 'auth-app-client',
      algorithms: ['HS256'],
      clockTolerance: 5,
    })

    const payload = refreshTokenSchema.parse(decoded)

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type')
    }

    return payload
  } catch (err) {
    if (err instanceof AuthenticationError) throw err

    if (err instanceof TokenExpiredError) {
      throw new AuthenticationError('Refresh token expired')
    }

    if (err instanceof JsonWebTokenError) {
      throw new AuthenticationError('Invalid refresh token')
    }

    throw new AuthenticationError('Token verification failed')
  }
}

export interface MfaPendingTokenPayload {
  sub: string
  type: 'mfa_pending'
}

export function signMfaPendingToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa_pending' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '5m', // 5 minutes to complete MFA
    issuer: 'auth-app',
    audience: 'auth-app-client',
  })
}

export function verifyMfaPendingToken(token: string): MfaPendingTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'auth-app',
      audience: 'auth-app-client',
    }) as MfaPendingTokenPayload

    if (payload.type !== 'mfa_pending') {
      throw new AuthenticationError('Invalid token type')
    }

    return payload
  } catch (err) {
    if (err instanceof AuthenticationError) throw err
    throw new AuthenticationError('Invalid or expired MFA session')
  }
}
