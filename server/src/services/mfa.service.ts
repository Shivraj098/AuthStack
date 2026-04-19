import { generateSecret, verify, generateURI } from 'otplib'
import qrcode from 'qrcode'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../config/database.js'
import { AuthenticationError, AppError } from '../utils/error.js'

const BACKUP_CODE_COUNT = 10
const BCRYPT_ROUNDS = 12

class MfaService {
  // ─── Private Helper: Verify TOTP (otplib v13 compatible) ─────
  // In otplib v13, verify() returns Promise<VerifyResult> → { valid: boolean, delta?: number }
  // We MUST extract .valid and explicitly set epochTolerance: 30
  // (this matches the previous window: 1 behaviour and handles clock drift)
  private async verifyTOTP(secret: string, code: string): Promise<boolean> {
    const result = await verify({
      token: code,
      secret,
      epochTolerance: 30, // ±30 seconds tolerance (standard for TOTP)
    })
    return result.valid
  }

  // ─── Step 1: Generate Setup ───────────────────────────────
  async generateSetup(userId: string): Promise<{
    qrCodeDataUrl: string
    backupCodes: string[]
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })

    if (!user) throw new AppError('User not found', 404, 'NOT_FOUND')

    const existing = await prisma.mfaSecret.findUnique({
      where: { userId },
      select: { isEnabled: true },
    })

    if (existing?.isEnabled) {
      throw new AppError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED')
    }

    const secret = generateSecret()
    const otpauthUri = generateURI({
      secret,
      label: user.email,
      issuer: 'AuthApp',
    })
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUri)

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto
        .randomBytes(5)
        .toString('hex')
        .toUpperCase()
        .replace(/(.{5})/, '$1-')
    )

    const hashedCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code.replace('-', ''), BCRYPT_ROUNDS))
    )

    await prisma.$transaction([
      prisma.mfaSecret.upsert({
        where: { userId },
        create: { userId, secret, isEnabled: false },
        update: { secret, isEnabled: false },
      }),
      prisma.mfaBackupCode.deleteMany({ where: { userId } }),
      prisma.mfaBackupCode.createMany({
        data: hashedCodes.map((codeHash) => ({ userId, codeHash })),
      }),
    ])

    // 🔒 Do NOT return secret
    return { qrCodeDataUrl, backupCodes }
  }

  // ─── Step 2: Verify Setup ───────────────────────────────
  async verifySetup(userId: string, code: string): Promise<void> {
    const mfaSecret = await prisma.mfaSecret.findUnique({
      where: { userId },
      select: { secret: true, isEnabled: true },
    })

    if (!mfaSecret) {
      throw new AppError('MFA setup not initiated', 400, 'MFA_NOT_SETUP')
    }

    if (mfaSecret.isEnabled) {
      throw new AppError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED')
    }

    const isValid = await this.verifyTOTP(mfaSecret.secret, code)

    if (!isValid) {
      throw new AuthenticationError('Invalid code. Make sure your app is synced.')
    }

    await prisma.mfaSecret.update({
      where: { userId },
      data: { isEnabled: true },
    })

    await prisma.auditLog.create({
      data: { userId, event: 'MFA_ENABLED' },
    })
  }

  // ─── Validate TOTP ──────────────────────────────────────
  async validateCode(userId: string, code: string): Promise<boolean> {
    const mfaSecret = await prisma.mfaSecret.findUnique({
      where: { userId },
      select: { secret: true, isEnabled: true },
    })

    if (!mfaSecret?.isEnabled) return false

    return await this.verifyTOTP(mfaSecret.secret, code)
  }

  // ─── Validate Backup Code (FIXED: race condition) ───────
  async validateBackupCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/-/g, '').toUpperCase()

    return await prisma.$transaction(async (tx) => {
      const records = await tx.mfaBackupCode.findMany({
        where: { userId, usedAt: null },
        select: { id: true, codeHash: true },
      })

      for (const record of records) {
        const matches = await bcrypt.compare(normalized, record.codeHash)

        if (matches) {
          // atomic update
          const updated = await tx.mfaBackupCode.updateMany({
            where: { id: record.id, usedAt: null },
            data: { usedAt: new Date() },
          })

          if (updated.count === 0) {
            return false // already used by another request
          }

          const remaining = await tx.mfaBackupCode.count({
            where: { userId, usedAt: null },
          })

          await tx.auditLog.create({
            data: {
              userId,
              event: 'MFA_BACKUP_CODE_USED',
              metadata: { remainingCodes: remaining },
            },
          })

          return true
        }
      }

      return false
    })
  }

  // ─── Disable MFA ───────────────────────────────────────
  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    })

    if (!user?.passwordHash) {
      throw new AuthenticationError('Password confirmation required')
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      throw new AuthenticationError('Incorrect password')
    }

    // ✅ allow backup code fallback
    const codeValid =
      (await this.validateCode(userId, code)) || (await this.validateBackupCode(userId, code))

    if (!codeValid) {
      throw new AuthenticationError('Invalid authenticator or backup code')
    }

    await prisma.$transaction([
      prisma.mfaSecret.delete({ where: { userId } }),
      prisma.mfaBackupCode.deleteMany({ where: { userId } }),
    ])

    await prisma.auditLog.create({
      data: { userId, event: 'MFA_DISABLED' },
    })
  }

  // ─── Get Status ────────────────────────────────────────
  async getStatus(userId: string): Promise<{
    isEnabled: boolean
    backupCodesRemaining: number
  }> {
    const [mfaSecret, backupCodesCount] = await Promise.all([
      prisma.mfaSecret.findUnique({
        where: { userId },
        select: { isEnabled: true },
      }),
      prisma.mfaBackupCode.count({
        where: { userId, usedAt: null },
      }),
    ])

    return {
      isEnabled: mfaSecret?.isEnabled ?? false,
      backupCodesRemaining: backupCodesCount,
    }
  }
}

export const mfaService = new MfaService()
