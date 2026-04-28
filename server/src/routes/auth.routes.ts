import { Request, Response, NextFunction, Router } from 'express'
import { authController } from '../controllers/auth.controllers.js'
import { getAuthLimiter, getPasswordResetLimiter } from '../middleware/rateLimiter.js'
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

const authLimiter = (req: Request, res: Response, next: NextFunction) => {
  return getAuthLimiter()(req, res, next)
}
const passwordResetLimiter = (req: Request, res: Response, next: NextFunction) => {
  return getPasswordResetLimiter()(req, res, next)
}
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: test@test.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: Password123!
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  authController.register.bind(authController)
)
/**
 * @swagger
 * /auth/verify-email:
 *   get:
 *     summary: Verify user email
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 */

router.get(
  '/verify-email',
  validate(verifyEmailSchema, 'query'),
  authController.verifyEmail.bind(authController)
)
/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent
 */
router.post(
  '/resend-verification',
  passwordResetLimiter,
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
router.post('/login', authLimiter, validate(loginSchema), authController.login.bind(authController))

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 */
router.post('/refresh', authLimiter, authController.refresh.bind(authController))

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
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
)

router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword.bind(authController)
)

export default router
