# Auth App — Production-grade authentication system

Full-stack authentication and authorization system built with industry-standard security practices.

## Stack

**Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, React Router 7, TanStack Query 5  
**Backend:** Node.js 22 LTS# AuthStack

AuthStack is a full-stack authentication and authorization application built with TypeScript, React, Express, PostgreSQL, Prisma, and Redis. The project focuses on account security, session management, identity verification, and role-based access control.

## Technology stack

**Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5.

**Backend:** Node.js 22, Express 5, TypeScript, Prisma 7, PostgreSQL 17, Redis 8.

**Authentication and security:** JWT access tokens, refresh-token rotation, password hashing with bcrypt, email verification, password recovery, Google and GitHub OAuth, TOTP multi-factor authentication, backup codes, and role-based authorization.

**Email delivery:** Resend.

**Testing and quality:** Vitest, Supertest, ESLint, TypeScript, and GitHub Actions.

## Application capabilities

The repository contains implementations for the following workflows:

- Email and password registration with email verification.
- Access-token authentication and refresh-token handling.
- Logout and session management.
- Password reset and password changes.
- Google and GitHub OAuth integration.
- Role-based access control for users, moderators, and administrators.
- TOTP multi-factor authentication and backup codes.
- Account security activity and audit logs.
- Administrative user and role management.
- Structured server logging and API documentation.

Security-sensitive workflows are being validated and hardened as part of ongoing development. The presence of a feature in this list should not be interpreted as proof that every edge case has already been verified.

## Architecture

The application is organized as an npm workspace with separate client and server packages.

```text
AuthStack
├── client/                 React frontend
├── server/
│   ├── prisma/              Schema and database migrations
│   └── src/
│       ├── config/          Environment and infrastructure setup
│       ├── controllers/     HTTP request handling
│       ├── middleware/      Authentication and request middleware
│       ├── routes/          API routes
│       ├── services/        Application and business logic
│       └── tests/           Unit and integration tests
├── .github/workflows/       CI workflow
├── package.json             Workspace scripts and dependencies
└── package-lock.json        Dependency lockfile
```

The client communicates with the Express API. The backend uses PostgreSQL through Prisma and Redis for authentication-related state and rate limiting.

## Prerequisites

- Node.js 22 or a compatible supported release.
- npm.
- Docker Desktop with Docker Compose, for local PostgreSQL and Redis.
- Google and GitHub OAuth applications if you intend to test those login providers.
- A Resend account and a verified sender configuration if you intend to test real email delivery outside automated tests.

## Local development setup

### 1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd auth-app
npm ci
```

Install dependencies from the repository root. The root package manifest defines the client and server as npm workspaces.

### 2. Configure the local environment

Create a local environment file from the example:

```bash
cp .env.example .env
```

On PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Configure the values required by the application, including:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CLIENT_URL`
- OAuth credentials, when required

Use local database and Redis URLs for development. Generate distinct, strong JWT secrets for your own environment. Never commit `.env` or put production credentials into source control.

The backend validates required environment variables at startup. If a variable is missing or invalid, correct the configuration rather than bypassing validation.

### 3. Start PostgreSQL and Redis

Start the local infrastructure:

```bash
docker compose up -d
docker compose ps
```

Wait for PostgreSQL and Redis to become healthy.

The default local Compose configuration uses PostgreSQL database `authdb` and password-protected Redis. If you customize the credentials in `.env`, keep the application connection strings consistent with those settings.

### 4. Apply database migrations

From the repository root, run:

```bash
npm run build --workspace=server
```

Then apply the development migration from the server workspace:

```bash
cd server
npx prisma migrate dev
```

Return to the repository root after completing the database setup.

Migrations are the source of truth for database schema changes. Avoid using `prisma db push` as a replacement for the project's migration history.

### 5. Initialize local demo data

The repository includes a seed script for development data.

If you choose to use it, inspect `server/prisma/seed.ts` first. Its demonstration accounts and fixed credentials are for local development only. Never run the demo seed against a production database.

Production role and administrator initialization must follow an explicitly controlled deployment procedure.

### 6. Start the application

Start the backend:

```bash
npm run dev:server
```

In a second terminal, start the frontend:

```bash
npm run dev:client
```

The default local frontend URL is `http://localhost:5173`. The API defaults to port `3000`, unless configured otherwise.

API documentation is available at `/api/docs` on the running backend.

## Test environment and safety

Automated tests must use a database and Redis instance dedicated to testing. They must never use a production database URL or production Redis credentials.

The test environment is configured separately from `.env`. Create `.env.test` from the committed, non-secret test template once it is available, then configure it for your local test infrastructure.

Use a separate PostgreSQL database named `authdb_test` and local Redis database `1`. The credentials must match the local services you configured.

Create the test database only after ensuring the local PostgreSQL service is the intended target. For example, with the default local Compose service:

```bash
docker exec auth_postgres psql -U authuser -d postgres \
  -c "CREATE DATABASE authdb_test;"
```

If the database already exists, do not repeatedly recreate it or run destructive commands against an unverified target.

Before running tests, ensure the environment configuration points to the dedicated test database and Redis instance. The test setup is designed to reject unsafe targets because test cleanup removes data.

### Run quality checks

From the repository root:

```bash
npm run typecheck --workspace=server
npm run typecheck --workspace=client
npm run lint
```

Run the server test suite with coverage after the isolated test infrastructure has been verified:

```bash
npm run test:coverage --workspace=server
```

Useful alternatives include:

```bash
npm run test --workspace=server
npm run test:unit --workspace=server
npm run test:integration --workspace=server
```

Integration tests require the database and Redis setup described above. Do not run them against production resources.

Automated tests should mock email delivery. Real email-provider verification should be a separate, explicitly controlled activity using dedicated credentials and recipients.

## Environment configuration

Keep environments separate.

| Environment       | Database                     | Credentials                    |
| ----------------- | ---------------------------- | ------------------------------ |
| Local development | Local development PostgreSQL | Local-only `.env`              |
| Automated tests   | Dedicated test database      | `.env.test` and CI-only values |
| Production        | Supabase PostgreSQL          | Render environment variables   |

Do not commit `.env`, `.env.test`, or real API credentials. Commit non-secret example files instead.

The backend requires valid database, Redis, JWT, email, and client-origin configuration. OAuth credentials are required when enabling their corresponding providers.

## Continuous integration

GitHub Actions is configured to validate changes on pushes and pull requests targeting `main` and `develop`.

The workflow should verify:

- Dependency installation from the committed lockfile.
- Server and client TypeScript checks.
- ESLint.
- Server tests against isolated PostgreSQL and Redis services.
- Server and client production builds.
- Coverage artifact publication.

The CI pipeline must not use production database credentials, production Redis credentials, or a real Resend API key.

A green workflow is evidence that the checks defined in CI passed; it is not a substitute for verifying deployed behavior and security-sensitive edge cases.

## Production deployment

The current deployment uses Render for the backend and Supabase for PostgreSQL.

### Database

Production `DATABASE_URL` belongs in the Render backend's environment configuration. Use the appropriate Supabase connection string for your deployment's network requirements.

Apply version-controlled Prisma migrations during deployment using:

```bash
npx prisma migrate deploy
```

Run this from the server workspace in the configured production environment. A failed migration must be treated as a deployment failure; do not start the application against an incompatible schema.

Do not use the local development seed script in production.

### Backend environment

Configure the required production environment variables in Render, including:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CLIENT_URL`
- `SERVER_URL`

Set OAuth credentials when those providers are enabled.

Do not copy production secrets into `.env.test`, CI workflow source, or public documentation.

### Deployment verification

After deployment, verify the service logs and health endpoint. Confirm that PostgreSQL and Redis connections are established and that the API behaves as expected.

Deployment configuration, migration status, email delivery, and authentication workflows should be verified independently rather than inferred solely from a successful build.

The Docker Compose production files are an alternative deployment path and must be validated separately before use.

## Security and contribution practices

- Never commit production credentials or user data.
- Keep local, test, and production environments separate.
- Treat test database and Redis cleanup as destructive operations.
- Use Prisma migrations for schema changes.
- Validate request data at API boundaries.
- Avoid logging tokens, passwords, verification links, or sensitive query parameters.
- Add regression tests for security-sensitive behavior and concurrency scenarios.
- Keep README instructions aligned with the commands and configuration in the repository.
- Require CI checks to pass before merging changes.

## License

Add the project's chosen license and attribution information here before distributing the repository under an open-source license.
, Express 5, TypeScript, Prisma 7, PostgreSQL 17, Redis 8  
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
