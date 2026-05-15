// tests/history.test.ts
// lookupHistory + mergeRecentHistory + appendHistory.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_CONFIG, type Config } from '../src/config/index.js';
import { appendHistory, lookupHistory, mergeRecentHistory, type HistoryEntry } from '../src/history/index.js';

let tmpDir: string;
let cfg: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gscli-hist-'));
  cfg = { ...DEFAULT_CONFIG, historyFile: path.join(tmpDir, 'searches.jsonl'), noHistory: false };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeEntry(file: string, e: HistoryEntry): void {
  fs.appendFileSync(file, JSON.stringify(e) + '\n');
}

const sampleEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ts: new Date().toISOString(),
  query: 'foo',
  status: 'ok',
  title: 'Foo - Google Search',
  mode: 'serp',
  cdpPort: 9222,
  links: [{ position: 1, title: 'A', url: 'https://a.example', snippet: 's' }],
  ...overrides,
});

describe('appendHistory', () => {
  it('writes one JSONL line per call', () => {
    appendHistory(cfg, { status: 'ok', query: 'q1', title: 't1', cdpPort: 9222, links: [{ position: 1, title: 'a', url: 'u', snippet: 's' }] } as any);
    appendHistory(cfg, { status: 'ok', query: 'q2', title: 't2', cdpPort: 9222, links: [] } as any);
    const lines = fs.readFileSync(cfg.historyFile, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).query).toBe('q1');
    expect(JSON.parse(lines[1]).query).toBe('q2');
  });

  it('respects noHistory=true', () => {
    appendHistory({ ...cfg, noHistory: true }, { status: 'ok', query: 'x', title: '', cdpPort: 0, links: [] } as any);
    expect(fs.existsSync(cfg.historyFile)).toBe(false);
  });
});

describe('lookupHistory', () => {
  it('returns null when file missing', () => {
    expect(lookupHistory(cfg, 'anything', 3600)).toBeNull();
  });

  it('returns the most recent successful entry within TTL', () => {
    writeEntry(cfg.historyFile, sampleEntry({ query: 'q', ts: new Date(Date.now() - 5_000).toISOString(), title: 'old' }));
    writeEntry(cfg.historyFile, sampleEntry({ query: 'q', ts: new Date(Date.now() - 1_000).toISOString(), title: 'new' }));
    const hit = lookupHistory(cfg, 'q', 3600);
    expect(hit?.title).toBe('new');
  });

  it('skips expired entries (outside TTL)', () => {
    writeEntry(cfg.historyFile, sampleEntry({ query: 'q', ts: new Date(Date.now() - 7200 * 1000).toISOString() }));
    expect(lookupHistory(cfg, 'q', 3600)).toBeNull();
  });

  it('skips non-ok entries', () => {
    writeEntry(cfg.historyFile, sampleEntry({ query: 'q', status: 'blocked' }));
    expect(lookupHistory(cfg, 'q', 3600)).toBeNull();
  });
});

describe('mergeRecentHistory', () => {
  it('returns empty when no history file', () => {
    const { entries, merged } = mergeRecentHistory(cfg);
    expect(entries).toHaveLength(0);
    expect(merged).toHaveLength(0);
  });

  it('dedupes URLs across queries and tracks sources', () => {
    writeEntry(cfg.historyFile, sampleEntry({
      query: 'q1',
      ts: new Date(Date.now() - 2000).toISOString(),
      links: [
        { position: 1, title: 'A', url: 'https://a.example', snippet: 'sa' },
        { position: 2, title: 'B', url: 'https://b.example' },
      ],
    }));
    writeEntry(cfg.historyFile, sampleEntry({
      query: 'q2',
      ts: new Date(Date.now() - 1000).toISOString(),
      links: [
        { position: 1, title: 'A', url: 'https://a.example' },
        { position: 2, title: 'C', url: 'https://c.example' },
      ],
    }));

    const { entries, merged } = mergeRecentHistory(cfg, { limit: 10, ttlSeconds: 3600 });
    expect(entries).toHaveLength(2);
    expect(merged).toHaveLength(3);
    const a = merged.find((m) => m.url === 'https://a.example')!;
    expect(a.sources.sort()).toEqual(['q1', 'q2']);
    expect(a.snippet).toBe('sa'); // preserved from first occurrence
  });

  it('honors limit (most recent N)', () => {
    for (let i = 0; i < 5; i += 1) {
      writeEntry(cfg.historyFile, sampleEntry({
        query: `q${i}`,
        ts: new Date(Date.now() - (5 - i) * 1000).toISOString(),
        links: [{ position: 1, title: `T${i}`, url: `https://x${i}.example` }],
      }));
    }
    const { entries } = mergeRecentHistory(cfg, { limit: 2, ttlSeconds: 3600 });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.query).sort()).toEqual(['q3', 'q4']);
  });
});
