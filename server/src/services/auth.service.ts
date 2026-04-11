import bcrypt from 'bcrypt'
import { prisma } from '../config/database.js'
import { emailService } from './email.service.js'
import { generateSecureToken, hashToken, getExpiryDate, isExpired } from '../utils/token.js'
import { AuthenticationError, AppError } from '../utils/error.js'
import type { RegisterInput, ResendVerificationInput } from '../validators/auth.schema.js'

const BCRYPT_ROUNDS = 12
const EMAIL_VERIFY_EXPIRY_HOURS = 24

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
      await emailService.sendVerificationEmail(
        email,
        user.verificationToken,
        user.newUser.firstName ?? undefined
      )

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
      await bcrypt.hash(password, BCRYPT_ROUNDS)
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
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: verification.user.id },
        data: { isVerified: true },
      }),
    ])

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
}

export const authService = new AuthService()
