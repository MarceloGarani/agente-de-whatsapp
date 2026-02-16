import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { listUpcoming } from './calendar.service.js';
import { sendText } from './whatsapp.client.js';
import { messages } from '../utils/messages.js';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const sentReminders = new Set<string>();

export async function checkAndSendReminders(): Promise<void> {
  const userPhone = env.WHATSAPP_USER_PHONE;
  if (!userPhone) {
    logger.warn({ service: 'reminder', action: 'check' }, 'WHATSAPP_USER_PHONE not configured, skipping reminders');
    return;
  }

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + THIRTY_MINUTES_MS).toISOString();

    const events = await listUpcoming(timeMin, timeMax);

    for (const event of events) {
      if (sentReminders.has(event.eventId)) {
        continue;
      }

      const minutesUntil = Math.round(
        (new Date(event.startTime).getTime() - now.getTime()) / 60_000,
      );

      const meetLinkStr = event.meetLink
        ? `\nLink Meet: ${event.meetLink}`
        : '';

      const message = messages.confirmations.reminder
        .replace('{titulo}', event.title)
        .replace('{minutos}', String(minutesUntil))
        .replace('{meetLink}', meetLinkStr);

      try {
        await sendText(userPhone, message);
        sentReminders.add(event.eventId);

        logger.info(
          { service: 'reminder', action: 'sent', eventId: event.eventId, minutesUntil },
          `Reminder sent: ${event.title} in ${minutesUntil}min`,
        );
      } catch (error) {
        logger.error(
          { service: 'reminder', action: 'send-failed', eventId: event.eventId, error },
          `Failed to send reminder for: ${event.title}`,
        );
      }
    }
  } catch (error) {
    logger.error(
      { service: 'reminder', action: 'check', error },
      'Failed to check upcoming events for reminders',
    );
  }
}

export function startScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    await checkAndSendReminders();
  });

  logger.info(
    { service: 'reminder', action: 'start' },
    'Reminder scheduler started (every 5 minutes)',
  );
}
