import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import type { Express } from 'express'

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types                         */
/* ----------------------------- */

interface AccessTokenResponse {
  data: {
    accessToken: string
  }
}

interface MeResponse {
  data: {
    email: string
    roles: string[]
    passwordHash?: never
    deletedAt?: never
  }
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

function extractRefreshCookie(res: Response): string {
  const cookies = res.headers['set-cookie'] as string[] | undefined

  if (!cookies || cookies.length === 0) {
    throw new Error('Missing set-cookie header')
  }

  const cookie = cookies
    .map((c) => c.split(';')[0])
    .find((c): c is string => c !== undefined && c.startsWith('refreshToken='))

  if (!cookie) {
    throw new Error('refreshToken cookie not found')
  }

  return cookie.replace('refreshToken=', '')
}

function assertAccessToken(res: Response): AccessTokenResponse {
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`)
  }

  const body = res.body as Partial<AccessTokenResponse>

  if (!body?.data?.accessToken) {
    throw new Error('Missing access token in response')
  }

  return body as AccessTokenResponse
}

function assertError(res: Response, expectedStatus: number): ErrorResponse {
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`)
  }

  const body = res.body as Partial<ErrorResponse>

  if (!body?.error?.message) {
    throw new Error('Invalid error response')
  }

  return body as ErrorResponse
}

function assertMeResponse(res: Response): MeResponse {
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}`)
  }

  const body = res.body as Partial<MeResponse>

  if (!body?.data?.email || !Array.isArray(body.data.roles)) {
    throw new Error('Invalid /me response')
  }

  return body as MeResponse
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('POST /api/auth/refresh', () => {
  it('issues a new access token and rotates refresh token', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const oldCookie = extractRefreshCookie(loginRes)

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${oldCookie}; Path=/api/auth`)

    const refreshBody = assertAccessToken(refreshRes)

    expect(refreshBody.data.accessToken).toBeDefined()

    const newCookie = extractRefreshCookie(refreshRes)

    expect(newCookie).not.toBe(oldCookie)
    expect(newCookie.length).toBeGreaterThan(0)
  })

  it('old refresh token is revoked after rotation', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const oldCookie = extractRefreshCookie(loginRes)

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${oldCookie}; Path=/api/auth`)

    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${oldCookie}; Path=/api/auth`)

    assertError(replayRes, 401)
  })

  it('detects token reuse and revokes all sessions', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const stolenCookie = extractRefreshCookie(loginRes)

    const victimRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${stolenCookie}; Path=/api/auth`)

    expect(victimRefresh.status).toBe(200)

    const attackRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${stolenCookie}; Path=/api/auth`)

    const body = assertError(attackRes, 401)

    expect(body.error.message).toContain('suspicious activity')

    const activeTokens = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })

    expect(activeTokens).toBe(0)
  })

  it('returns 401 with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')
    assertError(res, 401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears refresh token cookie', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const cookie = extractRefreshCookie(loginRes)

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refreshToken=${cookie}; Path=/api/auth`)

    expect(logoutRes.status).toBe(200)

    const setCookies = logoutRes.headers['set-cookie'] as string[] | undefined

    if (!setCookies) {
      throw new Error('Missing set-cookie header on logout')
    }

    const clearedCookie = setCookies.find((c) => c.startsWith('refreshToken='))

    if (!clearedCookie) {
      throw new Error('Refresh cookie not cleared')
    }

    expect(clearedCookie).toMatch(/refreshToken=;|Max-Age=0/)
  })

  it('blacklists access token', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const loginBody = assertAccessToken(loginRes)
    const cookie = extractRefreshCookie(loginRes)

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refreshToken=${cookie}; Path=/api/auth`)
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)

    const body = assertError(meRes, 401)

    expect(body.error.message).toContain('revoked')
  })

  it('revokes refresh token in DB', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const cookie = extractRefreshCookie(loginRes)

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refreshToken=${cookie}; Path=/api/auth`)

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { userId: user.id },
    })

    expect(tokenRecord).not.toBeNull()
    expect(tokenRecord!.revokedAt).not.toBeNull()
  })

  it('logout succeeds without cookie', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user data for valid token', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const loginBody = assertAccessToken(loginRes)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)

    const body = assertMeResponse(res)

    expect(body.data.email).toBe(user.email)
    expect(body.data.roles).toContain('user')

    expect(body.data.passwordHash).toBeUndefined()
    expect(body.data.deletedAt).toBeUndefined()
  })

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me')

    const body = assertError(res, 401)

    expect(body.error.code).toBe('AUTHENTICATION_ERROR')
  })

  it('returns 401 for malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt')

    assertError(res, 401)
  })

  it('returns 401 for tampered token', async () => {
    const user = await createUser()

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const loginBody = assertAccessToken(loginRes)
    const token = loginBody.data.accessToken

    const [header, , signature] = token.split('.')

    if (!header || !signature) {
      throw new Error('Invalid token structure')
    }

    const fakePayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', roles: ['admin'], type: 'access' })
    ).toString('base64url')

    const tampered = `${header}.${fakePayload}.${signature}`

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)

    assertError(res, 401)
  })
})
