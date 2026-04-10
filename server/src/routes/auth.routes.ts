import { Router } from 'express'
import { authController } from '../controllers/auth.controllers.js'
import { authLimiter } from '../middleware/rateLimiter'

const router = Router()

router.use(authLimiter)

router.post('/register', authController.register.bind(authController))

export default router
