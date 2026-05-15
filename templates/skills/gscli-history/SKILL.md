---
name: gscli-history
description: Use this skill when the user wants to review past searches, merge results across multiple queries, or work with `gscli`'s persistent search history. Trigger phrases include "what did we search", "merge results", "all links about X", "history of my searches".
---

# gscli-history

`gscli` appends every successful search to `~/.gscli/history/searches.jsonl` (one entry per line). The history is the source of truth for both cache hits and cross-search merges.

## When to use

- User asks what they searched recently.
- User wants the union of links from multiple recent searches, deduped.
- User asks for citations / link lists from prior research without re-running the browser.

## Merge multiple recent searches

```bash
gscli --merge-history --merge-limit 5 --merge-ttl 7200
```

Returns deduped union of links from the last N searches within the TTL window. Each merged link carries `sources: [query1, query2, ...]` showing which searches produced it.

## Cache: reuse a single previous query

```bash
gscli "exact same query" --use-cache --cache-ttl 3600
```

If a matching entry exists within `--cache-ttl` seconds, returns it without opening Chrome.

## Read history directly

The history is plain JSONL — safe to grep:

```bash
tail -n 20 ~/.gscli/history/searches.jsonl | jq -r .query
grep -i "python" ~/.gscli/history/searches.jsonl | jq '.links[].url'
```

## Hard rules

- **Never edit `searches.jsonl` by hand.** It's append-only; reordering or rewriting entries breaks cache/merge.
- **Disable history with `--no-history` only for one-off / sensitive queries.** Otherwise leave it on — it makes follow-ups cheap.
