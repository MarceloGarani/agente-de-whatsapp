import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';
import { env, TIMEOUTS } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: TIMEOUTS.OPENAI_WHISPER,
});

function convertOggToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(outputPath);
  });
}

export async function transcribeAudio(buffer: Buffer): Promise<string> {
  const timestamp = Date.now();
  const tmpOgg = path.join(os.tmpdir(), `audio-${timestamp}.ogg`);
  const tmpMp3 = path.join(os.tmpdir(), `audio-${timestamp}.mp3`);

  try {
    await fs.writeFile(tmpOgg, buffer);
    await convertOggToMp3(tmpOgg, tmpMp3);

    const file = createReadStream(tmpMp3);
    const response = await openai.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file,
      language: 'pt',
    });

    const text = response.text?.trim() || '';

    logger.info(
      { service: 'audio-transcriber', action: 'transcribe', textLength: text.length },
      `Audio transcribed: ${text.length} chars`,
    );

    return text;
  } catch (error) {
    logger.error({ service: 'audio-transcriber', action: 'transcribe', error }, 'Failed to transcribe audio');
    throw handleApiError(error, 'audio-transcriber');
  } finally {
    await fs.unlink(tmpOgg).catch(() => {});
    await fs.unlink(tmpMp3).catch(() => {});
  }
}
