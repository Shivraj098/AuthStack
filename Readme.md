# Auth App — Production-grade authentication system

Full-stack authentication and authorization system built with industry-standard security practices.

## Stack

**Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, React Router 7, TanStack Query 5  
**Backend:** Node.js 22 LTS, Express 5, TypeScript, Prisma 7, PostgreSQL 17, Redis 8  
**Security:** JWT with rotation, bcrypt cost 12, httpOnly cookies, PKCE OAuth, TOTP MFA, Redis blacklisting  
**Testing:** Vitest, Supertest, 80+ tests

## Features

- Email/password registration with verification
- JWT access tokens (15min) + rotating refresh tokens (7d)
- Token blacklisting on logout via Redis
- Account lockout after 5 failed attempts
- Password reset with 1-hour expiring tokens
- Google and GitHub OAuth 2.0 with PKCE
- Role-based access control (admin, moderator, user)
- TOTP two-factor authentication with backup codes
- Audit logging for all security events
- Session management (view and revoke active sessions)
- Structured logging with Pino

## Prerequisites

- Node.js 22+
- Docker and Docker Compose
- A Google OAuth app and GitHub OAuth app

## Local development — running in under 10 minutes

### 1. Clone and install

```bash
git clone <repo-url>
cd auth-app
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. Required fields:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — from GitHub Developer Settings
- `SMTP_*` — use [Ethereal](https://ethereal.email) for development

### 3. Start infrastructure

```bash
docker compose up -d
```

Postgres and Redis start with health checks. Wait for both to show `healthy`:

```bash
docker compose ps
```

### 4. Initialize database

```bash
cd server
npx prisma migrate dev
npx prisma db seed
```

### 5. Start development servers

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

App runs at: **http://localhost:5173**  
API docs at: **http://localhost:3000/api/docs**  
Prisma Studio: `cd server && npx prisma studio`

### Seeded test accounts

| Email             | Password     | Role  |
| ----------------- | ------------ | ----- |
| admin@example.com | Admin@123456 | admin |
| user@example.com  | User@123456  | user  |

## Running tests

```bash
# Create test database
docker exec auth_postgres psql -U authuser -c "CREATE DATABASE authdb_test;"

# Run tests
cd server && npm test

# With coverage
npm run test:coverage
```

## Production deployment

### 1. Generate secrets

```bash
node scripts/generate-secrets.js
```

### 2. Configure production environment

```bash
cp .env.production.example .env.prod
# Edit .env.prod with real values from step 1
```

### 3. Build and deploy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 4. Verify

```bash
docker compose -f docker-compose.prod.yml logs -f
curl http://your-domain.com/api/health
```

## Architecture

```
Client (React + Nginx :80)
    ↓ /api/* proxy
Server (Node + Express :3000)
    ↓ Prisma ORM
PostgreSQL :5432     Redis :6379
```

All services communicate on an internal Docker network. Only port 80/443 is exposed externally.

## Security notes

- Passwords hashed with bcrypt cost factor 12
- Access tokens expire in 15 minutes and live only in memory
- Refresh tokens rotate on every use — theft detection built in
- All tokens stored as SHA-256 hashes in the database
- httpOnly cookies prevent JavaScript token access
- PKCE prevents OAuth authorization code interception
- Rate limiting via Redis — works across multiple server instances
- Audit log is append-only — every security event recorded
