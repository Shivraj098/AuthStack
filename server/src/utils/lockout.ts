import { redisClient } from '../config/redis.js'

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 // 15 minutes in seconds
const WINDOW_DURATION = 15 * 60 // Reset attempt counter after 15 min

function lockoutKey(email: string): string {
  return `lockout:${email}`
}

function attemptsKey(email: string): string {
  return `attempts:${email}`
}

// Atomic increment — returns new count
// INCR in Redis is a single atomic operation.
// No race condition possible — two concurrent
// requests cannot both read the old value.
export async function recordFailedAttempt(email: string): Promise<number> {
  const key = attemptsKey(email)
  const attempts = await redisClient.incr(key)

  // Set expiry only on first attempt (when value becomes 1)
  // If we set it every time, a flood of requests resets the window
  if (attempts === 1) {
    await redisClient.expire(key, WINDOW_DURATION)
  }

  if (attempts >= MAX_ATTEMPTS) {
    await redisClient.set(lockoutKey(email), '1', { EX: LOCKOUT_DURATION })
  }

  return attempts
}

export async function isLockedOut(email: string): Promise<boolean> {
  const locked = await redisClient.get(lockoutKey(email))
  return locked !== null
}

export async function clearFailedAttempts(email: string): Promise<void> {
  await redisClient.del(attemptsKey(email))
  await redisClient.del(lockoutKey(email))
}

export async function getRemainingLockoutSeconds(email: string): Promise<number> {
  const ttl = await redisClient.ttl(lockoutKey(email))
  return ttl > 0 ? ttl : 0
}
