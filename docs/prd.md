# Assistente Pessoal Inteligente via WhatsApp — Product Requirements Document (PRD)

> **Version:** 0.1
> **Date:** 2026-02-16
> **Author:** @pm (Morgan)
> **Status:** Draft
> **Inputs:** requirements.json, spec.md, complexity.json, research.json, implementation.yaml

---

## 1. Goals and Background Context

### 1.1 Goals

- Permitir que o usuario gerencie arquivos pessoais enviando-os via WhatsApp para upload automatico no Google Drive, organizados por tipo e data _(FR-3)_
- Automatizar a criacao e cancelamento de eventos no Google Calendar atraves de linguagem natural via WhatsApp _(FR-4, FR-5)_
- Coordenar reunioes com geracao automatica de link Google Meet e envio de convites por email/WhatsApp _(FR-6, FR-8)_
- Receber e interpretar comandos em texto e audio em portugues brasileiro _(FR-1, FR-2)_
- Enviar lembretes proativos via WhatsApp antes de compromissos _(FR-7)_

### 1.2 Background Context

O usuario precisa de um assistente pessoal que centralize tarefas cotidianas — salvar arquivos, agendar compromissos e organizar reunioes — sem sair do WhatsApp, sua principal ferramenta de comunicacao. Hoje, essas acoes exigem alternar entre multiplos apps (Drive, Calendar, Gmail), criar links manualmente e copiar informacoes entre plataformas.

O projeto resolve isso integrando um agente de IA ao WhatsApp Business API que interpreta linguagem natural (texto e audio) via OpenAI GPT e executa acoes automatizadas nas APIs do Google. A v1 atende um unico usuario com custo operacional estimado em ~$6.30/mes.

### 1.3 Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-02-16 | 0.1 | Criacao inicial do PRD baseado em Spec Pipeline completo | @pm (Morgan) |

---

## 2. Requirements

### 2.1 Functional

- **FR1:** Receber mensagens de texto via WhatsApp Business API e interpretar intencao usando LLM (OpenAI GPT) _(P0)_
- **FR2:** Receber audio, transcrever via Whisper e interpretar como comando de texto _(P0)_
- **FR3:** Upload automatico de arquivos para Google Drive com organizacao por tipo/data _(P0)_
- **FR4:** Criacao de eventos no Google Calendar a partir de linguagem natural _(P0)_
- **FR5:** Cancelamento de eventos existentes no Google Calendar _(P1)_
- **FR6:** Criacao de reunioes com Google Meet + envio de convites (email/WhatsApp) _(P0)_
- **FR7:** Lembretes automaticos via WhatsApp antes de compromissos _(P1)_
- **FR8:** Cancelamento de reunioes com notificacao aos participantes _(P1)_

### 2.2 Non Functional

- **NFR1:** Resposta em < 30s para qualquer operacao (p95 latencia end-to-end)
- **NFR2:** Interface intuitiva via linguagem natural em pt-BR — sem manual necessario
- **NFR3:** Resiliencia a falhas de APIs, notificando usuario — zero operacoes perdidas silenciosamente
- **NFR4:** Tokens OAuth armazenados com seguranca — nenhum token exposto em logs/codigo
- **NFR5:** Arquitetura v1 single-user, preparada para multi-tenant futuro
- **NFR6:** Transcricao de audio com suporte pt-BR, acuracia > 90% para audios claros

---

## 3. Technical Assumptions

### 3.1 Repository Structure: Monorepo

Projeto unico com um unico repositorio. Backend Node.js/TypeScript com todos os servicos, testes e configuracoes no mesmo repo. Adequado para v1 single-service.

### 3.2 Service Architecture

**Monolith** — Express server unico que recebe webhooks, processa intents e chama APIs externas. Justificativa: v1 single-user, sem necessidade de microservicos ou filas. Complexidade minima com todos os servicos no mesmo processo.

### 3.3 Testing Requirements

**Unit + Integration:**
- **Unit tests:** Intent classifier, message router, drive service, calendar service (Jest + ts-jest)
- **Integration tests:** Webhook e2e, fluxo completo de reuniao
- **Sem E2E automatizado:** WhatsApp Cloud API nao suporta testes e2e automatizados facilmente — validacao manual via sandbox Meta

### 3.4 Additional Technical Assumptions and Requests

- **Runtime:** Node.js >= 20 LTS com TypeScript strict mode _(CON-1)_
- **WhatsApp:** Cloud API v21.0 via Meta — requer conta Meta Business verificada _(CON-2)_
- **Google APIs:** googleapis npm ^134.0.0 — OAuth 2.0 Authorization Code flow, refresh token em `.env` (v1 single-user) _(CON-3)_
- **LLM:** OpenAI GPT-4o-mini com function calling (structured output) para intent classification _(CON-4)_
- **STT:** Whisper API (gpt-4o-mini-transcribe) com pre-processamento ffmpeg OGG/Opus → MP3 _(CON-5)_
- **Sem banco de dados na v1:** Sources of truth sao Google Calendar (eventos), Google Drive (arquivos), WhatsApp (conversas). Estado de lembretes em memoria (`Set<eventId>`)
- **Hosting:** Railway (deploy simples, SSL automatico, free tier para dev) _(OQ-1)_
- **Custo operacional estimado:** ~$6.30/mes (OpenAI GPT + Whisper) _(research.json)_
- **Audio:** fluent-ffmpeg para conversao, ffmpeg como dependencia de sistema
- **Logging:** pino (structured logging) — diagnostico de falhas de APIs externas
- **Scheduling:** node-cron para verificacao periodica de lembretes (a cada 5min)

---

## 4. Epic List

1. **Epic 1: Foundation & WhatsApp Integration** — Estabelecer infraestrutura do projeto e implementar o core do WhatsApp: webhook, intent classification via GPT e message routing.
2. **Epic 2: Google Integration & File Management** — Implementar OAuth 2.0 com Google e upload de arquivos para o Drive com organizacao automatica.
3. **Epic 3: Calendar, Meetings & Notifications** — Implementar Calendar, Google Meet, envio de convites e cancelamento com notificacoes.
4. **Epic 4: Audio, Reminders & Polish** — Implementar transcricao de audio, lembretes automaticos, edge cases e documentacao.

---

## 5. Epic 1: Foundation & WhatsApp Integration

**Goal:** Estabelecer toda a infraestrutura do projeto (scaffold Node.js/TypeScript, configuracao, utils) e implementar o core do WhatsApp: recepcao de mensagens via webhook, envio de respostas, classificacao de intencoes via OpenAI GPT e roteamento de mensagens por tipo e intent. Ao final deste epic, o agente recebe mensagens de texto no WhatsApp, interpreta a intencao e responde com a acao identificada.

### Story 1.1: Project Foundation & Express Server

> As a developer,
> I want a fully configured Node.js/TypeScript project with Express server, environment validation, shared types, and structured logging,
> so that I have a solid foundation to build all subsequent features.

**Acceptance Criteria:**

1. `package.json` criado com scripts: `dev`, `build`, `start`, `test`, `typecheck` e todas as dependencias do spec
2. `tsconfig.json` com strict=true, target=ES2022, module=NodeNext, outDir=dist/
3. `.env.example` com todas as variaveis de ambiente documentadas (WhatsApp, Google, OpenAI, Server)
4. `src/config/env.ts` exporta objeto tipado validando campos obrigatorios — lanca erro claro se variavel critica faltar
5. `src/types/index.ts` com enums e interfaces: Intent, IntentResult, MessageType, entities
6. `src/utils/logger.ts` com pino configurado: redact de tokens/keys, niveis info/warn/error
7. `src/utils/error-handler.ts` com classe AppError (code, statusCode, userMessage pt-BR) e funcao handleApiError()
8. `src/server.ts` com Express server, health check em GET /health retornando 200, middleware de logging, shutdown graceful (SIGTERM)
9. `.gitignore` ignora node_modules/, dist/, .env, uploads/
10. `npm install && npx tsc --noEmit` executa sem erros

### Story 1.2: WhatsApp Webhook & Client

> As a user,
> I want the system to receive my WhatsApp messages and be able to respond,
> so that I can communicate with the assistant through my preferred messaging app.

**Acceptance Criteria:**

1. GET `/webhook` verifica `hub.verify_token` e retorna `hub.challenge` (Meta webhook verification)
2. POST `/webhook` responde HTTP 200 imediatamente e processa mensagem de forma assincrona (NFR-1)
3. POST `/webhook` extrai mensagem de `req.body.entry[0].changes[0].value.messages[0]` corretamente
4. `whatsapp.client.ts` implementa `sendText(to, body)` via POST graph.facebook.com/v21.0/{PHONE_ID}/messages
5. `whatsapp.client.ts` implementa `downloadMedia(mediaId)` com fluxo 2-step (GET URL → GET binary)
6. `whatsapp.client.ts` implementa `sendProcessingMessage(to)` que envia "Processando..." em < 2s (NFR-1)
7. Timeout de 10s em todas as chamadas ao WhatsApp Cloud API
8. Erros de API sao logados via pino e usuario notificado com mensagem descritiva (NFR-3)

### Story 1.3: Intent Classification via OpenAI

> As a user,
> I want the assistant to understand what I mean when I send a message in Portuguese,
> so that it can perform the correct action automatically.

**Acceptance Criteria:**

1. `intent-classifier.ts` usa OpenAI GPT-4o-mini com function calling (strict: true)
2. Schema `extract_intent` retorna: `{ intent, entities: { titulo, data, hora, duracao, participantes[] }, confidence }`
3. Intents reconhecidos: `upload_arquivo`, `criar_evento`, `criar_reuniao`, `cancelar_evento`, `ajuda`
4. System prompt em pt-BR instruindo o modelo a interpretar linguagem natural brasileira
5. Threshold de confianca: mensagens com confidence < 0.7 retornam intent `clarificacao`
6. Timeout de 10s para chamadas a OpenAI API
7. Testes unitarios com mock da OpenAI API cobrindo: intent correto para cada tipo, extracao de entidades, mensagem ambigua

### Story 1.4: Message Router & End-to-End Text Flow

> As a user,
> I want to send a text message and receive an appropriate response based on my intent,
> so that the assistant acts on my requests without me needing to learn commands.

**Acceptance Criteria:**

1. `message-router.ts` roteia por tipo: text → intent-classifier, audio → (futuro), document → intent `upload_arquivo`
2. Apos classificacao, intent router direciona para servico correspondente via `switch(intent)`
3. Para intents ainda nao implementados (drive, calendar), responde com "Funcionalidade em desenvolvimento"
4. Para intent `ajuda`, responde com lista de capacidades do assistente em pt-BR
5. Para intent `clarificacao`, responde pedindo mais detalhes com opcoes sugeridas
6. Webhook handler integrado com message router: mensagem recebida → classificada → respondida
7. Testes unitarios para roteamento por tipo e por intent
8. Teste de integracao: POST /webhook com mensagem texto → resposta correta via WhatsApp

---

## 6. Epic 2: Google Integration & File Management

**Goal:** Implementar a autenticacao OAuth 2.0 com Google e o servico de upload de arquivos para o Google Drive com organizacao automatica por tipo e data. Ao final deste epic, o usuario envia um arquivo pelo WhatsApp e ele aparece organizado no Google Drive, com confirmacao de sucesso enviada de volta pelo assistente.

### Story 2.1: Google OAuth 2.0 Authentication

> As a user,
> I want to connect my Google account to the assistant,
> so that it can access my Drive, Calendar and Gmail on my behalf.

**Acceptance Criteria:**

1. `google-auth.ts` implementa OAuth2Client com `client_id`, `client_secret` e `redirect_uri` do env
2. GET `/auth/google` redireciona (302) para Google consent screen com scopes: `drive.file`, `calendar`, `gmail.send`
3. Parametros OAuth incluem `access_type: 'offline'` e `prompt: 'consent'` para garantir refresh token
4. GET `/auth/google/callback` troca authorization code por tokens via `oauth2Client.getToken(code)`
5. Callback exibe o `refresh_token` na tela para o usuario copiar e colar no `.env` (v1 single-user)
6. `getAuthenticatedClient()` retorna OAuth2Client configurado com refresh token do `.env`, renovando access_token automaticamente
7. Se refresh token estiver ausente ou invalido, loga erro e notifica via WhatsApp com instrucoes de re-autorizacao (EC-7)
8. Teste unitario: mock de OAuth flow verifica troca de code por tokens

### Story 2.2: Google Drive Upload & Auto-Organization

> As a user,
> I want my files to be automatically organized in Google Drive by type and date,
> so that I can find them easily later without manual sorting.

**Acceptance Criteria:**

1. `drive.service.ts` implementa `uploadFile(buffer, filename, mimeType)` usando `drive.files.create` com media stream
2. Organizacao automatica: pasta raiz por tipo (`documentos/`, `imagens/`, `planilhas/`, `outros/`) baseada em mime_type
3. Subpasta por mes/ano (ex: `documentos/02-2026/`) criada automaticamente se nao existir
4. Retorna objeto `{ fileId, webViewLink, folderPath }` apos upload bem-sucedido
5. Scope utilizado: `drive.file` (acesso apenas a arquivos criados pelo app)
6. Timeout de 10s para chamadas a Drive API
7. Erros de upload (quota, permissao, rede) logados e notificados ao usuario (NFR-3)
8. Teste unitario com mock da googleapis: criacao de pasta + upload + retorno de link

### Story 2.3: WhatsApp-to-Drive End-to-End Flow

> As a user,
> I want to send a file on WhatsApp and have it saved to my Google Drive automatically,
> so that I don't need to open Drive and upload manually.

**Acceptance Criteria:**

1. Message router identifica mensagens do tipo `document` e classifica intent como `upload_arquivo`
2. Fluxo completo: webhook recebe → download media do WhatsApp → classifica tipo → upload para Drive → confirma
3. Mensagem "Processando seu arquivo..." enviada imediatamente ao usuario (NFR-1)
4. Apos upload, confirmacao enviada com nome do arquivo e localizacao no Drive (ex: "Arquivo 'relatorio.pdf' salvo em documentos/02-2026/")
5. Se arquivo muito grande (EC-6), informa limite e sugere alternativa
6. Se Google Drive indisponivel (EC-1), notifica usuario com mensagem explicativa
7. Teste de integracao: POST /webhook com documento → mock de WhatsApp download → mock de Drive upload → resposta de confirmacao

---

## 7. Epic 3: Calendar, Meetings & Notifications

**Goal:** Implementar criacao e cancelamento de eventos no Google Calendar, geracao automatica de links Google Meet, e envio de convites por email e WhatsApp. Ao final deste epic, o usuario cria reunioes com um comando em linguagem natural e todos os participantes recebem convites com link do Meet. Cancelamentos notificam os envolvidos automaticamente.

### Story 3.1: Calendar Event Creation from Natural Language

> As a user,
> I want to create calendar events by sending natural language messages on WhatsApp,
> so that I can organize my schedule without opening the Google Calendar app.

**Acceptance Criteria:**

1. `calendar.service.ts` implementa `createEvent(title, startTime, endTime, description?)` via `calendar.events.insert`
2. Timezone configurado como `America/Sao_Paulo` em todas as operacoes
3. Duracao default de 1h quando nao especificada pelo usuario
4. `listUpcoming(timeMin, timeMax)` retorna eventos futuros com `singleEvents: true` e `orderBy: 'startTime'`
5. Message router integrado: intent `criar_evento` → extrai entities (titulo, data, hora, duracao) → cria evento
6. Mensagem "Agendando seu compromisso..." enviada imediatamente (NFR-1)
7. Confirmacao enviada com resumo: nome, data, horario (ex: "Evento 'Dentista' criado para 17/02 as 15:00")
8. Se conflito de horario (EC-9), avisa usuario e pergunta se deseja criar mesmo assim
9. Se data no passado (EC-5), informa e pergunta se deseja agendar para proxima ocorrencia
10. Teste unitario com mock da Calendar API: criacao de evento + listagem de proximos

### Story 3.2: Google Meet Links & Meeting Invites

> As a user,
> I want to create meetings with automatic Google Meet links and send invites to participants,
> so that I can coordinate meetings in one message without switching between apps.

**Acceptance Criteria:**

1. `createEvent` com `conferenceDataVersion: 1` e `conferenceData.createRequest` gera link Google Meet automaticamente
2. `calendar.events.insert` com `sendUpdates: 'all'` envia convites nativos do Google Calendar para participantes com email
3. `email.service.ts` implementa envio de convites customizados via Nodemailer OAuth2 para participantes nao-Google (OQ-6)
4. Transport Nodemailer configurado com OAuth2 (clientId, clientSecret, refreshToken)
5. Para participantes com telefone/WhatsApp, convite enviado via `whatsapp.client.sendText` com detalhes + link Meet
6. Message router integrado: intent `criar_reuniao` → extrai entities (titulo, data, hora, participantes[]) → cria evento + Meet + convites
7. Confirmacao enviada com resumo: nome, data, link Meet, status dos convites
8. Se email de participante invalido (EC-8), informa quais convites falharam sem bloquear os demais
9. Teste unitario: mock Calendar API (evento + Meet link) + mock Nodemailer (envio email)

### Story 3.3: Event & Meeting Cancellation with Notifications

> As a user,
> I want to cancel events or meetings by sending a message on WhatsApp,
> so that I can manage my schedule and participants are notified automatically.

**Acceptance Criteria:**

1. `calendar.service.ts` implementa `deleteEvent(eventId)` via `calendar.events.delete` com `sendUpdates: 'all'`
2. Message router integrado: intent `cancelar_evento` → busca eventos matching → solicita confirmacao → cancela
3. Busca de eventos por descricao/data usando `listUpcoming` + filtro por titulo
4. Se multiplos eventos encontrados (AC-5.3), lista opcoes numeradas e pede selecao ao usuario
5. Confirmacao obrigatoria antes de cancelar: "Cancelar '[titulo]' em [data]? Responda sim para confirmar"
6. Apos cancelamento, confirmacao enviada: "Evento '[titulo]' cancelado com sucesso"
7. Para reunioes com participantes (FR-8), notificacao de cancelamento enviada pelo mesmo canal do convite original
8. Se evento nao encontrado, responde: "Nao encontrei nenhum evento com essa descricao"
9. Teste unitario: mock Calendar API (busca + delete) + fluxo de confirmacao

---

## 8. Epic 4: Audio, Reminders & Polish

**Goal:** Implementar transcricao de audio via ffmpeg e Whisper API, lembretes automaticos de compromissos via node-cron, e refinar o sistema com tratamento robusto de edge cases, mensagens padronizadas em pt-BR e documentacao de setup. Ao final deste epic, o sistema esta completo e robusto.

### Story 4.1: Audio Transcription (ffmpeg + Whisper)

> As a user,
> I want to send voice messages on WhatsApp and have the assistant understand them,
> so that I can interact hands-free without typing.

**Acceptance Criteria:**

1. `audio-transcriber.ts` implementa pipeline: Buffer OGG/Opus → temp file → fluent-ffmpeg → MP3 → Whisper API → texto
2. Conversao via fluent-ffmpeg com codec libmp3lame, removendo temp files apos processamento
3. Whisper API chamada com model `gpt-4o-mini-transcribe` e `language: 'pt'`
4. Timeout de 15s para chamada ao Whisper API
5. Message router atualizado: tipo `audio` → download media → audio-transcriber → texto → intent-classifier → resposta
6. Se transcricao falha ou audio inaudivel (EC-3), responde: "Nao consegui entender o audio. Pode enviar por texto?"
7. Temp files sempre removidos (try/finally) para evitar acumulo em disco
8. Teste unitario com mock: ffmpeg conversao + Whisper transcricao + fluxo de erro

### Story 4.2: Automatic Reminders Scheduler

> As a user,
> I want to receive automatic WhatsApp reminders before my upcoming appointments,
> so that I never miss an important event or meeting.

**Acceptance Criteria:**

1. `reminder.scheduler.ts` usa node-cron para executar a cada 5 minutos
2. Consulta Calendar API (`listUpcoming`) para eventos nos proximos 30 minutos
3. `Set<string>` em memoria com eventIds ja lembrados para evitar duplicatas
4. Lembrete enviado via `whatsapp.client.sendText` com: nome do evento, horario e link Meet (se aplicavel)
5. Formato da mensagem: "Lembrete: '[titulo]' comeca em [X] minutos. [Link Meet se houver]"
6. Se servidor reiniciar, Set limpa — pior caso e lembrete duplicado (aceitavel v1)
7. Scheduler iniciado no startup do server (`src/server.ts`)
8. Se Calendar API indisponivel durante verificacao, loga erro e tenta novamente no proximo ciclo
9. Teste unitario com mock: Calendar retorna eventos proximos → lembrete enviado → eventId adicionado ao Set → segundo ciclo nao reenvia

### Story 4.3: Edge Cases, PT-BR Messages & Documentation

> As a user,
> I want consistent Portuguese messages and graceful error handling,
> so that the assistant feels natural and never leaves me without feedback.

**Acceptance Criteria:**

1. `src/utils/messages.ts` centraliza todas as mensagens de feedback em pt-BR (processando, confirmacoes, erros, ajuda)
2. Todos os servicos utilizam `messages.ts` em vez de strings hardcoded
3. Edge cases implementados no message-router e error-handler:
   - Mensagem ambigua (EC-4): pede clarificacao com opcoes sugeridas
   - API indisponivel (EC-1, EC-2): mensagem explicativa + sugestao de retry
   - Token OAuth invalido (EC-7): instrucoes de re-autorizacao via WhatsApp
   - Conflito de horario (EC-9): aviso + pergunta de confirmacao
   - Data no passado (EC-5): sugestao de proxima ocorrencia
   - Arquivo grande (EC-6): informa limite
   - Email invalido (EC-8): informa quais convites falharam
4. `README.md` criado com: descricao do projeto, pre-requisitos (Node.js, ffmpeg, contas), setup passo-a-passo, configuracao de APIs (Meta, Google, OpenAI), variaveis de ambiente, comandos de execucao, troubleshooting
5. Testes unitarios atualizados para cobrir edge cases principais
6. Nenhuma mensagem em ingles exibida ao usuario — tudo em pt-BR

---

## 9. Checklist Results Report

### Executive Summary

- **Overall PRD completeness:** 92%
- **MVP scope appropriateness:** Just Right
- **Readiness for architecture phase:** Ready (arquitetura ja definida no spec.md)
- **Most critical gap:** Ausencia de secao formal de User Personas (mitigado: v1 single-user, persona implicita)

### Category Statuses

| Category | Status | Critical Issues |
|----------|--------|-----------------|
| 1. Problem Definition & Context | **PASS** | Problema claro, contexto documentado, custo validado |
| 2. MVP Scope Definition | **PASS** | Escopo definido com IN/OUT claros no spec.md, P0/P1 priorizacao |
| 3. User Experience Requirements | **PASS** | Sem UI — WhatsApp e a interface. 5 fluxos de interacao documentados |
| 4. Functional Requirements | **PASS** | 8 FRs com ACs detalhados, testáveis e rastreáveis |
| 5. Non-Functional Requirements | **PASS** | 6 NFRs com metricas mensuráveis, performance strategy definida |
| 6. Epic & Story Structure | **PASS** | 4 epics, 13 stories sequenciais, ACs completos |
| 7. Technical Guidance | **PASS** | Stack definido, constraints claros, decisoes arquiteturais documentadas |
| 8. Cross-Functional Requirements | **PARTIAL** | 7 APIs externas documentadas; sem politica de data retention formal |
| 9. Clarity & Communication | **PASS** | Linguagem consistente, terminologia definida, traceability completa |

### Top Issues by Priority

**HIGH:**
- Nenhum

**MEDIUM:**
- Data retention policy nao formalizada (v1 sem DB — dados vivem nos servicos Google, retencao e responsabilidade do Google)
- Ausencia de secao formal de User Personas (mitigado: single-user, persona implicita no background context)

**LOW:**
- Monitoring/alerting nao detalhado (pino logging cobre v1, monitoring formal e post-MVP)
- Deployment frequency nao especificada (Railway continuous deploy implícito)

### MVP Scope Assessment

- **Escopo adequado:** 8 FRs cobrindo as 3 funcionalidades core (arquivos, agenda, reunioes) + input multimodal (texto/audio) + lembretes
- **Cortes corretos:** Edicao de eventos, multi-tenant, UI web, edicao de arquivos — tudo corretamente fora do escopo v1
- **Complexidade:** COMPLEX (23/25) mas gerenciavel em 4 epics de ~1 semana cada
- **Custo:** ~$6.30/mes — viavel para uso pessoal

### Recommendations

1. ~~Data retention~~ — Para v1, documentar que dados pertencem ao Google (Drive/Calendar) e ao WhatsApp. Sem dados locais = sem politica local necessaria.
2. ~~User persona~~ — Para v1 single-user, a persona e o proprio usuario. Formalizar se escalar para multi-tenant.
3. **Monitoring:** Adicionar metricas basicas (request count, error rate) como story futura post-MVP.

### Final Decision

**READY FOR ARCHITECT** — O PRD esta completo, bem estruturado e pronto para a fase de arquitetura (que ja foi concluida no spec.md e implementation.yaml).

---

## 10. Next Steps

### 10.1 UX Expert Prompt

> N/A — Este projeto nao possui interface grafica propria. O WhatsApp e a interface do usuario. Nenhuma intervencao de UX design e necessaria.

### 10.2 Architect Prompt

> A arquitetura ja foi definida como parte do Spec Pipeline (spec.md + implementation.yaml). Para referencia, ativar @architect e consultar `docs/spec/spec.md` secao 3 (Technical Approach) e `docs/spec/plan/implementation.yaml` para o plano de implementacao detalhado com 6 fases e 21 subtasks.

---

## Metadata

- **Generated by:** @pm (Morgan) via create-doc (prd-tmpl.yaml v2.0)
- **Inputs:** requirements.json, spec.md, complexity.json, research.json, implementation.yaml
- **Spec Pipeline Status:** Complete (all 6 phases + revision)
- **Architecture Status:** Complete (spec.md + implementation.yaml)
- **Next Workflow Step:** Story Development Cycle — @sm cria stories formais a partir deste PRD
