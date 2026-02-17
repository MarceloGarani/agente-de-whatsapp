import { Router } from 'express';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { sendText } from '../services/whatsapp.client.js';
import { routeMessage } from '../services/message-router.js';
import { messages } from '../utils/messages.js';
import type { IncomingMessage, MessageType } from '../types/index.js';
import { MessageType as MsgType } from '../types/index.js';

export const webhookRouter = Router();

webhookRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
    logger.info({ service: 'webhook', action: 'verify' }, 'Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn({ service: 'webhook', action: 'verify' }, 'Webhook verification failed');
    res.sendStatus(403);
  }
});

webhookRouter.post('/webhook', (req: Request, res: Response) => {
  res.sendStatus(200);

  processWebhookPayload(req.body).catch((error) => {
    logger.error({ service: 'webhook', action: 'process', error }, 'Failed to process webhook');
  });
});

export function extractMessage(body: unknown): IncomingMessage | null {
  try {
    const entry = (body as Record<string, unknown[]>)?.entry;
    if (!Array.isArray(entry) || entry.length === 0) return null;

    const changes = (entry[0] as Record<string, unknown[]>)?.changes;
    if (!Array.isArray(changes) || changes.length === 0) return null;

    const value = (changes[0] as Record<string, unknown>)?.value as Record<string, unknown> | undefined;
    if (!value) return null;

    const msgArray = value.messages as Record<string, unknown>[] | undefined;
    if (!Array.isArray(msgArray) || msgArray.length === 0) return null;

    const msg = msgArray[0];
    const rawType = msg.type as string;
    const type = parseMessageType(rawType);

    const incoming: IncomingMessage = {
      from: msg.from as string,
      type,
      timestamp: msg.timestamp as string,
    };

    if (type === MsgType.TEXT) {
      incoming.text = (msg.text as Record<string, string>)?.body;
    }

    if (type === MsgType.AUDIO) {
      const audio = msg.audio as Record<string, string> | undefined;
      incoming.mediaId = audio?.id;
      incoming.mimeType = audio?.mime_type;
    }

    if (type === MsgType.DOCUMENT) {
      const doc = msg.document as Record<string, string> | undefined;
      incoming.mediaId = doc?.id;
      incoming.mimeType = doc?.mime_type;
      incoming.filename = doc?.filename;
      if (doc?.caption) {
        incoming.text = doc.caption;
      }
    }

    if (type === MsgType.IMAGE) {
      const image = msg.image as Record<string, string> | undefined;
      incoming.mediaId = image?.id;
      incoming.mimeType = image?.mime_type;
      if (image?.caption) {
        incoming.text = image.caption;
      }
    }

    return incoming;
  } catch {
    return null;
  }
}

function parseMessageType(type: string): MessageType {
  switch (type) {
    case 'text': return MsgType.TEXT;
    case 'audio': return MsgType.AUDIO;
    case 'document': return MsgType.DOCUMENT;
    case 'image': return MsgType.IMAGE;
    default: return MsgType.UNKNOWN;
  }
}

async function processWebhookPayload(body: unknown): Promise<void> {
  const message = extractMessage(body);
  if (!message) {
    logger.debug({ service: 'webhook', action: 'skip' }, 'No processable message in payload');
    return;
  }

  logger.info({ service: 'webhook', action: 'receive', from: message.from, type: message.type }, 'Message received');

  try {
    await routeMessage(message);
  } catch (error) {
    logger.error({ service: 'webhook', action: 'respond', error }, 'Failed to respond to user');
    try {
      await sendText(message.from, messages.errors.generic);
    } catch {
      logger.error({ service: 'webhook', action: 'error-notify' }, 'Failed to send error message to user');
    }
  }
}
