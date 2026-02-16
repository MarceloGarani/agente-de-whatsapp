jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
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

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: jest.fn(),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    on: jest.fn(),
  })),
}));

const mockEventsInsert = jest.fn();
const mockEventsList = jest.fn();
const mockEventsDelete = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn().mockReturnValue({
      events: {
        insert: (...args: unknown[]) => mockEventsInsert(...args),
        list: (...args: unknown[]) => mockEventsList(...args),
        delete: (...args: unknown[]) => mockEventsDelete(...args),
      },
    }),
  },
}));

import { createEvent, listUpcoming, deleteEvent, findEventsByTitle, resolveDateTime, formatDateTimeBR } from '../../src/services/calendar.service';

describe('Calendar Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('creates event with title and times', async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: 'event-123',
          summary: 'Dentista',
          start: { dateTime: '2026-02-17T15:00:00.000Z' },
          end: { dateTime: '2026-02-17T16:00:00.000Z' },
        },
      });

      const result = await createEvent(
        'Dentista',
        '2026-02-17T15:00:00.000Z',
        '2026-02-17T16:00:00.000Z',
      );

      expect(result.eventId).toBe('event-123');
      expect(result.title).toBe('Dentista');
      expect(result.startTime).toBe('2026-02-17T15:00:00.000Z');
      expect(result.endTime).toBe('2026-02-17T16:00:00.000Z');
      expect(result.meetLink).toBeUndefined();

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          requestBody: expect.objectContaining({
            summary: 'Dentista',
            start: expect.objectContaining({ timeZone: 'America/Sao_Paulo' }),
            end: expect.objectContaining({ timeZone: 'America/Sao_Paulo' }),
          }),
        }),
      );
    });

    it('uses default 1h duration when endTime not provided', async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: 'event-456', summary: 'Reuniao' },
      });

      const result = await createEvent('Reuniao', '2026-02-17T10:00:00.000Z');

      expect(result.startTime).toBe('2026-02-17T10:00:00.000Z');
      expect(result.endTime).toBe('2026-02-17T11:00:00.000Z');
    });

    it('includes description when provided', async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: 'event-789' },
      });

      await createEvent('Consulta', '2026-02-17T14:00:00.000Z', undefined, 'Consulta medica');

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            description: 'Consulta medica',
          }),
        }),
      );
    });

    it('creates event with Meet link when withMeet=true', async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: 'event-meet-1',
          summary: 'Daily',
          conferenceData: {
            entryPoints: [
              { uri: 'https://meet.google.com/abc-defg-hij', entryPointType: 'video' },
            ],
          },
        },
      });

      const result = await createEvent(
        'Daily',
        '2026-02-17T10:00:00.000Z',
        '2026-02-17T11:00:00.000Z',
        undefined,
        { withMeet: true },
      );

      expect(result.meetLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            conferenceData: expect.objectContaining({
              createRequest: expect.objectContaining({
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              }),
            }),
          }),
        }),
      );
    });

    it('includes attendees and sendUpdates when provided', async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: 'event-att-1', summary: 'Reuniao' },
      });

      await createEvent(
        'Reuniao',
        '2026-02-17T10:00:00.000Z',
        '2026-02-17T11:00:00.000Z',
        undefined,
        { attendees: ['joao@email.com', 'maria@email.com'] },
      );

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          sendUpdates: 'all',
          requestBody: expect.objectContaining({
            attendees: [{ email: 'joao@email.com' }, { email: 'maria@email.com' }],
          }),
        }),
      );
    });

    it('throws AppError on Calendar API error', async () => {
      mockEventsInsert.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        createEvent('Test', '2026-02-17T10:00:00.000Z'),
      ).rejects.toThrow();
    });
  });

  describe('listUpcoming', () => {
    it('returns events sorted by start time', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: 'ev-1',
              summary: 'Reuniao',
              start: { dateTime: '2026-02-17T10:00:00-03:00' },
              end: { dateTime: '2026-02-17T11:00:00-03:00' },
            },
            {
              id: 'ev-2',
              summary: 'Almoco',
              start: { dateTime: '2026-02-17T12:00:00-03:00' },
              end: { dateTime: '2026-02-17T13:00:00-03:00' },
            },
          ],
        },
      });

      const events = await listUpcoming(
        '2026-02-17T00:00:00-03:00',
        '2026-02-17T23:59:59-03:00',
      );

      expect(events).toHaveLength(2);
      expect(events[0].title).toBe('Reuniao');
      expect(events[1].title).toBe('Almoco');
    });

    it('returns empty array when no events', async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });

      const events = await listUpcoming(
        '2026-02-17T00:00:00-03:00',
        '2026-02-17T23:59:59-03:00',
      );

      expect(events).toHaveLength(0);
    });

    it('throws AppError on Calendar API error', async () => {
      mockEventsList.mockRejectedValue(new Error('403'));

      await expect(
        listUpcoming('2026-02-17T00:00:00Z', '2026-02-17T23:59:59Z'),
      ).rejects.toThrow();
    });
  });

  describe('deleteEvent', () => {
    it('deletes event with sendUpdates all', async () => {
      mockEventsDelete.mockResolvedValue({});

      await deleteEvent('event-to-delete');

      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-to-delete',
        sendUpdates: 'all',
      });
    });

    it('throws AppError on Calendar API error', async () => {
      mockEventsDelete.mockRejectedValue(new Error('404'));

      await expect(deleteEvent('bad-id')).rejects.toThrow();
    });
  });

  describe('findEventsByTitle', () => {
    it('returns events matching title (case-insensitive)', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: 'ev-1', summary: 'Reuniao Daily', start: { dateTime: '2026-02-18T10:00:00Z' }, end: { dateTime: '2026-02-18T11:00:00Z' } },
            { id: 'ev-2', summary: 'Almoco', start: { dateTime: '2026-02-18T12:00:00Z' }, end: { dateTime: '2026-02-18T13:00:00Z' } },
            { id: 'ev-3', summary: 'Reuniao Semanal', start: { dateTime: '2026-02-19T10:00:00Z' }, end: { dateTime: '2026-02-19T11:00:00Z' } },
          ],
        },
      });

      const results = await findEventsByTitle('reuniao', '2026-02-18T00:00:00Z', '2026-02-20T00:00:00Z');

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Reuniao Daily');
      expect(results[1].title).toBe('Reuniao Semanal');
    });

    it('returns empty array when no match', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: 'ev-1', summary: 'Dentista', start: { dateTime: '2026-02-18T10:00:00Z' }, end: { dateTime: '2026-02-18T11:00:00Z' } },
          ],
        },
      });

      const results = await findEventsByTitle('reuniao', '2026-02-18T00:00:00Z', '2026-02-20T00:00:00Z');

      expect(results).toHaveLength(0);
    });

    it('uses default 30-day range when no timeMin/timeMax', async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });

      await findEventsByTitle('test');

      expect(mockEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          singleEvents: true,
          orderBy: 'startTime',
        }),
      );
    });
  });

  describe('resolveDateTime', () => {
    it('resolves ISO date with time', () => {
      const result = resolveDateTime('2026-02-17', '15:00');

      const start = new Date(result.startTime);
      expect(start.getDate()).toBe(17);
      expect(start.getMonth()).toBe(1); // February
      expect(start.getHours()).toBe(15);
      expect(start.getMinutes()).toBe(0);

      const end = new Date(result.endTime);
      expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000); // 1h default
    });

    it('uses custom duration when provided', () => {
      const result = resolveDateTime('2026-02-17', '10:00', 30);

      const start = new Date(result.startTime);
      const end = new Date(result.endTime);
      expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000); // 30min
    });

    it('handles DD/MM date format', () => {
      const result = resolveDateTime('17/02', '09:00');

      const start = new Date(result.startTime);
      expect(start.getDate()).toBe(17);
      expect(start.getMonth()).toBe(1);
    });

    it('uses current date when data is undefined', () => {
      const result = resolveDateTime(undefined, '14:00');

      const start = new Date(result.startTime);
      const today = new Date();
      expect(start.getDate()).toBe(today.getDate());
    });
  });

  describe('formatDateTimeBR', () => {
    it('formats ISO date to BR format', () => {
      const result = formatDateTimeBR('2026-02-17T15:00:00.000Z');

      // The exact output depends on timezone, but format should be DD/MM and HH:MM
      expect(result.data).toMatch(/^\d{2}\/\d{2}$/);
      expect(result.hora).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
