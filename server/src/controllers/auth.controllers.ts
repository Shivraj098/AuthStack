import { Request, Response } from 'express'
import type {
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from '../validators/auth.schema.js'

import { authService } from '../services/auth.service.js'
import type { LoginInput } from '../validators/auth.schema.js'
import { AuthenticationError, NotFoundError } from '../utils/error.js'
import { env } from '../config/env.js'
import { prisma } from '../config/database.js'
import { ForgotPasswordInput, ResetPasswordInput } from '../validators/auth.schema.js'

class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body as RegisterInput)
    res.status(202).json({ success: true, ...result })
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.query as VerifyEmailInput
    const result = await authService.verifyEmail(token)
    res.json({ success: true, ...result })
  }

  async resendVerification(req: Request, res: Response): Promise<void> {
    const result = await authService.resendVerification(req.body as ResendVerificationInput)
    res.json({ success: true, ...result })
  }

  private getRefreshTokenFromCookie(req: Request): string {
    const token = req.cookies['refreshToken'] as string | undefined
    if (!token) throw new AuthenticationError('No refresh token provided')
    return token
  }

  private setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie('refreshToken', token, {
      httpOnly: true, // JavaScript cannot read this cookie
      secure: env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // Never sent on cross-site requests (CSRF protection)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/api/auth', // Cookie only sent to auth routes, not every request
    })
  }

  private clearRefreshTokenCookie(res: Response): void {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
    })
  }

  async login(req: Request, res: Response): Promise<void> {
    const meta = {
      ...(req.ip ? { ip: req.ip } : {}),
      ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
    }
    const result = await authService.login(req.body as LoginInput, meta)

    if (result.mfaRequired) {
      // Don't set cookie — no refresh token yet
      res.json({
        success: true,
        data: {
          mfaRequired: true,
          mfaPendingToken: result.mfaPendingToken,
        },
      })
      return
    }

    this.setRefreshTokenCookie(res, result.refreshToken!)

    res.json({
      success: true,
      data: {
        mfaRequired: false,
        accessToken: result.accessToken,
        user: result.user,
      },
    })
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken = this.getRefreshTokenFromCookie(req)

    const meta = {
      ...(req.ip ? { ip: req.ip } : {}),
      ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
    }

    const result = await authService.refresh(refreshToken, meta)

    this.setRefreshTokenCookie(res, result.refreshToken)

    res.json({
      success: true,
      data: { accessToken: result.accessToken },
    })
  }

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies['refreshToken'] as string | undefined

    if (refreshToken) {
      await authService.logout(refreshToken)
    }

    this.clearRefreshTokenCookie(res)
    res.json({ success: true, message: 'Logged out successfully' })
  }

  async logoutAll(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new AuthenticationError()
    await authService.logoutAll(req.user.sub)
    this.clearRefreshTokenCookie(res)
    res.json({ success: true, message: 'Logged out from all devices' })
  }

  async getMe(req: Request, res: Response): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isVerified: true,
        createdAt: true,
        roles: {
          select: { role: { select: { name: true } } },
        },
      },
    })

    if (!user) throw new NotFoundError('User')

    res.json({
      success: true,
      data: {
        ...user,
        roles: user.roles.map((ur) => ur.role.name),
      },
    })
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body as ForgotPasswordInput
    // Always 200 — never reveal if email exists
    await authService.forgotPassword(email)
    res.json({
      success: true,
      message: 'If that email is registered, a reset link has been sent.',
    })
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = req.body as ResetPasswordInput
    await authService.resetPassword(token, password)
    res.json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.',
    })
  }
}

export const authController = new AuthController()
