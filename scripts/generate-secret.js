#!/usr/bin/env node
// Run: node scripts/generate-secrets.js
// Generates cryptographically secure secrets for production use

import crypto from 'crypto'

const secrets = {
  POSTGRES_PASSWORD: crypto.randomBytes(32).toString('hex'),
  REDIS_PASSWORD: crypto.randomBytes(32).toString('hex'),
  JWT_ACCESS_SECRET: crypto.randomBytes(64).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(64).toString('hex'),
}

console.log('\n🔑 Generated secrets for production:\n')
Object.entries(secrets).forEach(([key, value]) => {
  console.log(`${key}=${value}`)
})
console.log('\n⚠️  Store these in your secrets manager — never commit them.\n')