# Assistente Pessoal Inteligente via WhatsApp

Agente de IA integrado ao WhatsApp que atua como assistente pessoal, automatizando gestao de arquivos, organizacao de agenda e coordenacao de reunioes.

## Funcionalidades

- **Gestao de arquivos** — Envie arquivos pelo WhatsApp e eles sao salvos automaticamente no Google Drive, organizados por tipo e mes
- **Organizacao de agenda** — Crie eventos no Google Calendar usando linguagem natural (texto ou audio)
- **Coordenacao de reunioes** — Crie reunioes com link do Google Meet e envie convites por email e WhatsApp
- **Cancelamento de eventos** — Cancele eventos da agenda por nome, com confirmacao
- **Lembretes automaticos** — Receba lembretes no WhatsApp 30 minutos antes dos compromissos
- **Audio** — Envie mensagens de voz que sao transcritas e processadas como texto

## Pre-requisitos

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **ffmpeg** — Necessario para conversao de audio (OGG para MP3)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Railway: instalado automaticamente via Nixpacks
- **Conta Meta Business** — Para acesso a WhatsApp Business API
- **Google Cloud Project** — Com APIs habilitadas: Drive, Calendar, Gmail
- **OpenAI API Key** — Para transcricao de audio (Whisper) e classificacao de intents (GPT)

## Setup

### 1. Clone e instale

```bash
git clone <repo-url>
cd assistente-whatsapp
npm install
```

### 2. Configure variaveis de ambiente

```bash
cp .env.example .env
```

Preencha as variaveis no `.env`:

| Variavel | Descricao | Obrigatoria |
|----------|-----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Token da WhatsApp Business API | Sim |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do numero de telefone WhatsApp | Sim |
| `WEBHOOK_VERIFY_TOKEN` | Token para verificacao do webhook | Sim |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID | Sim |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | Sim |
| `GOOGLE_REDIRECT_URI` | URI de callback OAuth | Sim |
| `GOOGLE_REFRESH_TOKEN` | Obtido apos autorizacao (passo 3) | Sim |
| `GOOGLE_USER_EMAIL` | Email para envio de convites Gmail | Nao |
| `WHATSAPP_USER_PHONE` | Numero do usuario para lembretes | Nao |
| `OPENAI_API_KEY` | Chave da API OpenAI | Sim |
| `PORT` | Porta do servidor (default: 3000) | Nao |

### 3. Autorize o Google OAuth

Inicie o servidor e acesse no navegador:

```
http://localhost:3000/auth/google
```

Autorize as permissoes solicitadas. Copie o `refresh_token` exibido e cole no `.env` como `GOOGLE_REFRESH_TOKEN`. Reinicie o servidor.

### 4. Configure o webhook WhatsApp

No painel Meta Business > WhatsApp > Configuration:

- **Callback URL:** `https://seu-dominio.com/webhook`
- **Verify Token:** Mesmo valor de `WEBHOOK_VERIFY_TOKEN` no `.env`
- **Subscribed Fields:** `messages`

## Comandos

```bash
npm run dev       # Desenvolvimento com hot-reload
npm run build     # Compilar TypeScript
npm start         # Executar build de producao
npm test          # Rodar todos os testes
npm run typecheck # Verificar tipos TypeScript
```

## Configuracao de APIs

### Meta WhatsApp Business API

1. Crie um app em [Meta for Developers](https://developers.facebook.com/)
2. Adicione o produto "WhatsApp"
3. Obtenha o Access Token e Phone Number ID em API Setup

### Google Cloud

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Habilite as APIs: Google Drive, Google Calendar, Gmail
3. Crie credenciais OAuth 2.0 (tipo: Web application)
4. Adicione `http://localhost:3000/auth/google/callback` como Authorized Redirect URI

### OpenAI

1. Obtenha uma API key em [OpenAI Platform](https://platform.openai.com/api-keys)
2. Modelos utilizados: `gpt-4o-mini` (classificacao), `gpt-4o-mini-transcribe` (audio)

## Arquitetura

```
src/
├── config/          # Configuracao e variaveis de ambiente
├── services/        # Servicos de negocio
│   ├── audio-transcriber.ts    # Pipeline ffmpeg + Whisper
│   ├── calendar.service.ts     # Google Calendar CRUD
│   ├── drive.service.ts        # Google Drive upload
│   ├── email.service.ts        # Envio de emails via Gmail
│   ├── google-auth.ts          # OAuth 2.0 + rotas de auth
│   ├── intent-classifier.ts    # Classificacao de intents via GPT
│   ├── message-router.ts       # Roteamento central de mensagens
│   ├── reminder.scheduler.ts   # Lembretes automaticos via cron
│   └── whatsapp.client.ts      # Cliente WhatsApp Business API
├── types/           # Interfaces TypeScript
├── utils/           # Logger, mensagens, error handler
└── webhooks/        # Handler do webhook WhatsApp
```

## Troubleshooting

| Problema | Solucao |
|----------|---------|
| `GOOGLE_REFRESH_TOKEN not configured` | Acesse `http://localhost:3000/auth/google` para autorizar |
| `ffmpeg: command not found` | Instale ffmpeg: `brew install ffmpeg` ou `apt-get install ffmpeg` |
| Webhook retorna 403 | Verifique que `WEBHOOK_VERIFY_TOKEN` no `.env` corresponde ao configurado no Meta |
| Audio nao transcrito | Verifique a `OPENAI_API_KEY` e que o modelo `gpt-4o-mini-transcribe` esta disponivel |
| Lembretes nao enviados | Verifique que `WHATSAPP_USER_PHONE` esta configurado no `.env` |
| Emails nao enviados | Verifique `GOOGLE_USER_EMAIL` e que a Gmail API esta habilitada |
| Google API timeout | APIs Google tem timeout de 10s. Tente novamente em alguns minutos |

## Licenca

Projeto privado.
