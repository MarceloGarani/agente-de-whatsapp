import axios from 'axios';
import { sendText, downloadMedia, sendProcessingMessage } from '../../src/services/whatsapp.client';

jest.mock('axios', () => {
  const mockInstance = {
    post: jest.fn(),
    get: jest.fn(),
  };
  const mockCreate = jest.fn(() => mockInstance);
  return {
    __esModule: true,
    default: {
      create: mockCreate,
      get: jest.fn(),
    },
    create: mockCreate,
    get: jest.fn(),
  };
});

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

const mockAxiosInstance = (axios as unknown as { create: jest.Mock }).create();

describe('WhatsApp Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendText', () => {
    it('sends text message via WhatsApp API', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: { messages: [{ id: 'msg-1' }] } });

      await sendText('5511999999999', 'Ola!');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/test-phone-id/messages',
        {
          messaging_product: 'whatsapp',
          to: '5511999999999',
          type: 'text',
          text: { body: 'Ola!' },
        },
      );
    });

    it('throws AppError on API failure', async () => {
      (mockAxiosInstance.post as jest.Mock).mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(sendText('5511999999999', 'test')).rejects.toThrow();
    });
  });

  describe('downloadMedia', () => {
    it('downloads media with 2-step flow', async () => {
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({
        data: { url: 'https://media.whatsapp.com/file123' },
      });

      const binaryData = Buffer.from('fake-binary-data');
      (axios as unknown as { get: jest.Mock }).get.mockResolvedValue({
        data: binaryData,
      });

      const result = await downloadMedia('media-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/media-123');
      expect((axios as unknown as { get: jest.Mock }).get).toHaveBeenCalledWith(
        'https://media.whatsapp.com/file123',
        expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 10000,
        }),
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('throws on media download failure', async () => {
      (mockAxiosInstance.get as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(downloadMedia('media-123')).rejects.toThrow();
    });
  });

  describe('sendProcessingMessage', () => {
    it('sends processing message with default text', async () => {
      (mockAxiosInstance.post as jest.Mock).mockResolvedValue({ data: {} });

      await sendProcessingMessage('5511999999999');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/test-phone-id/messages',
        expect.objectContaining({
          text: { body: 'Processando sua mensagem...' },
        }),
      );
    });
  });
});
