import { describe, it, expect, beforeAll } from 'vitest'
import request, { Response } from 'supertest'
import { createTestApp } from '../../helpers/app.helpers.js'
import { createUser, createAdminUser } from '../../factories/user.factories.js'
import { prisma } from '../../../config/database.js'
import type { Express } from 'express'

let app: Express

beforeAll(() => {
  app = createTestApp()
})

/* ----------------------------- */
/* Types (STRICT CONTRACTS)      */
/* ----------------------------- */

interface LoginResponse {
  data: {
    accessToken: string
  }
}

interface AdminUsersResponse {
  data: {
    users: unknown[]
    pagination: unknown
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
    throw new Error(`Login failed with status ${res.status}`)
  }

  const body = res.body as Partial<LoginResponse>

  if (!body?.data?.accessToken) {
    throw new Error('Invalid login response: accessToken missing')
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

function assertAdminUsersResponse(res: Response): AdminUsersResponse {
  if (res.status !== 200) {
    throw new Error(`Expected 200 but got ${res.status}`)
  }

  const body = res.body as Partial<AdminUsersResponse>

  if (!body?.data?.users || !body?.data?.pagination) {
    throw new Error('Invalid admin users response')
  }

  return body as AdminUsersResponse
}

async function loginAs(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password })

  const body = assertLoginResponse(res)

  return body.data.accessToken
}

/* ----------------------------- */
/* Tests                         */
/* ----------------------------- */

describe('Admin routes — role enforcement', () => {
  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/users')

    const body = assertErrorResponse(res, 401)

    expect(body.error.code).toBe('AUTHENTICATION_ERROR')
  })

  it('rejects user-role request with 403', async () => {
    const user = await createUser()
    const token = await loginAs(user.email, user.plainPassword)

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`)

    const body = assertErrorResponse(res, 403)

    expect(body.error.code).toBe('AUTHORIZATION_ERROR')
    expect(body.error.message).toContain('admin')
  })

  it('allows admin-role request with 200', async () => {
    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`)

    const body = assertAdminUsersResponse(res)

    expect(body.data.users).toBeDefined()
    expect(body.data.pagination).toBeDefined()
  })

  it('paginated user list never includes passwordHash', async () => {
    await createUser()
    await createUser({ email: 'second@test.com' })

    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`)

    const bodyStr = JSON.stringify(res.body)

    expect(bodyStr).not.toContain('passwordHash')
    expect(bodyStr).not.toContain('$2b$')
  })
})

describe('Role assignment', () => {
  it('admin can assign a role to a user', async () => {
    const user = await createUser()
    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'moderator' })

    expect(res.status).toBe(200)

    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    })

    const roleNames = userRoles.map((ur) => ur.role.name)

    expect(roleNames).toContain('moderator')
  })

  it('returns 409 when assigning duplicate role', async () => {
    const user = await createUser()
    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'user' })

    const body = assertErrorResponse(res, 409)

    expect(body.error.code).toBe('CONFLICT')
  })

  it('returns 400 when removing last role', async () => {
    const user = await createUser()
    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app)
      .delete(`/api/admin/users/${user.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'user' })

    const body = assertErrorResponse(res, 400)

    expect(body.error.code).toBe('LAST_ROLE')
  })

  it('admin cannot deactivate themselves', async () => {
    const admin = await createAdminUser()
    const token = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app)
      .patch(`/api/admin/users/${admin.id}/toggle-active`)
      .set('Authorization', `Bearer ${token}`)

    const body = assertErrorResponse(res, 400)

    expect(body.error.message).toContain('own account')
  })

  it('deactivating user revokes their active sessions', async () => {
    const user = await createUser()
    const admin = await createAdminUser()

    // Create active session
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.plainPassword })

    const adminToken = await loginAs(admin.email, admin.plainPassword)

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}/toggle-active`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)

    const activeTokens = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })

    expect(activeTokens).toBe(0)
  })
})
