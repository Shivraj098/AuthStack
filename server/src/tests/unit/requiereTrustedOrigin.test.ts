import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { env } from '../../config/env.js'
import { errorHandler } from '../../middleware/errorHandler.js'
import { requireTrustedOrigin } from '../../middleware/requireTrustedOrigin.js'

const app = express()

app.post('/cookie-action', requireTrustedOrigin, (_req, res) => {
  res.status(204).end()
})

app.use(errorHandler)

describe('requireTrustedOrigin', () => {
  it('allows the configured frontend origin', async () => {
    const response = await request(app)
      .post('/cookie-action')
      .set('Origin', new URL(env.CLIENT_URL).origin)

    expect(response.status).toBe(204)
  })

  it('rejects an untrusted origin', async () => {
    const response = await request(app)
      .post('/cookie-action')
      .set('Origin', 'https://attacker.example')

    expect(response.status).toBe(403)
    expect(response.body).toHaveProperty('error.code', 'UNTRUSTED_ORIGIN')
  })

  it('allows a request without an Origin header', async () => {
    const response = await request(app).post('/cookie-action')

    expect(response.status).toBe(204)
  })
})
