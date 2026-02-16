# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Assistente Pessoal Inteligente via WhatsApp** — Agente de IA integrado ao WhatsApp que atua como assistente pessoal, automatizando:
1. **Gestão de arquivos** — Envio de arquivos pelo WhatsApp → upload automático no Google Drive
2. **Organização de agenda** — Interpretação de linguagem natural → criação de eventos no Google Calendar
3. **Coordenação de reuniões** — Criação de evento + link Google Meet + envio de convites (email/WhatsApp)

**Integrações:** WhatsApp Business API, Google Drive API, Google Calendar API, Google Meet API, Gmail API

**Status:** Projeto greenfield — framework AIOS instalado, código de aplicação ainda não iniciado.

## Synkra AIOS Framework

<!-- AIOS-MANAGED-START: core-framework -->
### Core Framework Understanding

Synkra AIOS is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture.
<!-- AIOS-MANAGED-END: core-framework -->

<!-- AIOS-MANAGED-START: agent-system -->
### Agent System

#### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst
- The master agent is activated with @aios-master
- Agent commands use the * prefix: *help, *create-story, *task, *exit

#### Agent Context
When an agent is active:
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Maintain the agent's perspective throughout the interaction
<!-- AIOS-MANAGED-END: agent-system -->

### Agent Authority (Key Rules)
- **@devops (Gage)** — EXCLUSIVO para `git push`, `gh pr create/merge`, MCP management, CI/CD
- **@dev (Dex)** — Pode `git add/commit/branch/checkout/merge` (local). NÃO pode `git push` ou `gh pr`
- **@pm (Morgan)** — Exclusivo para epic orchestration e spec pipeline
- **@po (Pax)** — Exclusivo para validação de stories (10-point checklist) e transição Draft → Ready
- **@sm (River)** — Exclusivo para criação de stories (`*draft`, `*create-story`)
- Regras completas em `.claude/rules/agent-authority.md`

## Story-Driven Development

All development follows the Story Development Cycle (SDC):
1. **Create** (@sm) → `docs/stories/{epicNum}.{storyNum}.story.md`
2. **Validate** (@po) → 10-point checklist, GO (≥7/10) ou NO-GO
3. **Implement** (@dev) → Modes: Interactive (default), YOLO (autonomous), Pre-Flight (plan-first)
4. **QA Gate** (@qa) → 7 quality checks, verdict: PASS / CONCERNS / FAIL / WAIVED

Story file edits: @po edita título/descrição/AC/escopo; @dev edita File List/checkboxes/Dev Notes; @qa edita QA Results.

<!-- AIOS-MANAGED-START: framework-structure -->
### AIOS Framework Structure

```
aios-core/
├── agents/         # Agent persona definitions (YAML/Markdown)
├── tasks/          # Executable task workflows
├── workflows/      # Multi-step workflow definitions
├── templates/      # Document and code templates
├── checklists/     # Validation and review checklists
└── rules/          # Framework rules and patterns

docs/
├── stories/        # Development stories (numbered)
├── prd/            # Product requirement documents
├── architecture/   # System architecture documentation
└── guides/         # User and developer guides
```
<!-- AIOS-MANAGED-END: framework-structure -->

### Key Configuration Files
- `.aios-core/core-config.yaml` — Configuração central do framework
- `.claude/rules/*.md` — Regras detalhadas (agent-authority, story-lifecycle, workflow-execution, etc.)
- `.env` / `.env.example` — Variáveis de ambiente (LLM keys, Supabase, GitHub, etc.)
- `.aios-core/development/agents/*.md` — Definições de persona dos agentes

## Build & Test Commands

```bash
# AIOS Core (from .aios-core/)
npm test                    # Unit + integration tests
npm run test:unit           # Jest unit tests only
npm run test:integration    # Jest integration tests only
npm run lint                # ESLint
npm run typecheck           # TypeScript check (tsc --noEmit)
npm run build               # Build core

# Validation
npm run validate:structure  # Validate framework structure
npm run validate:agents     # Validate agent definitions
npm run sync:ide            # Sync IDE configurations
npm run sync:ide:check      # Check IDE sync status
```

**Requisitos:** Node.js >= 18.0.0, npm >= 9.0.0

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Reference story ID: `feat: implement IDE detection [Story 2.1]`
- Commits atômicos e focados
- Apenas @devops pode executar `git push` e `gh pr create/merge`

<!-- AIOS-MANAGED-START: aios-patterns -->
### AIOS-Specific Patterns

#### Working with Templates
```javascript
const template = await loadTemplate('template-name');
const rendered = await renderTemplate(template, context);
```

#### Agent Command Handling
```javascript
if (command.startsWith('*')) {
  const agentCommand = command.substring(1);
  await executeAgentCommand(agentCommand, args);
}
```

#### Story Updates
```javascript
// Update story progress
const story = await loadStory(storyId);
story.updateTask(taskId, { status: 'completed' });
await story.save();
```
<!-- AIOS-MANAGED-END: aios-patterns -->

<!-- AIOS-MANAGED-START: common-commands -->
## Common Commands

### AIOS Master Commands
- `*help` - Show available commands
- `*create-story` - Create new story
- `*task {name}` - Execute specific task
- `*workflow {name}` - Run workflow

### Development Commands
- `npm run dev` - Start development
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run build` - Build project
<!-- AIOS-MANAGED-END: common-commands -->

## Workflow Execution

Tasks em `.aios-core/development/tasks/` são executadas conforme configuradas. Workflows com `elicit: true` requerem input do usuário.

### Workflow Selection
| Situação | Workflow |
|----------|---------|
| Nova story de epic | Story Development Cycle (SDC) |
| QA encontrou issues | QA Loop (max 5 iterações) |
| Feature complexa precisa de spec | Spec Pipeline → SDC |
| Projeto legado existente | Brownfield Discovery |
| Bug fix simples | SDC (modo YOLO) |

## IDS Principle (Incremental Development System)

Hierarquia de decisão: **REUSE > ADAPT > CREATE**
- Consultar registro de entidades antes de criar algo novo
- Adaptações não podem exceder 30% do original
- Criações requerem justificativa documentada
- Detalhes em `.claude/rules/ids-principles.md`

## Permissions & Security

Configuração definida em `.claude/settings.json`:

**Permitido (allow):**
- Todas as ferramentas core: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task, NotebookEdit, Skill
- Edição de planos aprovados: `Edit(.claude/approved-plans/**)`
- Git pull: `Bash(git pull:*)`

**Bloqueado (deny):**
- `rm -rf /`, `rm -rf ~`, `rm -rf /*` — Remoção destrutiva de sistema
- `sudo rm -rf:*` — Remoção com elevação de privilégio
- `mkfs:*` — Formatação de disco
- `dd if=/dev/zero:*` — Sobrescrita de disco
- `chmod -R 777 /` — Permissão insegura no sistema

**Outras configurações:**
- Sandbox desabilitado
- Always thinking habilitado
- Output style: default

## Language

Toda comunicação com o usuário deve ser em **português**. Termos técnicos e identificadores de código permanecem na forma original.
