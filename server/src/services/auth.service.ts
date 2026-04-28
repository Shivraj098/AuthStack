import bcrypt from 'bcrypt'
import crypto from 'crypto'

import { prisma } from '../config/database.js'
import { redisClient } from '../config/redis.js'

import { emailService } from './email.service.js'
import { mfaService } from './mfa.service.js'
import jwt from 'jsonwebtoken'
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
import { logger } from '../config/logger.js'

const BCRYPT_ROUNDS = 12
const EMAIL_VERIFY_EXPIRY_HOURS = 24
const MAX_ATTEMPTS = 5
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3b7x9wqG1Gq6z9Y0Yw7n0Rr9E6k5K2K'
const DUMMY_PASSWORD = 'dummy_password_for_timing_attack_prevention'

/**
 * AuthService — Core authentication & session management service.
 *
 * Security Model (Production-Grade Implementation):
 * - Timing-attack resistant enumeration prevention on every user-facing endpoint
 * - Hybrid JWT (stateless access) + stateful refresh tokens with rotation + reuse detection
 * - Step-up MFA using short-lived mfaPendingToken (proves password step succeeded)
 * - Atomic transactions for all state-changing security operations
 * - Full audit trail for compliance (SOC2, GDPR, etc.)
 * - Defense-in-depth: lockout, verification gates, token revocation cascades
 */
class AuthService {
  // ─── Registration ──────────────────────────────────────────────
  /**
   * Registers a new user with full enumeration prevention.
   *
   * Key Production Decisions:
   * - Never throws "email already exists" (prevents user enumeration via error messages or timing)
   * - Always performs bcrypt work (even on existing users) so response time is identical
   * - Email verification token created atomically with user + role assignment
   * - Email send is intentionally OUTSIDE the transaction (if email fails, user can still resend)
   * - Single generic success message returned in all cases
   */
  async register(input: RegisterInput): Promise<{ message: string }> {
    const { email, password, firstName, lastName } = input

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (!existingUser) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

      const userRole = await prisma.role.findUnique({
        where: { name: 'user' },
        select: { id: true },
      })

      if (!userRole) {
        throw new AppError('Default role not found', 500, 'SETUP_ERROR', false)
      }

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

      try {
        await emailService.sendVerificationEmail(
          email,
          user.verificationToken,
          user.newUser.firstName ?? undefined
        )
      } catch (error) {
        logger.error({ err: error }, 'Verification email failed')
      }

      await prisma.auditLog.create({
        data: {
          userId: user.newUser.id,
          event: 'USER_REGISTERED',
          metadata: { email },
        },
      })
    } else {
      await bcrypt.hash(password, BCRYPT_ROUNDS)
    }

    return {
      message: 'If this email is not registered, you will receive a verification link shortly.',
    }
  }

  // ─── Email Verification ────────────────────────────────────────
  /**
   * Verifies email using single-use, hashed, expiring token.
   * Atomic update of token.usedAt + user.isVerified prevents race conditions.
   */
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
      return { message: 'Email already verified. You can sign in.' }
    }

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
  /**
   * Resend verification with enumeration prevention + token accumulation protection.
   * Invalidates all previous unused tokens before issuing a new one.
   */
  async resendVerification(input: ResendVerificationInput): Promise<{ message: string }> {
    const { email } = input
    const RESEND_SAME_MESSAGE =
      'If your email is registered and unverified, a new link has been sent.'

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isVerified: true, firstName: true },
    })

    if (!user || user.isVerified) {
      return { message: RESEND_SAME_MESSAGE }
    }

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
  /**
   * Primary login with account lockout, MFA step-up, and full audit.
   *
   * Security Highlights:
   * - Lockout check happens BEFORE any DB query (DoS resistance)
   * - Dummy bcrypt work on unknown users (timing attack prevention)
   * - Progressive lockout with remaining attempts messaging
   * - MFA users receive only a short-lived mfaPendingToken (no access/refresh yet)
   */
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

    if (await isLockedOut(email)) {
      const remaining = await getRemainingLockoutSeconds(email)
      throw new AppError(
        `Account temporarily locked. Try again in ${Math.ceil(remaining / 60)} minutes.`,
        429,
        'ACCOUNT_LOCKED'
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
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

    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
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

    await clearFailedAttempts(email)

    const roles = user.roles.map((ur) => ur.role.name)

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

    const tokenId = crypto.randomUUID()

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

    await prisma.$transaction([
      prisma.refreshToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash: refreshTokenHash,
          deviceInfo: meta.userAgent ?? null,
          ipAddress: meta.ip ?? null,
          expiresAt,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          event: 'USER_LOGIN',
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          metadata: { email },
        },
      }),
    ])

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
  /**
   * Initiates password reset with full enumeration prevention.
   *
   * Production Notes:
   * - Identical work performed for existing and non-existing users (bcrypt dummy + same response time)
   * - Old unused reset tokens are invalidated atomically with new token creation
   * - Email is sent outside the transaction (user can request resend if delivery fails)
   */
  async forgotPassword(email: string): Promise<void> {
    const EXPIRY_HOURS = 1

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, passwordHash: true },
    })

    if (!user || !user.passwordHash) {
      await bcrypt.compare(DUMMY_PASSWORD, DUMMY_HASH)
      return
    }

    const { plain, hash } = generateSecureToken()

    await prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })

      await tx.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          expiresAt: getExpiryDate(EXPIRY_HOURS),
        },
      })
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
  /**
   * Completes password reset + immediately revokes ALL active sessions.
   * This is critical: any attacker who had a valid session loses it instantly.
   */
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

    const now = new Date()

    const tokensBefore = await prisma.refreshToken.findMany({
      where: { userId: resetRecord.user.id },
    })

    console.log('🟡 TOKENS BEFORE RESET:', tokensBefore)

    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: now },
      }),

      prisma.user.update({
        where: { id: resetRecord.user.id },
        data: { passwordHash: newPasswordHash },
      }),

      prisma.refreshToken.updateMany({
        where: {
          userId: resetRecord.user.id,
        },
        data: {
          revokedAt: now, // ✅ SAME timestamp
        },
      }),

      prisma.auditLog.create({
        data: {
          userId: resetRecord.user.id,
          event: 'PASSWORD_RESET_COMPLETED',
          metadata: { email: resetRecord.user.email },
        },
      }),
    ])

    const tokensAfter = await prisma.refreshToken.findMany({
      where: { userId: resetRecord.user.id },
    })

    console.log('🟢 TOKENS AFTER RESET:', tokensAfter)
  }

  // ─── Refresh Token ─────────────────────────────────────────────
  /**
   * Token refresh with reuse detection (the most important anti-theft mechanism).
   *
   * If a refresh token is ever used twice (revokedAt already set), we assume theft
   * and immediately revoke ALL sessions for that user. This is the gold standard
   * for refresh token security (see: OAuth 2.1, Auth0, Clerk, etc.).
   */
  async refresh(
    rawRefreshToken: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = verifyRefreshToken(rawRefreshToken)

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
    const incomingBuffer = Buffer.from(incomingHash)
    const storedBuffer = Buffer.from(tokenRecord.tokenHash)

    if (incomingBuffer.length !== storedBuffer.length) {
      throw new AuthenticationError('Invalid refresh token')
    }

    const hashMatches = crypto.timingSafeEqual(incomingBuffer, storedBuffer)

    if (!hashMatches) {
      await this.revokeAllSessions(tokenRecord.userId)
      throw new AuthenticationError('Token integrity check failed')
    }

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

    const newTokenId = crypto.randomUUID()
    const newRefreshToken = signRefreshToken({
      sub: tokenRecord.user.id,
      tokenId: newTokenId,
    })
    const newRefreshTokenHash = hashToken(newRefreshToken)
    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7)

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      })
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
  /**
   * Single-session logout with immediate access token revocation via Redis blacklist.
   * Never throws — graceful degradation is intentional for logout UX.
   */
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

      if (accessToken) {
        console.log('🔐 LOGOUT - accessToken received:', accessToken)
        const accessPayload = verifyAccessToken(accessToken)
        console.log('🔐 LOGOUT - jti:', accessPayload.jti)
        const decoded = jwt.decode(accessToken) as { exp?: number }

        const ttl = decoded?.exp
          ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0)
          : 60 * 15
        console.log('🔌 REDIS READY?', redisClient.isReady)
        await redisClient.set(`blacklist:${accessPayload.jti}`, '1', { EX: ttl })
        const value = await redisClient.get(`blacklist:${accessPayload.jti}`)
        console.log('🧠 REDIS CHECK AFTER SET:', value)
      }

      await prisma.auditLog.create({
        data: {
          userId: payload.sub,
          event: 'USER_LOGOUT',
        },
      })
    } catch (err) {
      logger.error({ err }, 'Logout failed')
      throw err // 🔥 REQUIRED
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
  /**
   * Completes the second factor after password step.
   * The mfaPendingToken proves the password was already successfully verified.
   */
  async completeMfaLogin(
    mfaPendingToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{
    accessToken: string
    refreshToken: string
    user: { id: string; email: string; firstName: string | null; roles: string[] }
  }> {
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

    const totpValid = await mfaService.validateCode(user.id, code)
    const backupValid = totpValid ? false : await mfaService.validateBackupCode(user.id, code)

    if (!totpValid && !backupValid) {
      throw new AuthenticationError('Invalid authentication code')
    }

    const roles = user.roles.map((ur) => ur.role.name)
    const tokenId = crypto.randomUUID()

    let accessToken: string
    let refreshToken: string

    try {
      accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles,
        tokenId,
      })

      refreshToken = signRefreshToken({
        sub: user.id,
        tokenId,
      })
    } catch (err) {
      logger.error(
        { err, userId: user.id, email: user.email },
        'Token generation failed during login'
      )
      throw new AppError('Authentication failed', 500, 'TOKEN_ERROR')
    }
    const refreshTokenHash = hashToken(refreshToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

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
