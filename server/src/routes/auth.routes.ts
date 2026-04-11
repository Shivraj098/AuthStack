import { Router } from 'express'
import { authController } from '../controllers/auth.controllers.js'
import { createGlobalLimiter, createPasswordResetLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '../validators/auth.schema.js'

const router = Router()

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
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       202:
 *         description: Registration accepted
 *       400:
 *         $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests
 */
router.post(
  '/register',
  createGlobalLimiter(),
  validate(registerSchema),
  authController.register.bind(authController)
)

/**
 * @swagger
 * /auth/verify-email:
 *   get:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verified
 *       401:
 *         description: Invalid or expired token
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
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Resend accepted
 */
router.post(
  '/resend-verification',
  createPasswordResetLimiter(),
  validate(resendVerificationSchema),
  authController.resendVerification.bind(authController)
)

export default router
