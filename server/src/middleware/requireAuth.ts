import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js'
import { AuthenticationError, AuthorizationError } from '../utils/error.js'
import { redisClient } from '../config/redis.js'

// Extend Express Request type to carry the authenticated user
declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      user?: AccessTokenPayload
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Extract token from Authorization: Bearer <token>
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError('No token provided'))
  }

  const token = authHeader.slice(7) // Remove "Bearer "

  const payload = verifyAccessToken(token) // Throws if invalid
  console.log('🟡 MIDDLEWARE payload:', payload)

  // Check blacklist — catches tokens from logged-out sessions
  try {
    const blacklisted = await redisClient.get(`blacklist:${payload.jti}`)
    console.log('🔴 BLACKLIST CHECK:', blacklisted)

    if (blacklisted) {
      return next(new AuthenticationError('Token has been revoked'))
    }
  } catch {
    return next(new AuthenticationError('Auth service unavailable'))
  }

  req.user = payload
  next()
}

// Factory for role-based protection
// Usage: router.get('/admin', requireAuth, requireRole('admin'), handler)
export function requireRole(...roles: string[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    const user = _req.user

    if (!user) {
      return next(new AuthenticationError())
    }

    const hasRole = roles.some((role) => user.roles.includes(role))

    if (!hasRole) {
      return next(new AuthorizationError(`Requires one of: ${roles.join(', ')}`))
    }

    next()
  }
}
