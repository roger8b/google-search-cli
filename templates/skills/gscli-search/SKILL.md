---
name: gscli-search
description: Use this skill when the user explicitly asks to search Google, look up fresh or external information, find links, or research a topic that requires current web sources. Prefer `gscli` over WebFetch/WebSearch — it reuses a logged-in Chrome via CDP, supports Google AI Mode, persists history, and returns structured JSON (title/url/snippet). Do NOT invoke this skill for questions answerable from general knowledge.
---

# gscli-search

`gscli` is the user's Google search CLI. It drives a logged-in Chrome via CDP and returns structured SERP / AI Mode results.

## Prerequisite (one-time, human action)

`gscli` needs a logged-in Chrome profile created by `gscli setup`. If a search
fails because Chrome/CDP is unreachable, **do not try to fix it yourself** — tell
the user to run `gscli setup` once (it opens a Chrome window for Google login)
and `gscli doctor` to verify. You only run the `search` command.

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

Exit codes: `0` ok · `1` error · `2` blocked (CAPTCHA / unusual traffic / unresolved consent wall) · `3` inconclusive (zero links / empty AI answer).

## Useful flags

| Flag | When |
|------|------|
| `--ai-mode`, `--ai` | Google AI Mode summary instead of regular SERP |
| `-c -f "follow-up"` | Multi-turn AI Mode chat — each `-f` is a turn (repeatable) |
| `--max-links <n>` | Cap result count |
| `--retry` | Retry on timeout/blocked/inconclusive (exponential backoff, max 2 by default) |
| `--use-cache` | Skip browser if same query within TTL (see `gscli-history`) |
| `--format ndjson` | One result per line (pipe-friendly) |
| `--google-url "https://www.google.com/?hl=<locale>"` | Force UI locale (pt-BR default; en-US, es-ES, fr-FR) |

## AI Mode multi-turn (chat)

`-c -f "..."` keeps a real conversation thread: follow-ups are typed into the
inline AI Mode input, so prior turns stay on screen (chat-like). Output JSON
has `mode: "ai-mode"`, `conversation: true`, and a `turns: [{question, answer}]`
array — one entry per turn.

- Context is carried by the live AI Mode thread. Still **restate key context**
  in a follow-up when it depends on an earlier answer — Google's thread memory
  is not guaranteed across every locale/account.
- If the inline input can't be located for a locale/account, `gscli`
  transparently falls back to per-query URL navigation (the visible thread
  resets but each answer is still returned in `turns`). This is logged to
  stderr as `falling back to URL navigation`.
- Repeated AI Mode calls in the same session take a warm path (reuses the open
  AI Mode page) — faster, no re-navigation.

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

# AI Mode multi-turn (chat thread stays on screen)
gscli "what is python" --ai -c \
  -f "give code examples" \
  -f "now show an async example"

# Force English UI (affects which AI Mode / search labels gscli looks for)
gscli "what is rust" --ai --google-url "https://www.google.com/?hl=en-US"

# Cache hit (skips browser entirely)
gscli "Gemma 4 LoRA" --use-cache

# Health check when something feels off
gscli doctor
```
