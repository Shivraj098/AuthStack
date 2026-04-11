import { Request, Response } from 'express'
import { authService } from '../services/auth.service.js'
import type {
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from '../validators/auth.schema.js'

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
}

export const authController = new AuthController()
