// src/agent-mode/index.ts
// AI Mode search — Google AI Mode (udm=50) instead of the regular SERP.

import { Config } from '../config/index.js';
import { runAgentBrowser, runMaybe } from '../browser/agent.js';
import { humanType, humanClick } from '../human/index.js';
import { sleep } from '../human/utils.js';
import { waitForLoad, findSearchBoxInSnapshot, clearSearchBox } from '../search/snapshot.js';
import { getCurrentUrl } from '../search/consent.js';
import { getLabels } from '../utils/i18n.js';

function log(message: string): void {
  process.stderr.write(`[gscli:ai-mode] ${message}\n`);
}

function isOnAiMode(bin: string, port: number): boolean {
  try {
    return /[?&]udm=50\b/.test(getCurrentUrl(bin, port));
  } catch {
    return false;
  }
}

export async function activateAiMode(config: Config): Promise<void> {
  const labels = getLabels(config.googleUrl);
  log(`activating AI Mode via button "${labels.aiModeButton}"`);
  const result = runAgentBrowser(
    config.agentBrowserBin,
    ['--cdp', String(config.port), 'find', 'text', labels.aiModeButton, 'click'],
    config.port,
    { allowFailure: true },
  );
  log(`AI Mode button click: ${result || 'ok'}`);
  await sleep(5000);
}

/**
 * Tries the warm path: if we are already on an AI Mode page, click the
 * "new conversation" affordance instead of re-navigating from google.com.
 * Returns true if the warm path was taken.
 */
async function tryNewThread(config: Config): Promise<boolean> {
  if (!isOnAiMode(config.agentBrowserBin, config.port)) return false;
  const labels = getLabels(config.googleUrl);
  log('already on AI Mode — attempting warm-path "new conversation"');
  for (const btn of labels.newThreadButton) {
    runAgentBrowser(
      config.agentBrowserBin,
      ['--cdp', String(config.port), 'find', 'text', btn, 'click'],
      config.port,
      { allowFailure: true },
    );
  }
  await sleep(1500);
  return true;
}

export async function performAiSearch(config: Config): Promise<void> {
  log(`performing AI Mode search for: ${config.searchQuery}`);

  // Warm path: skip the google.com → type → click-AI-button dance entirely
  // when an AI Mode page is already open in this session.
  const warm = await tryNewThread(config);

  const snapshot = runMaybe(
    config.agentBrowserBin,
    ['--cdp', String(config.port), 'snapshot', '-i'],
    config.port,
  );
  const labels = getLabels(config.googleUrl);
  const searchBoxRef = findSearchBoxInSnapshot(snapshot, labels.searchbox);
  if (!searchBoxRef) {
    throw new Error(
      `Could not detect AI Mode search box (locale labels: ${labels.searchbox.join(', ')}). ` +
        `The page may be on a consent screen or a different language than the configured googleUrl.`,
    );
  }
  log(`search box ref: ${searchBoxRef}`);

  log(`typing query: ${config.searchQuery}`);
  await humanType(config.agentBrowserBin, config.port, config.searchQuery, searchBoxRef, config);

  await sleep(1000);
  if (!warm) {
    await activateAiMode(config);
  }

  log('submitting AI Mode query with Enter');
  runAgentBrowser(config.agentBrowserBin, ['--cdp', String(config.port), 'press', 'Enter'], config.port);

  log('waiting for AI response…');
  waitForLoad(config.agentBrowserBin, config.port);
}

/**
 * Scans the accessibility snapshot for the inline AI Mode follow-up input
 * (a textbox/combobox whose accessible name matches a locale follow-up
 * placeholder). Returns its ref or null.
 */
export function findFollowUpInputRef(snapshot: string, hints: string[]): string | null {
  const lines = snapshot.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/(?:textbox|combobox|searchbox|textarea)\s+"([^"]+)"\s*\[ref=(e\d+)\]/i);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (hints.some((h) => name.includes(h.toLowerCase()))) {
      return m[2];
    }
  }
  return null;
}

/**
 * Follow-up question.
 *
 * Preferred (chat-like): type into the inline AI Mode follow-up input so the
 * thread stays on screen and prior turns remain visible — same behavior the
 * user expects from a chat UI.
 *
 * Fallback: if no inline input can be located (some locales/accounts do not
 * render it), navigate to a fresh `?q=…&udm=50` URL. The Google session cookie
 * still carries history server-side, but the visible thread is reset.
 */
export async function performFollowUp(config: Config, query: string): Promise<void> {
  const bin = config.agentBrowserBin;
  const port = config.port;
  const labels = getLabels(config.googleUrl);

  const snapshot = runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);
  const inlineRef = findFollowUpInputRef(snapshot, labels.followUpInput);

  if (inlineRef) {
    log(`inline follow-up via input ${inlineRef} (thread preserved)`);
    await humanClick(bin, port, inlineRef);
    clearSearchBox(bin, port, inlineRef);

    // Re-resolve in case the DOM shifted after focusing.
    let typingRef = inlineRef;
    try {
      const fresh = runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);
      typingRef = findFollowUpInputRef(fresh, labels.followUpInput) ?? inlineRef;
    } catch {
      /* keep inlineRef */
    }

    await humanType(bin, port, query, typingRef, config);
    runAgentBrowser(bin, ['--cdp', String(port), 'press', 'Enter'], port);
    log('waiting for follow-up response…');
    waitForLoad(bin, port);
    return;
  }

  log('inline follow-up input not found — falling back to URL navigation (thread resets)');
  const locale = localeParam(config.googleUrl);
  const url = `${stripQuery(config.googleUrl)}/search?q=${encodeURIComponent(query)}${locale}&udm=50`;
  runAgentBrowser(bin, ['--cdp', String(port), 'open', url], port, { allowFailure: true });
  log('waiting for follow-up response…');
  waitForLoad(bin, port);
}

function localeParam(googleUrl: string): string {
  try {
    const hl = new URL(googleUrl).searchParams.get('hl');
    return hl ? `&hl=${encodeURIComponent(hl)}` : '';
  } catch {
    return '';
  }
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
 * Polls the AI response until its length stabilizes (streaming finished) or a
 * timeout elapses. Replaces the previous blind fixed sleep.
 */
export async function waitForAiResponseStable(
  config: Config,
  query: string,
  opts: { maxMs?: number; gapMs?: number; stableNeeded?: number } = {},
): Promise<string> {
  const maxMs = opts.maxMs ?? 20000;
  const gapMs = opts.gapMs ?? 600;
  const stableNeeded = opts.stableNeeded ?? 4;

  const start = Date.now();
  let lastLen = -1;
  let stable = 0;
  let last = '';

  while (Date.now() - start < maxMs) {
    const text = getAiResponse(config.agentBrowserBin, config.port, query);
    last = text;
    if (text.length > 100 && text.length === lastLen) {
      stable += 1;
      if (stable >= stableNeeded) {
        log(`AI response stable after ${Math.round((Date.now() - start) / 1000)}s (${text.length} chars)`);
        return text;
      }
    } else {
      stable = 0;
      lastLen = text.length;
    }
    await sleep(gapMs);
  }
  log(`AI response poll timed out (${last.length} chars) — returning best effort`);
  return last;
}

/**
 * Extracts AI Mode response text. Strategy: locate the answer container whose
 * heading matches the query, else known AI Mode containers, else [role=main],
 * else trimmed body text.
 */
export function getAiResponse(agentBrowserBin: string, port: number, query: string): string {
  const escapedQuery = query.replace(/[\\'"]/g, '\\$&');
  const content = runAgentBrowser(
    agentBrowserBin,
    [
      '--cdp',
      String(port),
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

      // Multi-turn: the newest answer is the LAST completed block in the
      // thread. Prefer the last substantial [data-complete="true"] element so
      // a follow-up returns its own answer, not the whole concatenated thread.
      const completeEls = Array.from(document.querySelectorAll('[data-complete="true"]'))
        .filter((el) => {
          const t = (el.innerText || '').trim();
          if (!t || t.length < 200) return false;
          if (/data:image|_setImageSrc|window\\.jsl|jsaction=/.test(t)) return false;
          return true;
        });
      if (completeEls.length > 0) {
        const last = completeEls[completeEls.length - 1];
        const t = (last.innerText || '').trim();
        if (t.length > 200) return t;
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
    `,
    ],
    port,
  );

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
