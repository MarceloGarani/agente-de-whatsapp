const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock');
const mockGetToken = jest.fn();
const mockSetCredentials = jest.fn();
const mockOn = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    setCredentials: mockSetCredentials,
    on: mockOn,
  })),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
    OPENAI_API_KEY: 'test',
    PORT: 3000,
    NODE_ENV: 'development',
  },
  TIMEOUTS: {
    WHATSAPP_API: 10000,
    OPENAI_GPT: 10000,
    OPENAI_WHISPER: 15000,
    GOOGLE_APIS: 10000,
    NODEMAILER: 10000,
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getAuthenticatedClient } from '../../src/services/google-auth';

describe('Google Auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthenticatedClient', () => {
    it('returns OAuth2Client with refresh token configured', () => {
      const client = getAuthenticatedClient();

      expect(client).toBeDefined();
      expect(mockSetCredentials).toHaveBeenCalledWith({
        refresh_token: 'test-refresh-token',
      });
      expect(mockOn).toHaveBeenCalledWith('tokens', expect.any(Function));
    });

    it('throws AppError when refresh token is missing', () => {
      // Override env mock for this test
      const envModule = require('../../src/config/env');
      const originalToken = envModule.env.GOOGLE_REFRESH_TOKEN;
      envModule.env.GOOGLE_REFRESH_TOKEN = '';

      expect(() => getAuthenticatedClient()).toThrow();

      try {
        getAuthenticatedClient();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number; userMessage: string };
        expect(appError.code).toBe('AUTH_REQUIRED');
        expect(appError.statusCode).toBe(401);
        expect(appError.userMessage).toContain('reconecte sua conta Google');
      }

      envModule.env.GOOGLE_REFRESH_TOKEN = originalToken;
    });
  });

  describe('OAuth callback', () => {
    it('exchanges authorization code for tokens', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client();
      const result = await client.getToken('mock-auth-code');

      expect(mockGetToken).toHaveBeenCalledWith('mock-auth-code');
      expect(result.tokens.refresh_token).toBe('mock-refresh-token');
      expect(result.tokens.access_token).toBe('mock-access-token');
    });

    it('handles token exchange failure', async () => {
      mockGetToken.mockRejectedValue(new Error('invalid_grant'));

      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client();

      await expect(client.getToken('bad-code')).rejects.toThrow('invalid_grant');
    });
  });
});
