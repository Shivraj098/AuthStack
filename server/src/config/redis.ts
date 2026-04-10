import { createClient } from 'redis'
import { env } from './env.js'

export const redisClient = createClient({ url: env.REDIS_URL })

redisClient.on('error', (err) => {
  console.error('Redis error:', err)
})

redisClient.on('connect', () => {
  console.log('Redis connected')
})

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
}
