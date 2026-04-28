import bcrypt from 'bcrypt'
import request from 'supertest'
import { prisma } from '../../config/database.js'
import type { User } from '@prisma/client'
import type { Express } from 'express'
import crypto from 'crypto'
interface CreateUserOptions {
  email?: string
  password?: string
  firstName?: string
  lastName?: string
  isVerified?: boolean
  isActive?: boolean
  role?: 'admin' | 'user' | 'moderator'
}

export interface LoginResponse {
  data: {
    accessToken: string
  }
}

interface AuthenticatedUser {
  user: User & { plainPassword: string }
  accessToken: string
  refreshToken: string
}

// Creates a verified, active user with the given role
// Mirrors what the seed script does — consistent test baseline
export async function createUser(
  options: CreateUserOptions = {}
): Promise<User & { plainPassword: string }> {
  const {
    email = `testuser_${crypto.randomUUID()}@test.com`,
    password = 'Test@12345',
    firstName = 'Test',
    lastName = 'User',
    isVerified = true,
    isActive = true,
    role = 'user',
  } = options

  const passwordHash = await bcrypt.hash(password, 10)
  // Cost 10 in tests — cost 12 is correct for production
  // but adds 200ms per test. With 50 tests that use users,
  // that's 10 extra seconds. Cost 10 is still secure for test data.

  const roleRecord = await prisma.role.findUnique({
    where: { name: role },
    select: { id: true },
  })

  if (!roleRecord) throw new Error(`Role '${role}' not found — was beforeEach seed skipped?`)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      isVerified,
      isActive,
      roles: {
        create: { roleId: roleRecord.id },
      },
    },
  })

  return { ...user, plainPassword: password }
}

export async function createAdminUser(
  options: Omit<CreateUserOptions, 'role'> = {}
): Promise<User & { plainPassword: string }> {
  return createUser({
    ...options,
    role: 'admin',
    email: options.email ?? `admin_${Date.now()}@test.com`,
  })
}

// Creates a user and returns their login tokens
// Useful for tests that need an authenticated starting state
export async function createAuthenticatedUser(
  app: Express,
  options: CreateUserOptions = {}
): Promise<AuthenticatedUser> {
  const user = await createUser(options)

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.plainPassword })
  const body = res.body as LoginResponse
  const accessToken = body.data?.accessToken
  const rawCookies = res.headers['set-cookie'] as string[] | undefined
  const refreshCookie = rawCookies?.find((c) => c.startsWith('refreshToken'))
  const refreshToken =
    refreshCookie
      ?.split(';')
      .find((part) => part.startsWith('refreshToken='))
      ?.replace('refreshToken=', '') ?? ''

  return { user, accessToken, refreshToken }
}
