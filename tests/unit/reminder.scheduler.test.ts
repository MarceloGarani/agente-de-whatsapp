jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
    GOOGLE_USER_EMAIL: '',
    WHATSAPP_USER_PHONE: '5511999999999',
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

jest.mock('../../src/services/calendar.service', () => ({
  listUpcoming: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/whatsapp.client', () => ({
  sendText: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

import { checkAndSendReminders, sentReminders } from '../../src/services/reminder.scheduler';
import { listUpcoming } from '../../src/services/calendar.service';
import { sendText } from '../../src/services/whatsapp.client';
import { messages } from '../../src/utils/messages';

const mockListUpcoming = listUpcoming as jest.MockedFunction<typeof listUpcoming>;
const mockSendText = sendText as jest.MockedFunction<typeof sendText>;

describe('Reminder Scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sentReminders.clear();
  });

  it('sends reminders for upcoming events', async () => {
    const now = new Date();
    const in15Min = new Date(now.getTime() + 15 * 60_000).toISOString();
    const in20Min = new Date(now.getTime() + 20 * 60_000).toISOString();

    mockListUpcoming.mockResolvedValue([
      {
        eventId: 'ev-1',
        title: 'Dentista',
        startTime: in15Min,
        endTime: new Date(now.getTime() + 75 * 60_000).toISOString(),
      },
      {
        eventId: 'ev-2',
        title: 'Reuniao time',
        startTime: in20Min,
        endTime: new Date(now.getTime() + 80 * 60_000).toISOString(),
      },
    ]);

    await checkAndSendReminders();

    expect(mockListUpcoming).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledTimes(2);
    expect(mockSendText).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Dentista'),
    );
    expect(mockSendText).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('Reuniao time'),
    );
    expect(sentReminders.has('ev-1')).toBe(true);
    expect(sentReminders.has('ev-2')).toBe(true);
  });

  it('does not resend reminders for already-sent events', async () => {
    const now = new Date();
    const in15Min = new Date(now.getTime() + 15 * 60_000).toISOString();

    const events = [
      {
        eventId: 'ev-1',
        title: 'Dentista',
        startTime: in15Min,
        endTime: new Date(now.getTime() + 75 * 60_000).toISOString(),
      },
    ];

    mockListUpcoming.mockResolvedValue(events);

    // First cycle — sends reminder
    await checkAndSendReminders();
    expect(mockSendText).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mockListUpcoming.mockResolvedValue(events);

    // Second cycle — same event, should NOT resend
    await checkAndSendReminders();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('handles Calendar API failure gracefully', async () => {
    mockListUpcoming.mockRejectedValue(new Error('Calendar unavailable'));

    await checkAndSendReminders();

    expect(mockSendText).not.toHaveBeenCalled();
    // Should not throw — just logs error
  });

  it('includes Meet link in reminder when available', async () => {
    const now = new Date();
    const in10Min = new Date(now.getTime() + 10 * 60_000).toISOString();

    mockListUpcoming.mockResolvedValue([
      {
        eventId: 'ev-meet',
        title: 'Daily standup',
        startTime: in10Min,
        endTime: new Date(now.getTime() + 70 * 60_000).toISOString(),
        meetLink: 'https://meet.google.com/abc-defg-hij',
      },
    ]);

    await checkAndSendReminders();

    expect(mockSendText).toHaveBeenCalledWith(
      '5511999999999',
      expect.stringContaining('https://meet.google.com/abc-defg-hij'),
    );
  });

  it('sends reminder without Meet link when not available', async () => {
    const now = new Date();
    const in10Min = new Date(now.getTime() + 10 * 60_000).toISOString();

    mockListUpcoming.mockResolvedValue([
      {
        eventId: 'ev-no-meet',
        title: 'Almoco',
        startTime: in10Min,
        endTime: new Date(now.getTime() + 70 * 60_000).toISOString(),
      },
    ]);

    await checkAndSendReminders();

    const sentMessage = mockSendText.mock.calls[0][1];
    expect(sentMessage).toContain('Almoco');
    expect(sentMessage).not.toContain('Link Meet');
  });

  it('continues sending other reminders when one sendText fails', async () => {
    const now = new Date();
    const in10Min = new Date(now.getTime() + 10 * 60_000).toISOString();

    mockListUpcoming.mockResolvedValue([
      {
        eventId: 'ev-fail',
        title: 'Evento falha',
        startTime: in10Min,
        endTime: new Date(now.getTime() + 70 * 60_000).toISOString(),
      },
      {
        eventId: 'ev-ok',
        title: 'Evento ok',
        startTime: in10Min,
        endTime: new Date(now.getTime() + 70 * 60_000).toISOString(),
      },
    ]);

    mockSendText
      .mockRejectedValueOnce(new Error('WhatsApp error'))
      .mockResolvedValueOnce(undefined);

    await checkAndSendReminders();

    expect(mockSendText).toHaveBeenCalledTimes(2);
    // First failed — not added to Set
    expect(sentReminders.has('ev-fail')).toBe(false);
    // Second succeeded — added to Set
    expect(sentReminders.has('ev-ok')).toBe(true);
  });
});
