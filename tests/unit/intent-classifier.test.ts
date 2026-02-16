jest.mock('../../src/config/env', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    GOOGLE_REFRESH_TOKEN: '',
    OPENAI_API_KEY: 'test-openai-key',
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

const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

import { classifyIntent } from '../../src/services/intent-classifier';
import { Intent } from '../../src/types/index';

function buildGptResponse(args: Record<string, unknown>) {
  return {
    choices: [{
      message: {
        tool_calls: [{
          function: {
            name: 'extract_intent',
            arguments: JSON.stringify(args),
          },
        }],
      },
    }],
  };
}

describe('Intent Classifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies "tenho dentista amanha as 15h" as CRIAR_EVENTO', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'criar_evento',
      entities: {
        titulo: 'Dentista',
        data: '2026-02-17',
        hora: '15:00',
        duracao: 60,
        participantes: [],
      },
      confidence: 0.95,
    }));

    const result = await classifyIntent('tenho dentista amanha as 15h');

    expect(result.intent).toBe(Intent.CRIAR_EVENTO);
    expect(result.entities.titulo).toBe('Dentista');
    expect(result.entities.hora).toBe('15:00');
    expect(result.confidence).toBe(0.95);
    expect(result.rawText).toBe('tenho dentista amanha as 15h');
  });

  it('classifies "reuniao com joao@email.com sexta 10h" as CRIAR_REUNIAO', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'criar_reuniao',
      entities: {
        titulo: 'Reuniao',
        data: '2026-02-20',
        hora: '10:00',
        duracao: 60,
        participantes: [{ nome: 'Joao', email: 'joao@email.com', telefone: null }],
      },
      confidence: 0.92,
    }));

    const result = await classifyIntent('reuniao com joao@email.com sexta 10h');

    expect(result.intent).toBe(Intent.CRIAR_REUNIAO);
    expect(result.entities.participantes).toBeDefined();
    expect(result.entities.participantes!.length).toBeGreaterThan(0);
    expect(result.entities.participantes![0].email).toBe('joao@email.com');
  });

  it('classifies "salvar no drive" as UPLOAD_ARQUIVO', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'upload_arquivo',
      entities: {
        titulo: null,
        data: null,
        hora: null,
        duracao: null,
        participantes: [],
      },
      confidence: 0.88,
    }));

    const result = await classifyIntent('salvar no drive');

    expect(result.intent).toBe(Intent.UPLOAD_ARQUIVO);
    expect(result.confidence).toBe(0.88);
  });

  it('classifies "cancelar reuniao de sexta" as CANCELAR_EVENTO', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'cancelar_evento',
      entities: {
        titulo: null,
        data: '2026-02-20',
        hora: null,
        duracao: null,
        participantes: [],
      },
      confidence: 0.85,
    }));

    const result = await classifyIntent('cancelar reuniao de sexta');

    expect(result.intent).toBe(Intent.CANCELAR_EVENTO);
    expect(result.entities.data).toBe('2026-02-20');
  });

  it('classifies "ajuda" as AJUDA', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'ajuda',
      entities: {
        titulo: null,
        data: null,
        hora: null,
        duracao: null,
        participantes: [],
      },
      confidence: 0.98,
    }));

    const result = await classifyIntent('ajuda');

    expect(result.intent).toBe(Intent.AJUDA);
    expect(result.confidence).toBe(0.98);
  });

  it('returns CLARIFICACAO when confidence < 0.7', async () => {
    mockCreate.mockResolvedValue(buildGptResponse({
      intent: 'criar_evento',
      entities: {
        titulo: null,
        data: null,
        hora: null,
        duracao: null,
        participantes: [],
      },
      confidence: 0.4,
    }));

    const result = await classifyIntent('preciso disso');

    expect(result.intent).toBe(Intent.CLARIFICACAO);
    expect(result.confidence).toBe(0.4);
  });

  it('returns CLARIFICACAO when no tool call returned', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: undefined } }],
    });

    const result = await classifyIntent('...');

    expect(result.intent).toBe(Intent.CLARIFICACAO);
    expect(result.confidence).toBe(0);
    expect(result.rawText).toBe('...');
  });

  it('throws AppError on OpenAI timeout', async () => {
    mockCreate.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(classifyIntent('teste')).rejects.toThrow();
  });
});
