import crypto from 'node:crypto';
import { google } from 'googleapis';
import { getAuthenticatedClient } from './google-auth.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';
import { TIMEOUTS } from '../config/env.js';
import type { CalendarEvent } from '../types/index.js';

const TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 1 hour

function getCalendar() {
  const auth = getAuthenticatedClient();
  return google.calendar({ version: 'v3', auth, timeout: TIMEOUTS.GOOGLE_APIS });
}

export interface CreateEventOptions {
  withMeet?: boolean;
  attendees?: string[];
}

export async function createEvent(
  title: string,
  startTime: string,
  endTime?: string,
  description?: string,
  options?: CreateEventOptions,
): Promise<CalendarEvent> {
  try {
    const calendar = getCalendar();

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + DEFAULT_DURATION_MS);

    const requestBody: Record<string, unknown> = {
      summary: title,
      description,
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    };

    if (options?.withMeet) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    if (options?.attendees && options.attendees.length > 0) {
      requestBody.attendees = options.attendees.map((email) => ({ email }));
    }

    const insertParams: Record<string, unknown> = {
      calendarId: 'primary',
      requestBody,
    };

    if (options?.withMeet) {
      insertParams.conferenceDataVersion = 1;
    }

    if (options?.attendees && options.attendees.length > 0) {
      insertParams.sendUpdates = 'all';
    }

    const res = await calendar.events.insert(insertParams);

    const event = res.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventData = event as Record<string, any>;
    const meetLink = options?.withMeet
      ? eventData.conferenceData?.entryPoints?.[0]?.uri as string | undefined
      : undefined;

    logger.info(
      { service: 'calendar', action: 'create-event', eventId: event.id, title, meetLink },
      `Event created: ${title}`,
    );

    return {
      eventId: event.id!,
      title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      meetLink,
      description,
    };
  } catch (error) {
    logger.error({ service: 'calendar', action: 'create-event', error, title }, 'Failed to create event');
    throw handleApiError(error, 'calendar');
  }
}

export async function listUpcoming(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  try {
    const calendar = getCalendar();

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TIMEZONE,
    });

    const items = res.data.items || [];

    return items.map((item) => ({
      eventId: item.id!,
      title: item.summary || 'Sem titulo',
      startTime: item.start?.dateTime || item.start?.date || '',
      endTime: item.end?.dateTime || item.end?.date || '',
      meetLink: item.hangoutLink ?? undefined,
      description: item.description ?? undefined,
    }));
  } catch (error) {
    logger.error({ service: 'calendar', action: 'list-upcoming', error }, 'Failed to list events');
    throw handleApiError(error, 'calendar');
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  try {
    const calendar = getCalendar();

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    logger.info(
      { service: 'calendar', action: 'delete-event', eventId },
      `Event deleted: ${eventId}`,
    );
  } catch (error) {
    logger.error({ service: 'calendar', action: 'delete-event', error, eventId }, 'Failed to delete event');
    throw handleApiError(error, 'calendar');
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function findEventsByTitle(
  query: string,
  timeMin?: string,
  timeMax?: string,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const min = timeMin || now.toISOString();
  const max = timeMax || new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();

  const events = await listUpcoming(min, max);
  const lowerQuery = query.toLowerCase();

  return events.filter((e) => e.title.toLowerCase().includes(lowerQuery));
}

export function resolveDateTime(
  data?: string,
  hora?: string,
  duracao?: number,
): { startTime: string; endTime: string } {
  const now = new Date();
  let targetDate: Date;

  if (data) {
    // Try ISO format first (YYYY-MM-DD)
    const isoMatch = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      targetDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    } else {
      // Try DD/MM format
      const brMatch = data.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (brMatch) {
        const day = parseInt(brMatch[1]);
        const month = parseInt(brMatch[2]) - 1;
        const year = brMatch[3] ? parseInt(brMatch[3]) : now.getFullYear();
        targetDate = new Date(year < 100 ? year + 2000 : year, month, day);
      } else {
        targetDate = new Date(now);
      }
    }
  } else {
    targetDate = new Date(now);
  }

  // Apply time
  if (hora) {
    const timeMatch = hora.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      targetDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    }
  } else {
    // Default to next full hour
    targetDate.setHours(targetDate.getHours() + 1, 0, 0, 0);
  }

  const durationMs = (duracao || 60) * 60 * 1000;
  const endDate = new Date(targetDate.getTime() + durationMs);

  return {
    startTime: targetDate.toISOString(),
    endTime: endDate.toISOString(),
  };
}

export function formatDateTimeBR(isoDate: string): { data: string; hora: string } {
  const d = new Date(isoDate);
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return {
    data: dateFormatter.format(d),
    hora: timeFormatter.format(d),
  };
}
