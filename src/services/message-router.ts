import { logger } from '../utils/logger.js';
import { sendText, sendProcessingMessage, downloadMedia } from './whatsapp.client.js';
import { classifyIntent } from './intent-classifier.js';
import { uploadFile } from './drive.service.js';
import { createEvent, deleteEvent, findEventsByTitle, resolveDateTime, formatDateTimeBR } from './calendar.service.js';
import { sendMeetingInvite } from './email.service.js';
import { transcribeAudio } from './audio-transcriber.js';
import { messages } from '../utils/messages.js';
import { Intent, MessageType } from '../types/index.js';
import type { IncomingMessage, IntentResult, CalendarEvent } from '../types/index.js';

// In-memory pending actions for cancel confirmation (v1 limitation — no DB)
interface PendingAction {
  type: 'cancel_confirm' | 'cancel_select';
  eventId?: string;
  eventTitle?: string;
  events?: CalendarEvent[];
  expiresAt: Date;
}

const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const pendingActions = new Map<string, PendingAction>();

function cleanExpiredActions(): void {
  const now = Date.now();
  for (const [key, action] of pendingActions) {
    if (now > action.expiresAt.getTime()) {
      pendingActions.delete(key);
    }
  }
}

export async function routeMessage(message: IncomingMessage): Promise<void> {
  await sendProcessingMessage(message.from);

  switch (message.type) {
    case MessageType.TEXT:
      await handleTextMessage(message);
      break;
    case MessageType.AUDIO:
      await handleAudioMessage(message);
      break;
    case MessageType.DOCUMENT:
    case MessageType.IMAGE:
      await handleFileUpload(message);
      break;
    default:
      await sendText(message.from, messages.errors.generic);
      break;
  }
}

async function handleTextMessage(message: IncomingMessage): Promise<void> {
  cleanExpiredActions();

  // Check for pending action response (cancel confirmation flow)
  const pending = pendingActions.get(message.from);
  if (pending) {
    await handlePendingAction(message.from, message.text!, pending);
    return;
  }

  const result = await classifyIntent(message.text!);

  logger.info(
    { service: 'message-router', action: 'route', intent: result.intent, confidence: result.confidence },
    `Routed intent: ${result.intent}`,
  );

  if (result.intent === Intent.UPLOAD_ARQUIVO) {
    await sendText(message.from, messages.prompts.uploadInstruction);
    return;
  }

  if (result.intent === Intent.CRIAR_EVENTO) {
    await handleCreateEvent(message.from, result);
    return;
  }

  if (result.intent === Intent.CRIAR_REUNIAO) {
    await handleCreateMeeting(message.from, result);
    return;
  }

  if (result.intent === Intent.CANCELAR_EVENTO) {
    await handleCancelEvent(message.from, result);
    return;
  }

  await handleIntentAction(message.from, result.intent);
}

async function handleFileUpload(message: IncomingMessage): Promise<void> {
  if (!message.mediaId) {
    await sendText(message.from, messages.errors.generic);
    return;
  }

  try {
    await sendText(message.from, messages.processing.file);

    const buffer = await downloadMedia(message.mediaId);

    const filename = message.filename || `arquivo_${Date.now()}.${getExtension(message.mimeType)}`;
    const mimeType = message.mimeType || 'application/octet-stream';

    const result = await uploadFile(buffer, filename, mimeType);

    const confirmation = messages.confirmations.fileUploaded
      .replace('{filename}', result.filename)
      .replace('{folderPath}', result.folderPath);

    await sendText(message.from, confirmation);

    logger.info(
      { service: 'message-router', action: 'upload-complete', fileId: result.fileId, folderPath: result.folderPath },
      `File uploaded: ${result.filename} → ${result.folderPath}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'upload-failed', error }, 'File upload failed');

    const err = error as { code?: string };
    if (err.code === 'SERVICE_UNAVAILABLE' || err.code === 'AUTH_REQUIRED') {
      await sendText(message.from, messages.errors.driveUnavailable);
    } else {
      await sendText(message.from, messages.errors.generic);
    }
  }
}

async function handleAudioMessage(message: IncomingMessage): Promise<void> {
  if (!message.mediaId) {
    await sendText(message.from, messages.errors.generic);
    return;
  }

  try {
    await sendText(message.from, messages.processing.audio);

    const buffer = await downloadMedia(message.mediaId);
    const text = await transcribeAudio(buffer);

    if (!text) {
      await sendText(message.from, messages.errors.whisperFailed);
      return;
    }

    logger.info(
      { service: 'message-router', action: 'audio-transcribed', textLength: text.length },
      `Audio transcribed, routing as text`,
    );

    // Route transcribed text through the same text pipeline
    const result = await classifyIntent(text);

    logger.info(
      { service: 'message-router', action: 'route', intent: result.intent, confidence: result.confidence, source: 'audio' },
      `Routed intent (from audio): ${result.intent}`,
    );

    if (result.intent === Intent.UPLOAD_ARQUIVO) {
      await sendText(message.from, messages.prompts.uploadInstruction);
      return;
    }

    if (result.intent === Intent.CRIAR_EVENTO) {
      await handleCreateEvent(message.from, result);
      return;
    }

    if (result.intent === Intent.CRIAR_REUNIAO) {
      await handleCreateMeeting(message.from, result);
      return;
    }

    if (result.intent === Intent.CANCELAR_EVENTO) {
      await handleCancelEvent(message.from, result);
      return;
    }

    await handleIntentAction(message.from, result.intent);
  } catch (error) {
    logger.error({ service: 'message-router', action: 'audio-failed', error }, 'Audio processing failed');
    await sendText(message.from, messages.errors.whisperFailed);
  }
}

function getExtension(mimeType?: string): string {
  if (!mimeType) return 'bin';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'audio/ogg': 'ogg',
  };
  return map[mimeType.split(';')[0]] || 'bin';
}

async function handleCreateEvent(to: string, result: IntentResult): Promise<void> {
  try {
    await sendText(to, messages.processing.event);

    const title = result.entities.titulo || 'Evento';
    const { startTime, endTime } = resolveDateTime(
      result.entities.data,
      result.entities.hora,
      result.entities.duracao,
    );

    const event = await createEvent(title, startTime, endTime, undefined);
    const formatted = formatDateTimeBR(event.startTime);

    const confirmation = messages.confirmations.eventCreated
      .replace('{titulo}', event.title)
      .replace('{data}', formatted.data)
      .replace('{hora}', formatted.hora);

    await sendText(to, confirmation);

    logger.info(
      { service: 'message-router', action: 'event-created', eventId: event.eventId },
      `Event created: ${event.title}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'event-create-failed', error }, 'Failed to create event');

    const err = error as { code?: string };
    if (err.code === 'AUTH_REQUIRED') {
      await sendText(to, messages.errors.calendarUnavailable);
    } else {
      await sendText(to, messages.errors.calendarUnavailable);
    }
  }
}

async function handleCreateMeeting(to: string, result: IntentResult): Promise<void> {
  try {
    await sendText(to, messages.processing.meeting);

    const title = result.entities.titulo || 'Reuniao';
    const { startTime, endTime } = resolveDateTime(
      result.entities.data,
      result.entities.hora,
      result.entities.duracao,
    );

    const participants = result.entities.participantes || [];
    const emailAttendees = participants.filter((p) => p.email).map((p) => p.email!);
    const phoneParticipants = participants.filter((p) => p.telefone);

    const event = await createEvent(title, startTime, endTime, undefined, {
      withMeet: true,
      attendees: emailAttendees,
    });

    const formatted = formatDateTimeBR(event.startTime);
    const dateTimeStr = `${formatted.data} as ${formatted.hora}`;

    // Send WhatsApp invites to phone participants
    const inviteResults: string[] = [];
    for (const p of phoneParticipants) {
      try {
        const meetStr = event.meetLink ? `\nLink Meet: ${event.meetLink}` : '';
        const inviteMsg = messages.prompts.meetingInvite
          .replace('{titulo}', title)
          .replace('{dateTime}', dateTimeStr)
          .replace('{meetLink}', meetStr);
        await sendText(p.telefone!, inviteMsg);
        inviteResults.push(p.nome || p.telefone!);
      } catch {
        inviteResults.push(`${p.nome || p.telefone!} (falha)`);
      }
    }

    // Send custom email invites (in addition to Google Calendar native invites)
    for (const p of participants.filter((p) => p.email)) {
      try {
        if (event.meetLink) {
          await sendMeetingInvite(p.email!, title, event.meetLink, dateTimeStr);
        }
        inviteResults.push(p.nome || p.email!);
      } catch {
        inviteResults.push(`${p.nome || p.email!} (falha)`);
      }
    }

    const convitesStr = inviteResults.length > 0 ? inviteResults.join(', ') : 'nenhum';

    const confirmation = messages.confirmations.meetingCreated
      .replace('{titulo}', event.title)
      .replace('{data}', formatted.data)
      .replace('{hora}', formatted.hora)
      .replace('{meetLink}', event.meetLink || 'indisponivel')
      .replace('{convites}', convitesStr);

    await sendText(to, confirmation);

    logger.info(
      { service: 'message-router', action: 'meeting-created', eventId: event.eventId, meetLink: event.meetLink },
      `Meeting created: ${event.title}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'meeting-create-failed', error }, 'Failed to create meeting');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

async function handleCancelEvent(to: string, result: IntentResult): Promise<void> {
  try {
    await sendText(to, messages.processing.default);

    const query = result.entities.titulo || '';
    if (!query) {
      await sendText(to, messages.errors.eventNotFound);
      return;
    }

    const events = await findEventsByTitle(query);

    if (events.length === 0) {
      await sendText(to, messages.errors.eventNotFound);
      return;
    }

    if (events.length === 1) {
      const event = events[0];
      const formatted = formatDateTimeBR(event.startTime);

      pendingActions.set(to, {
        type: 'cancel_confirm',
        eventId: event.eventId,
        eventTitle: event.title,
        expiresAt: new Date(Date.now() + PENDING_TIMEOUT_MS),
      });

      const prompt = messages.prompts.cancelConfirm
        .replace('{titulo}', event.title)
        .replace('{data}', `${formatted.data} as ${formatted.hora}`);

      await sendText(to, prompt);
      return;
    }

    // Multiple events — list options
    const lista = events.map((e, i) => {
      const f = formatDateTimeBR(e.startTime);
      return `${i + 1}. ${e.title} — ${f.data} as ${f.hora}`;
    }).join('\n');

    pendingActions.set(to, {
      type: 'cancel_select',
      events,
      expiresAt: new Date(Date.now() + PENDING_TIMEOUT_MS),
    });

    const prompt = messages.prompts.multipleEvents
      .replace('{count}', String(events.length))
      .replace('{lista}', lista);

    await sendText(to, prompt);
  } catch (error) {
    logger.error({ service: 'message-router', action: 'cancel-event-failed', error }, 'Failed to cancel event');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

async function handlePendingAction(to: string, text: string, pending: PendingAction): Promise<void> {
  pendingActions.delete(to);

  try {
    if (pending.type === 'cancel_confirm') {
      if (text.toLowerCase().trim() === 'sim') {
        await deleteEvent(pending.eventId!);

        const confirmation = messages.confirmations.eventCancelled
          .replace('{titulo}', pending.eventTitle!);

        await sendText(to, confirmation);

        logger.info(
          { service: 'message-router', action: 'event-cancelled', eventId: pending.eventId },
          `Event cancelled: ${pending.eventTitle}`,
        );
      } else {
        await sendText(to, messages.prompts.cancelDiscarded);
      }
      return;
    }

    if (pending.type === 'cancel_select' && pending.events) {
      const index = parseInt(text.trim(), 10) - 1;
      if (isNaN(index) || index < 0 || index >= pending.events.length) {
        await sendText(to, messages.prompts.invalidOption);
        return;
      }

      const selected = pending.events[index];
      const formatted = formatDateTimeBR(selected.startTime);

      pendingActions.set(to, {
        type: 'cancel_confirm',
        eventId: selected.eventId,
        eventTitle: selected.title,
        expiresAt: new Date(Date.now() + PENDING_TIMEOUT_MS),
      });

      const prompt = messages.prompts.cancelConfirm
        .replace('{titulo}', selected.title)
        .replace('{data}', `${formatted.data} as ${formatted.hora}`);

      await sendText(to, prompt);
      return;
    }
  } catch (error) {
    logger.error({ service: 'message-router', action: 'pending-action-failed', error }, 'Failed to process pending action');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

async function handleIntentAction(to: string, intent: Intent): Promise<void> {
  switch (intent) {
    case Intent.AJUDA:
      await sendText(to, messages.prompts.help);
      break;
    case Intent.CLARIFICACAO:
      await sendText(to, messages.prompts.clarification);
      break;
    default:
      await sendText(to, messages.errors.generic);
      break;
  }
}
