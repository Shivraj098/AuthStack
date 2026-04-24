import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import { prisma } from './config/database.js'
import { connectRedis, disconnectRedis, redisClient } from './config/redis.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { initRateLimiters, getGlobalLimiter } from './middleware/rateLimiter.js'
import { errorHandler } from './middleware/errorHandler.js'
import { swaggerSpec } from './config/swagger.js'

const app = express()

// ======================
// 1. SECURITY & FOUNDATION
// ======================
app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// Required for correct req.ip resolution behind Nginx / Cloudflare / AWS ALB.
// Value of 1 means trust one proxy hop. Increase if you have multiple proxy layers.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// ======================
// 2. REQUEST TRACING
// ======================
app.use(requestIdMiddleware)

// ======================
// 3. BODY PARSING
// ======================
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

// ======================
// 4. API DOCUMENTATION (public, no rate limiting)
// ======================
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// ─── Health check handler (defined early, registered after connections) ────────
// Defined outside bootstrap so it's readable at the top of the file,
// but registered inside bootstrap after Redis + DB are connected.
const healthCheckHandler = async (_req: express.Request, res: express.Response): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redisClient.ping()

    res.json({
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
    })
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    })
  }
}

// ======================
// 5. BOOTSTRAP
// ======================
async function bootstrap(): Promise<void> {
  // ── Step 1: Connect external services ──────────────────────────────────────
  // Order matters: Redis must be connected before initRateLimiters(),
  // and both must be ready before routes are imported (routes call getAuthLimiter()
  // at module evaluation time).
  await connectRedis()
  await prisma.$connect()

  // ── Step 2: Initialize rate limiters (requires Redis to be connected) ───────
  // Must happen before routes are imported — route files call getAuthLimiter()
  // and getPasswordResetLimiter() at the top level when the module loads.
  initRateLimiters()
  console.log('[Bootstrap] Rate limiters ready')

  // ── Step 3: Import routes (safe now — Redis connected, limiters initialized) ─
  // Dynamic import defers module evaluation to this point, guaranteeing that
  // all route-level limiter accessors find initialized instances.
  const { default: routes } = await import('./routes/index.js')

  // ── Step 4: Register health check (exempt from rate limiting) ───────────────
  // Registered before the global limiter middleware so health probes
  // (e.g. from Kubernetes, AWS ALB, or UptimeRobot) are never rate-limited.
  app.get('/api/health', healthCheckHandler)

  // ── Step 5: Apply global rate limiter + mount routes ────────────────────────
  app.use('/api', getGlobalLimiter())
  app.use('/api', routes)

  // ── Step 6: 404 handler (must be after all routes) ──────────────────────────
  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    })
  })

  // ── Step 7: Global error handler (must be last) ─────────────────────────────
  app.use(errorHandler)

  // ── Step 8: Start server ────────────────────────────────────────────────────
  const server = app.listen(env.PORT, () => {
    console.log(`[Server] Running on port ${env.PORT} in ${env.NODE_ENV} mode`)
    console.log(`[Server] API docs: http://localhost:${env.PORT}/api/docs`)
  })

  // ── Step 9: Graceful shutdown ───────────────────────────────────────────────
  // Ensures in-flight requests finish, and connections are closed cleanly
  // before the process exits. Critical for zero-downtime deploys (PM2, K8s).
  const shutdown = (signal: string): void => {
    console.log(`[Server] ${signal} received. Shutting down gracefully...`)

    const cleanup = async (): Promise<void> => {
      await Promise.allSettled([prisma.$disconnect(), disconnectRedis()])
      console.log('[Server] All connections closed. Exiting.')
      process.exit(0)
    }

    server.close((err) => {
      if (err) {
        console.error('[Server] Error closing HTTP server:', err)
        process.exit(1)
      }

      console.log('[Server] HTTP server closed')
      void cleanup()
    })
    // Force-kill if graceful shutdown exceeds 10s (prevents hanging in prod)
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out. Forcing exit.')
      process.exit(1)
    }, 10_000)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM')) // Docker / K8s stop
  process.on('SIGINT', () => void shutdown('SIGINT')) // Ctrl+C in dev
}

// ======================
// 6. RUN
// ======================
bootstrap().catch((err) => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})

export default app
