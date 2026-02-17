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

function buildSystemPrompt(): string {
  // Use São Paulo timezone to get correct "today" regardless of server timezone
  const now = new Date();
  const spFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayISO = spFormatter.format(now); // returns YYYY-MM-DD

  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
  });
  const todayWeekday = weekdayFormatter.format(now);

  return `Voce e o motor de interpretacao de um assistente pessoal inteligente via WhatsApp. O usuario interage em portugues brasileiro informal para gerenciar sua vida pessoal: salvar arquivos no Google Drive, agendar compromissos no Google Calendar, criar reunioes com Google Meet e enviar convites.

Sua tarefa: classificar a intencao e extrair entidades da mensagem do usuario.

IMPORTANTE: Voce recebe o HISTORICO da conversa. Use-o para entender o contexto. O usuario pode fazer referencias a acoes anteriores como "envie pra esse entao", "muda o nome", "adiciona fulano", "tenta de novo". Interprete essas mensagens usando o contexto da conversa.

## DATA DE REFERENCIA (CRITICO)
Hoje e ${todayWeekday}, ${todayISO}. Fuso horario: America/Sao_Paulo (BRT/BRST).

Regras de conversao de datas relativas:
- "hoje" → ${todayISO}
- "amanha" → dia seguinte a ${todayISO}
- "depois de amanha" → dois dias apos ${todayISO}
- "proxima segunda/terca/etc" → a proxima ocorrencia futura desse dia da semana a partir de ${todayISO}
- "semana que vem" → 7 dias apos ${todayISO}
- "mes que vem" → mesmo dia no proximo mes
- Se o usuario disser apenas o dia (ex: "dia 20"), assuma o mes atual. Se o dia 20 ja passou neste mes, assuma o proximo mes.
SEMPRE retorne a data convertida em formato YYYY-MM-DD. NUNCA retorne palavras como "amanha", "hoje", "proxima segunda".

## INTENCOES

| intent | descricao | exemplos |
|--------|-----------|----------|
| criar_evento | agendar compromisso/evento no calendario | "marca dentista pra amanha as 14h", "agendar reuniao dia 20", "coloca na agenda almoco sexta 12h" |
| criar_reuniao | criar reuniao com link Meet e/ou participantes | "cria reuniao com joao@email.com amanha 10h", "marca call com o time as 15h" |
| cancelar_evento | cancelar evento/reuniao existente | "cancela meu dentista", "remove a reuniao de amanha" |
| reenviar_convite | reenviar/enviar convite de reuniao recente para outro email ou participante | "envie pra esse entao fulano@email.com", "manda o convite pro joao tambem", "tenta enviar de novo" |
| upload_arquivo | salvar arquivo no Google Drive (ou legenda/caption de um arquivo enviado) | "salva esse arquivo", "guarda no drive", "salvar com o nome relatorio" |
| ajuda | pede ajuda ou quer saber capacidades | "o que voce faz?", "ajuda", "como funciona?" |
| clarificacao | mensagem ambigua ou fora das categorias | qualquer mensagem que nao se encaixe claramente |

Diferenciar criar_evento vs criar_reuniao: se menciona participantes (email, telefone, nomes de pessoas) ou pede "link meet/call/video", e criar_reuniao. Caso contrario, e criar_evento.

Diferenciar criar_reuniao vs reenviar_convite: se o historico mostra que uma reuniao acabou de ser criada e o usuario quer enviar/reenviar o convite para alguem (novo email, novo participante, retry), use reenviar_convite. Se e uma reuniao totalmente nova, use criar_reuniao.

## EXTRACAO DE ENTIDADES

- titulo: descricao curta do compromisso (ex: "dentista", "almoco com maria"). Se nao explicito, infira do contexto ou do historico.
- data: OBRIGATORIO formato YYYY-MM-DD. Converta usando as regras acima.
- hora: formato HH:MM em 24h. Se "2 da tarde" → "14:00", "meio-dia" → "12:00", "10:30am" → "10:30", "10:30pm" → "22:30". Se nao mencionado, retorne null.
- duracao: em minutos. Se nao mencionado, retorne null (sistema usara default de 60min).
- participantes: lista de pessoas. Extraia nome, email e/ou telefone quando mencionados. Inclua participantes mencionados na mensagem atual, mesmo que seja um follow-up.
- nomeArquivo: nome desejado para o arquivo (ex: se usuario diz "salvar com o nome lindo", nomeArquivo = "lindo"). Sem extensao.
- pastaDestino: pasta onde salvar o arquivo (ex: "na pasta fotos", "em documentos/trabalho"). Se nao mencionado, retorne null.

## CONFIDENCE
Retorne um valor entre 0 e 1. Use >= 0.8 quando a intencao e clara e as entidades foram extraidas. Use 0.5-0.7 quando ha ambiguidade. Use < 0.5 quando a mensagem e incompreensivel.`;
}

const extractIntentSchema = {
  name: 'extract_intent',
  description: 'Extrai a intencao e entidades de uma mensagem do usuario',
  strict: true,
  parameters: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string' as const,
        enum: ['upload_arquivo', 'criar_evento', 'criar_reuniao', 'cancelar_evento', 'reenviar_convite', 'ajuda', 'clarificacao'],
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
          nomeArquivo: { type: ['string', 'null'] as const, description: 'Nome desejado para o arquivo (sem extensao)' },
          pastaDestino: { type: ['string', 'null'] as const, description: 'Pasta de destino para o arquivo' },
        },
        required: ['titulo', 'data', 'hora', 'duracao', 'participantes', 'nomeArquivo', 'pastaDestino'],
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function classifyIntent(
  text: string,
  history?: ConversationMessage[],
): Promise<IntentResult> {
  try {
    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildSystemPrompt() },
    ];

    // Include conversation history for context
    if (history && history.length > 0) {
      for (const msg of history) {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }

    chatMessages.push({ role: 'user', content: text });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: chatMessages,
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
    if (entities.nomeArquivo === null) delete entities.nomeArquivo;
    if (entities.pastaDestino === null) delete entities.pastaDestino;

    logger.info(
      { service: 'intent-classifier', action: 'classify', intent, confidence: parsed.confidence, historyLength: history?.length || 0 },
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
