import { createClient, RedisClientType } from 'redis'
import { env } from './env.js'
import { logger } from './logger.js'

export const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries: number): number | Error => {
      if (retries > 10) {
        logger.error('Redis: maximum reconnection attempts reached')
        return new Error('Maximum reconnection attempts reached')
      }
      const delay = Math.min(retries * 100, 3000) // Exponential backoff with a max delay of 3 seconds
      logger.warn({ retries, delay }, 'Redis connection lost, attempting reconnect')
      return delay
    },
    connectTimeout: 10_000, // 10 seconds
  },
}) as RedisClientType

// ─── Lifecycle events ─────────────────────────────────────────────────────────
redisClient.on('connect', () => logger.info('Redis connection established'))
redisClient.on('ready', () => logger.info('Redis client ready'))
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting'))
redisClient.on('error', (err: Error) => logger.error({ err }, 'Redis error'))

redisClient.on('end', () => logger.warn('Redis connection closed'))

export async function connectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    logger.info('Redis client already connected')
    return
  }
  await redisClient.connect()
}

// ─── Graceful shutdown (call from SIGTERM/SIGINT handler) ─────────────────────
export async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit()
    logger.info('Redis disconnected cleanly')
  }
}
