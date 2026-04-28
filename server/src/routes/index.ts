import { Router } from 'express'
import authRoutes from './auth.routes.js'
import oauthRoutes from './oauth.routes.js'
import accountRoutes from './account.routes.js'
import mfaRoutes from './mfa.routes.js'
import adminRoutes from './admin.routes.js'
const router = Router()

router.use('/auth', authRoutes)
router.use('/oauth', oauthRoutes)
router.use('/account', accountRoutes)
router.use('/mfa', mfaRoutes)
router.use('/admin', adminRoutes)
export default router
