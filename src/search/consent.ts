// src/search/consent.ts
// Google frequently interposes a consent / cookie wall (consent.google.com or
// an in-page banner) on a fresh profile or new region. It blocks the search
// box entirely. We detect it and click the locale-appropriate "accept" button
// so the search flow can continue instead of returning "inconclusive".

import { runMaybe, runAgentBrowser } from '../browser/agent.js';
import { sleep } from '../human/utils.js';
import { getLabels } from '../utils/i18n.js';
import { Config } from '../config/index.js';

function log(message: string): void {
  process.stderr.write(`[gscli:consent] ${message}\n`);
}

const CONSENT_PATTERNS =
  /consent\.google|before you continue to google|antes de (ir|continuar) para o google|antes de continuar a usar o google|continuar para o google|aceitar tudo|accept all|tout accepter|aceptar todo/i;

export function getCurrentUrl(bin: string, port: number): string {
  const out = runMaybe(bin, ['--cdp', String(port), 'eval', 'window.location.href'], port);
  return out.trim().replace(/^"|"$/g, '');
}

/**
 * Detects and dismisses a consent screen if present. Returns true if a consent
 * screen was handled (caller should re-settle the page).
 */
export async function handleConsentIfPresent(config: Config): Promise<boolean> {
  const bin = config.agentBrowserBin;
  const port = config.port;

  const url = getCurrentUrl(bin, port);
  const snapshot = runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);

  const onConsentUrl = /consent\.google/i.test(url);
  const bannerVisible = CONSENT_PATTERNS.test(snapshot);
  if (!onConsentUrl && !bannerVisible) return false;

  log(`consent screen detected (url=${onConsentUrl ? 'consent.google' : 'in-page banner'})`);
  const labels = getLabels(config.googleUrl);

  for (const accept of labels.consentAccept) {
    log(`trying accept button: "${accept}"`);
    runAgentBrowser(bin, ['--cdp', String(port), 'find', 'text', accept, 'click'], port, {
      allowFailure: true,
    });
    await sleep(1500);

    // Verify clearance for BOTH cases:
    //  - consent.google redirect → URL must leave consent.google
    //  - in-page banner → URL often stays on google.com, so re-check the
    //    snapshot for the banner text instead of trusting the URL.
    const afterUrl = getCurrentUrl(bin, port);
    const afterSnap = runMaybe(bin, ['--cdp', String(port), 'snapshot', '-i'], port);
    const stillOnConsentUrl = /consent\.google/i.test(afterUrl);
    const bannerStillVisible = CONSENT_PATTERNS.test(afterSnap);

    if (!stillOnConsentUrl && !bannerStillVisible) {
      log('consent cleared');
      return true;
    }
  }

  log('consent button not found / not cleared — continuing best-effort');
  return true;
}
