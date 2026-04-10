import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import { prisma } from './config/database.js'
import { connectRedis, redisClient } from './config/redis.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { createGlobalLimiter } from './middleware/rateLimiter.js'
import { errorHandler } from './middleware/errorHandler.js'
import { swaggerSpec } from './config/swagger.js'
import routes from './routes/index.js'

const app = express()

// ── Security middleware ──────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true, // Required for cookies to cross origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// ── Parsing middleware ───────────────────────────────
app.use(express.json({ limit: '10kb' })) // Prevent huge payload attacks
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

// ── Request tracing ──────────────────────────────────
app.use(requestIdMiddleware)

// ── Global rate limit ────────────────────────────────

// ── API docs ─────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// ── Health check ─────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  const redisAlive = redisClient.isReady

  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: 'connected',
    redis: redisAlive ? 'connected' : 'disconnected',
  })
})

// ── Application routes ───────────────────────────────
app.use('/api', routes)

// ── 404 handler ──────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  })
})

// ── Global error handler (must be last) ─────────────
app.use(errorHandler)

// ── Bootstrap ────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await connectRedis()
  await prisma.$connect()

  const globalLimiter = createGlobalLimiter()
  app.use('/api', globalLimiter)

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
    console.log(`API docs: http://localhost:${env.PORT}/api/docs`)
  })
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

export default app
