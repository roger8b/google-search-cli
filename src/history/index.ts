// src/history/index.ts
// Persistent search history (JSONL append-only) + query lookup.

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Config } from '../config/index.js';
import { SearchResultPayload } from '../emitter/index.js';

export interface HistoryEntry {
  ts: string;
  query: string;
  status: string;
  title: string;
  mode: 'serp' | 'ai-mode';
  links: Array<{ position: number; title: string; url: string; snippet?: string }>;
  cdpPort: number;
}

function log(message: string): void {
  process.stderr.write(`[google-search] ${message}\n`);
}

export function appendHistory(config: Config, payload: SearchResultPayload, mode: 'serp' | 'ai-mode' = 'serp'): void {
  if (config.noHistory) return;
  const path = config.historyFile;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const entry: HistoryEntry = {
      ts: new Date().toISOString(),
      query: payload.query,
      status: payload.status,
      title: payload.title,
      mode,
      links: payload.links,
      cdpPort: payload.cdpPort,
    };
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`history append failed: ${msg}`);
  }
}

export interface MergedLink {
  title: string;
  url: string;
  snippet?: string;
  sources: string[]; // queries that surfaced this URL
}

/**
 * Merge recent successful searches: returns deduped links across N most recent entries.
 * If `queries` provided, filter to those queries only; else use last `limit` entries.
 */
export function mergeRecentHistory(
  config: Config,
  options: { limit?: number; ttlSeconds?: number; queries?: string[] } = {}
): { entries: HistoryEntry[]; merged: MergedLink[] } {
  const { limit = 10, ttlSeconds = 86400, queries } = options;
  const path = config.historyFile;
  if (!existsSync(path)) return { entries: [], merged: [] };

  const cutoff = Date.now() - ttlSeconds * 1000;
  const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim());
  const entries: HistoryEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i -= 1) {
    try {
      const e = JSON.parse(lines[i]) as HistoryEntry;
      if (e.status !== 'ok') continue;
      const ts = Date.parse(e.ts);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      if (queries && !queries.includes(e.query)) continue;
      entries.push(e);
    } catch {
      // skip
    }
  }

  const byUrl = new Map<string, MergedLink>();
  for (const entry of entries.reverse()) {
    for (const link of entry.links) {
      const existing = byUrl.get(link.url);
      if (existing) {
        if (!existing.sources.includes(entry.query)) existing.sources.push(entry.query);
        if (!existing.snippet && link.snippet) existing.snippet = link.snippet;
      } else {
        byUrl.set(link.url, {
          title: link.title,
          url: link.url,
          snippet: link.snippet,
          sources: [entry.query],
        });
      }
    }
  }

  return { entries, merged: Array.from(byUrl.values()) };
}

/**
 * Lookup most recent successful entry for a query within ttlSeconds.
 * Returns null if not found or expired.
 */
export function lookupHistory(config: Config, query: string, ttlSeconds: number): HistoryEntry | null {
  const path = config.historyFile;
  if (!existsSync(path)) return null;
  try {
    const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim());
    const cutoff = Date.now() - ttlSeconds * 1000;
    // last-write-wins: scan from end
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const entry = JSON.parse(lines[i]) as HistoryEntry;
        if (entry.query !== query) continue;
        if (entry.status !== 'ok') continue;
        const ts = Date.parse(entry.ts);
        if (Number.isNaN(ts) || ts < cutoff) continue;
        return entry;
      } catch {
        // skip malformed line
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`history lookup failed: ${msg}`);
  }
  return null;
}
