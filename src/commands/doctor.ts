// src/commands/doctor.ts
// Health check: validates Chrome, agent-browser, CDP reachability, profile
// dir writability, history file, log dir. Exits non-zero on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pc from 'picocolors';
import { portOpen } from '../browser/connect.js';
import { DEFAULT_CONFIG, GSCLI_HOME } from '../config/index.js';
import { VERSION } from '../utils/version.js';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(): Promise<number> {
  const checks: Check[] = [];

  checks.push({
    label: 'gscli version',
    ok: true,
    detail: VERSION,
  });

  // Chrome binary
  const chromeOk = fs.existsSync(DEFAULT_CONFIG.chromeBin);
  checks.push({
    label: 'Chrome binary',
    ok: chromeOk,
    detail: chromeOk ? DEFAULT_CONFIG.chromeBin : `not found at ${DEFAULT_CONFIG.chromeBin} (set CHROME_BIN)`,
  });

  // agent-browser on PATH or absolute
  const agentBin = DEFAULT_CONFIG.agentBrowserBin;
  let agentPath: string | null = null;
  try {
    if (path.isAbsolute(agentBin)) {
      agentPath = fs.existsSync(agentBin) ? agentBin : null;
    } else {
      agentPath = execSync(`command -v ${agentBin}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    }
  } catch {
    agentPath = null;
  }
  checks.push({
    label: 'agent-browser',
    ok: !!agentPath,
    detail: agentPath ?? `'${agentBin}' not on PATH (install agent-browser or set AGENT_BROWSER_BIN)`,
  });

  // GSCLI_HOME writable
  let homeOk = true;
  let homeDetail = GSCLI_HOME;
  try {
    fs.mkdirSync(GSCLI_HOME, { recursive: true });
    const probe = path.join(GSCLI_HOME, '.write-probe');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
  } catch (e) {
    homeOk = false;
    homeDetail = `${GSCLI_HOME} (not writable: ${(e as Error).message})`;
  }
  checks.push({ label: 'GSCLI_HOME', ok: homeOk, detail: homeDetail });

  // Profile dir
  const profileExists = fs.existsSync(DEFAULT_CONFIG.profileDir);
  checks.push({
    label: 'Chrome profile',
    ok: true,
    detail: profileExists ? DEFAULT_CONFIG.profileDir : `${DEFAULT_CONFIG.profileDir} (will be created by 'gscli setup')`,
  });

  // CDP port
  const cdpUp = await portOpen(DEFAULT_CONFIG.port);
  checks.push({
    label: `CDP :${DEFAULT_CONFIG.port}`,
    ok: true,
    detail: cdpUp ? 'responding (Chrome debug running)' : 'idle (run a search to launch Chrome, or `gscli setup`)',
  });

  // History file
  const historyExists = fs.existsSync(DEFAULT_CONFIG.historyFile);
  let historyLines = 0;
  if (historyExists) {
    try {
      historyLines = fs.readFileSync(DEFAULT_CONFIG.historyFile, 'utf8').split('\n').filter(Boolean).length;
    } catch {
      // ignore
    }
  }
  checks.push({
    label: 'History',
    ok: true,
    detail: historyExists ? `${DEFAULT_CONFIG.historyFile} (${historyLines} entries)` : `${DEFAULT_CONFIG.historyFile} (empty)`,
  });

  // Log dir
  let logOk = true;
  try {
    fs.mkdirSync(DEFAULT_CONFIG.startLogDir, { recursive: true });
  } catch (e) {
    logOk = false;
  }
  checks.push({
    label: 'Log dir',
    ok: logOk,
    detail: DEFAULT_CONFIG.startLogDir,
  });

  console.error(pc.cyan('▸ gscli doctor'));
  console.error('');
  let allOk = true;
  for (const c of checks) {
    const icon = c.ok ? pc.green('✓') : pc.red('✗');
    if (!c.ok) allOk = false;
    console.error(`  ${icon} ${c.label.padEnd(18)} ${pc.dim(c.detail)}`);
  }
  console.error('');
  if (allOk) {
    console.error(pc.green('All checks passed.'));
    return 0;
  }
  console.error(pc.red('One or more checks failed — see details above.'));
  return 1;
}
