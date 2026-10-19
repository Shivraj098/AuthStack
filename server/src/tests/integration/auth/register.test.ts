import bcrypt from 'bcrypt'
import { randomUUID } from 'node:crypto'
import type { Express } from 'express'
import request from 'supertest'
import type { Response } from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../config/database.js'
import { emailService } from '../../../services/email.service.js'
import { createTestApp } from '../../helpers/app.helpers.js'

let app: Express

interface RegistrationPayload {
  email: string
  password: string
  firstName: string
  lastName: string
}

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

/**
 * Validates that an unknown value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates the field-error structure returned by the API.
 */
function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  if (!isRecord(value)) {
    return false
  }

  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string')
  )
}

/**
 * Narrows nullable database results after checking their existence.
 */
function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}

/**
 * Validates the successful registration response contract.
 */
function assertSuccessResponse(res: Response, expectedStatus: number): SuccessResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, received ${res.status}`)
  }

  const body: unknown = res.body

  if (!isRecord(body)) {
    throw new Error('Invalid success response: expected an object')
  }

  const success = body.success
  const message = body.message

  if (typeof success !== 'boolean' || typeof message !== 'string') {
    throw new Error('Invalid success response structure')
  }

  return { success, message }
}

/**
 * Validates the API's standard validation-error response.
 */
function assertValidationError(res: Response): ValidationErrorResponse {
  if (res.status !== 400) {
    throw new Error(`Expected status 400, received ${res.status}`)
  }

  const body: unknown = res.body

  if (!isRecord(body) || !isRecord(body.error)) {
    throw new Error('Invalid validation error response structure')
  }

  const error = body.error

  if (error.code !== 'VALIDATION_ERROR') {
    throw new Error('Expected VALIDATION_ERROR response code')
  }

  const result: ValidationErrorResponse['error'] = {
    code: 'VALIDATION_ERROR',
  }

  if (typeof error.message === 'string') {
    result.message = error.message
  }

  if (isStringArrayRecord(error.fields)) {
    result.fields = error.fields
  }

  return { error: result }
}

function getValidPayload(): RegistrationPayload {
  return {
    email: `register_${randomUUID()}@test.com`,
    password: 'Test@12345',
    firstName: 'Register',
    lastName: 'Test',
  }
}

/**
 * Submits a registration request and verifies the successful
 * response contract before a test inspects persisted data.
 */
async function registerSuccessfully(payload: RegistrationPayload): Promise<Response> {
  const res = await request(app).post('/api/auth/register').send(payload)

  assertSuccessResponse(res, 202)

  return res
}

// This spy ensures the registration test never invokes the real
// verification-email implementation, even if the shared test mock
// has not been configured correctly.
const sendVerificationEmailSpy = vi
  .spyOn(emailService, 'sendVerificationEmail')
  .mockResolvedValue(undefined)

beforeAll(() => {
  app = createTestApp()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/register', () => {
  describe('Successful registration', () => {
    it('returns 202 with an enumeration-safe message', async () => {
      const payload = getValidPayload()

      const res = await registerSuccessfully(payload)
      const body = assertSuccessResponse(res, 202)

      expect(body.success).toBe(true)
      expect(body.message).toContain('If this email is not registered')
    })

    it('creates an active user whose email is not verified', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: payload.email },
      })

      assertDefined(user, 'Expected registration to create a user')

      expect(user.isVerified).toBe(false)
      expect(user.isActive).toBe(true)
    })

    it('stores a bcrypt hash rather than the plain-text password', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: payload.email },
      })

      assertDefined(user, 'Expected registration to create a user')

      const passwordHash = user.passwordHash

      if (typeof passwordHash !== 'string') {
        throw new Error('Expected a password hash for a password-registered user')
      }

      expect(passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
      expect(passwordHash).not.toContain(payload.password)

      const isValid = await bcrypt.compare(payload.password, passwordHash)

      expect(isValid).toBe(true)
    })

    it('normalizes the email address to lowercase before storing', async () => {
      const payload: RegistrationPayload = {
        ...getValidPayload(),
        email: getValidPayload().email.toUpperCase(),
      }

      const normalizedEmail = payload.email.toLowerCase()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      assertDefined(user, 'Expected the normalized email address to be stored')

      expect(user.email).toBe(normalizedEmail)
    })

    it('assigns the default user role', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: payload.email },
        include: {
          roles: {
            include: { role: true },
          },
        },
      })

      assertDefined(user, 'Expected registration to create a user')

      expect(user.roles).toHaveLength(1)

      const roleAssignment = user.roles[0]

      assertDefined(roleAssignment, 'Expected the new user to have a role assignment')

      expect(roleAssignment.role.name).toBe('user')
    })

    it('creates a hashed, unused email-verification record', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: payload.email },
      })

      assertDefined(user, 'Expected registration to create a user')

      const verification = await prisma.emailVerification.findFirst({
        where: { userId: user.id },
      })

      assertDefined(verification, 'Expected an email-verification record')

      expect(verification.tokenHash).toHaveLength(64)
      expect(verification.usedAt).toBeNull()
      expect(verification.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('creates a USER_REGISTERED audit log', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      const user = await prisma.user.findUnique({
        where: { email: payload.email },
      })

      assertDefined(user, 'Expected registration to create a user')

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          event: 'USER_REGISTERED',
        },
      })

      expect(auditLog).not.toBeNull()
    })

    it('requests verification email delivery through the email service', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)

      expect(sendVerificationEmailSpy).toHaveBeenCalledWith(
        payload.email,
        expect.any(String),
        payload.firstName
      )
    })
  })

  describe('Enumeration prevention', () => {
    it('returns the same message for a duplicate email', async () => {
      const payload = getValidPayload()

      const first = await registerSuccessfully(payload)
      const second = await registerSuccessfully(payload)

      const firstBody = assertSuccessResponse(first, 202)
      const secondBody = assertSuccessResponse(second, 202)

      expect(secondBody.message).toBe(firstBody.message)

      const count = await prisma.user.count({
        where: { email: payload.email },
      })

      expect(count).toBe(1)
    })

    it('does not create a second user for a duplicate email', async () => {
      const payload = getValidPayload()

      await registerSuccessfully(payload)
      await registerSuccessfully(payload)

      const count = await prisma.user.count({
        where: { email: payload.email },
      })

      expect(count).toBe(1)
    })
  })

  describe('Validation failures', () => {
    it('returns 400 for an invalid email address', async () => {
      const payload = {
        ...getValidPayload(),
        email: 'notanemail',
      }

      const res = await request(app).post('/api/auth/register').send(payload)

      const body = assertValidationError(res)

      expect(body.error.fields?.email).toBeDefined()
    })

    it('returns 400 for a password missing an uppercase letter', async () => {
      const payload = {
        ...getValidPayload(),
        password: 'test@12345',
      }

      const res = await request(app).post('/api/auth/register').send(payload)

      const body = assertValidationError(res)
      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('uppercase')
    })

    it('returns 400 for a password missing a special character', async () => {
      const payload = {
        ...getValidPayload(),
        password: 'Test123456',
      }

      const res = await request(app).post('/api/auth/register').send(payload)

      const body = assertValidationError(res)
      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('special')
    })

    it('returns 400 for a password shorter than eight characters', async () => {
      const payload = {
        ...getValidPayload(),
        password: 'T@1a',
      }

      const res = await request(app).post('/api/auth/register').send(payload)

      const body = assertValidationError(res)
      const passwordErrors = body.error.fields?.password

      if (!passwordErrors || passwordErrors.length === 0) {
        throw new Error('Expected password validation errors')
      }

      expect(passwordErrors[0]).toContain('8')
    })

    it('returns 400 when the email address is missing', async () => {
      const res = await request(app).post('/api/auth/register').send({ password: 'Test@12345' })

      const body = assertValidationError(res)

      expect(body.error.fields?.email).toBeDefined()
    })
  })
})
