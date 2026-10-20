import rateLimit, { RateLimitRequestHandler, Options, ipKeyGenerator } from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import { redisClient } from '../config/redis.js'
import { RateLimitError } from '../utils/error.js'
import type { NextFunction, Request, Response } from 'express'
import { logger } from '../config/logger.js'

/**
 * Shared handler – single reference, consistent error shape across all limiters
 */
const rateLimitHandler = (req: Request, res: Response): void => {
  logger.warn({ ip: req.ip, requestId: req.id }, 'Rate limit exceeded')
  const error = new RateLimitError()
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      requestId: req.id,
    },
  })
}

/**
 * Core factory – Modern, fully type-safe Redis store
 * (This eliminates the ReplyUnion vs RedisReply error)
 */
function makeRateLimiter(
  windowMs: number,
  max: number,
  prefix: string,
  options?: Partial<Options>
): RateLimitRequestHandler {
  const sendCommand = (...args: string[]): Promise<RedisReply> => {
    return redisClient.sendCommand(args)
  }

  const commonOptions: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => ipKeyGenerator(req.ip || 'unknown'),
    handler: rateLimitHandler,
    ...options,
  }

  const redisLimiter = rateLimit({
    ...commonOptions,
    store: new RedisStore({
      sendCommand,
      prefix,
    }),
  })

  // Local, in-process fallback. It protects this instance during
  // Redis outages but does not share counts across server instances.
  const fallbackLimiter = rateLimit(commonOptions)

  return Object.assign(
    (req: Request, res: Response, next: NextFunction): void => {
      if (redisClient.isReady) {
        redisLimiter(req, res, next)
        return
      }

      logger.warn(
        { requestId: req.id, ip: req.ip, prefix },
        'Redis unavailable; using process-local rate limiting'
      )

      fallbackLimiter(req, res, next)
    },
    {
      resetKey: (key: string): void => {
        redisLimiter.resetKey(key)
        fallbackLimiter.resetKey(key)
      },
      getKey: (key: string) =>
        redisClient.isReady ? redisLimiter.getKey(key) : fallbackLimiter.getKey(key),
    }
  )
}
/**
 * Lazy singleton pattern (your original excellent architecture – unchanged)
 */
let _globalLimiter: RateLimitRequestHandler | null = null
let _authLimiter: RateLimitRequestHandler | null = null
let _passwordResetLimiter: RateLimitRequestHandler | null = null

export function initRateLimiters(): void {
  _globalLimiter = makeRateLimiter(15 * 60 * 1000, 100, 'rl:global:')
  _authLimiter = makeRateLimiter(15 * 60 * 1000, 10, 'rl:auth:')
  _passwordResetLimiter = makeRateLimiter(60 * 60 * 1000, 3, 'rl:reset:')

  logger.info('Rate limiter initialized (Redis, Fixed Window)')
}

function assertInitialized(
  limiter: RateLimitRequestHandler | null,
  name: string
): RateLimitRequestHandler {
  if (!limiter) {
    throw new Error(
      `[RateLimiter] "${name}" accessed before initRateLimiters() was called. ` +
        'Ensure initRateLimiters() is called in bootstrap() after connectRedis().'
    )
  }
  return limiter
}

export const getGlobalLimiter = (): RateLimitRequestHandler =>
  assertInitialized(_globalLimiter, 'globalLimiter')

export const getAuthLimiter = (): RateLimitRequestHandler =>
  assertInitialized(_authLimiter, 'authLimiter')

export const getPasswordResetLimiter = (): RateLimitRequestHandler =>
  assertInitialized(_passwordResetLimiter, 'passwordResetLimiter')
