import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { accountService } from '../services/account.service.js'
import { Request, Response } from 'express'

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
  const result = await accountService.revokeOtherSessions(req.user!.sub, req.user!.jti)
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

export default router
