import crypto from 'crypto'
import axiosLib from 'axios'
import { prisma } from '../config/database.js'
import { redisClient } from '../config/redis.js'
import { env } from '../config/env.js'
import { AppError, AuthenticationError } from '../utils/error.js'
import { signAccessToken, signRefreshToken } from '../utils/jwt.js'
import { hashToken } from '../utils/token.js'
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────────

type OAuthProvider = 'google' | 'github'

interface OAuthConfig {
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string[]
}

interface OAuthUserProfile {
  providerUserId: string
  email: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
}

// ── Provider configurations ────────────────────────────────────────

const providers: Record<OAuthProvider, OAuthConfig> = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
}

// ── PKCE helpers ───────────────────────────────────────────────────

function generateCodeVerifier(): string {
  // 43-128 chars of URL-safe random bytes — RFC 7636 requirement
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  // S256 method: SHA-256 hash of the verifier, base64url encoded
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ── OAuth Service ──────────────────────────────────────────────────

class OAuthService {
  // Step 1: Generate the authorization URL the user is redirected to
  async getAuthorizationUrl(provider: OAuthProvider): Promise<string> {
    const config = providers[provider]

    // PKCE: generate verifier and challenge pair
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // State: random string to prevent CSRF on the callback
    const state = crypto.randomBytes(16).toString('hex')

    // Store both in Redis — expire after 10 minutes
    // User must complete the OAuth flow within 10 minutes
    const key = `oauth:${state}`
    await redisClient.set(key, JSON.stringify({ codeVerifier, provider }), { EX: 600 })

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${env.SERVER_URL}/api/auth/callback/${provider}`,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      // PKCE parameters
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Google-specific: force account selection even if logged in
      ...(provider === 'google' && { prompt: 'select_account' }),
    })

    return `${config.authorizationUrl}?${params.toString()}`
  }

  // Step 2: Handle the callback — exchange code for tokens, get user profile
  async handleCallback(
    provider: OAuthProvider,
    code: string,
    state: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{
    accessToken: string
    refreshToken: string
    isNewUser: boolean
  }> {
    // Validate state — prevents CSRF
    const stateKey = `oauth:${state}`
    const stored = await redisClient.get(stateKey)

    if (!stored) {
      throw new AuthenticationError('Invalid or expired OAuth state. Please try again.')
    }

    // Delete immediately — state is single-use
    await redisClient.del(stateKey)

    const { codeVerifier, provider: storedProvider } = JSON.parse(stored) as {
      codeVerifier: string
      provider: OAuthProvider
    }

    // Ensure the state was created for this provider
    // Prevents state from one provider being used on another's callback
    if (storedProvider !== provider) {
      throw new AuthenticationError('OAuth state mismatch')
    }

    const config = providers[provider]

    // Exchange authorization code for provider's access token
    // We must include the code_verifier — provider hashes it and
    // compares against the code_challenge we sent in step 1
    const providerAccessToken = await this.exchangeCodeForToken(
      config,
      code,
      codeVerifier,
      provider
    )

    // Fetch the user's profile from the provider
    const profile = await this.fetchUserProfile(provider, providerAccessToken)

    // Find or create the user in our database
    const { user, isNewUser } = await this.findOrCreateUser(profile, provider)

    // Issue our own tokens — not the provider's
    const roles = user.roles.map((ur) => ur.role.name)

    const tokenId = randomUUID()
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      tokenId,
    })
    const refreshToken = signRefreshToken({ sub: user.id, tokenId })

    const refreshTokenHash = hashToken(refreshToken)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id,
        tokenHash: refreshTokenHash,
        deviceInfo: meta.userAgent ?? null,
        ipAddress: meta.ip ?? null,
        expiresAt,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        event: isNewUser ? 'USER_REGISTERED_OAUTH' : 'USER_LOGIN_OAUTH',
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: { provider, email: user.email },
      },
    })

    return { accessToken, refreshToken, isNewUser }
  }

  // ── Private helpers ────────────────────────────────────────────

  private async exchangeCodeForToken(
    config: OAuthConfig,
    code: string,
    codeVerifier: string,
    provider: OAuthProvider
  ): Promise<string> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.SERVER_URL}/api/auth/callback/${provider}`,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: codeVerifier, // PKCE proof
      })

      const response = await axiosLib.post<{ access_token: string }>(
        config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }
      )

      const token = response.data.access_token
      if (!token) {
        throw new AppError('No access token in provider response', 502, 'OAUTH_ERROR', false)
      }

      return token
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('Failed to exchange OAuth code', 502, 'OAUTH_ERROR', false)
    }
  }

  private async fetchUserProfile(
    provider: OAuthProvider,
    accessToken: string
  ): Promise<OAuthUserProfile> {
    const config = providers[provider]

    try {
      if (provider === 'google') {
        return await this.fetchGoogleProfile(config.userInfoUrl, accessToken)
      } else {
        return await this.fetchGithubProfile(accessToken)
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('Failed to fetch user profile from provider', 502, 'OAUTH_ERROR', false)
    }
  }

  private async fetchGoogleProfile(
    userInfoUrl: string,
    accessToken: string
  ): Promise<OAuthUserProfile> {
    const res = await axiosLib.get<{
      sub: string
      email: string
      email_verified: boolean
      given_name?: string
      family_name?: string
      picture?: string
    }>(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = res.data

    if (!data.email_verified) {
      throw new AuthenticationError(
        'Google account email is not verified. Please verify your Google email first.'
      )
    }

    return {
      providerUserId: data.sub,
      email: data.email.toLowerCase(),
      emailVerified: data.email_verified,
      firstName: data.given_name ?? null,
      lastName: data.family_name ?? null,
      avatarUrl: data.picture ?? null,
    }
  }

  private async fetchGithubProfile(accessToken: string): Promise<OAuthUserProfile> {
    // GitHub requires two calls — user info and emails separately
    // The primary email is not always in the user object
    const [userRes, emailsRes] = await Promise.all([
      axiosLib.get<{
        id: number
        name?: string
        avatar_url?: string
        email?: string
      }>('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      }),
      axiosLib.get<
        Array<{
          email: string
          primary: boolean
          verified: boolean
        }>
      >('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      }),
    ])

    const user = userRes.data
    const emails = emailsRes.data

    // Find the primary verified email
    const primaryEmail = emails.find((e) => e.primary && e.verified)

    if (!primaryEmail) {
      throw new AuthenticationError(
        'No verified email found on your GitHub account. Please verify your GitHub email first.'
      )
    }

    // Parse name into first/last
    const nameParts = (user.name ?? '').trim().split(' ')
    const firstName = nameParts[0] ?? null
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

    return {
      providerUserId: String(user.id),
      email: primaryEmail.email.toLowerCase(),
      emailVerified: true,
      firstName,
      lastName,
      avatarUrl: user.avatar_url ?? null,
    }
  }

  private async findOrCreateUser(profile: OAuthUserProfile, provider: OAuthProvider) {
    // Check if this provider account is already linked
    const existingOAuth = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    })

    if (existingOAuth) {
      // Known OAuth account — update profile data that may have changed
      await prisma.user.update({
        where: { id: existingOAuth.userId },
        data: {
          avatarUrl: profile.avatarUrl,
          // Only update name if the user hasn't set their own
          firstName: existingOAuth.user.firstName ?? profile.firstName,
          lastName: existingOAuth.user.lastName ?? profile.lastName,
        },
      })

      return { user: existingOAuth.user, isNewUser: false }
    }

    // Check if a user with this email already exists (account linking)
    const existingUser = await prisma.user.findUnique({
      where: { email: profile.email },
      include: {
        roles: { include: { role: true } },
      },
    })

    if (existingUser) {
      // Link this OAuth provider to the existing account
      // Only safe because we verified the email is verified by the provider
      await prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
          expiresAt: null,
        },
      })

      // Mark email as verified if it wasn't already
      if (!existingUser.isVerified) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { isVerified: true },
        })
      }

      return { user: existingUser, isNewUser: false }
    }

    // New user — create account via OAuth
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
      select: { id: true },
    })

    if (!userRole) {
      throw new AppError('Default role not found', 500, 'SETUP_ERROR', false)
    }

    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatarUrl: profile.avatarUrl,
          // OAuth users have no password — nullable field
          passwordHash: null,
          // Email is verified because the provider confirmed it
          isVerified: true,
          roles: {
            create: { roleId: userRole.id },
          },
          oauthAccounts: {
            create: {
              provider,
              providerUserId: profile.providerUserId,
            },
          },
        },
        include: {
          roles: { include: { role: true } },
        },
      })

      return created
    })

    return { user: newUser, isNewUser: true }
  }
}

export const oauthService = new OAuthService()
