import { Request, Response } from 'express'
import { oauthService } from '../services/oauth.service.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/error.js'

type OAuthProvider = 'google' | 'github'
const VALID_PROVIDERS: OAuthProvider[] = ['google', 'github']

class OAuthController {
  // Redirects the user to the provider's login page
  async authorize(req: Request, res: Response): Promise<void> {
    const provider = req.params['provider'] as OAuthProvider

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new AppError('Invalid OAuth provider', 400, 'INVALID_PROVIDER')
    }

    const url = await oauthService.getAuthorizationUrl(provider)
    res.redirect(url)
  }

  // Handles the redirect back from the provider
  async callback(req: Request, res: Response): Promise<void> {
    const provider = req.params['provider'] as OAuthProvider
    const { code, state, error } = req.query as Record<string, string>

    // User denied access on the provider's page
    if (error) {
      res.redirect(`${env.CLIENT_URL}/login?error=oauth_denied`)
      return
    }

    if (!code || !state) {
      res.redirect(`${env.CLIENT_URL}/login?error=oauth_invalid`)
      return
    }

    const meta = {
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    }

    const result = await oauthService.handleCallback(provider, code, state, meta)

    // Set refresh token cookie — same settings as regular login
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    })

    // Redirect to frontend with access token in URL fragment (#)
    // Fragment (#) is never sent to servers — only the browser sees it
    // The frontend reads it from window.location.hash and stores
    // it in memory, then immediately cleans the URL
    res.redirect(
      `${env.CLIENT_URL}/oauth/callback#token=${result.accessToken}&new=${result.isNewUser}`
    )
  }
}

export const oauthController = new OAuthController()
