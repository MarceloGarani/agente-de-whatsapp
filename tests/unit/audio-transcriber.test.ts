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

const mockTranscriptionsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: (...args: unknown[]) => mockTranscriptionsCreate(...args),
      },
    },
  }));
});

const mockCreateReadStream = jest.fn().mockReturnValue({
  on: jest.fn().mockReturnThis(),
  pipe: jest.fn().mockReturnThis(),
  destroy: jest.fn(),
});

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

const mockFfmpeg = jest.fn();

jest.mock('fluent-ffmpeg', () => {
  const instance = {
    audioCodec: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
      if (event === 'end') {
        (this as Record<string, unknown>)._endCb = cb;
      }
      if (event === 'error') {
        (this as Record<string, unknown>)._errorCb = cb;
      }
      return this;
    }),
    save: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
      // By default, resolve immediately
      const endCb = (this as Record<string, unknown>)._endCb as (() => void) | undefined;
      if (endCb) setTimeout(endCb, 0);
    }),
  };
  const fn = (...args: unknown[]) => {
    mockFfmpeg(...args);
    return instance;
  };
  (fn as unknown as Record<string, unknown>).__instance = instance;
  return fn;
});

import fs from 'node:fs/promises';
import { transcribeAudio } from '../../src/services/audio-transcriber';

// Spy on fs operations
const mockWriteFile = jest.spyOn(fs, 'writeFile').mockResolvedValue();
const mockUnlink = jest.spyOn(fs, 'unlink').mockResolvedValue();

describe('Audio Transcriber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue();
    mockUnlink.mockResolvedValue();
  });

  it('transcribes audio buffer through ffmpeg + Whisper pipeline', async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: 'agendar dentista amanha as 15',
    });

    const buffer = Buffer.from('fake-ogg-audio');
    const result = await transcribeAudio(buffer);

    expect(result).toBe('agendar dentista amanha as 15');

    // Verify temp file was written
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.ogg'),
      buffer,
    );

    // Verify ffmpeg was called with ogg input
    expect(mockFfmpeg).toHaveBeenCalledWith(expect.stringContaining('.ogg'));

    // Verify Whisper was called with correct params
    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini-transcribe',
        language: 'pt',
      }),
    );

    // Verify cleanup
    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.ogg'));
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.mp3'));
  });

  it('throws on Whisper API failure', async () => {
    mockTranscriptionsCreate.mockRejectedValue(new Error('Whisper timeout'));

    const buffer = Buffer.from('fake-ogg');
    await expect(transcribeAudio(buffer)).rejects.toThrow();

    // Cleanup still happens
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it('throws on ffmpeg conversion failure', async () => {
    // Override save to trigger error
    const ffmpegModule = jest.requireMock('fluent-ffmpeg') as Record<string, unknown>;
    const instance = ffmpegModule.__instance as Record<string, jest.Mock>;
    instance.save.mockImplementationOnce(function (this: Record<string, unknown>) {
      const errorCb = (this as Record<string, unknown>)._errorCb as ((err: Error) => void) | undefined;
      if (errorCb) setTimeout(() => errorCb(new Error('ffmpeg failed')), 0);
    });

    const buffer = Buffer.from('bad-audio');
    await expect(transcribeAudio(buffer)).rejects.toThrow();

    // Cleanup still happens
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it('always cleans up temp files even on error', async () => {
    mockTranscriptionsCreate.mockRejectedValue(new Error('fail'));

    const buffer = Buffer.from('data');
    await expect(transcribeAudio(buffer)).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.ogg'));
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.mp3'));
  });
});
