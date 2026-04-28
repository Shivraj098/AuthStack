import { describe, it, expect, beforeAll, vi } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import { generateSecureToken, hashToken, getExpiryDate } from '../../../utils/token.js'
import type { Express } from 'express'

/* ----------------------------- */
/* Mock external side effects    */
/* ----------------------------- */

vi.mock('../../../services/email.service.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types (STRICT CONTRACTS)      */
/* ----------------------------- */

interface MessageResponse {
  message: string
}

interface ErrorResponse {
  error: {
    code?: string
    message: string
  }
}

/* ----------------------------- */
/* Helpers                       */
/* ----------------------------- */

function assertMessageResponse(res: Response, expectedStatus: number): MessageResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<MessageResponse>

  if (!body?.message || typeof body.message !== 'string') {
    throw new Error('Invalid message response structure')
  }

  return body as MessageResponse
}

function assertErrorResponse(res: Response, expectedStatus: number): ErrorResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<ErrorResponse>

  if (!body?.error?.message) {
    throw new Error('Invalid error response structure')
  }

  return body as ErrorResponse
}

async function createResetToken(
  userId: string,
  overrides: {
    expiresAt?: Date
    usedAt?: Date
  } = {}
) {
  const { plain, hash } = generateSecureToken()

  await prisma.passwordReset.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: overrides.expiresAt ?? getExpiryDate(1),
      usedAt: overrides.usedAt ?? null,
    },
  })

  return plain
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 regardless of whether email exists', async () => {
    const existingRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' })

    const nonExistingRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@nowhere.com' })

    const existingBody = assertMessageResponse(existingRes, 200)
    const nonExistingBody = assertMessageResponse(nonExistingRes, 200)

    expect(existingBody.message).toBe(nonExistingBody.message)
  })

  it('creates a password reset record for existing user', async () => {
    const user = await createUser()

    await request(app).post('/api/auth/forgot-password').send({ email: user.email })

    const reset = await prisma.passwordReset.findFirst({
      where: { userId: user.id },
    })

    expect(reset).not.toBeNull()
    expect(reset!.tokenHash).toHaveLength(64)
    expect(reset!.usedAt).toBeNull()
  })
})

describe('POST /api/auth/reset-password', () => {
  it('successfully resets password and revokes all sessions', async () => {
    const user = await createUser()

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const token = await createResetToken(user.id)

    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NewPassword@1',
      confirmPassword: 'NewPassword@1',
    })

    const body = assertMessageResponse(res, 200)

    expect(body.message).toContain('reset successfully')

    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    expect(oldLoginRes.status).toBe(401)

    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'NewPassword@1' })

    expect(newLoginRes.status).toBe(200)

    const activeTokens = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })

    expect(activeTokens).toBe(1)
  })

  it('marks token as used after reset', async () => {
    const user = await createUser()
    const token = await createResetToken(user.id)

    await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NewPassword@1',
      confirmPassword: 'NewPassword@1',
    })

    const reset = await prisma.passwordReset.findFirst({
      where: { tokenHash: hashToken(token) },
    })

    expect(reset).not.toBeNull()
    expect(reset!.usedAt).not.toBeNull()
  })

  it('returns 401 for an already-used token', async () => {
    const user = await createUser()
    const token = await createResetToken(user.id, { usedAt: new Date() })

    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NewPassword@1',
      confirmPassword: 'NewPassword@1',
    })

    const body = assertErrorResponse(res, 401)

    expect(body.error.message).toContain('already been used')
  })

  it('returns 401 for an expired token', async () => {
    const user = await createUser()
    const token = await createResetToken(user.id, {
      expiresAt: new Date(Date.now() - 1000),
    })

    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NewPassword@1',
      confirmPassword: 'NewPassword@1',
    })

    const body = assertErrorResponse(res, 401)

    expect(body.error.message).toContain('expired')
  })

  it('returns 401 for a completely fake token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'a'.repeat(64),
        password: 'NewPassword@1',
        confirmPassword: 'NewPassword@1',
      })

    expect(res.status).toBe(401)
  })

  it('validates new password strength', async () => {
    const user = await createUser()
    const token = await createResetToken(user.id)

    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'weakpassword',
      confirmPassword: 'weakpassword',
    })

    const body = assertErrorResponse(res, 400)

    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
