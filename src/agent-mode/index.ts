// src/agent-mode/index.ts
// AI Mode search - Uses Google AI Mode instead of regular search.

import { Config } from '../config/index.js';
import { runAgentBrowser } from '../browser/agent.js';
import { humanType } from '../human/index.js';
import { waitForLoad } from '../search/snapshot.js';

function log(message: string): void {
  process.stderr.write(`[google-search:ai-mode] ${message}\n`);
}

const AI_MODE_BUTTON_TEXT = 'Modo IA';

export async function activateAiMode(
  agentBrowserBin: string,
  port: number
): Promise<void> {
  log(`Activating AI Mode by finding "${AI_MODE_BUTTON_TEXT}"`);
  const result = runAgentBrowser(agentBrowserBin, [
    '--cdp', String(port),
    'find', 'text', AI_MODE_BUTTON_TEXT, 'click'
  ], port);
  log(`AI Mode button click result: ${result || 'success'}`);
  sleep(5);
}

export async function performAiSearch(config: Config): Promise<void> {
  log(`Performing AI Mode search for: ${config.searchQuery}`);

  const snapshot = runAgentBrowser(config.agentBrowserBin, [
    '--cdp', String(config.port),
    'snapshot'
  ], config.port);

  const searchBoxMatch = snapshot.match(/combobox "Pesquisar" \[ref=([a-z0-9]+)\]/i);
  const searchBoxRef = searchBoxMatch ? searchBoxMatch[1] : 'e12';
  log(`Found search box ref: ${searchBoxRef}`);

  log(`Typing query: ${config.searchQuery}`);
  await humanType(
    config.agentBrowserBin,
    config.port,
    config.searchQuery,
    searchBoxRef,
    config
  );

  sleep(1);
  await activateAiMode(config.agentBrowserBin, config.port);

  log('Submitting AI Mode query with Enter');
  runAgentBrowser(config.agentBrowserBin, [
    '--cdp', String(config.port),
    'press', 'Enter'
  ], config.port);

  log('Waiting for AI response...');
  waitForLoad(config.agentBrowserBin, config.port);
  sleep(8);
}

/**
 * Submits a follow-up question by navigating to a new AI Mode URL.
 *
 * Reason: AI Mode SERP variant (udm=50) in pt-BR for this account does not
 * render an inline follow-up textbox. The placeholder div
 * `#aim-server-input-plate-placeholder` exists but its bootstrap script
 * never inflates the textarea. Verified via DOM inspection — only textarea
 * present is feedback "Dê alguns detalhes…", not visible.
 *
 * Workaround: each follow-up navigates to a fresh `?q=<text>&udm=50` URL.
 * Google session cookie carries history (visible in "Histórico do Modo IA"),
 * so context may persist server-side, but this is independent-query semantics.
 */
export async function performFollowUp(config: Config, query: string): Promise<void> {
  log(`Follow-up via URL navigation: ${query}`);
  const url = `${stripQuery(config.googleUrl)}/search?q=${encodeURIComponent(query)}&hl=pt-BR&udm=50`;
  runAgentBrowser(config.agentBrowserBin, [
    '--cdp', String(config.port),
    'open', url
  ], config.port, { allowFailure: true });

  log('Waiting for follow-up response...');
  waitForLoad(config.agentBrowserBin, config.port);
  sleep(8);
}

function stripQuery(googleUrl: string): string {
  try {
    const u = new URL(googleUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://www.google.com';
  }
}

/**
 * Extracts AI Mode response text.
 *
 * Strategy: locate the answer container that holds the heading matching the
 * user query, then return its full innerText. Fallbacks: known AI Mode
 * container classes, then `[role=main]`, then trimmed body text.
 */
export function getAiResponse(agentBrowserBin: string, port: number, query: string): string {
  log('Extracting AI response content...');

  const escapedQuery = query.replace(/[\\'"]/g, '\\$&');
  const content = runAgentBrowser(agentBrowserBin, [
    '--cdp', String(port),
    'eval',
    `
    (() => {
      const QUERY = '${escapedQuery}'.toLowerCase().trim();

      const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role=heading]'));
      for (const h of headings) {
        const text = (h.innerText || '').toLowerCase().trim();
        if (text && QUERY && (text === QUERY || text.includes(QUERY))) {
          let p = h;
          for (let i = 0; i < 8; i++) {
            p = p.parentElement;
            if (!p) break;
            const len = (p.innerText || '').length;
            if (len > 400 && len < 12000) {
              return (p.innerText || '').trim();
            }
          }
        }
      }

      const containerSelectors = [
        '[data-aitium]',
        '.WzWwpc.vve6Ce',
        '.tonYlb',
        '.CKgc1d',
        '[jsname="y3z0Ef"]',
        'g-section-with-header',
        '[role=main]',
      ];
      for (const sel of containerSelectors) {
        const el = document.querySelector(sel);
        const t = el && (el.innerText || '').trim();
        if (t && t.length > 200) return t;
      }

      const body = document.body.innerText || '';
      return body.substring(0, 6000).trim();
    })()
    `
  ], port);

  return stripJsonQuotes(content).trim();
}

function stripJsonQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      return t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }
  return t;
}

function sleep(seconds: number): void {
  const ms = seconds * 1000;
  process.stdout.write(`[sleep] ${seconds}s\n`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait
  }
}
