import OpenAI from 'openai';
import { env, TIMEOUTS } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';
import { Intent } from '../types/index.js';
import type { IntentResult, IntentEntities } from '../types/index.js';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: TIMEOUTS.OPENAI_GPT,
});

const SYSTEM_PROMPT = `Voce e um assistente que interpreta mensagens em portugues brasileiro. Classifique a intencao do usuario e extraia entidades relevantes.

Intencoes possiveis:
- upload_arquivo: usuario quer salvar/enviar arquivo no Google Drive
- criar_evento: usuario quer agendar compromisso/evento na agenda
- criar_reuniao: usuario quer criar reuniao com link Meet e participantes
- cancelar_evento: usuario quer cancelar um evento/reuniao existente
- ajuda: usuario pede ajuda ou quer saber o que o assistente faz
- clarificacao: mensagem ambigua ou que nao se encaixa nas categorias acima

Extraia entidades quando aplicavel:
- titulo: nome/descricao do evento ou reuniao
- data: data mencionada (formato YYYY-MM-DD quando possivel)
- hora: horario mencionado (formato HH:MM)
- duracao: duracao em minutos (padrao 60 se nao especificado)
- participantes: lista de pessoas com nome, email ou telefone

Retorne um valor de confidence entre 0 e 1 indicando sua certeza na classificacao.`;

const extractIntentSchema = {
  name: 'extract_intent',
  description: 'Extrai a intencao e entidades de uma mensagem do usuario',
  strict: true,
  parameters: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string' as const,
        enum: ['upload_arquivo', 'criar_evento', 'criar_reuniao', 'cancelar_evento', 'ajuda', 'clarificacao'],
        description: 'A intencao classificada da mensagem',
      },
      entities: {
        type: 'object' as const,
        properties: {
          titulo: { type: ['string', 'null'] as const, description: 'Titulo do evento ou reuniao' },
          data: { type: ['string', 'null'] as const, description: 'Data no formato YYYY-MM-DD' },
          hora: { type: ['string', 'null'] as const, description: 'Horario no formato HH:MM' },
          duracao: { type: ['number', 'null'] as const, description: 'Duracao em minutos' },
          participantes: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                nome: { type: ['string', 'null'] as const },
                email: { type: ['string', 'null'] as const },
                telefone: { type: ['string', 'null'] as const },
              },
              required: ['nome', 'email', 'telefone'],
              additionalProperties: false,
            },
            description: 'Lista de participantes',
          },
        },
        required: ['titulo', 'data', 'hora', 'duracao', 'participantes'],
        additionalProperties: false,
      },
      confidence: {
        type: 'number' as const,
        description: 'Confianca na classificacao (0-1)',
      },
    },
    required: ['intent', 'entities', 'confidence'],
    additionalProperties: false,
  },
} as const;

const CONFIDENCE_THRESHOLD = 0.7;

export async function classifyIntent(text: string): Promise<IntentResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      tools: [{ type: 'function', function: extractIntentSchema }],
      tool_choice: { type: 'function', function: { name: 'extract_intent' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      logger.warn({ service: 'intent-classifier', action: 'no-tool-call' }, 'GPT did not return tool call');
      return { intent: Intent.CLARIFICACAO, entities: {}, confidence: 0, rawText: text };
    }

    const parsed = JSON.parse(toolCall.function.arguments) as {
      intent: string;
      entities: IntentEntities;
      confidence: number;
    };

    const intent = parsed.confidence < CONFIDENCE_THRESHOLD
      ? Intent.CLARIFICACAO
      : (parsed.intent as Intent);

    const entities: IntentEntities = {
      ...parsed.entities,
      participantes: parsed.entities.participantes?.map(p => ({
        ...(p.nome ? { nome: p.nome } : {}),
        ...(p.email ? { email: p.email } : {}),
        ...(p.telefone ? { telefone: p.telefone } : {}),
      })),
    };

    // Clean null values from entities
    if (entities.titulo === null) delete entities.titulo;
    if (entities.data === null) delete entities.data;
    if (entities.hora === null) delete entities.hora;
    if (entities.duracao === null) delete entities.duracao;

    logger.info(
      { service: 'intent-classifier', action: 'classify', intent, confidence: parsed.confidence },
      `Intent classified: ${intent} (confidence: ${parsed.confidence})`,
    );

    return {
      intent,
      entities,
      confidence: parsed.confidence,
      rawText: text,
    };
  } catch (error) {
    logger.error({ service: 'intent-classifier', action: 'classify', error }, 'Failed to classify intent');
    throw handleApiError(error, 'intent-classifier');
  }
}
