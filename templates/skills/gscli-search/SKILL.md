---
name: gscli-search
description: Use this skill when the user explicitly asks to search Google, look up fresh or external information, find links, or research a topic that requires current web sources. Prefer `gscli` over WebFetch/WebSearch — it reuses a logged-in Chrome via CDP, supports Google AI Mode, persists history, and returns structured JSON (title/url/snippet). Do NOT invoke this skill for questions answerable from general knowledge.
---

# gscli-search

`gscli` is the user's Google search CLI. It drives a logged-in Chrome via CDP and returns structured SERP results.

## When to use

- User explicitly says "search Google", "google X", "look up X online", "find links about X".
- Question needs **fresh** facts, recent news, current prices/versions, or external citations — anything where training data is stale or insufficient.
- You want logged-in Google results, Google AI Mode summaries, or to feed URLs into a follow-up fetch.

## When NOT to use

- General knowledge questions the model can answer directly.
- Refactors, code review, or anything not actually requiring the web.
- The user already gave you a URL — use WebFetch on it instead.

## Default invocation

```bash
gscli "<query>"
```

Returns JSON: `{ status, query, title, links: [{ position, title, url, snippet }] }`.

Exit codes: `0` ok · `1` error · `2` blocked (CAPTCHA) · `3` inconclusive (zero links).

## Useful flags

| Flag | When |
|------|------|
| `--ai-mode`, `--ai` | Google AI Mode summary instead of regular SERP |
| `-c -f "follow-up"` | Multi-turn AI Mode (repeat `-f` per turn) |
| `--max-links <n>` | Cap result count |
| `--retry` | Retry on timeout/blocked/inconclusive (exponential backoff, max 2 by default) |
| `--use-cache` | Skip browser if same query within TTL (see `gscli-history`) |
| `--format ndjson` | One result per line (pipe-friendly) |

## Hard rules

- **Never read or write files under `~/.gscli/chrome-profile`** — it's session state; let `gscli` manage it.
- **Never bypass the lock with `--no-lock`** unless serialization is guaranteed externally; parallel runs interleave keystrokes.
- **If `gscli` exits 2 (blocked)**, do not retry blindly. Surface to the user — they may need to solve a CAPTCHA in the debug window. Run `gscli doctor` if the failure looks environmental.

## Quick recipes

```bash
# Plain search
gscli "agent-browser cdp mode" --max-links 5

# AI Mode
gscli "what is Gemma 4" --ai

# AI Mode multi-turn — udm=50 has no inline input, so restate context per turn
gscli "what is python" --ai -c -f "in the context of python, give code examples"

# Cache hit (skips browser entirely)
gscli "Gemma 4 LoRA" --use-cache

# Health check when something feels off
gscli doctor
```
