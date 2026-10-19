import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const testEnvPath = path.resolve(currentDir, '../../../../.env.test')

// Load local test configuration without overriding explicitly
// supplied process variables. Unsafe targets will be rejected below.
dotenv.config({ path: testEnvPath })

const allowedLocalHosts = new Set(['localhost', '127.0.0.1', '::1'])

function readEnvironmentUrl(name: string): URL {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required to run the test suite.`)
  }

  try {
    return new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL for the test environment.`)
  }
}

function isLocalHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  return allowedLocalHosts.has(normalizedHost)
}

export function assertSafeTestTargets(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to run tests: NODE_ENV must be "test".')
  }

  const databaseUrl = readEnvironmentUrl('DATABASE_URL')
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''))

  const validDatabase =
    ['postgres:', 'postgresql:'].includes(databaseUrl.protocol) &&
    isLocalHost(databaseUrl.hostname) &&
    databaseName === 'authdb_test'

  if (!validDatabase) {
    throw new Error(
      'Refusing to run tests: DATABASE_URL must target the local authdb_test database.'
    )
  }

  const redisUrl = readEnvironmentUrl('REDIS_URL')
  const redisDatabase = redisUrl.pathname.replace(/^\/+/, '') || '0'

  const validRedis =
    redisUrl.protocol === 'redis:' && isLocalHost(redisUrl.hostname) && redisDatabase === '1'

  if (!validRedis) {
    throw new Error('Refusing to run tests: REDIS_URL must target local Redis database 1.')
  }
}
