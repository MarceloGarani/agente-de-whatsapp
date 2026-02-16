import axios from 'axios';
import { env, TIMEOUTS } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';
import { messages } from '../utils/messages.js';

const WHATSAPP_API_BASE = `https://graph.facebook.com/v21.0`;

const whatsappApi = axios.create({
  baseURL: WHATSAPP_API_BASE,
  timeout: TIMEOUTS.WHATSAPP_API,
  headers: {
    'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export async function sendText(to: string, body: string): Promise<void> {
  try {
    await whatsappApi.post(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
    logger.info({ service: 'whatsapp', action: 'sendText', to }, 'Message sent');
  } catch (error) {
    logger.error({ service: 'whatsapp', action: 'sendText', to, error }, 'Failed to send message');
    throw handleApiError(error, 'whatsapp');
  }
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  try {
    const urlResponse = await whatsappApi.get(`/${mediaId}`);
    const mediaUrl: string = urlResponse.data.url;

    const mediaResponse = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: TIMEOUTS.WHATSAPP_API,
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
    });

    logger.info({ service: 'whatsapp', action: 'downloadMedia', mediaId }, 'Media downloaded');
    return Buffer.from(mediaResponse.data);
  } catch (error) {
    logger.error({ service: 'whatsapp', action: 'downloadMedia', mediaId, error }, 'Failed to download media');
    throw handleApiError(error, 'whatsapp');
  }
}

export async function sendProcessingMessage(to: string): Promise<void> {
  await sendText(to, messages.processing.default);
}
