import { logger } from '../utils/logger.js';
import { sendText, sendProcessingMessage, downloadMedia } from './whatsapp.client.js';
import { classifyIntent } from './intent-classifier.js';
import { uploadFile } from './drive.service.js';
import { createEvent, deleteEvent, findEventsByTitle, resolveDateTime, formatDateTimeBR } from './calendar.service.js';
import { sendMeetingInvite } from './email.service.js';
import { transcribeAudio } from './audio-transcriber.js';
import {
  addMessage,
  getHistoryForGPT,
  setLastAction,
  getLastAction,
  setPendingUpload,
  getPendingUpload,
  clearPendingUpload,
  cleanExpiredConversations,
} from './conversation-store.js';
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
  cleanExpiredConversations();
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
      await handleFileMessage(message);
      break;
    default:
      await sendText(message.from, messages.errors.generic);
      break;
  }
}

// --- Text Messages ---

async function handleTextMessage(message: IncomingMessage): Promise<void> {
  cleanExpiredActions();

  // Check for pending cancel action
  const pending = pendingActions.get(message.from);
  if (pending) {
    await handlePendingAction(message.from, message.text!, pending);
    return;
  }

  // Check for pending upload awaiting name/folder
  const pendingUpload = getPendingUpload(message.from);
  if (pendingUpload) {
    await handlePendingUploadResponse(message.from, message.text!, pendingUpload);
    return;
  }

  // Store user message and classify with history
  addMessage(message.from, 'user', message.text!);
  const history = getHistoryForGPT(message.from);
  // Remove the last entry (current message) since classifyIntent adds it separately
  const previousHistory = history.slice(0, -1);
  const result = await classifyIntent(message.text!, previousHistory);

  logger.info(
    { service: 'message-router', action: 'route', intent: result.intent, confidence: result.confidence },
    `Routed intent: ${result.intent}`,
  );

  await dispatchIntent(message.from, result);
}

// --- Audio Messages ---

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

    addMessage(message.from, 'user', text);
    const history = getHistoryForGPT(message.from);
    const previousHistory = history.slice(0, -1);
    const result = await classifyIntent(text, previousHistory);

    logger.info(
      { service: 'message-router', action: 'route', intent: result.intent, confidence: result.confidence, source: 'audio' },
      `Routed intent (from audio): ${result.intent}`,
    );

    await dispatchIntent(message.from, result);
  } catch (error) {
    logger.error({ service: 'message-router', action: 'audio-failed', error }, 'Audio processing failed');
    await sendText(message.from, messages.errors.whisperFailed);
  }
}

// --- File Messages (Document / Image) ---

async function handleFileMessage(message: IncomingMessage): Promise<void> {
  if (!message.mediaId) {
    await sendText(message.from, messages.errors.generic);
    return;
  }

  try {
    const buffer = await downloadMedia(message.mediaId);
    const ext = getExtension(message.mimeType);
    const mimeType = message.mimeType || 'application/octet-stream';

    // If there's a caption, use GPT to extract filename/folder
    if (message.text) {
      addMessage(message.from, 'user', message.text);
      const history = getHistoryForGPT(message.from);
      const previousHistory = history.slice(0, -1);
      const result = await classifyIntent(message.text, previousHistory);

      const customName = result.entities.nomeArquivo;
      const customFolder = result.entities.pastaDestino;
      const filename = customName ? `${customName}.${ext}` : (message.filename || `arquivo_${Date.now()}.${ext}`);

      await executeUpload(message.from, buffer, filename, mimeType, customFolder);
      return;
    }

    // No caption — ask user for name and folder
    setPendingUpload(message.from, {
      buffer,
      mimeType,
      originalFilename: message.filename,
    });

    const response = 'Recebi seu arquivo! Como deseja salvar?\n\nMe diga o nome e a pasta, por exemplo:\n- "lindo na pasta fotos"\n- "relatorio mensal"\n- "salvar automatico" (organizo por tipo e data)';
    await sendText(message.from, response);
    addMessage(message.from, 'assistant', response);
  } catch (error) {
    logger.error({ service: 'message-router', action: 'file-failed', error }, 'File processing failed');
    await sendText(message.from, messages.errors.generic);
  }
}

async function handlePendingUploadResponse(
  to: string,
  text: string,
  upload: { buffer: Buffer; mimeType: string; originalFilename?: string },
): Promise<void> {
  clearPendingUpload(to);

  const ext = getExtension(upload.mimeType);

  // Check for "automatic" save
  const lowerText = text.toLowerCase().trim();
  if (lowerText.includes('automatico') || lowerText.includes('automatica') || lowerText === 'sim') {
    const filename = upload.originalFilename || `arquivo_${Date.now()}.${ext}`;
    await executeUpload(to, upload.buffer, filename, upload.mimeType);
    return;
  }

  // Use GPT to extract name/folder from response
  addMessage(to, 'user', text);
  const history = getHistoryForGPT(to);
  const previousHistory = history.slice(0, -1);
  const result = await classifyIntent(text, previousHistory);

  const customName = result.entities.nomeArquivo;
  const customFolder = result.entities.pastaDestino;
  const filename = customName ? `${customName}.${ext}` : (upload.originalFilename || `arquivo_${Date.now()}.${ext}`);

  await executeUpload(to, upload.buffer, filename, upload.mimeType, customFolder);
}

async function executeUpload(
  to: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  customFolder?: string,
): Promise<void> {
  try {
    await sendText(to, messages.processing.file);

    const result = await uploadFile(buffer, filename, mimeType, customFolder);

    const confirmation = messages.confirmations.fileUploaded
      .replace('{filename}', result.filename)
      .replace('{folderPath}', result.folderPath);

    await sendText(to, confirmation);
    addMessage(to, 'assistant', confirmation);

    setLastAction(to, 'file_uploaded', {
      fileId: result.fileId,
      filename: result.filename,
      folderPath: result.folderPath,
    });

    logger.info(
      { service: 'message-router', action: 'upload-complete', fileId: result.fileId, folderPath: result.folderPath },
      `File uploaded: ${result.filename} → ${result.folderPath}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'upload-failed', error }, 'File upload failed');

    const err = error as { code?: string };
    if (err.code === 'SERVICE_UNAVAILABLE' || err.code === 'AUTH_REQUIRED') {
      await sendText(to, messages.errors.driveUnavailable);
    } else {
      await sendText(to, messages.errors.generic);
    }
  }
}

// --- Intent Dispatch ---

async function dispatchIntent(to: string, result: IntentResult): Promise<void> {
  switch (result.intent) {
    case Intent.UPLOAD_ARQUIVO:
      await sendText(to, messages.prompts.uploadInstruction);
      addMessage(to, 'assistant', messages.prompts.uploadInstruction);
      break;
    case Intent.CRIAR_EVENTO:
      await handleCreateEvent(to, result);
      break;
    case Intent.CRIAR_REUNIAO:
      await handleCreateMeeting(to, result);
      break;
    case Intent.CANCELAR_EVENTO:
      await handleCancelEvent(to, result);
      break;
    case Intent.REENVIAR_CONVITE:
      await handleResendInvite(to, result);
      break;
    case Intent.AJUDA:
      await sendText(to, messages.prompts.help);
      addMessage(to, 'assistant', messages.prompts.help);
      break;
    case Intent.CLARIFICACAO:
    default:
      await sendText(to, messages.prompts.clarification);
      addMessage(to, 'assistant', messages.prompts.clarification);
      break;
  }
}

// --- Create Event ---

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
    addMessage(to, 'assistant', confirmation);

    setLastAction(to, 'event_created', {
      eventId: event.eventId,
      title: event.title,
      startTime: event.startTime,
    });

    logger.info(
      { service: 'message-router', action: 'event-created', eventId: event.eventId },
      `Event created: ${event.title}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'event-create-failed', error }, 'Failed to create event');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

// --- Create Meeting ---

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
    const failedInvites: string[] = [];

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
        const name = p.nome || p.telefone!;
        inviteResults.push(`${name} (falha no WhatsApp)`);
        failedInvites.push(name);
      }
    }

    // Send custom email invites
    for (const p of participants.filter((p) => p.email)) {
      try {
        if (event.meetLink) {
          await sendMeetingInvite(p.email!, title, event.meetLink, dateTimeStr);
        }
        inviteResults.push(p.nome || p.email!);
      } catch (emailError) {
        const name = p.nome || p.email!;
        logger.error({ service: 'message-router', action: 'email-invite-failed', email: p.email, error: emailError }, `Email invite failed for ${p.email}`);
        inviteResults.push(`${name} (falha no email)`);
        failedInvites.push(p.email!);
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
    addMessage(to, 'assistant', confirmation);

    // If there were failures, offer to retry
    if (failedInvites.length > 0) {
      const retryMsg = `Alguns convites falharam. Voce pode me enviar outro email ou pedir para tentar novamente.`;
      await sendText(to, retryMsg);
      addMessage(to, 'assistant', retryMsg);
    }

    // Store action context for follow-ups
    setLastAction(to, 'meeting_created', {
      eventId: event.eventId,
      title: event.title,
      meetLink: event.meetLink,
      startTime: event.startTime,
      dateTimeStr,
      failedInvites,
      successInvites: inviteResults.filter(r => !r.includes('(falha')),
    });

    logger.info(
      { service: 'message-router', action: 'meeting-created', eventId: event.eventId, meetLink: event.meetLink },
      `Meeting created: ${event.title}`,
    );
  } catch (error) {
    logger.error({ service: 'message-router', action: 'meeting-create-failed', error }, 'Failed to create meeting');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

// --- Resend Invite (follow-up) ---

async function handleResendInvite(to: string, result: IntentResult): Promise<void> {
  const lastAction = getLastAction(to);

  if (!lastAction || lastAction.type !== 'meeting_created') {
    const response = 'Nao encontrei nenhuma reuniao recente para reenviar o convite. Crie uma reuniao primeiro.';
    await sendText(to, response);
    addMessage(to, 'assistant', response);
    return;
  }

  const { title, meetLink, dateTimeStr } = lastAction.details as {
    title: string;
    meetLink?: string;
    dateTimeStr: string;
  };

  if (!meetLink) {
    const response = 'A reuniao nao tem link do Meet. Crie uma nova reuniao com participantes.';
    await sendText(to, response);
    addMessage(to, 'assistant', response);
    return;
  }

  const participants = result.entities.participantes || [];
  const inviteResults: string[] = [];

  for (const p of participants) {
    if (p.email) {
      try {
        await sendMeetingInvite(p.email, title as string, meetLink as string, dateTimeStr as string);
        inviteResults.push(p.nome || p.email);
      } catch (error) {
        logger.error({ service: 'message-router', action: 'resend-email-failed', email: p.email, error }, `Resend failed for ${p.email}`);
        inviteResults.push(`${p.nome || p.email} (falha)`);
      }
    }

    if (p.telefone) {
      try {
        const meetStr = `\nLink Meet: ${meetLink}`;
        const inviteMsg = messages.prompts.meetingInvite
          .replace('{titulo}', title as string)
          .replace('{dateTime}', dateTimeStr as string)
          .replace('{meetLink}', meetStr);
        await sendText(p.telefone, inviteMsg);
        inviteResults.push(p.nome || p.telefone);
      } catch {
        inviteResults.push(`${p.nome || p.telefone} (falha)`);
      }
    }
  }

  const convitesStr = inviteResults.length > 0 ? inviteResults.join(', ') : 'nenhum participante identificado';
  const confirmation = `Convites da reuniao "${title}" reenviados: ${convitesStr}`;
  await sendText(to, confirmation);
  addMessage(to, 'assistant', confirmation);
}

// --- Cancel Event ---

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
      addMessage(to, 'assistant', prompt);
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
    addMessage(to, 'assistant', prompt);
  } catch (error) {
    logger.error({ service: 'message-router', action: 'cancel-event-failed', error }, 'Failed to cancel event');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}

// --- Pending Cancel Actions ---

async function handlePendingAction(to: string, text: string, pending: PendingAction): Promise<void> {
  pendingActions.delete(to);
  addMessage(to, 'user', text);

  try {
    if (pending.type === 'cancel_confirm') {
      if (text.toLowerCase().trim() === 'sim') {
        await deleteEvent(pending.eventId!);

        const confirmation = messages.confirmations.eventCancelled
          .replace('{titulo}', pending.eventTitle!);

        await sendText(to, confirmation);
        addMessage(to, 'assistant', confirmation);

        setLastAction(to, 'event_cancelled', {
          eventId: pending.eventId,
          title: pending.eventTitle,
        });

        logger.info(
          { service: 'message-router', action: 'event-cancelled', eventId: pending.eventId },
          `Event cancelled: ${pending.eventTitle}`,
        );
      } else {
        await sendText(to, messages.prompts.cancelDiscarded);
        addMessage(to, 'assistant', messages.prompts.cancelDiscarded);
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
      addMessage(to, 'assistant', prompt);
      return;
    }
  } catch (error) {
    logger.error({ service: 'message-router', action: 'pending-action-failed', error }, 'Failed to process pending action');
    await sendText(to, messages.errors.calendarUnavailable);
  }
}
