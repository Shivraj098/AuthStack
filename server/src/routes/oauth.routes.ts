import { Router } from 'express'
import { oauthController } from '../controllers/oauth.controllers.js'
import { createGlobalLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.use(createGlobalLimiter())

// Initiates OAuth flow — redirects to provider
router.get('/:provider', oauthController.authorize.bind(oauthController))

// Handles the callback from provider
router.get('/callback/:provider', oauthController.callback.bind(oauthController))

export default router
