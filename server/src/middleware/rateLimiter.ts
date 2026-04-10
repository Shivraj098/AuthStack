import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { RedisStore, RedisReply } from 'rate-limit-redis'
import { redisClient } from '../config/redis.js'
import { RateLimitError } from '../utils/error.js'

const sendCommand = (...args: string[]): Promise<RedisReply> => {
  return redisClient.sendCommand(args as [string, ...string[]])
}

function makeRateLimiter(windowMs: number, max: number, prefix: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    store: new RedisStore({
      sendCommand,
      prefix,
    }),

    handler: (_req, _res, next) => {
      next(new RateLimitError())
    },

    keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  })
}

// ✅ FIXED (factory pattern)
export function createGlobalLimiter() {
  return makeRateLimiter(15 * 60 * 1000, 100, 'rl:global:')
}

export function createAuthLimiter() {
  return makeRateLimiter(15 * 60 * 1000, 10, 'rl:auth:')
}

export function createPasswordResetLimiter() {
  return makeRateLimiter(60 * 60 * 1000, 3, 'rl:reset:')
}
