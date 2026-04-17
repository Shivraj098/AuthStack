import { prisma } from '../config/database.js'
import { NotFoundError, AuthorizationError } from '../utils/error.js'
import bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 12

class AccountService {
  // ─── Get user's active sessions ────────────────────────────────
  async getSessions(userId: string) {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return sessions
  }

  // ─── Revoke specific session ───────────────────────────────────
  async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })

    if (!session) throw new NotFoundError('Session')

    // Users can only revoke their OWN sessions
    if (session.userId !== userId) {
      throw new AuthorizationError("Cannot revoke another user's session")
    }

    await prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    })

    return { message: 'Session revoked' }
  }

  // ─── Revoke all other sessions ─────────────────────────────────
  async revokeOtherSessions(userId: string, currentTokenId: string) {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        NOT: { id: currentTokenId },
      },
      data: { revokedAt: new Date() },
    })

    return { message: 'All other sessions revoked' }
  }

  // ─── Change password ───────────────────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    })

    if (!user) throw new NotFoundError('User')

    // OAuth-only users have no password
    if (!user.passwordHash) {
      throw new AuthorizationError('This account uses social login. Password cannot be changed.')
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      throw new AuthorizationError('Current password is incorrect')
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })

    // Revoke all sessions — re-login required
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await prisma.auditLog.create({
      data: {
        userId,
        event: 'PASSWORD_CHANGED',
        metadata: { email: user.email },
      },
    })

    return { message: 'Password changed. Please sign in again.' }
  }
}

export const accountService = new AccountService()
