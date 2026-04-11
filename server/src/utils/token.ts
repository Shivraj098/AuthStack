import crypto from 'crypto'

// Generates a cryptographically secure random token
// Returns both the plain token (for the email) and
// the hash (for the database)
export function generateSecureToken(bytes = 32): {
  plain: string
  hash: string
} {
  const plain = crypto.randomBytes(bytes).toString('hex')
  const hash = hashToken(plain)
  return { plain, hash }
}

// One-way hash of a plain token for database storage
// SHA-256 is appropriate here — tokens are already
// high-entropy random bytes, so slowness (bcrypt) is
// unnecessary. We just need one-way irreversibility.
export function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

// Timing-safe comparison prevents timing attacks.
// A normal string comparison (===) returns false faster
// when the first character differs than when the last does.
// An attacker can measure response times to guess tokens
// one character at a time. timingSafeEqual takes the same
// time regardless of where strings differ.
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// Token expiry helpers
export function getExpiryDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

export function isExpired(date: Date): boolean {
  return date < new Date()
}
