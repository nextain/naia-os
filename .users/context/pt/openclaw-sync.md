# Sincronização de Configuração OpenClaw

## Visão Geral

Sincroniza as definições de utilizador da Shell (app Tauri) com os ficheiros bootstrap do OpenClaw Gateway.  
Isto garante que as funcionalidades do Gateway (Discord DM, TTS, etc.) usam a mesma persona e credenciais da Shell.

## Triggers de Sincronização

| Trigger | Ficheiro | Função |
|---------|----------|--------|
| Guardar definições | `SettingsTab.tsx` | `handleSave()` |
| Conclusão do onboarding | `OnboardingWizard.tsx` | `handleComplete()` |
| Callback de autenticação do Lab | `SettingsTab.tsx` | listener `lab_auth_complete` |
| Arranque da app | `ChatPanel.tsx` | session load useEffect |
| Após sumarização de sessão | `ChatPanel.tsx` | `summarizePreviousSession()` |
| Após extração automática de facts | `ChatPanel.tsx` | a cada 10 mensagens / `visibilitychange` |
| Após sincronização inversa | `memory-sync.ts` | `syncFromOpenClawMemory()` |

## Itens de Sincronização

### 1. `openclaw.json` — Fornecedor/Modelo

| Shell Provider | OpenClaw Provider |
|---------------|-----------------|
| gemini | google |
| anthropic | anthropic |
| xai | xai |
| openai | openai |
| nextain | nextain |
| claude-code-cli | anthropic |
| ollama | ollama |

### 2. `auth-profiles.json` — API Key
- Ignorado para Lab proxy (nextain) e fornecedores sem key

### 3. `SOUL.md` — System Prompt (completo)
Saída completa de `buildSystemPrompt()`:

- Texto da persona (com substituição de nome)  
- Instruções de tags de emoção  
- Contexto do nome do utilizador  
- **Facts conhecidos sobre o utilizador (da DB de facts da Shell)**  
- Instruções de linguagem/locale  

> **Nota**: `syncToOpenClaw()` é autónomo — carrega sempre config + facts internamente.  
> O parâmetro `_systemPrompt` do chamador é ignorado. Todos os caminhos de sincronização incluem os facts consistentemente.

### 4. `IDENTITY.md` / `USER.md`
- Nome do agente, nome do utilizador

## Sincronização de Memória

### Arquitetura Dual-Origin

| Aspecto | Shell | OpenClaw |
|---------|-------|----------|
| Role | "Quem é o utilizador" (facts) | "O que aconteceu" (registos de sessão) |
| Armazenamento | `memory.db` (SQLite, tabela facts) | `workspace/memory/*.md` + `memory/main.sqlite` |

### Shell para OpenClaw (facts em SOUL.md)
O conteúdo da DB de facts é injetado em SOUL.md para que os caminhos exclusivos do OpenClaw (Discord DM, etc.) acedam à informação do utilizador.

### Extração Automática Durante Conversa
Facts são extraídos automaticamente sem necessidade de clicar em "Nova Conversa":

- **A cada 10 mensagens**: trigger no handler do chunk `usage`  
- **Quando a app vai para background**: evento `visibilitychange`, limiar 3+ mensagens não extraídas  
- Apenas usa `extractFacts()` (leve, sem sumarização)

### OpenClaw para Shell (sincronização inversa)
Lê ficheiros `workspace/memory/*.md` guardados pelo hook `session-memory` do OpenClaw:

- Comando Rust `read_openclaw_memory_files(since_ms)` lê os ficheiros  
- LLM extrai facts -> `upsertFact()` -> `syncToOpenClaw()`  
- Executa 5s após arranque da app + a cada 30 minutos

### Hook session-memory
Hook interno do OpenClaw que guarda automaticamente conversas em `workspace/memory/*.md`.  
Ativado via `config/defaults/openclaw-bootstrap.json`.

## Roteamento de Chat

| Definição | Valor | Comportamento |
|-----------|-------|---------------|
| `AppConfig.chatRouting` | `"auto"` (padrão) | Rota via Gateway quando conectado; fallback para LLM direto |
| | `"gateway"` | Sempre via Gateway |
| | `"direct"` | Sempre LLM direto (comportamento original) |

Campo do agente: `ChatRequest.routeViaGateway` (booleano)

## Ficheiros Chave

- `shell/src/lib/openclaw-sync.ts` — `syncToOpenClaw()` (autónomo)  
- `shell/src/lib/memory-sync.ts` — sincronização inversa (OpenClaw -> Shell)  
- `shell/src/lib/memory-processor.ts` — `extractFacts()`, `summarizeSession()`  
- `shell/src/lib/persona.ts` — `buildSystemPrompt()`  
- `shell/src/lib/db.ts` — `getAllFacts()`, `upsertFact()`  
- `shell/src/components/ChatPanel.tsx` — triggers de extração automática  
- `shell/src/components/SettingsTab.tsx` — trigger `handleSave`  
- `shell/src/components/OnboardingWizard.tsx` — trigger `handleComplete`  
- `shell/src-tauri/src/lib.rs` — `sync_openclaw_config`, `read_openclaw_memory_files`

## Restrições

- **O código-fonte do OpenClaw NÃO é modificável**  
- A sincronização é best-effort; erros são logados, mas nunca bloqueiam a UI  
- SOUL.md recebe o PROMPT completo do sistema (tags de emoção + nome + facts + contexto)  
- `gateway.mode=local` é OBRIGATÓRIO — sem isto o OpenClaw encerra imediatamente