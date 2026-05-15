// src/commands/uninstall.ts
// Reverse of `gscli init`.
//
// Project mode (default): strip the marker-delimited section from CLAUDE.md /
// AGENTS.md / GEMINI.md (whichever are present in the project) and remove the
// gscli-* skills from each per-agent skillsDir.
//
// Global mode (--global): remove gscli-* skills from $HOME/<agent>/skills for
// every known agent. Never touches rule files.

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { AGENTS, type AgentConfig, GLOBAL_AGENT_IDS, detectInstalledAgents, globalSkillsDir } from '../utils/agents.js';

export interface UninstallOpts {
  cwd?: string;
  agent?: string;
  global?: boolean;
}

const MARKER_START = '<!-- gscli-start -->';
const MARKER_END = '<!-- gscli-end -->';

export async function runUninstall(opts: UninstallOpts = {}): Promise<number> {
  return opts.global ? runGlobal(opts) : runProject(opts);
}

async function runProject(opts: UninstallOpts): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());

  const agents: AgentConfig[] = opts.agent
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
    removeGscliSkills(path.join(cwd, agent.skillsDir), agent.skillsDir);
    const rulePath = path.join(cwd, agent.ruleFile);
    cleanRuleFile(rulePath, agent.ruleFile);
  }

  console.error('');
  console.error(pc.green('gscli unwired from project.'));
  return 0;
}

async function runGlobal(opts: UninstallOpts): Promise<number> {
  const agents: AgentConfig[] = opts.agent
    ? (AGENTS[opts.agent] ? [AGENTS[opts.agent]] : [])
    : GLOBAL_AGENT_IDS.map((id) => AGENTS[id]);

  if (agents.length === 0) {
    console.error(pc.red(`✗ unknown agent: ${opts.agent}`));
    return 1;
  }

  console.error(pc.cyan('▸ gscli uninstall --global'));
  console.error('');

  for (const agent of agents) {
    const dst = globalSkillsDir(agent);
    removeGscliSkills(dst, dst);
  }

  console.error('');
  console.error(pc.green('gscli global skills removed.'));
  return 0;
}

function removeGscliSkills(skillsRoot: string, displayLabel: string): void {
  if (!fs.existsSync(skillsRoot)) return;
  for (const entry of fs.readdirSync(skillsRoot)) {
    if (entry.startsWith('gscli-')) {
      fs.rmSync(path.join(skillsRoot, entry), { recursive: true, force: true });
      console.error(pc.green(`  ✓ removed ${path.join(displayLabel, entry)}`));
    }
  }
}

function cleanRuleFile(rulePath: string, displayName: string): void {
  if (!fs.existsSync(rulePath)) return;
  const content = fs.readFileSync(rulePath, 'utf8');
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

  const before = content.slice(0, startIdx).replace(/\n+$/, '\n');
  const after = content.slice(endIdx + MARKER_END.length).replace(/^\n+/, '\n');
  fs.writeFileSync(rulePath, before + after);
  console.error(pc.green(`  ✓ cleaned ${displayName}`));
}
