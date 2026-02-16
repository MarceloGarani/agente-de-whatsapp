jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: '',
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

jest.mock('../../src/services/whatsapp.client', () => ({
  sendText: jest.fn(),
  downloadMedia: jest.fn(),
  sendProcessingMessage: jest.fn(),
}));

jest.mock('../../src/services/message-router', () => ({
  routeMessage: jest.fn(),
}));

import { extractMessage } from '../../src/webhooks/whatsapp.handler';

describe('WhatsApp Webhook Handler', () => {
  describe('extractMessage', () => {
    it('extracts text message from valid payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'text',
                text: { body: 'Olá assistente' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const result = extractMessage(payload);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('5511999999999');
      expect(result!.type).toBe('text');
      expect(result!.text).toBe('Olá assistente');
      expect(result!.timestamp).toBe('1708100000');
    });

    it('extracts audio message from valid payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'audio',
                audio: { id: 'audio-123', mime_type: 'audio/ogg; codecs=opus' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const result = extractMessage(payload);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('audio');
      expect(result!.mediaId).toBe('audio-123');
      expect(result!.mimeType).toBe('audio/ogg; codecs=opus');
    });

    it('extracts document message from valid payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'document',
                document: { id: 'doc-456', mime_type: 'application/pdf', filename: 'relatorio.pdf' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const result = extractMessage(payload);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('document');
      expect(result!.mediaId).toBe('doc-456');
      expect(result!.filename).toBe('relatorio.pdf');
    });

    it('extracts image message from valid payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'image',
                image: { id: 'img-789', mime_type: 'image/jpeg' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const result = extractMessage(payload);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('image');
      expect(result!.mediaId).toBe('img-789');
    });

    it('returns null for empty payload', () => {
      expect(extractMessage({})).toBeNull();
      expect(extractMessage(null)).toBeNull();
      expect(extractMessage(undefined)).toBeNull();
    });

    it('returns null for payload without messages', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: 'status-1' }],
            },
          }],
        }],
      };

      expect(extractMessage(payload)).toBeNull();
    });

    it('returns unknown type for unsupported message type', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'sticker',
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const result = extractMessage(payload);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('unknown');
    });
  });
});
