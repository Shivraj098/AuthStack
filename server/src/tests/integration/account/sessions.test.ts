import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import type { Express } from 'express'
import { randomUUID } from 'crypto'

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types (STRICT API CONTRACTS)  */
/* ----------------------------- */

interface LoginResponse {
  data: {
    accessToken: string
  }
}

interface SessionsResponse {
  data: { id: string }[]
}

interface ErrorResponse {
  error: {
    message: string
  }
}

/* ----------------------------- */
/* Helpers                       */
/* ----------------------------- */

function extractRefreshToken(setCookieHeader?: string[]): string {
  if (!setCookieHeader || setCookieHeader.length === 0) {
    throw new Error('Missing set-cookie header')
  }

  const cookie = setCookieHeader
    .map((c) => c.split(';')[0])
    .find((c): c is string => c !== undefined && c.startsWith('refreshToken='))

  if (!cookie) {
    throw new Error('refreshToken cookie not found')
  }

  return cookie.replace('refreshToken=', '')
}

function assertLoginResponse(res: Response): LoginResponse {
  if (res.status !== 200) {
    throw new Error(`Login failed with status ${res.status}`)
  }

  const body = res.body as Partial<LoginResponse>

  if (!body?.data?.accessToken) {
    throw new Error('Invalid login response: accessToken missing')
  }

  return body as LoginResponse
}

function assertSessionsResponse(res: Response): SessionsResponse {
  if (res.status !== 200) {
    throw new Error(`Expected 200 but got ${res.status}`)
  }

  const body = res.body as Partial<SessionsResponse>

  if (!Array.isArray(body?.data)) {
    throw new Error('Invalid sessions response')
  }

  return body as SessionsResponse
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

async function loginUser(user: { email: string; plainPassword: string }) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.plainPassword })

  const body = assertLoginResponse(res)
  const refreshToken = extractRefreshToken(res.headers['set-cookie'] as string[] | undefined)

  return {
    token: body.data.accessToken,
    refreshToken,
  }
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('GET /api/account/sessions', () => {
  it('returns only current user sessions', async () => {
    const user1 = await createUser()
    const user2 = await createUser({
      email: `user2_${randomUUID()}@test.com`,
    })

    await loginUser(user1)
    await loginUser(user2)
    const { token } = await loginUser(user1)

    const res = await request(app)
      .get('/api/account/sessions')
      .set('Authorization', `Bearer ${token}`)

    const body = assertSessionsResponse(res)

    expect(body.data.length).toBeGreaterThan(0)

    const ids = body.data.map((s) => s.id)

    const records = await prisma.refreshToken.findMany({
      where: { id: { in: ids } },
      select: { userId: true },
    })

    expect(records).toHaveLength(ids.length)
    expect(records.every((r) => r.userId === user1.id)).toBe(true)
  })

  it('does not return revoked sessions', async () => {
    const user = await createUser()

    const { refreshToken } = await loginUser(user)

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refreshToken=${refreshToken}; Path=/api/auth`)

    expect(logoutRes.status).toBe(200)

    const { token } = await loginUser(user)

    const res = await request(app)
      .get('/api/account/sessions')
      .set('Authorization', `Bearer ${token}`)

    const body = assertSessionsResponse(res)

    expect(body.data).toHaveLength(1)
  })
})

describe('DELETE /api/account/sessions/:id', () => {
  it('revokes own session', async () => {
    const user = await createUser()
    const { token } = await loginUser(user)

    const sessionsRes = await request(app)
      .get('/api/account/sessions')
      .set('Authorization', `Bearer ${token}`)

    const sessions = assertSessionsResponse(sessionsRes)

    const sessionId = sessions.data[0]?.id
    if (!sessionId) throw new Error('No session found')

    const { token: token2 } = await loginUser(user)

    const res = await request(app)
      .delete(`/api/account/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token2}`)

    expect(res.status).toBe(200)

    const record = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    })

    expect(record?.revokedAt).not.toBeNull()
  })

  it('cannot revoke another user session', async () => {
    const user1 = await createUser()
    const user2 = await createUser({
      email: `user2_${randomUUID()}@test.com`,
    })

    const { token } = await loginUser(user1)
    await loginUser(user2)

    const user2Session = await prisma.refreshToken.findFirst({
      where: { userId: user2.id, revokedAt: null },
    })

    if (!user2Session) throw new Error('User2 has no session')

    const res = await request(app)
      .delete(`/api/account/sessions/${user2Session.id}`)
      .set('Authorization', `Bearer ${token}`)

    const body = assertErrorResponse(res, 403)

    expect(body.error.message).toContain('Cannot revoke')
  })
})

describe('POST /api/account/change-password', () => {
  it('changes password and revokes sessions', async () => {
    const user = await createUser()
    const { token } = await loginUser(user)

    await loginUser(user)

    const res = await request(app)
      .post('/api/account/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: user.plainPassword,
        newPassword: 'NewPassword@1',
      })

    expect(res.status).toBe(200)

    const active = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })

    expect(active).toBe(0)

    const oldLogin = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: user.plainPassword,
    })

    expect(oldLogin.status).toBe(401)
  })

  it('rejects wrong current password', async () => {
    const user = await createUser()
    const { token } = await loginUser(user)

    const res = await request(app)
      .post('/api/account/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'WrongPassword@1',
        newPassword: 'NewPassword@1',
      })

    const body = assertErrorResponse(res, 403)

    expect(body.error.message).toContain('Incorrect password')
  })
})
