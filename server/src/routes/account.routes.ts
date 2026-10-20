import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { accountService } from '../services/account.service.js'
import { Request, Response } from 'express'
import { prisma } from '../config/database.js'
import { validate } from '../middleware/validate.js'
import { changePasswordSchema, type ChangePasswordInput } from '../validators/auth.schema.js'
import {
  accountActivityQuerySchema,
  sessionIdParamsSchema,
  type AccountActivityQuery,
  type SessionIdParams,
} from '../validators/account.schema.js'
const router = Router()

router.use(requireAuth)

router.get('/sessions', async (req: Request, res: Response) => {
  const sessions = await accountService.getSessions(req.user!.sub)
  res.json({ success: true, data: sessions })
})

router.delete(
  '/sessions/:id',
  validate(sessionIdParamsSchema, 'params'),
  async (req: Request, res: Response) => {
    const { id } = req.params as SessionIdParams

    const result = await accountService.revokeSession(req.user!.sub, id)

    res.json({ success: true, ...result })
  }
)
router.delete('/sessions', async (req: Request, res: Response) => {
  const user = req.user!

  const result = await accountService.revokeOtherSessions(user.sub, user.tokenId)

  res.json({ success: true, ...result })
})

router.post(
  '/change-password',
  validate(changePasswordSchema),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body as ChangePasswordInput

    const result = await accountService.changePassword(req.user!.sub, currentPassword, newPassword)

    res.json({ success: true, ...result })
  }
)

router.get(
  '/activity',
  validate(accountActivityQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as AccountActivityQuery

    const userId = req.user!.sub

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({
        where: { userId },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          event: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
    ])

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  }
)

export default router
