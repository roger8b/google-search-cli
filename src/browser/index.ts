// src/browser/index.ts
// Browser module - exports all browser-related utilities.

export { runAgentBrowser, runMaybe, buildCdpArgs } from './agent.js';
export { portOpen, waitForCdp } from './connect.js';
export { startChromeIfNeeded } from './chrome.js';