import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import crypto from 'crypto'

import { prisma } from '../config/database.js'
import { redisClient } from '../config/redis.js'

import { emailService } from './email.service.js'
import { mfaService } from './mfa.service.js'

import {
  recordFailedAttempt,
  isLockedOut,
  clearFailedAttempts,
  getRemainingLockoutSeconds,
} from '../utils/lockout.js'

import { generateSecureToken, hashToken, getExpiryDate, isExpired } from '../utils/token.js'
import { verifyAccessToken, verifyMfaPendingToken } from '../utils/jwt.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signMfaPendingToken,
} from '../utils/jwt.js'

import { AuthenticationError, AppError } from '../utils/error.js'
import type {
  RegisterInput,
  ResendVerificationInput,
  LoginInput,
} from '../validators/auth.schema.js'

const BCRYPT_ROUNDS = 12
const EMAIL_VERIFY_EXPIRY_HOURS = 24
const MAX_ATTEMPTS = 5
const DUMMY_HASH = '$2b$12$invalidhashplaceholderfortiming00000000000000000'

class AuthService {
  // ─── Registration ──────────────────────────────────────────────
  async register(input: RegisterInput): Promise<{ message: string }> {
    const { email, password, firstName, lastName } = input

    // Check if email already exists
    // IMPORTANT: we do NOT throw a ConflictError here because
    // that would let attackers discover registered emails.
    // Instead we proceed as if registration succeeded.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (!existingUser) {
      // Hash password — this takes ~250ms intentionally
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

      // Get the default 'user' role
      const userRole = await prisma.role.findUnique({
        where: { name: 'user' },
        select: { id: true },
      })

      if (!userRole) {
        throw new AppError('Default role not found', 500, 'SETUP_ERROR', false)
      }

      // Create user and assign role in a transaction
      // Either both succeed or neither does — no orphaned records
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            roles: {
              create: { roleId: userRole.id },
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
          },
        })

        // Generate verification token
        const { plain, hash } = generateSecureToken()

        await tx.emailVerification.create({
          data: {
            userId: newUser.id,
            tokenHash: hash,
            expiresAt: getExpiryDate(EMAIL_VERIFY_EXPIRY_HOURS),
          },
        })

        return { newUser, verificationToken: plain }
      })

      // Send email OUTSIDE the transaction
      // Why? If the email fails, we don't want to roll back the
      // user creation. The user can request a resend.
      try {
        await emailService.sendVerificationEmail(
          email,
          user.verificationToken,
          user.newUser.firstName ?? undefined
        )
      } catch (error) {
        // Email sending failed, but user registration succeeded
        // User can request a resend verification email
        console.error('Verification email failed to send:', error)
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: user.newUser.id,
          event: 'USER_REGISTERED',
          metadata: { email },
        },
      })
    } else {
      // User exists — we still hash a dummy password to consume
      // the same ~250ms. Without this, attackers can distinguish
      // "email exists" (fast response) from "email is new"
      // (slow response due to bcrypt) purely by timing.
      await bcrypt.hash(password, DUMMY_HASH)
    }

    // Always return the same message regardless of path taken
    return {
      message: 'If this email is not registered, you will receive a verification link shortly.',
    }
  }

  // ─── Email Verification ────────────────────────────────────────
  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = hashToken(token)

    const verification = await prisma.emailVerification.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, isVerified: true } } },
    })

    if (!verification) {
      throw new AuthenticationError('Invalid or expired verification token')
    }

    if (verification.usedAt) {
      throw new AuthenticationError('This verification link has already been used')
    }

    if (isExpired(verification.expiresAt)) {
      throw new AuthenticationError('This verification link has expired')
    }

    if (verification.user.isVerified) {
      // Already verified — not an error, just inform them
      return { message: 'Email already verified. You can sign in.' }
    }

    // Mark token as used and verify user atomically
    await prisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      })
      await tx.user.update({
        where: { id: verification.user.id },
        data: { isVerified: true },
      })
    })
    await prisma.auditLog.create({
      data: {
        userId: verification.user.id,
        event: 'EMAIL_VERIFIED',
      },
    })

    return { message: 'Email verified successfully. You can now sign in.' }
  }

  // ─── Resend Verification ───────────────────────────────────────
  async resendVerification(input: ResendVerificationInput): Promise<{ message: string }> {
    const { email } = input
    const RESEND_SAME_MESSAGE =
      'If your email is registered and unverified, a new link has been sent.'

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isVerified: true, firstName: true },
    })

    // Enumeration prevention — same message every time
    if (!user || user.isVerified) {
      return { message: RESEND_SAME_MESSAGE }
    }

    // Invalidate any existing unused tokens for this user
    // Prevents token accumulation — only one valid token at a time
    await prisma.emailVerification.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    })

    const { plain, hash } = generateSecureToken()

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: getExpiryDate(EMAIL_VERIFY_EXPIRY_HOURS),
      },
    })

    await emailService.sendVerificationEmail(email, plain, user.firstName ?? undefined)

    return { message: RESEND_SAME_MESSAGE }
  }

  // ─── Login ─────────────────────────────────────────────────────
  async login(
    input: LoginInput,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{
    mfaRequired: boolean
    mfaPendingToken: string | null
    accessToken: string | null
    refreshToken: string | null
    user: { id: string; email: string; firstName: string | null; roles: string[] } | null
  }> {
    const { email, password } = input

    // Check lockout FIRST — before any database query
    // This means locked-out users don't even hit the DB
    if (await isLockedOut(email)) {
      const remaining = await getRemainingLockoutSeconds(email)
      throw new AppError(
        `Account temporarily locked. Try again in ${Math.ceil(remaining / 60)} minutes.`,
        429,
        'ACCOUNT_LOCKED'
      )
    }

    // Find user — select only what we need, never select *
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        passwordHash: true,
        isVerified: true,
        isActive: true,
        roles: {
          select: {
            role: { select: { name: true } },
          },
        },
      },
    })

    // User not found — still do bcrypt compare to prevent timing attacks
    // An attacker cannot distinguish "wrong email" from "wrong password"
    // because both take the same ~250ms
    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, DUMMY_HASH)
      await recordFailedAttempt(email)
      throw new AuthenticationError('Invalid email or password')
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)

    if (!passwordValid) {
      const attempts = await recordFailedAttempt(email)
      const remaining = MAX_ATTEMPTS - attempts

      if (remaining <= 0) {
        throw new AppError(
          'Too many failed attempts. Account locked for 15 minutes.',
          429,
          'ACCOUNT_LOCKED'
        )
      }

      throw new AuthenticationError(
        `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      )
    }

    if (!user.isVerified) {
      throw new AuthenticationError('Please verify your email address before signing in.')
    }

    if (!user.isActive) {
      throw new AuthenticationError('This account has been deactivated.')
    }

    // Successful login — clear failed attempts
    await clearFailedAttempts(email)

    const roles = user.roles.map((ur) => ur.role.name)

    // ✅ MFA CHECK
    const mfaStatus = await mfaService.getStatus(user.id)

    if (mfaStatus.isEnabled) {
      const mfaPendingToken = signMfaPendingToken(user.id)

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          event: 'USER_LOGIN_MFA_REQUIRED',
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      })

      return {
        mfaRequired: true,
        mfaPendingToken,
        accessToken: null,
        refreshToken: null,
        user: null,
      }
    }

    // ✅ NORMAL LOGIN FLOW
    const tokenId = randomUUID()

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      tokenId,
    })

    const refreshToken = signRefreshToken({
      sub: user.id,
      tokenId,
    })

    const refreshTokenHash = hashToken(refreshToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // ✅ TRANSACTION FIX
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash: refreshTokenHash,
          deviceInfo: meta.userAgent ?? null,
          ipAddress: meta.ip ?? null,
          expiresAt,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: user.id,
          event: 'USER_LOGIN',
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          metadata: { email },
        },
      })
    })

    return {
      mfaRequired: false,
      mfaPendingToken: null,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        roles,
      },
    }
  }

  // ─── Forgot Password ───────────────────────────────────────────
  async forgotPassword(email: string): Promise<void> {
    const EXPIRY_HOURS = 1

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, passwordHash: true },
    })

    // Always take the same code path to prevent timing-based
    // enumeration — attacker cannot distinguish existing from
    // non-existing email by measuring response time
    if (!user || !user.passwordHash) {
      // For non-existent users we still run the exact same work as real users
      // except we skip the email send and token creation.
      // This eliminates the timing difference.
      await new Promise((resolve) => setTimeout(resolve, 250))
      return
    }

    // Invalidate all existing unused reset tokens for this user
    // Only one valid reset token at a time
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    const { plain, hash } = generateSecureToken()

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: getExpiryDate(EXPIRY_HOURS),
      },
    })

    await emailService.sendPasswordResetEmail(email, plain, user.firstName ?? undefined)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        event: 'PASSWORD_RESET_REQUESTED',
        metadata: { email },
      },
    })
  }

  // ─── Reset Password ────────────────────────────────────────────
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token)

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    })

    if (!resetRecord) {
      throw new AuthenticationError('Invalid or expired reset token')
    }

    if (resetRecord.usedAt) {
      throw new AuthenticationError('This reset link has already been used')
    }

    if (isExpired(resetRecord.expiresAt)) {
      throw new AuthenticationError('This reset link has expired')
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    // Atomic transaction — token marked used AND password updated together
    // If anything fails mid-way, both roll back
    // Also revokes ALL active sessions — attacker sessions die immediately
    await prisma.$transaction(async (tx) => {
      await tx.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      })
      await tx.user.update({
        where: { id: resetRecord.user.id },
        data: { passwordHash: newPasswordHash },
      })
      await tx.refreshToken.updateMany({
        where: { userId: resetRecord.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    })

    await prisma.auditLog.create({
      data: {
        userId: resetRecord.user.id,
        event: 'PASSWORD_RESET_COMPLETED',
        metadata: { email: resetRecord.user.email },
      },
    })
  }

  // ─── Refresh Token ─────────────────────────────────────────────
  async refresh(
    rawRefreshToken: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify the JWT signature first — cheap operation
    const payload = verifyRefreshToken(rawRefreshToken)

    // Find the token record by its ID (from JWT payload)
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { id: payload.tokenId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            isVerified: true,
            roles: {
              select: { role: { select: { name: true } } },
            },
          },
        },
      },
    })

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid refresh token')
    }
    const incomingHash = hashToken(rawRefreshToken)
    const hashMatches = crypto.timingSafeEqual(
      Buffer.from(incomingHash),
      Buffer.from(tokenRecord.tokenHash)
    )

    // Verify the hash matches — ensures the token wasn't tampered with

    if (!hashMatches) {
      // Token ID exists but hash doesn't match — something very wrong
      // Revoke all sessions for this user as a precaution
      await this.revokeAllSessions(tokenRecord.userId)
      throw new AuthenticationError('Token integrity check failed')
    }

    // REUSE DETECTION — the most critical check
    // If revokedAt is set, this token was already used once.
    // Someone is replaying a stolen token. Kill everything.
    if (tokenRecord.revokedAt) {
      await this.revokeAllSessions(tokenRecord.userId)
      throw new AuthenticationError(
        'Session invalidated due to suspicious activity. Please sign in again.'
      )
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token expired. Please sign in again.')
    }

    if (!tokenRecord.user.isActive) {
      throw new AuthenticationError('This account has been deactivated.')
    }

    if (!tokenRecord.user.isVerified) {
      throw new AuthenticationError('Email is not verified.')
    }

    const roles = tokenRecord.user.roles.map((ur) => ur.role.name)

    // Rotate: revoke old token, issue new one
    // Both happen in a transaction — can't get a new token
    // without the old one being revoked
    const newTokenId = randomUUID()
    const newRefreshToken = signRefreshToken({
      sub: tokenRecord.user.id,
      tokenId: newTokenId,
    })
    const newRefreshTokenHash = hashToken(newRefreshToken)
    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7)

    await prisma.$transaction(async (tx) => {
      // Revoke old
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      })
      // Create new
      await tx.refreshToken.create({
        data: {
          id: newTokenId,
          userId: tokenRecord.user.id,
          tokenHash: newRefreshTokenHash,
          deviceInfo: meta.userAgent ?? tokenRecord.deviceInfo,
          ipAddress: meta.ip ?? tokenRecord.ipAddress,
          expiresAt: newExpiresAt,
        },
      })
    })

    const newAccessToken = signAccessToken({
      sub: tokenRecord.user.id,
      email: tokenRecord.user.email,
      roles,
      tokenId: newTokenId,
    })

    return { accessToken: newAccessToken, refreshToken: newRefreshToken }
  }

  // ─── Logout ────────────────────────────────────────────────────
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken)

      await prisma.refreshToken.updateMany({
        where: {
          id: payload.tokenId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      })

      // Blacklist the access token in Redis until it naturally expires
      // Why? Access tokens are stateless — even after logout, a stolen
      // access token would still work until it expires (15 min).
      // The blacklist makes logout truly immediate.

      if (accessToken) {
        const accessPayload = verifyAccessToken(accessToken)

        await redisClient.set(`blacklist:${accessPayload.jti}`, '1', { EX: 15 * 60 })
      }

      await prisma.auditLog.create({
        data: {
          userId: payload.sub,
          event: 'USER_LOGOUT',
        },
      })
    } catch {
      // Logout should never throw — even invalid tokens
      // should result in a clean logout from the client's perspective
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllSessions(userId)

    await prisma.auditLog.create({
      data: {
        userId,
        event: 'USER_LOGOUT_ALL',
      },
    })
  }

  // ─── Complete MFA login ────────────────────────────────────────
  async completeMfaLogin(
    mfaPendingToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{
    accessToken: string
    refreshToken: string
    user: { id: string; email: string; firstName: string | null; roles: string[] }
  }> {
    // Verify the pending token — proves password was already checked
    const payload = verifyMfaPendingToken(mfaPendingToken)

    const user = await prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    })

    if (!user) throw new AuthenticationError('User not found')

    // ✅ Follow exact same pattern as disable() and earlier code
    const totpValid = await mfaService.validateCode(user.id, code)
    const backupValid = totpValid ? false : await mfaService.validateBackupCode(user.id, code)

    if (!totpValid && !backupValid) {
      throw new AuthenticationError('Invalid authentication code')
    }

    const roles = user.roles.map((ur) => ur.role.name)
    const tokenId = randomUUID()

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      tokenId,
    })

    const refreshToken = signRefreshToken({ sub: user.id, tokenId })
    const refreshTokenHash = hashToken(refreshToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // ✅ Transaction + audit log together (matches register, verifyEmail, resetPassword, login)
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash: refreshTokenHash,
          deviceInfo: meta.userAgent ?? null,
          ipAddress: meta.ip ?? null,
          expiresAt,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: user.id,
          event: 'USER_LOGIN_MFA_COMPLETED',
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          metadata: { method: totpValid ? 'totp' : 'backup_code' },
        },
      })
    })

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        roles,
      },
    }
  }

  // ─── Private helpers ───────────────────────────────────────────
  private async revokeAllSessions(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}

export const authService = new AuthService()
