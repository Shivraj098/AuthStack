import { afterAll, beforeEach, vi } from 'vitest'
import { assertLocalTestEnvironment } from './testEnvironment.js'

// Validate targets before importing modules that initialize clients.

// Prevent automated tests from contacting the real email provider.
vi.mock('../../services/email.service.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

// These modules can only load after the safety check passes.
const { prisma } = await import('../../config/database.js')
const { redisClient, connectRedis } = await import('../../config/redis.js')
const { initRateLimiters } = await import('../../middleware/rateLimiter.js')

// ============================================
// TOP-LEVEL INITIALIZATION (runs once when file is imported)
// ============================================
assertLocalTestEnvironment()
await connectRedis()
initRateLimiters()
await prisma.$connect()

// ============================================
// PER-TEST CLEANUP + SEEDING (beforeEach = best isolation)
// ============================================
beforeEach(async () => {
  vi.clearAllMocks()
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
