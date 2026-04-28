import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import { redisClient } from '../../../config/redis.js'
import type { Express } from 'express'
import { Buffer } from 'node:buffer'

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types                         */
/* ----------------------------- */

interface LoginResponse {
  data: {
    accessToken: string
    mfaRequired: boolean
    user: {
      email: string
      roles: string[]
    }
  }
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

function assertLoginResponse(res: Response): LoginResponse {
  if (res.status !== 200) {
    throw new Error(`Expected 200 but got ${res.status}`)
  }

  const body = res.body as Partial<LoginResponse>

  if (
    !body?.data?.accessToken ||
    typeof body.data.mfaRequired !== 'boolean' ||
    !body.data.user?.email
  ) {
    throw new Error('Invalid login response structure')
  }

  return body as LoginResponse
}

function assertErrorResponse(res: Response, expectedStatus: number): ErrorResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<ErrorResponse>

  if (!body?.error?.code || !body?.error?.message) {
    throw new Error('Invalid error response structure')
  }

  return body as ErrorResponse
}

function extractRefreshCookie(res: Response): string {
  const cookies = res.headers['set-cookie'] as string[] | undefined

  if (!cookies || cookies.length === 0) {
    throw new Error('Missing set-cookie header')
  }

  const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='))

  if (!refreshCookie) {
    throw new Error('refreshToken cookie not found')
  }

  return refreshCookie // IMPORTANT: return FULL cookie
}

function decodeJwtPayload(token: string) {
  const parts = token.split('.')

  if (parts.length !== 3 || !parts[1]) {
    throw new Error('Invalid JWT format')
  }

  return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, string>
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('POST /api/auth/login', () => {
  describe('Success cases', () => {
    it('returns tokens and correct response structure', async () => {
      const user = await createUser()

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const body = assertLoginResponse(res)

      expect(body.data.accessToken).toBeDefined()
      expect(body.data.mfaRequired).toBe(false)
      expect(body.data.user.email).toBe(user.email)
      expect(body.data.user.roles).toContain('user')

      const refreshCookie = extractRefreshCookie(res)

      expect(refreshCookie).toContain('HttpOnly')
      expect(refreshCookie).toContain('SameSite=Strict')
      expect(refreshCookie).toContain('Path=/api/auth')
    })

    it('access token payload is correct', async () => {
      const user = await createUser()

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const body = assertLoginResponse(res)

      const payload = decodeJwtPayload(body.data.accessToken)

      expect(payload.sub).toBe(user.id)
      expect(payload.email).toBe(user.email)
      expect(payload.roles).toContain('user')
      expect(payload.type).toBe('access')
      expect(payload.tokenId).toBeDefined()
    })

    it('stores hashed refresh token in database', async () => {
      const user = await createUser()

      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: user.id },
      })

      expect(tokenRecord).not.toBeNull()
      expect(tokenRecord!.tokenHash).toHaveLength(64)
      expect(tokenRecord!.revokedAt).toBeNull()
    })

    it('creates USER_LOGIN audit log', async () => {
      const user = await createUser()

      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const log = await prisma.auditLog.findFirst({
        where: { userId: user.id, event: 'USER_LOGIN' },
      })

      expect(log).not.toBeNull()
    })

    it('response never leaks sensitive fields', async () => {
      const user = await createUser()

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const str = JSON.stringify(res.body)

      expect(str).not.toContain('passwordHash')
      expect(str).not.toContain('$2b$')
    })
  })

  describe('Failure cases', () => {
    it('rejects wrong password', async () => {
      const user = await createUser()

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPass@1' })

      const body = assertErrorResponse(res, 401)

      expect(body.error.code).toBe('AUTHENTICATION_ERROR')
      expect(body.error.message).toContain('Invalid email or password')
    })

    it('rejects non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'Test@12345' })

      const body = assertErrorResponse(res, 401)

      expect(body.error.message).toContain('Invalid email or password')
    })

    it('rejects unverified user', async () => {
      const user = await createUser({ isVerified: false })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const body = assertErrorResponse(res, 401)

      expect(body.error.message).toContain('verify your email')
    })

    it('rejects deactivated user', async () => {
      const user = await createUser({ isActive: false })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const body = assertErrorResponse(res, 401)

      expect(body.error.message).toContain('deactivated')
    })

    it('decrements remaining attempts on wrong password', async () => {
      const user = await createUser()

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Wrong@1234' })

      const body = assertErrorResponse(res, 401)

      expect(body.error.message).toContain('attempts remaining')
    })

    it('locks account after repeated failures', async () => {
      const user = await createUser()

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: user.email, password: 'WrongPass@1' })
      }

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.plainPassword })

      const body = assertErrorResponse(res, 429)

      expect(body.error.code).toBe('ACCOUNT_LOCKED')

      const lockKey = await redisClient.get(`lockout:${user.email}`)
      expect(lockKey).toBe('1')
    })

    it('validates missing credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({})

      const body = assertErrorResponse(res, 400)

      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
