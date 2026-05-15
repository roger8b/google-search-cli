// src/commands/uninstall.ts
// Reverse of `gscli init`: remove the marker-delimited section from rule
// files and delete gscli-* skill directories from the per-agent skills dir.

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { AGENTS, detectInstalledAgents } from '../utils/agents.js';

export interface UninstallOpts {
  cwd?: string;
  agent?: string;
}

const MARKER_START = '<!-- gscli-start -->';
const MARKER_END = '<!-- gscli-end -->';

export async function runUninstall(opts: UninstallOpts = {}): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());

  const agents = opts.agent
    ? (AGENTS[opts.agent] ? [AGENTS[opts.agent]] : [])
    : detectInstalledAgents(cwd);

  if (agents.length === 0) {
    console.error(pc.yellow('! nothing to uninstall (no agents detected)'));
    return 0;
  }

  console.error(pc.cyan('▸ gscli uninstall'));
  console.error(`  project: ${cwd}`);
  console.error('');

  for (const agent of agents) {
    const skillsDst = path.join(cwd, agent.skillsDir);
    if (fs.existsSync(skillsDst)) {
      for (const entry of fs.readdirSync(skillsDst)) {
        if (entry.startsWith('gscli-')) {
          fs.rmSync(path.join(skillsDst, entry), { recursive: true, force: true });
          console.error(pc.green(`  ✓ removed ${path.join(agent.skillsDir, entry)}`));
        }
      }
    }
    const rulePath = path.join(cwd, agent.ruleFile);
    if (fs.existsSync(rulePath)) {
      const content = fs.readFileSync(rulePath, 'utf8');
      const startIdx = content.indexOf(MARKER_START);
      const endIdx = content.indexOf(MARKER_END);
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = content.slice(0, startIdx).replace(/\n+$/, '\n');
        const after = content.slice(endIdx + MARKER_END.length).replace(/^\n+/, '\n');
        fs.writeFileSync(rulePath, before + after);
        console.error(pc.green(`  ✓ cleaned ${agent.ruleFile}`));
      }
    }
  }

  console.error('');
  console.error(pc.green('gscli unwired from project.'));
  return 0;
}
