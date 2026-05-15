// src/search/index.ts
// Search orchestration - coordinates all search operations.

import { Config } from '../config/index.js';
import { runAgentBrowser } from '../browser/agent.js';
import { startChromeIfNeeded } from '../browser/chrome.js';
import { humanClick, humanType } from '../human/index.js';
import { extractSearchLinks, detectBlocking } from '../parser/index.js';
import { emitSearchResult, createPayload } from '../emitter/index.js';
import { appendHistory } from '../history/index.js';
import { getSearchBoxRef, takeSnapshot, getTitle, saveSnapshot, waitForLoad, clearSearchBox } from './snapshot.js';
import { performAiSearch, performFollowUp, getAiResponse } from '../agent-mode/index.js';

function log(message: string): void {
  process.stderr.write(`[google-search] ${message}\n`);
}

export function connectAgentBrowser(config: Config): void {
  log(`Connecting agent-browser to CDP ${config.port}`);
  runAgentBrowser(config.agentBrowserBin, ['connect', String(config.port)], config.port, { allowFailure: true });
}

export function openGoogle(config: Config): void {
  log(`Opening ${config.googleUrl}`);
  runAgentBrowser(config.agentBrowserBin, ['--cdp', String(config.port), 'open', config.googleUrl], config.port, { allowFailure: true });
}

export async function submitSearch(config: Config): Promise<void> {
  const searchBoxRef = getSearchBoxRef(config.agentBrowserBin, config.port);
  log(`Focusing search box ${searchBoxRef} with human-like movement`);
  await humanClick(config.agentBrowserBin, config.port, searchBoxRef);

  // Limpa input antes de digitar nova query
  // (queries previas em sessoes longas mesclam letras: bug "GeGmemmGame...")
  log('Clearing search box before typing');
  clearSearchBox(config.agentBrowserBin, config.port, searchBoxRef);

  // Re-resolve ref pos-clear caso o DOM tenha mudado
  let typingRef = searchBoxRef;
  try {
    typingRef = getSearchBoxRef(config.agentBrowserBin, config.port);
  } catch {
    // mantem ref original se re-resolve falhar
  }

  log(`Typing query like a human: ${config.searchQuery}`);
  await humanType(config.agentBrowserBin, config.port, config.searchQuery, typingRef, config);

  log('Submitting search');
  runAgentBrowser(config.agentBrowserBin, ['--cdp', String(config.port), 'press', 'Enter'], config.port);
}

export async function performSearch(config: Config): Promise<number> {
  await startChromeIfNeeded(config);
  connectAgentBrowser(config);
  openGoogle(config);

  log('Waiting for page to settle');
  waitForLoad(config.agentBrowserBin, config.port);

  // Use AI Mode if configured
  if (config.aiMode) {
    return performSearchAiMode(config);
  }

  await submitSearch(config);

  log('Waiting for search to settle');
  waitForLoad(config.agentBrowserBin, config.port);

  const snapshot = takeSnapshot(config.agentBrowserBin, config.port);
  const title = getTitle(config.agentBrowserBin, config.port);

  saveSnapshot(snapshot, config.startLogDir);

  // Detect blocking
  const detection = detectBlocking(snapshot, title);
  if (detection.blocked) {
    log(`Google blocked the request (${detection.type})`);
    const payload = createPayload('blocked', config.searchQuery, title, [], config.port);
    appendHistory(config, payload, 'serp');
    emitSearchResult(config, payload);
    return 2;
  }

  // Extract links
  const links = extractSearchLinks(config.agentBrowserBin, config.port, config.maxLinks);
  if (!links.length) {
    log('Google response was inconclusive; no result links were extracted');
    const payload = createPayload('inconclusive', config.searchQuery, title, [], config.port);
    appendHistory(config, payload, 'serp');
    emitSearchResult(config, payload);
    return 3;
  }

  log(`Extracted ${links.length} links`);
  const payload = createPayload('ok', config.searchQuery, title, links, config.port);
  appendHistory(config, payload, 'serp');
  emitSearchResult(config, payload);
  return 0;
}

/**
 * Performs search using Google AI Mode.
 * Types the query and clicks the AI Mode button instead of pressing Enter.
 */
async function performSearchAiMode(config: Config): Promise<number> {
  log(`Using AI Mode for search: ${config.searchQuery}`);

  // Perform AI Mode search (types query and clicks AI Mode button)
  await performAiSearch(config);

  // Wait for AI response to fully load
  log('Waiting for AI response to settle');
  waitForLoad(config.agentBrowserBin, config.port);

  const snapshot = takeSnapshot(config.agentBrowserBin, config.port);
  const title = getTitle(config.agentBrowserBin, config.port);

  saveSnapshot(snapshot, config.startLogDir);

  // Detect blocking
  const detection = detectBlocking(snapshot, title);
  if (detection.blocked) {
    log(`Google blocked the request (${detection.type})`);
    const payload = createPayload('blocked', config.searchQuery, title, [], config.port);
    emitSearchResult(config, payload);
    return 2;
  }

  const aiContent = getAiResponse(config.agentBrowserBin, config.port, config.searchQuery);

  if (!aiContent || aiContent.length < 50) {
    log('AI response was inconclusive or empty');
    const payload = createPayload('inconclusive', config.searchQuery, title, [], config.port);
    emitSearchResult(config, payload);
    return 3;
  }

  log(`AI Mode response extracted (${aiContent.length} chars)`);

  const turns: Array<{ question: string; answer: string }> = [
    { question: config.searchQuery, answer: aiContent }
  ];

  if (config.conversation && config.followUps.length > 0) {
    log(`Conversation mode: ${config.followUps.length} follow-up(s)`);
    for (const followUp of config.followUps) {
      await performFollowUp(config, followUp);
      const followTitle = getTitle(config.agentBrowserBin, config.port);
      const followSnapshot = takeSnapshot(config.agentBrowserBin, config.port);
      const followDetect = detectBlocking(followSnapshot, followTitle);
      if (followDetect.blocked) {
        log(`Follow-up blocked (${followDetect.type}): ${followUp}`);
        turns.push({ question: followUp, answer: `[blocked: ${followDetect.type}]` });
        continue;
      }
      const followAnswer = getAiResponse(config.agentBrowserBin, config.port, followUp);
      log(`Follow-up answer extracted (${followAnswer.length} chars)`);
      turns.push({ question: followUp, answer: followAnswer });
    }
  }

  const result = {
    status: 'ok',
    mode: 'ai-mode',
    conversation: config.conversation,
    query: config.searchQuery,
    title,
    port: config.port,
    turns,
    aiContent,
    timestamp: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}