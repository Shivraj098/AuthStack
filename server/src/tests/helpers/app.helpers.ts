import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from '../../config/env.js'
import { requestIdMiddleware } from '../../middleware/requestId.js'
import { errorHandler } from '../../middleware/errorHandler.js'
import routes from '../../routes/index.js'

// Create a test instance of the Express app
// Same middleware stack as production — tests are realistic
// No rate limiters — they would break tests that make many requests
export function createTestApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }))
  app.use(express.json({ limit: '10kb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.use(requestIdMiddleware)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api', routes)

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  app.use(errorHandler)

  return app
}
