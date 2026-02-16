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
  sendText: jest.fn().mockResolvedValue(undefined),
  sendProcessingMessage: jest.fn().mockResolvedValue(undefined),
  downloadMedia: jest.fn().mockResolvedValue(Buffer.from('fake-file-content')),
}));

jest.mock('../../src/services/intent-classifier', () => ({
  classifyIntent: jest.fn().mockResolvedValue({
    intent: 'ajuda',
    entities: {},
    confidence: 0.95,
    rawText: 'ajuda',
  }),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    on: jest.fn(),
  })),
}));

jest.mock('../../src/services/calendar.service', () => ({
  createEvent: jest.fn().mockResolvedValue({
    eventId: 'ev-int-123',
    title: 'Test Event',
    startTime: '2026-02-17T18:00:00.000Z',
    endTime: '2026-02-17T19:00:00.000Z',
    meetLink: undefined,
  }),
  deleteEvent: jest.fn().mockResolvedValue(undefined),
  findEventsByTitle: jest.fn().mockResolvedValue([]),
  resolveDateTime: jest.fn().mockReturnValue({
    startTime: '2026-02-17T18:00:00.000Z',
    endTime: '2026-02-17T19:00:00.000Z',
  }),
  formatDateTimeBR: jest.fn().mockReturnValue({ data: '17/02', hora: '15:00' }),
  listUpcoming: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/email.service', () => ({
  sendMeetingInvite: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/audio-transcriber', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('texto transcrito do audio'),
}));

jest.mock('../../src/services/reminder.scheduler', () => ({
  startScheduler: jest.fn(),
}));

jest.mock('../../src/services/drive.service', () => ({
  uploadFile: jest.fn().mockResolvedValue({
    fileId: 'file-int-123',
    webViewLink: 'https://drive.google.com/file/d/file-int-123/view',
    folderPath: 'documentos/02-2026/',
    filename: 'test.pdf',
  }),
  getMimeCategory: jest.fn().mockReturnValue('documentos'),
}));

jest.mock('pino-http', () => {
  return jest.fn().mockReturnValue(
    (_req: unknown, _res: unknown, next: () => void) => next()
  );
});

import request from 'supertest';
import { app } from '../../src/server';

describe('Webhook Integration', () => {
  describe('GET /webhook', () => {
    it('returns challenge with valid verify token', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-verify',
          'hub.challenge': 'challenge123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge123');
    });

    it('returns 403 with invalid verify token', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge123',
        });

      expect(res.status).toBe(403);
    });

    it('returns 403 without hub.mode subscribe', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.verify_token': 'test-verify',
          'hub.challenge': 'challenge123',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhook', () => {
    it('returns 200 immediately for text message payload', async () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'text',
                text: { body: 'ajuda' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const res = await request(app)
        .post('/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('returns 200 for document upload payload', async () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '5511999999999',
                type: 'document',
                document: { id: 'doc-int-456', mime_type: 'application/pdf', filename: 'test.pdf' },
                timestamp: '1708100000',
              }],
            },
          }],
        }],
      };

      const res = await request(app)
        .post('/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('returns 200 for empty payload (status updates)', async () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: 'status-1' }],
            },
          }],
        }],
      };

      const res = await request(app)
        .post('/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
