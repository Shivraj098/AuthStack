import type { NextFunction, Request, Response } from 'express'

import { logger } from '../config/logger.js'
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

function logInfrastructureFailure(operation: string, error: unknown): void {
  logger.error(
    {
      operation,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    },
    'Authentication infrastructure operation failed'
  )
}

function serviceUnavailableError(): AppError {
  return new AppError(
    'Authentication service temporarily unavailable',
    503,
    'AUTH_SERVICE_UNAVAILABLE'
  )
}

async function findSession(tokenId: string) {
  return prisma.refreshToken.findUnique({
    where: { id: tokenId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          isVerified: true,
          deletedAt: true,
          roles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError('No token provided'))
  }

  const token = authHeader.slice('Bearer '.length).trim()

  if (!token) {
    return next(new AuthenticationError('No token provided'))
  }

  let payload: AccessTokenPayload

  try {
    payload = verifyAccessToken(token)
  } catch (error: unknown) {
    return next(error instanceof Error ? error : new AuthenticationError('Invalid access token'))
  }

  // Reject access tokens explicitly revoked by their JWT ID.
  try {
    const blacklisted = await redisClient.get(`blacklist:${payload.jti}`)

    if (blacklisted !== null) {
      return next(new AuthenticationError('Token has been revoked'))
    }
  } catch (error: unknown) {
    logInfrastructureFailure('redis-blacklist-check', error)
    return next(serviceUnavailableError())
  }

  // Prisma infers this query's exact selected result type.
  // Avoid ReturnType annotations on its generic query methods.
  const session = await findSession(payload.tokenId).catch((error: unknown) => {
    logInfrastructureFailure('database-session-check', error)
    throw serviceUnavailableError()
  })

  if (!session || session.userId !== payload.sub || session.user.id !== payload.sub) {
    return next(new AuthenticationError('Invalid session'))
  }

  if (session.revokedAt !== null) {
    return next(new AuthenticationError('Session has been revoked'))
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return next(new AuthenticationError('Session has expired'))
  }

  if (!session.user.isActive || session.user.deletedAt !== null) {
    return next(new AuthenticationError('Account is not available'))
  }

  if (!session.user.isVerified) {
    return next(new AuthenticationError('Email is not verified'))
  }

  // Use current database roles so role changes take effect immediately.
  req.user = {
    ...payload,
    email: session.user.email,
    roles: session.user.roles.map(({ role }) => role.name),
  }

  return next()
}

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

    return next()
  }
}
