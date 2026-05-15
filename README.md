# gscli — Google Search CLI

[![CI](https://github.com/roger8b/google-search-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/roger8b/google-search-cli/actions/workflows/ci.yml)
[![Node.js ≥18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A TypeScript CLI that drives a logged-in Chrome over CDP and extracts Google SERP links with human-like typing. Built for LLM agent workflows: deterministic JSON output, persistent search history, Google AI Mode, multi-turn conversations, retry/cache/merge, and a hard mutex against parallel-keystroke corruption.

## The Core Idea

`WebFetch` and most "search" tools hit Google anonymously through scrapers or proxies. The results are either generic, geo-skewed, blocked by anti-bot, or missing the personalization (history, language, account context) that makes search useful for real work.

`gscli` works differently: it drives your **own logged-in Chrome** through the Chrome DevTools Protocol. The browser is the one you already trust — same cookies, same account, same locale. The CLI types into the search box at a human cadence, scrapes the SERP, and returns structured JSON. AI Mode (`udm=50`) works the same way. Every successful search is appended to a JSONL history, so cache hits and cross-search merges happen without re-opening the browser.

You never click anything yourself; you never copy URLs out of a SERP again. The agent runs `gscli "<query>"`, gets a JSON list of links, and feeds them into whatever pipeline you have.

> The browser-as-API pattern is inspired by [agent-browser](https://github.com/roger8b/agent-browser), which `gscli` builds on for CDP automation.

---

## Architecture

```
~/.gscli/                  User data root — never wiped by the installer
├── chrome-profile/        Persistent Chrome profile (your Google login)
├── history/searches.jsonl Append-only search history (JSONL)
└── (installed CLI source via `install.sh --local`)

$TMPDIR/gscli/             Chrome launch logs
$TMPDIR/google-search-script-<port>.lock   Per-port mutex
```

**Three layers:**

1. **Chrome (CDP)** — a real, logged-in browser instance that `gscli setup` starts in a separate window using a dedicated profile. Your personal Chrome stays untouched.

2. **agent-browser** — the external CDP client (`agent-browser` binary) that types into the page, scrolls, and reads the DOM at human cadence so Google's anti-bot heuristics treat the session as a person.

3. **gscli** — the orchestration layer (Commander, history, cache, merge, lock, retry) that decides what to do with the browser and emits structured output to stdout.

Skills and rule files installed by `gscli init` live in the **project** (or `$HOME` with `--global`), never inside `~/.gscli/`. Updating the CLI updates the skill templates automatically.

---

## Why This Works

The painful parts of search-as-an-LLM-tool are session state, rate limiting, and result quality. A logged-in Chrome solves all three: cookies and history give you personalized results, the cadence of human typing keeps you under anti-bot thresholds, and a persistent profile means the second search of the day costs nothing. The per-port mutex prevents the foot-gun where two parallel runs share one Chrome and interleave keystrokes character-by-character (yes, this happens — we have the scrambled logs to prove it).

---

## Install

```bash
git clone https://github.com/roger8b/google-search-cli ~/wiki/google-search-cli
cd ~/wiki/google-search-cli
./install.sh --local
```

The script installs `gscli` globally and runs `gscli setup` so you can sign into Google in one step.

**Options:**

```bash
# install only — skip the Chrome login at the end
./install.sh --local --no-setup

# clone fresh from a remote and install
./install.sh

# sync a local checkout into ~/.gscli/ (development iteration)
./install.sh --local /path/to/google-search-cli
```

**Manual install (from source):**

```bash
git clone <repo> ~/.gscli && cd ~/.gscli
npm install && npm run build && npm link
gscli setup
```

**Prerequisites:** Node ≥18 and the [`agent-browser`](https://github.com/roger8b/agent-browser) binary on `PATH`. The installer warns when it's missing.

---

## First-Time Setup

```bash
# 1. Install (Chrome login prompted automatically)
./install.sh --local

# 2. Wire any project — run inside a repo
cd ~/code/my-project
gscli init
#    → creates / appends to CLAUDE.md + AGENTS.md
#    → installs gscli-search and gscli-history skills
#    → idempotent: re-running replaces the section in place

# 3. From anywhere — search
gscli "agent-browser cdp mode"
gscli "what is python" --ai
gscli --merge-history --merge-limit 5
```

---

## Commands

### Project Setup

```bash
gscli init [options]
#   --agent <id>     Force a specific agent (claude-code | codex | gemini)
#   --global         User-wide skills only (~/.claude/skills, ~/.agents/skills,
#                    ~/.gemini/skills); does not create or modify rule files
#   --force          Overwrite existing skill directories

gscli uninstall [options]
#   --agent <id>     Same selectors as init
#   --global         Remove user-wide skills installed with `init --global`
```

**Supported agents:**

| Agent | Rule file | Project skills | User-level skills |
|-------|-----------|----------------|-------------------|
| `claude-code` | `CLAUDE.md` | `.claude/skills/gscli-*` | `~/.claude/skills/gscli-*` |
| `codex` | `AGENTS.md` | `.agents/skills/gscli-*` | `~/.agents/skills/gscli-*` |
| `gemini` | `GEMINI.md` | `.gemini/skills/gscli-*` | `~/.gemini/skills/gscli-*` |

Default project install targets **claude-code + codex** (the two universal ones). Add `--agent gemini` to wire Gemini CLI too. Use `--global` for a user-wide install with no project files touched.

### Chrome Setup

```bash
gscli setup [options]
#   --port <n>            CDP port (default: 9222)
#   --profile-dir <path>  Chrome profile dir (default: ~/.gscli/chrome-profile)
#   --chrome-bin <path>   Chrome binary path
#   --force               Kill any Chrome on the port/profile, then relaunch
#   --reuse               Reuse existing CDP if already up; skip launch
```

Opens a **separate Chrome debug window** with a dedicated profile. Your personal Chrome stays open and untouched. Complete the Google sign-in once and the profile is reused on every future search.

### Search (default command)

```bash
gscli "<query>" [options]
gscli search "<query>" [options]   # explicit form

# Regular SERP
gscli "<query>"
gscli "<query>" --max-links 5 --format ndjson

# Google AI Mode (udm=50)
gscli "<query>" --ai
gscli "<query>" --ai -c -f "follow-up A" -f "follow-up B"

# History-backed cache (no browser)
gscli "<query>" --use-cache --cache-ttl 3600

# Cross-search merge (no browser)
gscli --merge-history --merge-limit 5 --merge-ttl 7200

# Retry on transient failures
gscli "<query>" --retry --max-retries 3
```

Run `gscli --help` for the full flag reference.

### Health & Introspection

```bash
gscli doctor          # validates Chrome, agent-browser, CDP, profile, history, logs
gscli --version
gscli --help
```

---

## Output

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

`--merge-history` adds `sources: [query1, query2, …]` on each link so you can trace where every URL came from.

**Exit codes:** `0` ok · `1` error · `2` blocked (CAPTCHA / unusual traffic) · `3` inconclusive (zero links).

---

## Paths & Environment

| What | Where | Env override |
|------|-------|--------------|
| User data root | `~/.gscli` | `GSCLI_HOME` |
| Chrome profile | `~/.gscli/chrome-profile` | `CHROME_DEBUG_DIR` |
| Search history | `~/.gscli/history/searches.jsonl` | `SEARCH_HISTORY_FILE` |
| Chrome launch logs | `$TMPDIR/gscli/chrome-<port>.log` | `START_LOG_DIR` |
| Per-port lock | `$TMPDIR/google-search-script-<port>.lock` | — |
| CDP port | `9222` | `CDP_PORT` |
| Chrome binary | `/Applications/Google Chrome.app/…` | `CHROME_BIN` |
| agent-browser bin | `agent-browser` (PATH) | `AGENT_BROWSER_BIN` |

All env vars resolve at process start. Pass equivalent flags to override on a single run.

---

## Common Workflow

1. **Install** — `./install.sh --local` (one time per machine; signs into Google at the end).
2. **Wire a project** — `cd ~/code/my-project && gscli init` (one time per project, or once globally with `--global`).
3. **Agent runs searches** — the agent invokes `gscli "<query>"`, parses the JSON, and feeds URLs into whatever follow-up step it needs.
4. **Cache hits and merges** are free — `--use-cache` for repeats, `--merge-history` for cross-query unions.
5. **When something feels off** — `gscli doctor` validates Chrome, agent-browser, CDP, paths.
6. **Read the raw history** — `~/.gscli/history/searches.jsonl` is plain JSONL, safe to `grep` / `jq`.

---

## Use Cases

### LLM Agent Tools
Replace `WebSearch` / `WebFetch` with `gscli` so the agent gets logged-in, AI-Mode-aware results plus a persistent JSONL trail of every query it ran.

### Continuous Research
Searching the same topic across days. Every result lands in `searches.jsonl`. `gscli --merge-history --merge-limit 20 --merge-ttl 604800` produces a deduped union of links from the last week, with source attribution per URL.

### Headless Data Pipelines
Pipe `gscli "<query>" --format ndjson` into a downstream extractor; chain with `jq` and a fetcher; emit structured datasets without a manual browser.

### Reproducible Citations
Every search is timestamped, status-tagged, and persisted. Going back to "what did Google say about X last Tuesday" is a `jq` away.

### Multi-Turn AI Mode
Use `--ai -c -f "…" -f "…"` for chained AI Mode queries. Because Google's `udm=50` has no inline follow-up box, each turn restates context in the follow-up text — `gscli` handles the URL shaping for you.

---

## Tips & Tricks

- **History is JSONL** — `tail -n 20 ~/.gscli/history/searches.jsonl | jq -r .query` shows recent queries. `jq -c 'select(.mode == "ai-mode")'` filters to AI Mode runs.
- **Headless? No.** This runs a visible Chrome by design — anti-bot heuristics treat headless mode differently. The window can be backgrounded but not killed during a search.
- **Two parallel runs on the same Chrome will interleave keystrokes** if you bypass the lock (`--no-lock`). Don't, unless you serialize externally.
- **AI Mode follow-ups need context** — `udm=50` does not render an inline input, so each `-f` becomes a fresh `?q=…&udm=50` URL. Always restate the topic.
- **`--use-cache` is silent on miss** — it falls through to a live search. Combine with `--no-history` if you want a one-off query that doesn't pollute the JSONL.
- **CAPTCHA?** Status will be `blocked` (exit 2). Open the debug Chrome window, solve it manually, re-run. Don't auto-retry on `2`.

---

## Mental Model

- **One install per machine.** Code in `~/.gscli/`, profile in `~/.gscli/chrome-profile/`, history in `~/.gscli/history/`. Re-running `install.sh` never wipes your data.
- **One Chrome debug window per CDP port.** The default port (`9222`) is fine for almost everyone; pass `--port` if you need parallel sessions with distinct profiles.
- **The per-port mutex is the safety net.** Without it, parallel runs garble each other's keystrokes. The lock auto-releases on exit / SIGINT / SIGTERM, and reaps stale holders after 10 min or when the PID dies.
- **History is append-only.** `--use-cache` and `--merge-history` depend on this — never edit the file by hand.
- **All commands work from any directory.** Defaults are derived from `GSCLI_HOME`, not the CWD.

Everything is plain TypeScript + Markdown + JSONL in a git repo. No databases, no daemons, no proxies.

---

## Dev

```bash
npm install
npm run dev -- "test query"   # tsx, no build
npm run build                 # tsc → dist/
npm test                      # vitest
```

CI runs `build` + `test` on Node 20 and 22 for every push and PR.

## License

MIT.
