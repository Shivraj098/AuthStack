import { describe, it, expect } from 'vitest'
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
} from '../../utils/jwt.js'
import { AuthenticationError } from '../../utils/error.js'

const testPayload = {
  sub: 'user-uuid-123',
  email: 'test@test.com',
  roles: ['user'],
  tokenId: 'token-uuid-456',
}

describe('Access tokens', () => {
  it('signs and verifies a valid access token', () => {
    const token = signAccessToken(testPayload)
    const decoded = verifyAccessToken(token)

    expect(decoded.sub).toBe(testPayload.sub)
    expect(decoded.email).toBe(testPayload.email)
    expect(decoded.roles).toEqual(testPayload.roles)
    expect(decoded.type).toBe('access')
  })

  it('throws AuthenticationError for a tampered token', () => {
    const token = signAccessToken(testPayload)
    const [header, signature] = token.split('.')

    // Modify the payload
    const fakePayload = Buffer.from(JSON.stringify({ sub: 'attacker', roles: ['admin'] })).toString(
      'base64url'
    )

    const tampered = `${header}.${fakePayload}.${signature}`

    expect(() => verifyAccessToken(tampered)).toThrow(AuthenticationError)
  })

  it('throws AuthenticationError for an expired token', async () => {
    // This test requires a very short expiry — test with a pre-expired token
    const jwt = await import('jsonwebtoken')
    const expiredToken = jwt.sign(
      { ...testPayload, type: 'access' },
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-minimum-32-characters-long',
      { expiresIn: '0s', issuer: 'auth-app', audience: 'auth-app-client' }
    )

    await new Promise((r) => setTimeout(r, 10)) // ensure expiry
    expect(() => verifyAccessToken(expiredToken)).toThrow(AuthenticationError)
  })

  it('throws AuthenticationError when using a refresh token as access token', () => {
    const refreshToken = signRefreshToken({
      sub: testPayload.sub,
      tokenId: testPayload.tokenId,
    })

    // Refresh token has type: "refresh" — access token verifier rejects it
    expect(() => verifyAccessToken(refreshToken)).toThrow(AuthenticationError)
  })
})

describe('Refresh tokens', () => {
  it('signs and verifies a valid refresh token', () => {
    const token = signRefreshToken({ sub: 'user-123', tokenId: 'token-456' })
    const decoded = verifyRefreshToken(token)

    expect(decoded.sub).toBe('user-123')
    expect(decoded.tokenId).toBe('token-456')
    expect(decoded.type).toBe('refresh')
  })

  it('throws when using access token as refresh token', () => {
    const accessToken = signAccessToken(testPayload)
    expect(() => verifyRefreshToken(accessToken)).toThrow(AuthenticationError)
  })
})

describe('MFA pending tokens', () => {
  it('signs and verifies a valid MFA pending token', () => {
    const token = signMfaPendingToken('user-123')
    const decoded = verifyMfaPendingToken(token)

    expect(decoded.sub).toBe('user-123')
    expect(decoded.type).toBe('mfa_pending')
  })

  it('throws when using access token as MFA pending token', () => {
    const accessToken = signAccessToken(testPayload)
    expect(() => verifyMfaPendingToken(accessToken)).toThrow(AuthenticationError)
  })
})
