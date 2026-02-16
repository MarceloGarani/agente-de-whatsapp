jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
    GOOGLE_USER_EMAIL: 'user@gmail.com',
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

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  }),
}));

import { sendMeetingInvite } from '../../src/services/email.service';
import nodemailer from 'nodemailer';

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMeetingInvite', () => {
    it('sends meeting invite email with correct params', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-123' });

      await sendMeetingInvite(
        'joao@email.com',
        'Daily Standup',
        'https://meet.google.com/abc-defg-hij',
        '17/02 as 10:00',
      );

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'gmail',
          auth: expect.objectContaining({
            type: 'OAuth2',
            user: 'user@gmail.com',
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            refreshToken: 'test-refresh-token',
          }),
        }),
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'user@gmail.com',
          to: 'joao@email.com',
          subject: 'Convite: Daily Standup',
        }),
      );

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('Daily Standup');
      expect(mailOptions.html).toContain('https://meet.google.com/abc-defg-hij');
      expect(mailOptions.html).toContain('17/02 as 10:00');
    });

    it('throws on sendMail failure', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(
        sendMeetingInvite('bad@email.com', 'Test', 'https://meet.google.com/xxx', '17/02 as 10:00'),
      ).rejects.toThrow();
    });
  });
});
