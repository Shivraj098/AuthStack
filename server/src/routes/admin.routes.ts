import { Router } from 'express'
import { adminController } from '../controllers/admin.controllers.js'
import { requireAuth, requireRole } from '../middleware/requireAuth.js'

const router = Router()

// Every admin route requires authentication AND the admin role
// Middleware runs left to right — auth check before role check
router.use(requireAuth)
router.use(requireRole('admin'))

router.get('/users', adminController.listUsers.bind(adminController))
router.get('/users/:id', adminController.getUser.bind(adminController))
router.post('/users/:id/roles', adminController.assignRole.bind(adminController))
router.delete('/users/:id/roles', adminController.removeRole.bind(adminController))
router.patch('/users/:id/toggle-active', adminController.toggleActive.bind(adminController))
router.get('/audit-logs', adminController.getAuditLogs.bind(adminController))
router.get('/roles', adminController.listRoles.bind(adminController))

export default router
