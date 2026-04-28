import { describe, it, expect } from 'vitest'
import {
  generateSecureToken,
  hashToken,
  safeCompare,
  getExpiryDate,
  isExpired,
} from '../../utils/token.js'

describe('generateSecureToken', () => {
  it('returns a plain token and its SHA-256 hash', () => {
    const { plain, hash } = generateSecureToken()

    expect(plain).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(hash).toHaveLength(64) // SHA-256 = 64 hex chars
    expect(plain).not.toEqual(hash) // They must be different
    expect(plain).toMatch(/^[a-f0-9]+$/) // Hex characters only
  })

  it('generates unique tokens on each call', () => {
    const { plain: a } = generateSecureToken()
    const { plain: b } = generateSecureToken()
    expect(a).not.toEqual(b)
  })

  it('hash is deterministic — same plain always produces same hash', () => {
    const { plain, hash } = generateSecureToken()
    const rehashedToken = hashToken(plain)
    expect(rehashedToken).toEqual(hash)
  })
})

describe('safeCompare', () => {
  it('returns true for identical strings', () => {
    const result = safeCompare('abc123', 'abc123')
    expect(result).toBe(true)
  })

  it('returns false for different strings of same length', () => {
    const result = safeCompare('abc123', 'xyz789')
    expect(result).toBe(false)
  })

  it('returns false for strings of different lengths', () => {
    const result = safeCompare('short', 'muchlongerstring')
    expect(result).toBe(false)
  })

  it('returns false for empty vs non-empty', () => {
    expect(safeCompare('', 'something')).toBe(false)
    expect(safeCompare('something', '')).toBe(false)
  })
})

describe('getExpiryDate', () => {
  it('returns a date in the future', () => {
    const expiry = getExpiryDate(24)
    expect(expiry.getTime()).toBeGreaterThan(Date.now())
  })

  it('is approximately 24 hours in the future', () => {
    const now = Date.now()
    const expiry = getExpiryDate(24)
    const diff = expiry.getTime() - now

    // Within 1 second of exactly 24 hours
    expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 1000)
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 1000)
  })
})

describe('isExpired', () => {
  it('returns true for dates in the past', () => {
    const pastDate = new Date(Date.now() - 1000)
    expect(isExpired(pastDate)).toBe(true)
  })

  it('returns false for dates in the future', () => {
    const futureDate = new Date(Date.now() + 60000)
    expect(isExpired(futureDate)).toBe(false)
  })
})
