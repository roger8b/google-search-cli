# gscli — Google Search CLI

[![CI](https://github.com/roger8b/google-search-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/roger8b/google-search-cli/actions/workflows/ci.yml)
[![Node.js ≥18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A TypeScript CLI that drives a **logged-in Chrome over CDP** and extracts Google results with human-like typing. Built for LLM agent workflows: deterministic JSON output, persistent search history, Google AI Mode (chat-like multi-turn), retry/cache/merge, locale awareness, consent-wall handling, and a hard mutex against parallel-keystroke corruption.

## The Core Idea

`WebFetch` and most "search" tools hit Google anonymously through scrapers or proxies. The results are generic, geo-skewed, blocked by anti-bot, or missing the personalization (history, language, account context) that makes search useful for real work.

`gscli` drives your **own logged-in Chrome** through the Chrome DevTools Protocol — same cookies, same account, same locale. It types into the search box at a human cadence, scrapes the result, and emits structured JSON. Google AI Mode (`udm=50`) works the same way, including a real on-screen conversation thread for follow-ups. Every successful search is appended to a JSONL history, so cache hits and cross-search merges happen without re-opening the browser.

The agent runs `gscli "<query>"`, gets JSON, and feeds it into whatever pipeline you have. No clicking, no copy-pasting URLs out of a SERP.

> The browser-as-API pattern builds on [agent-browser](https://agent-browser.dev/) for CDP automation.

---

## Architecture

```
~/.gscli/                     User data root — never wiped by the installer
├── chrome-profile/           Persistent Chrome profile (your Google login)
└── history/searches.jsonl    Append-only search history (JSONL)

~/.gscli/  (or a clone dir)   Installed CLI source (npm link → `gscli` bin)
$TMPDIR/gscli/                Chrome launch logs
$TMPDIR/google-search-script-<port>.lock   Per-port mutex
```

**Three layers:**

1. **Chrome (CDP)** — a real, logged-in browser `gscli setup` starts in a separate window using a dedicated profile. Your personal Chrome is untouched.
2. **agent-browser** — external CDP client that types, moves the mouse on Bézier curves, scrolls, and reads the DOM at human cadence so anti-bot heuristics treat the session as a person.
3. **gscli** — orchestration (Commander, i18n, consent handling, history, cache, merge, lock, retry, AI Mode warm-path) that emits structured output to stdout.

Skills and rule files installed by `gscli init` live in the **project** (or `$HOME` for global scope), never inside `~/.gscli/`. Updating the CLI updates the skill templates automatically (symlink install).

---

## Install

```bash
git clone https://github.com/roger8b/google-search-cli ~/wiki/google-search-cli
cd ~/wiki/google-search-cli
./install.sh --local
```

The script verifies Node ≥18, checks `agent-browser` is on `PATH`, syncs into `~/.gscli/`, builds, `npm link`s the `gscli` bin, and runs `gscli setup` so you sign into Google in one step.

**`install.sh` options:**

| Invocation | Effect |
|------------|--------|
| `./install.sh` | Clone fresh from the remote, build, link, setup |
| `./install.sh --local` | Use the current checkout (`$PWD`), build, link, setup |
| `./install.sh --local /path/to/src` | Sync that path into `~/.gscli/` first |
| `./install.sh --local --no-setup` | Install only, skip the Chrome login step |

**Manual install:**

```bash
git clone <repo> ~/.gscli && cd ~/.gscli
npm install && npm run build && npm link
gscli setup
```

**Prerequisites:** Node ≥18 and the [`agent-browser`](https://agent-browser.dev/) binary on `PATH` (the installer warns if missing).

---

## Quick Start

```bash
# 1. Install + sign in to Google (one time per machine)
./install.sh --local

# 2. Wire a project so agents know about gscli (one time per project)
cd ~/code/my-project && gscli init

# 3. Search from anywhere
gscli "agent-browser cdp mode"
gscli "what is python" --ai
gscli "what is python" --ai -c -f "give code examples" -f "now an async one"
gscli --merge-history --merge-limit 5

# 4. Verify the environment whenever something feels off
gscli doctor
```

---

## Commands

`gscli` has five commands. `search` is the default — `gscli "<query>"` ≡ `gscli search "<query>"`.

### `gscli setup` — one-time Chrome login

Opens a **separate Chrome debug window** with a dedicated profile. Your personal Chrome stays open and untouched. Sign in to Google once; the profile is reused on every future search.

| Flag | Default | Purpose |
|------|---------|---------|
| `--port <n>` | `9222` | CDP port |
| `--profile-dir <path>` | `~/.gscli/chrome-profile` | Profile location |
| `--chrome-bin <path>` | macOS Chrome path | Chrome binary |
| `--force` | – | Kill any Chrome on that port/profile, then relaunch |
| `--reuse` | – | If CDP already answers, skip launch and go to login |

### `gscli search` — run a search (default command)

```bash
gscli "<query>" [options]
gscli search "<query>" [options]     # explicit
gscli -q "<query>" [options]         # flag form
```

**Browser / target**

| Flag | Default | Purpose |
|------|---------|---------|
| `-q, --query <text>` | – | Query (alternative to the positional arg) |
| `--port <n>` | `9222` | CDP port |
| `--google-url <url>` | `https://www.google.com/?hl=pt-BR` | Start URL — the `?hl=` locale drives all UI labels (see [Locales](#locale-support)) |
| `--chrome-bin <path>` | macOS Chrome | Chrome binary |
| `--agent-browser-bin <path>` | `agent-browser` | agent-browser binary |
| `--profile-dir <path>` | `~/.gscli/chrome-profile` | Chrome profile |
| `--start-log-dir <path>` | `$TMPDIR/gscli` | Launch-log directory |

**Output / volume**

| Flag | Default | Purpose |
|------|---------|---------|
| `--max-links <n>` | `10` | Cap extracted links |
| `--format <json\|ndjson>` | `json` | Output shape (ndjson = one record per line) |
| `--type-delay-scale <n>` | `0.82` | Typing speed multiplier (lower = faster) |

**AI Mode**

| Flag | Purpose |
|------|---------|
| `--ai-mode`, `--ai` | Use Google AI Mode (`udm=50`) instead of the SERP |
| `-c, --conversation` | Enable multi-turn chat (use with `-f`) |
| `-f, --follow-up <text>` | A follow-up turn — repeatable |

**Resilience**

| Flag | Default | Purpose |
|------|---------|---------|
| `--retry` | – | Retry on `error`/`blocked`/`inconclusive` with exponential backoff |
| `--max-retries <n>` | `2` | Retry cap when `--retry` |

**History / cache / merge** (see also the `gscli-history` skill)

| Flag | Default | Purpose |
|------|---------|---------|
| `--history-file <path>` | `~/.gscli/history/searches.jsonl` | History JSONL location |
| `--no-history` | – | Do not append this search to history |
| `--use-cache` | – | Return a prior identical query within TTL — **no browser** |
| `--cache-ttl <seconds>` | `3600` | Cache window for `--use-cache` |
| `--merge-history` | – | Emit a deduped union of links from recent searches — **no browser** |
| `--merge-limit <n>` | `10` | How many recent searches to merge |
| `--merge-ttl <seconds>` | `86400` | Time window for `--merge-history` |

**Concurrency (lock)**

| Flag | Default | Purpose |
|------|---------|---------|
| `--no-lock` | – | **UNSAFE** — skip the per-port mutex (parallel runs interleave keystrokes) |
| `--lock-wait <seconds>` | `120` | Max wait to acquire the lock |

### `gscli init` — wire a project for agents

Interactive by default. Detects every supported agent installed on the machine (55-agent registry), lets you pick which to wire, installs the `gscli-*` skills, and injects a marker-delimited rules section into each agent's rule file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.clinerules`, `.cursor/rules/gscli.mdc`, …). Writes a `.gscli.json` manifest.

| Flag | Default | Purpose |
|------|---------|---------|
| `--scope <local\|global\|both>` | ask | `local` = project dirs; `global` = each agent's home dir; `both` |
| `--method <symlink\|copy>` | ask (symlink) | `symlink` auto-updates skills when the CLI updates; `copy` is a static snapshot |
| `--update` | – | Re-sync existing skills without prompting |
| `--show-all` | – | List every supported agent, not just detected ones |
| `--force` | – | Overwrite even if a gscli section already exists |
| `-y, --yes` | – | Non-interactive: detected agents, `local`, `symlink` |

```bash
gscli init                              # interactive
gscli init -y                           # non-interactive, sane defaults
gscli init --scope both --method copy   # explicit, still picks agents interactively
gscli init -y --scope global            # user-wide skills for detected agents
```

Re-running is idempotent: the rules section is replaced in place, the manifest is always refreshed (so a later `init` with different agents/scope/method does not leave stale metadata).

### `gscli uninstall` — reverse `init`

Removes `gscli-*` skills and the rules section from each agent, and deletes `.gscli.json` on a local uninstall.

| Flag | Default | Purpose |
|------|---------|---------|
| `--agent <id>` | – | Limit to one agent id |
| `--scope <local\|global\|both>` | `local` | Where to remove from |
| `-y, --yes` | – | Skip confirmations |

### `gscli doctor` — health check

Validates Chrome binary, `agent-browser` on PATH, CDP reachability, profile dir, history file, and log dir. Exits non-zero on any failure. Run it first whenever a search misbehaves.

### Misc

```bash
gscli --version
gscli --help          # full command + flag reference (same surface as this README)
```

---

## Output

### Regular SERP

```json
{
  "status": "ok",
  "query": "agent-browser cdp mode",
  "title": "agent-browser cdp mode - Google Search",
  "links": [
    { "position": 1, "title": "…", "url": "…", "snippet": "…" }
  ],
  "cdpPort": 9222,
  "source": "google"
}
```

Sponsored results are filtered out (EN/PT/ES/FR ad labels).

### AI Mode (`--ai`, with `-c -f` for multi-turn)

```json
{
  "status": "ok",
  "mode": "ai-mode",
  "conversation": true,
  "query": "what is python",
  "title": "…",
  "port": 9222,
  "turns": [
    { "question": "what is python", "answer": "…" },
    { "question": "give code examples", "answer": "…" }
  ],
  "aiContent": "…(first answer)…",
  "timestamp": "2026-05-16T…Z"
}
```

Follow-ups are typed into the **inline AI Mode input**, so the conversation stays on screen like a chat. If a locale/account doesn't render the inline box, `gscli` transparently falls back to per-query URL navigation (logged to stderr; the thread resets but every answer is still in `turns`).

### `--merge-history`

```json
{
  "status": "ok",
  "mode": "merge-history",
  "mergedFrom": [{ "ts": "…", "query": "…" }],
  "links": [
    { "position": 1, "title": "…", "url": "…", "snippet": "…",
      "sources": ["query A", "query B"] }
  ]
}
```

`sources` traces which past searches surfaced each URL.

### Exit codes

`0` ok · `1` error · `2` blocked (CAPTCHA / unusual traffic / unresolved consent) · `3` inconclusive (zero links / empty AI answer). With `--retry`, codes `1/2/3` trigger a backed-off retry.

---

## Locale Support

The UI language is derived from the `?hl=` param of `--google-url` (default `pt-BR`). It drives which labels `gscli` looks for: the search box, the **AI Mode** button, the "new conversation" affordance, the consent **accept** button, and the inline follow-up input.

| Locale | `--google-url` | AI Mode button |
|--------|----------------|----------------|
| pt-BR (default) | `?hl=pt-BR` | "Modo IA" |
| en-US | `?hl=en-US` | "AI Mode" |
| es-ES | `?hl=es-ES` | "Modo de IA" |
| fr-FR | `?hl=fr-FR` | "Mode IA" |

```bash
gscli "what is rust" --ai --google-url "https://www.google.com/?hl=en-US"
```

A bare prefix (`?hl=en`, `?hl=pt`) maps to the closest supported locale; unknown locales fall back to pt-BR.

---

## Consent / Cookie Walls

On a fresh profile or new region Google can interpose a consent wall (`consent.google.com` or an in-page banner) that blocks the search box. `gscli` detects it (URL or snapshot), clicks the locale-appropriate accept button, confirms it actually cleared (URL **and** banner re-check), and continues. An unresolved consent wall surfaces as `blocked` (exit 2) rather than a silent empty result.

---

## Concurrency

Every run takes an exclusive lock per CDP port (`$TMPDIR/google-search-script-<port>.lock`). Without it, parallel runs on the same Chrome interleave keystrokes character-by-character (real bug — we have the scrambled logs). The lock auto-releases on exit / SIGINT / SIGTERM and reaps stale holders after 10 min or when the holder PID dies. `--no-lock` is **UNSAFE** unless you serialize externally.

For true parallelism, run separate Chrome instances on distinct ports + profiles:

```bash
gscli setup --port 9223 --profile-dir ~/.gscli/profile-b
gscli "q" --port 9223 --profile-dir ~/.gscli/profile-b
```

---

## Use Cases

### LLM agent search tool
Replace `WebSearch` / `WebFetch`. The agent gets logged-in, AI-Mode-aware results plus a persistent JSONL trail. Wire it with `gscli init`; the installed skills tell the agent when and how to call it.

### Multi-turn AI research (chat)
`gscli "topic" --ai -c -f "narrow to X" -f "now compare with Y"` keeps a real on-screen conversation thread; the JSON `turns[]` array has every Q&A. Restate key context in a follow-up when it depends on an earlier answer — thread memory isn't guaranteed across every locale/account.

### Continuous research across days
Every result lands in `searches.jsonl`. `gscli --merge-history --merge-limit 20 --merge-ttl 604800` yields a deduped union of links from the last week with per-URL source attribution — **no browser**.

### Cheap repeats / cost control
`gscli "<q>" --use-cache --cache-ttl 3600` returns a recent identical query from history without opening Chrome. Add `--no-history` for one-off/sensitive queries that shouldn't pollute the JSONL.

### Headless data pipelines
`gscli "<q>" --format ndjson` → pipe into a `jq` filter → fetcher. Structured datasets without a manual browser. Exit codes make failures scriptable; `--retry` smooths transient blocks.

### Reproducible citations
Every search is timestamped + status-tagged in JSONL. "What did Google say about X last Tuesday" is a `jq` query away (see the `gscli-history` skill for recipes).

### Multi-locale / international queries
`--google-url "...?hl=<locale>"` runs the whole flow (search box, AI Mode, consent) in pt-BR / en-US / es-ES / fr-FR.

---

## Paths & Environment

| What | Where | Env override |
|------|-------|--------------|
| User data root | `~/.gscli` | `GSCLI_HOME` |
| Chrome profile | `~/.gscli/chrome-profile` | `CHROME_DEBUG_DIR` |
| Search history | `~/.gscli/history/searches.jsonl` | `SEARCH_HISTORY_FILE` |
| Chrome launch logs | `$TMPDIR/gscli/chrome-<port>.log` | `START_LOG_DIR` |
| SERP snapshot (debug) | `$TMPDIR/gscli/google-search-snapshot.log` | – |
| Per-port lock | `$TMPDIR/google-search-script-<port>.lock` | – |
| CDP port | `9222` | `CDP_PORT` |
| Chrome binary | `/Applications/Google Chrome.app/…` | `CHROME_BIN` |
| agent-browser bin | `agent-browser` (PATH) | `AGENT_BROWSER_BIN` |
| Default query | – | `SEARCH_QUERY` |
| AI Mode default | off | `AI_MODE=true` |
| Retry default | off | `SEARCH_RETRY=true` |

Env vars resolve at process start; equivalent flags override per run.

---

## Tips & Tricks

- **Inspect failures** — the last SERP/AI snapshot is at `$TMPDIR/gscli/google-search-snapshot.log`; Chrome launch logs at `$TMPDIR/gscli/chrome-<port>.log`.
- **Warm path** — repeated `--ai` calls in the same session reuse the open AI Mode page (skips the google.com → type → click-button dance, ~10-13 s faster). Watch stderr for `warm-path`.
- **Headless? No.** Visible Chrome by design — anti-bot treats headless differently. The window can be backgrounded but not killed mid-search.
- **CAPTCHA / unusual traffic** → `blocked` (exit 2). Solve it in the debug window, re-run. Don't auto-retry on `2` blindly.
- **`--use-cache` is silent on miss** — falls through to a live search.
- **`-c` without `-f` does nothing** — follow-ups need both.
- **History is JSONL** — `tail -n 20 ~/.gscli/history/searches.jsonl | jq -r .query`; `jq -c 'select(.mode=="ai-mode")'` filters AI Mode runs.

---

## Mental Model

- **One install per machine.** Code + profile + history under `~/.gscli/`. Re-running `install.sh` never wipes user data (profile/history excluded from sync).
- **One Chrome debug window per CDP port.** Default `9222`; use `--port` + `--profile-dir` for parallel isolated sessions.
- **The per-port mutex is the safety net.** It prevents keystroke interleaving and self-reaps.
- **History is append-only.** `--use-cache` and `--merge-history` depend on its ordering — never hand-edit it.
- **Locale is a URL concern.** Everything keys off `--google-url ?hl=`.
- **All commands work from any directory.** Defaults derive from `GSCLI_HOME`, not the CWD.

Everything is plain TypeScript + Markdown + JSONL in a git repo. No databases, no daemons, no proxies.

---

## Dev

```bash
npm install
npm run dev -- "test query"   # tsx, no build
npm run build                 # tsc → dist/
npm test                      # vitest (54 tests)
```

CI runs `build` + `test` on Node 20 and 22 for every push and PR. See `AGENTS.md` / `CLAUDE.md` for contributor conventions.

## License

MIT.
