const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export interface LocalTestEnvironment {
  databaseUrl: string
  redisUrl: string
}

export function assertLocalTestEnvironment(): LocalTestEnvironment {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('Refusing to run tests unless NODE_ENV=test')
  }

  const databaseUrl = process.env['DATABASE_URL']
  const redisUrl = process.env['REDIS_URL']

  if (!databaseUrl || !redisUrl) {
    throw new Error('DATABASE_URL and REDIS_URL are required for tests')
  }

  let database: URL
  let redis: URL

  try {
    database = new URL(databaseUrl)
    redis = new URL(redisUrl)
  } catch {
    throw new Error('Invalid database or Redis URL in the test environment')
  }

  const databaseName = database.pathname.replace(/^\/+/, '')
  const redisDatabase = redis.pathname.replace(/^\/+/, '')

  if (!LOCAL_HOSTS.has(database.hostname) || databaseName !== 'authdb_test') {
    throw new Error('Refusing to run tests: DATABASE_URL must point to local authdb_test')
  }

  if (!LOCAL_HOSTS.has(redis.hostname) || redisDatabase !== '1') {
    throw new Error('Refusing to run tests: REDIS_URL must point to local Redis database 1')
  }

  return { databaseUrl, redisUrl }
}
