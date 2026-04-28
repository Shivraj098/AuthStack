import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../../config/database.js'
import { redisClient, connectRedis } from '../../config/redis.js'
import { initRateLimiters } from '../../middleware/rateLimiter.js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') })

// ============================================
// TOP-LEVEL INITIALIZATION (runs once when file is imported)
// ============================================
await connectRedis()
initRateLimiters()
await prisma.$connect()

// ============================================
// PER-TEST CLEANUP + SEEDING (beforeEach = best isolation)
// ============================================
beforeEach(async () => {
  await prisma.auditLog.deleteMany()
  await prisma.mfaBackupCode.deleteMany()
  await prisma.mfaSecret.deleteMany()
  await prisma.oAuthAccount.deleteMany()
  await prisma.passwordReset.deleteMany()
  await prisma.emailVerification.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()

  await prisma.role.createMany({
    data: [
      { name: 'admin', description: 'Full system access' },
      { name: 'user', description: 'Standard user access' },
      { name: 'moderator', description: 'Content moderation access' },
    ],
  })

  await redisClient.flushDb()
})
// ============================================
// SINGLE DISCONNECT AT THE VERY END
// ============================================
let hasDisconnected = false

afterAll(async () => {
  if (hasDisconnected) return
  hasDisconnected = true

  await prisma.$disconnect()
  await redisClient.disconnect()
})
