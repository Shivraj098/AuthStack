import { createClient, RedisClientType } from 'redis'
import { env } from './env.js'

export const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries: number): number | Error => {
      if (retries > 10) {
        console.error('[Redis] Maximum reconnection attempts reached. Stopping retries.')
        return new Error('Maximum reconnection attempts reached')
      }
      const delay = Math.min(retries * 100, 3000) // Exponential backoff with a max delay of 3 seconds
      console.warn(
        `[Redis] Connection lost. Attempting to reconnect in ${delay}ms... (Attempt ${retries})`
      )
      return delay
    },
    connectTimeout: 10_000, // 10 seconds
  },
}) as RedisClientType

// ─── Lifecycle events ─────────────────────────────────────────────────────────
redisClient.on('connect', () => console.log('[Redis] Connection established'))
redisClient.on('ready', () => console.log('[Redis] Client ready'))
redisClient.on('reconnecting', () => console.warn('[Redis] Reconnecting...'))
redisClient.on('error', (err: Error) => console.error('[Redis] Error:', err.message))
redisClient.on('end', () => console.warn('[Redis] Connection closed'))

export async function connectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    console.log('[Redis] Client is already connected')
    return
  }
  await redisClient.connect()
}

// ─── Graceful shutdown (call from SIGTERM/SIGINT handler) ─────────────────────
export async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit()
    console.log('[Redis] Disconnected cleanly')
  }
}
