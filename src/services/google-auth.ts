import { OAuth2Client } from 'google-auth-library';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/error-handler.js';
import { messages } from '../utils/messages.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
];

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);

export function getAuthenticatedClient(): OAuth2Client {
  if (!env.GOOGLE_REFRESH_TOKEN) {
    logger.error(
      { service: 'google-auth', action: 'get-client' },
      'GOOGLE_REFRESH_TOKEN not configured. Run GET /auth/google to authorize.',
    );
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    throw new AppError(
      'AUTH_REQUIRED',
      401,
      messages.errors.authError.replace('{authUrl}', authUrl),
      'google-auth',
    );
  }

  oauth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

  oauth2Client.on('tokens', (tokens) => {
    logger.info(
      { service: 'google-auth', action: 'token-refresh' },
      'Access token refreshed automatically',
    );
    if (tokens.refresh_token) {
      logger.warn(
        { service: 'google-auth', action: 'new-refresh-token' },
        'New refresh token received. Update GOOGLE_REFRESH_TOKEN in .env',
      );
    }
  });

  return oauth2Client;
}

export const authRouter = Router();

authRouter.get('/auth/google', (_req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  logger.info({ service: 'google-auth', action: 'redirect' }, 'Redirecting to Google consent screen');
  res.redirect(authUrl);
});

authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    logger.warn({ service: 'google-auth', action: 'callback' }, 'No authorization code received');
    res.status(400).send('Authorization code not provided.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    logger.info({ service: 'google-auth', action: 'token-exchange' }, 'Authorization code exchanged for tokens');

    if (tokens.refresh_token) {
      logger.info(
        { service: 'google-auth', action: 'refresh-token-received' },
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token} — copie e cole no .env`,
      );
    } else {
      logger.warn(
        { service: 'google-auth', action: 'no-refresh-token' },
        'Nenhum refresh_token recebido (ja autorizado anteriormente). Revogue o acesso e tente novamente se precisar de um novo token.',
      );
    }

    res.status(200).send(`
      <html>
        <head><title>Google Auth - Success</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px;">
          <h1>Autorizacao concluida!</h1>
          <p>O <strong>refresh_token</strong> foi exibido nos <strong>logs do servidor</strong> (terminal).</p>
          <p>Copie o valor de <code>GOOGLE_REFRESH_TOKEN</code> dos logs e cole no seu arquivo <code>.env</code>.</p>
          <p>Apos atualizar o <code>.env</code>, reinicie o servidor.</p>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error({ service: 'google-auth', action: 'token-exchange', error }, 'Failed to exchange authorization code');
    res.status(500).send('Failed to exchange authorization code. Check server logs.');
  }
});
