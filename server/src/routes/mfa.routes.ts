import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { mfaService } from '../services/mfa.service.js'
import { authService } from '../services/auth.service.js'
import { env } from '../config/env.js'
import { z } from 'zod'
import { validate } from '../middleware/validate.js'

const router = Router()

// ─── Zod Schemas ───────────────────────────────────────────────
const codeSchema = z.object({
  code: z.string().min(6).max(10),
})

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(10),
})

const completeMfaSchema = codeSchema.extend({
  mfaPendingToken: z.string().min(1),
})

// typed request bodies inferred from Zod schemas
type CodeBody = z.infer<typeof codeSchema>
type DisableBody = z.infer<typeof disableSchema>
type CompleteMfaBody = z.infer<typeof completeMfaSchema>

// ─── Standardized success response helper ──────────────────────
// Ensures every successful response follows the same shape.
type SuccessResponse<T> = { success: true; data?: T; message?: string }

const success = <T = undefined>(data?: T, message?: string): SuccessResponse<T> => ({
  success: true,
  ...(data !== undefined ? { data } : {}),
  ...(message ? { message } : {}),
})

// ─── Public route: Complete MFA after password login ───────────
router.post('/complete', validate(completeMfaSchema), async (req: Request, res: Response) => {
  const { mfaPendingToken, code } = req.body as CompleteMfaBody

  const meta: { ip?: string; userAgent?: string } = {}
  if (req.ip) meta.ip = req.ip
  const ua = req.headers['user-agent']
  if (typeof ua === 'string' && ua) meta.userAgent = ua

  const result = await authService.completeMfaLogin(mfaPendingToken, code, meta)

  // Set refresh token as httpOnly cookie (consistent strategy)
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  })

  res.json(
    success({
      accessToken: result.accessToken,
      user: result.user,
    })
  )
})

// ─── Protected routes ──────────────────────────────────────────
router.use(requireAuth)

router.get('/status', async (req: Request, res: Response) => {
  // Defensive check instead of non-null assertion
  if (!req.user?.sub) {
    throw new Error('Unauthorized') // will be caught by error handler
  }

  const status = await mfaService.getStatus(req.user.sub)
  res.json(success(status))
})

router.post('/setup', async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    throw new Error('Unauthorized')
  }

  const setup = await mfaService.generateSetup(req.user.sub)
  res.json(success(setup))
})

router.post('/verify-setup', validate(codeSchema), async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    throw new Error('Unauthorized')
  }

  const { code } = req.body as CodeBody
  await mfaService.verifySetup(req.user.sub, code)
  res.json(success(undefined, 'MFA enabled successfully'))
})

router.post('/disable', validate(disableSchema), async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    throw new Error('Unauthorized')
  }

  const { password, code } = req.body as DisableBody
  await mfaService.disable(req.user.sub, password, code)
  res.json(success(undefined, 'MFA disabled'))
})

export default router
