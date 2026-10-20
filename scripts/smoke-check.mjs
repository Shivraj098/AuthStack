const baseUrl = process.env.SMOKE_BASE_URL?.trim()

if (!baseUrl) {
  console.error('SMOKE_BASE_URL is required, e.g. https://your-domain.example')
  process.exitCode = 1
} else {
  try {
    const healthUrl = new URL('/api/health', baseUrl)

    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000),
    })

    const body = await response.json()

    if (
      !response.ok ||
      body.status !== 'ok' ||
      body.database !== 'connected' ||
      body.redis !== 'connected'
    ) {
      throw new Error('API health check did not report all services as healthy')
    }

    console.log('Production smoke check passed')
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production smoke check failed',
    )
    process.exitCode = 1
  }
}