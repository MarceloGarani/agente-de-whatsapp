import dotenv from 'dotenv';
import type { EnvConfig } from '../types/index.js';

dotenv.config();

const requiredVars = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'OPENAI_API_KEY',
] as const;

function validateEnv(): EnvConfig {
  const missing: string[] = [];

  for (const key of requiredVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Variaveis de ambiente obrigatorias nao definidas: ${missing.join(', ')}. ` +
      `Copie .env.example para .env e preencha os valores.`
    );
  }

  return {
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN!,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN!,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || '',
    GOOGLE_USER_EMAIL: process.env.GOOGLE_USER_EMAIL || '',
    WHATSAPP_USER_PHONE: process.env.WHATSAPP_USER_PHONE || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    PORT: parseInt(process.env.PORT || '3000', 10),
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  };
}

export const env = validateEnv();

export const TIMEOUTS = {
  WHATSAPP_API: 10_000,
  OPENAI_GPT: 10_000,
  OPENAI_WHISPER: 15_000,
  GOOGLE_APIS: 10_000,
  NODEMAILER: 10_000,
} as const;
