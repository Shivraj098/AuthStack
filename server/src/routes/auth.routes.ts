import { Router } from 'express'
import { authController } from '../controllers/auth.controllers.js'
import { createAuthLimiter, createPasswordResetLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '../validators/auth.schema.js'

import { requireAuth } from '../middleware/requireAuth.js'
import {
  loginSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
} from '../validators/auth.schema.js'

const router = Router()

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 */
router.post(
  '/register',
  createAuthLimiter(),
  validate(registerSchema),
  authController.register.bind(authController)
)

router.get(
  '/verify-email',
  validate(verifyEmailSchema, 'query'),
  authController.verifyEmail.bind(authController)
)

router.post(
  '/resend-verification',
  createPasswordResetLimiter(),
  validate(resendVerificationSchema),
  authController.resendVerification.bind(authController)
)

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 */
router.post(
  '/login',
  createAuthLimiter(),
  validate(loginSchema),
  authController.login.bind(authController)
)

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 */
router.post('/refresh', authController.refresh.bind(authController))

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 */
router.post('/logout', authController.logout.bind(authController))

router.post('/logout-all', requireAuth, authController.logoutAll.bind(authController))

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Authentication]
 */
router.get('/me', requireAuth, authController.getMe.bind(authController))

router.post(
  '/forgot-password',
  createPasswordResetLimiter(),
  validate(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
)

router.post(
  '/reset-password',
  createAuthLimiter(),
  validate(resetPasswordSchema),
  authController.resetPassword.bind(authController)
)

export default router
