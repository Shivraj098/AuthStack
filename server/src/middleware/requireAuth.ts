import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/database.js'
import { redisClient } from '../config/redis.js'
import { AppError, AuthenticationError, AuthorizationError } from '../utils/error.js'
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js'

// Extend Express Request type to carry the authenticated user.
declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      user?: AccessTokenPayload
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AuthenticationError('No token provided'))
    return
  }

  const token = authHeader.slice('Bearer '.length)

  let payload: AccessTokenPayload

  try {
    payload = verifyAccessToken(token)
  } catch (error: unknown) {
    next(error)
    return
  }

  try {
    const [blacklisted, session] = await Promise.all([
      redisClient.get(`blacklist:${payload.jti}`),
      prisma.refreshToken.findUnique({
        where: { id: payload.tokenId },
        select: {
          userId: true,
          revokedAt: true,
          expiresAt: true,
          user: {
            select: {
              isActive: true,
              deletedAt: true,
            },
          },
        },
      }),
    ])

    if (blacklisted) {
      next(new AuthenticationError('Token has been revoked'))
      return
    }

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      next(new AuthenticationError('Session is no longer valid'))
      return
    }

    if (!session.user.isActive || session.user.deletedAt !== null) {
      next(new AuthenticationError('Account is no longer available'))
      return
    }

    req.user = payload
    next()
  } catch {
    // Fail closed if Redis or the database cannot verify session state.
    next(
      new AppError(
        'Authentication service is temporarily unavailable',
        503,
        'AUTH_SERVICE_UNAVAILABLE',
        false
      )
    )
  }
}

// Usage: router.get('/admin', requireAuth, requireRole('admin'), handler)
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user

    if (!user) {
      next(new AuthenticationError())
      return
    }

    const hasRole = roles.some((role) => user.roles.includes(role))

    if (!hasRole) {
      next(new AuthorizationError(`Requires one of: ${roles.join(', ')}`))
      return
    }

    next()
  }
}
