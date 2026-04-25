import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { accountService } from '../services/account.service.js'
import { Request, Response } from 'express'
import { prisma } from '../config/database.js'

const router = Router()

router.use(requireAuth)

router.get('/sessions', async (req: Request, res: Response) => {
  const sessions = await accountService.getSessions(req.user!.sub)
  res.json({ success: true, data: sessions })
})

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  const result = await accountService.revokeSession(req.user!.sub, req.params['id'] as string)
  res.json({ success: true, ...result })
})
router.delete('/sessions', async (req: Request, res: Response) => {
  const user = req.user!

  const result = await accountService.revokeOtherSessions(user.sub, user.jti)
  res.json({ success: true, ...result })
})

router.post('/change-password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string
    newPassword: string
  }
  const result = await accountService.changePassword(req.user!.sub, currentPassword, newPassword)
  res.json({ success: true, ...result })
})

router.get('/activity', async (req: Request, res: Response) => {
  const { page = '1', limit = '20' } = req.query as { page?: string; limit?: string }

  const userId = req.user!.sub

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: { userId } }),
    prisma.auditLog.findMany({
      where: { userId },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        event: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        // metadata excluded for user view — may contain internal IDs
      },
    }),
  ])

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  })
})

export default router
