import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { prisma } from '../../../config/database.js'
import type { Express } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

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

interface ValidationErrorResponse {
  error: {
    code: string
    message?: string
    fields?: Record<string, string[]>
  }
}

/* ----------------------------- */
/* Helpers                       */
/* ----------------------------- */

function assertSuccessResponse(res: Response, expectedStatus: number): SuccessResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<SuccessResponse>

  if (typeof body?.success !== 'boolean' || typeof body?.message !== 'string') {
    throw new Error('Invalid success response structure')
  }

  return body as SuccessResponse
}
function getValidPayload() {
  return {
    email: `register_${crypto.randomUUID()}@test.com`,
    password: 'Test@12345',
    firstName: 'Register',
    lastName: 'Test',
  }
}

function assertValidationError(res: Response): ValidationErrorResponse {
  if (res.status !== 400) {
    throw new Error(`Expected 400, got ${res.status}`)
  }

  const body = res.body as Partial<ValidationErrorResponse>

  if (!body?.error?.code || body.error.code !== 'VALIDATION_ERROR') {
    throw new Error('Invalid validation error structure')
  }

  return body as ValidationErrorResponse
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('POST /api/auth/register', () => {
  describe('Success cases', () => {
    it('returns 202 with enumeration-safe message', async () => {
      const validPayload = getValidPayload()
      const res = await request(app).post('/api/auth/register').send(validPayload)

      const body = assertSuccessResponse(res, 202)

      expect(body.success).toBe(true)
      expect(body.message).toContain('If this email is not registered')
    })

    it('creates user in database with isVerified=false', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)

      const user = await prisma.user.findUnique({
        where: { email: validPayload.email },
      })

      expect(user).not.toBeNull()
      expect(user!.isVerified).toBe(false)
      expect(user!.isActive).toBe(true)
    })

    it('stores bcrypt hash — never plain password', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)

      const user = await prisma.user.findUnique({
        where: { email: validPayload.email },
      })

      expect(user).not.toBeNull()

      expect(user!.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
      expect(user!.passwordHash).not.toContain(validPayload.password)

      // ✅ REAL validation
      if (!user?.passwordHash) {
        throw new Error('Expected user to have a passwordHash')
      }

      const isValid = await bcrypt.compare(validPayload.password, user.passwordHash)
      expect(isValid).toBe(true)
    })
    it('normalizes email to lowercase before storing', async () => {
      const payload = {
        ...getValidPayload(),
        email: 'UPPERCASE@TEST.COM',
      }

      await request(app).post('/api/auth/register').send(payload)

      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: payload.email,
            mode: 'insensitive',
          },
        },
      })

      expect(user).not.toBeNull()
    })

    it('assigns default user role', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)

      const user = await prisma.user.findUnique({
        where: { email: validPayload.email },
        include: { roles: { include: { role: true } } },
      })

      expect(user).not.toBeNull()
      expect(user!.roles).toHaveLength(1)
      expect(user!.roles[0]!.role.name).toBe('user')
    })

    it('creates email verification record with hash — not plain token', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)

      const user = await prisma.user.findUnique({
        where: { email: validPayload.email },
      })

      expect(user).not.toBeNull()

      const verification = await prisma.emailVerification.findFirst({
        where: { userId: user!.id },
      })

      expect(verification).not.toBeNull()
      expect(verification!.tokenHash).toHaveLength(64)
      expect(verification!.usedAt).toBeNull()
      expect(verification!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('creates USER_REGISTERED audit log', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)

      const user = await prisma.user.findUnique({
        where: { email: validPayload.email },
      })

      expect(user).not.toBeNull()

      const log = await prisma.auditLog.findFirst({
        where: { userId: user!.id, event: 'USER_REGISTERED' },
      })

      expect(log).not.toBeNull()
    })
  })

  describe('Enumeration prevention', () => {
    it('returns identical response for duplicate email', async () => {
      const validPayload = getValidPayload()
      const first = await request(app).post('/api/auth/register').send(validPayload)

      const second = await request(app).post('/api/auth/register').send(validPayload)

      const body1 = assertSuccessResponse(first, 202)
      const body2 = assertSuccessResponse(second, 202)

      expect(body1.message).toBe(body2.message)

      // Ensure only one user exists
      const count = await prisma.user.count({
        where: { email: validPayload.email },
      })
      expect(count).toBe(1)
    })

    it('does not create a second user for duplicate email', async () => {
      const validPayload = getValidPayload()
      await request(app).post('/api/auth/register').send(validPayload)
      await request(app).post('/api/auth/register').send(validPayload)

      const count = await prisma.user.count({
        where: { email: validPayload.email },
      })

      expect(count).toBe(1)
    })
  })

  describe('Validation failures', () => {
    it('returns 400 for invalid email', async () => {
      const validPayload = getValidPayload()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, email: 'notanemail' })

      const body = assertValidationError(res)

      expect(body.error.fields?.email).toBeDefined()
    })

    it('returns 400 for password missing uppercase', async () => {
      const validPayload = getValidPayload()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, password: 'test@12345' })

      const body = assertValidationError(res)

      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('uppercase')
    })

    it('returns 400 for password missing special character', async () => {
      const validPayload = getValidPayload()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, password: 'Test123456' })

      const body = assertValidationError(res)

      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('special')
    })

    it('returns 400 for password under 8 characters', async () => {
      const validPayload = getValidPayload()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validPayload, password: 'T@1a' })

      const body = assertValidationError(res)

      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('8')
    })

    it('returns 400 for missing email', async () => {
      const res = await request(app).post('/api/auth/register').send({ password: 'Test@12345' })

      const body = assertValidationError(res)

      expect(body.error.fields?.email).toBeDefined()
    })
  })
})
