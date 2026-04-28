import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import { generateSecureToken, hashToken, getExpiryDate } from '../../../utils/token.js'
import type { Express } from 'express'

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types (STRICT CONTRACTS)      */
/* ----------------------------- */

interface SuccessResponse {
  success: boolean
  message: string
}

interface ErrorResponse {
  error: {
    code: string
    message: string
  }
}

/* ----------------------------- */
/* Helpers                       */
/* ----------------------------- */

function assertSuccess(res: Response, expectedStatus: number): SuccessResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<SuccessResponse>

  if (typeof body?.success !== 'boolean' || typeof body?.message !== 'string') {
    throw new Error('Invalid success response')
  }

  return body as SuccessResponse
}

function assertError(res: Response, expectedStatus: number): ErrorResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<ErrorResponse>

  if (!body?.error?.code || !body?.error?.message) {
    throw new Error('Invalid error response')
  }

  return body as ErrorResponse
}

async function createVerificationToken(
  userId: string,
  overrides: {
    expiresAt?: Date
    usedAt?: Date
  } = {}
) {
  const { plain, hash } = generateSecureToken()

  await prisma.emailVerification.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: overrides.expiresAt ?? getExpiryDate(24),
      usedAt: overrides.usedAt ?? null,
    },
  })

  return plain
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('GET /api/auth/verify-email', () => {
  describe('Success cases', () => {
    it('verifies email and sets isVerified=true', async () => {
      const user = await createUser({ isVerified: false })
      const token = await createVerificationToken(user.id)

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`)

      const body = assertSuccess(res, 200)

      expect(body.success).toBe(true)
      expect(body.message).toContain('verified')

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
      })

      expect(updated).not.toBeNull()
      expect(updated!.isVerified).toBe(true)
    })

    it('marks token as used after verification', async () => {
      const user = await createUser({ isVerified: false })
      const token = await createVerificationToken(user.id)

      await request(app).get(`/api/auth/verify-email?token=${token}`)

      const verification = await prisma.emailVerification.findFirst({
        where: { tokenHash: hashToken(token) },
      })

      expect(verification).not.toBeNull()
      expect(verification!.usedAt).not.toBeNull()
    })

    it('creates EMAIL_VERIFIED audit log', async () => {
      const user = await createUser({ isVerified: false })
      const token = await createVerificationToken(user.id)

      await request(app).get(`/api/auth/verify-email?token=${token}`)

      const log = await prisma.auditLog.findFirst({
        where: { userId: user.id, event: 'EMAIL_VERIFIED' },
      })

      expect(log).not.toBeNull()
    })
  })

  describe('Failure cases', () => {
    it('returns 401 for a token that does not exist', async () => {
      const fakeToken = 'a'.repeat(64)

      const res = await request(app).get(`/api/auth/verify-email?token=${fakeToken}`)

      const body = assertError(res, 401)

      expect(body.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 401 for an already-used token', async () => {
      const user = await createUser({ isVerified: false })
      const token = await createVerificationToken(user.id, {
        usedAt: new Date(),
      })

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`)

      const body = assertError(res, 401)

      expect(body.error.message).toContain('already been used')
    })

    it('returns 401 for an expired token', async () => {
      const user = await createUser({ isVerified: false })
      const token = await createVerificationToken(user.id, {
        expiresAt: new Date(Date.now() - 1000),
      })

      const res = await request(app).get(`/api/auth/verify-email?token=${token}`)

      const body = assertError(res, 401)

      expect(body.error.message).toContain('expired')
    })

    it('returns 400 for missing token parameter', async () => {
      const res = await request(app).get('/api/auth/verify-email')

      const body = assertError(res, 400)

      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
