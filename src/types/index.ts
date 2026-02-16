// === Enums ===

export enum Intent {
  UPLOAD_ARQUIVO = 'upload_arquivo',
  CRIAR_EVENTO = 'criar_evento',
  CRIAR_REUNIAO = 'criar_reuniao',
  CANCELAR_EVENTO = 'cancelar_evento',
  AJUDA = 'ajuda',
  CLARIFICACAO = 'clarificacao',
}

export enum MessageType {
  TEXT = 'text',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

// === Intent Classification ===

export interface IntentEntities {
  titulo?: string;
  data?: string;
  hora?: string;
  duracao?: number;
  participantes?: Participant[];
}

export interface Participant {
  nome?: string;
  email?: string;
  telefone?: string;
}

export interface IntentResult {
  intent: Intent;
  entities: IntentEntities;
  confidence: number;
  rawText: string;
}

// === Incoming Messages ===

export interface IncomingMessage {
  from: string;
  type: MessageType;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  timestamp: string;
}

// === Service Results ===

export interface CalendarEvent {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink?: string;
  description?: string;
}

export interface DriveUpload {
  fileId: string;
  webViewLink: string;
  folderPath: string;
  filename: string;
}

// === Reminder State ===

export interface ReminderState {
  sentEventIds: Set<string>;
  lastCheckAt: Date;
}

// === Environment Config ===

export interface EnvConfig {
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WEBHOOK_VERIFY_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_REFRESH_TOKEN: string;
  GOOGLE_USER_EMAIL: string;
  WHATSAPP_USER_PHONE: string;
  OPENAI_API_KEY: string;
  PORT: number;
  NODE_ENV: 'development' | 'production';
}
