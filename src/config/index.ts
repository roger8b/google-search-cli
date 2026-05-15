// src/config/index.ts
// Main configuration for Google Search Script.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export interface Config {
  port: number;
  googleUrl: string;
  searchQuery: string;
  profileDir: string;
  chromeBin: string;
  agentBrowserBin: string;
  startLogDir: string;
  typeDelayScale: number;
  maxLinks: number;
  format: 'json' | 'ndjson';
  aiMode: boolean;
  conversation: boolean;
  followUps: string[];
  retry: boolean;
  maxRetries: number;
  historyFile: string;
  noHistory: boolean;
  cacheTtlSeconds: number;
  useCache: boolean;
  mergeHistory: boolean;
  mergeLimit: number;
  mergeTtlSeconds: number;
  noLock: boolean;
  lockWaitSeconds: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_ROOT = resolve(__dirname, '..', '..');

// Defaults from environment or constants
const PORT = Number(process.env.CDP_PORT || 9222);
const GOOGLE_URL = process.env.GOOGLE_URL || 'https://www.google.com/?hl=pt-BR';
const SEARCH_QUERY = process.env.SEARCH_QUERY || 'agent-browser cdp mode';
const PROFILE_DIR = process.env.CHROME_DEBUG_DIR || `${process.env.HOME || ''}/.hermes/chrome-debug-google-search`;
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AGENT_BROWSER_BIN = process.env.AGENT_BROWSER_BIN || 'agent-browser';
const START_LOG_DIR = process.env.START_LOG_DIR || '/tmp/google-search-script';
// Typing speed: lower = faster, higher = slower
const TYPE_DELAY_SCALE = Math.max(0.35, Number(process.env.TYPE_DELAY_SCALE || 0.82));
const AI_MODE = process.env.AI_MODE === 'true';

export const DEFAULT_CONFIG: Config = {
  port: PORT,
  googleUrl: GOOGLE_URL,
  searchQuery: SEARCH_QUERY,
  profileDir: PROFILE_DIR,
  chromeBin: CHROME_BIN,
  agentBrowserBin: AGENT_BROWSER_BIN,
  startLogDir: START_LOG_DIR,
  typeDelayScale: TYPE_DELAY_SCALE,
  maxLinks: 10,
  format: 'json',
  aiMode: AI_MODE,
  conversation: false,
  followUps: [],
  retry: process.env.SEARCH_RETRY === 'true',
  maxRetries: Number(process.env.SEARCH_MAX_RETRIES || 2),
  historyFile: process.env.SEARCH_HISTORY_FILE || resolve(SCRIPT_ROOT, 'history', 'searches.jsonl'),
  noHistory: process.env.SEARCH_NO_HISTORY === 'true',
  cacheTtlSeconds: Number(process.env.SEARCH_CACHE_TTL || 3600), // 1h
  useCache: process.env.SEARCH_USE_CACHE === 'true',
  mergeHistory: false,
  mergeLimit: 10,
  mergeTtlSeconds: 86400,
  noLock: process.env.SEARCH_NO_LOCK === 'true',
  lockWaitSeconds: Number(process.env.SEARCH_LOCK_WAIT || 120),
};

export { PORT, GOOGLE_URL, SEARCH_QUERY, CHROME_BIN, AGENT_BROWSER_BIN, START_LOG_DIR, TYPE_DELAY_SCALE, AI_MODE };