# google-search-script

CLI TypeScript que extrai links da SERP do Google via `agent-browser` (CDP) com simulação humana de teclado/mouse.

Memória permanente, retry, cache, AI Mode, e merge cross-search incluídos.

## Comportamento padrão

- Conecta ao Chrome existente em `localhost:9222` (CDP); inicia se preciso
- Limpa o input antes de digitar (evita texto residual de buscas anteriores)
- Re-resolve o ref do search box a cada busca (3 tentativas) — mitiga `Unknown ref: e12` em sessões longas
- Toda busca bem-sucedida é gravada em `history/searches.jsonl`
- Detecta CAPTCHA / tráfego incomum

## Instalação

```bash
chmod +x scripts/google-search-script/run.sh
# tsx via npm ou global; veja package.json
```

## Uso básico

```bash
./run.sh "agent-browser cdp mode"
./run.sh search --query "Gemma 4 fine-tuning" --max-links 5 --format json
```

## Flags

| Flag | Descrição |
|------|-----------|
| `-q, --query <text>` | Query (alternativa: posicional) |
| `--port <n>` | Porta CDP (default: 9222) |
| `--google-url <url>` | URL Google (default: `https://www.google.com/?hl=pt-BR`) |
| `--max-links <n>` | Limite de links (default: 10) |
| `--format json\|ndjson` | Formato saída |
| `--type-delay-scale <n>` | Velocidade digitação (default: 0.82; menor = mais rápido) |
| `--ai-mode, --ai` | Google AI Mode (`udm=50`) |
| `--conversation, -c` | Multi-turno AI Mode (use com `-f`) |
| `-f, --follow-up <text>` | Follow-up (repetível) |

### Resilience

| Flag | Descrição |
|------|-----------|
| `--retry` | Retry em timeout/inconclusive/blocked com backoff exponencial |
| `--max-retries <n>` | Máximo de retries (default: 2) |

### History (memória permanente)

| Flag | Descrição |
|------|-----------|
| `--history-file <path>` | JSONL append-only (default: `history/searches.jsonl`) |
| `--no-history` | Desabilita gravação |

### Cache (history-backed)

| Flag | Descrição |
|------|-----------|
| `--use-cache` | Reutiliza última entry da mesma query dentro do TTL — sem abrir browser |
| `--cache-ttl <seconds>` | TTL (default: 3600) |

### Merge cross-search (sem browser)

| Flag | Descrição |
|------|-----------|
| `--merge-history` | Emite união deduplicada de links das últimas N buscas |
| `--merge-limit <n>` | Searches a mesclar (default: 10) |
| `--merge-ttl <seconds>` | Janela (default: 86400 = 24h) |

### Concorrência (lock)

Cada execução adquire um lock exclusivo por porta CDP em `/tmp/google-search-script-<port>.lock`. Sem lock, múltiplas instâncias paralelas no mesmo Chrome interleavam keystrokes (vimos saídas tipo `m atGr oa4oi gnvlisn` = 3 queries embaralhadas char-a-char). Lock auto-libera no exit / SIGINT / SIGTERM. Locks órfãos (PID morto OU >10min) são removidos automaticamente.

| Flag | Descrição |
|------|-----------|
| `--no-lock` | UNSAFE: pula o mutex (use só se garantir serialização externa) |
| `--lock-wait <seconds>` | Max espera pelo lock (default: 120) |

Cada link mesclado inclui `sources: [query1, query2, ...]` indicando quais queries o produziram.

## Exemplos

```bash
# Busca normal com retry e history (default)
./run.sh "Gemma 4 LoRA QLoRA" --max-links 10 --retry

# Cache hit: 2ª chamada idêntica volta sem Chrome
./run.sh "Gemma 4 LoRA QLoRA" --use-cache
./run.sh "Gemma 4 LoRA QLoRA" --use-cache  # cache hit

# AI Mode + multi-turno
./run.sh "o que é python" --ai-mode -c \
  -f "principais usos" -f "exemplos de código"

# Mescla últimas 5 buscas em URLs únicos (com source-attribution)
./run.sh --merge-history --merge-limit 5 --merge-ttl 7200
```

## Output JSON

```json
{
  "status": "ok",
  "query": "...",
  "title": "...",
  "links": [
    { "position": 1, "title": "...", "url": "...", "snippet": "..." }
  ],
  "cdpPort": 9222,
  "source": "google"
}
```

Status: `ok` | `blocked` (CAPTCHA) | `inconclusive` (zero links).

## Variáveis de ambiente

| Var | Equivalente flag |
|-----|------------------|
| `CDP_PORT` | `--port` |
| `GOOGLE_URL` | `--google-url` |
| `SEARCH_QUERY` | `--query` |
| `CHROME_BIN` | `--chrome-bin` |
| `AGENT_BROWSER_BIN` | `--agent-browser-bin` |
| `CHROME_DEBUG_DIR` | `--profile-dir` |
| `TYPE_DELAY_SCALE` | `--type-delay-scale` |
| `AI_MODE=true` | `--ai-mode` |
| `SEARCH_RETRY=true` | `--retry` |
| `SEARCH_HISTORY_FILE` | `--history-file` |
| `SEARCH_USE_CACHE=true` | `--use-cache` |
| `SEARCH_NO_LOCK=true` | `--no-lock` |
| `SEARCH_LOCK_WAIT` | `--lock-wait` |

## Exit codes

- `0` — sucesso (`status: ok`)
- `1` — erro de execução
- `2` — bloqueado (CAPTCHA / unusual traffic)
- `3` — inconclusive (zero links)

Com `--retry`, códigos 1/2/3 disparam nova tentativa antes de retornar.

## Limitação AI Mode conversação

- `udm=50` (pt-BR) não renderiza input inline de follow-up
- Cada follow-up vira nova URL `?q=...&udm=50`, sem contexto
- Para preservar contexto, inclua manualmente no follow-up: `-f "no contexto de python, dê exemplos"`

## Pipeline integrado

Para fluxo end-to-end (search → extract → consolidação), veja `scripts/research_pipeline.py`.
