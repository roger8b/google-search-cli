// src/utils/agents.ts
// AI agent registry. Each entry: where the rule file lives in a project
// (CLAUDE.md, AGENTS.md, GEMINI.md), where the per-project skills directory
// lives, and where the per-user (global) skills directory lives.
//
// `gscli init` (default) installs skills + injects a marker-delimited section
// into the rule files of DEFAULT_AGENT_IDS (claude-code, codex). Missing rule
// files are created; existing ones are appended to.
//
// `gscli init --global` installs skills into globalSkillsDir for every agent
// in GLOBAL_AGENT_IDS and never touches rule files.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AgentConfig {
  id: string;
  label: string;
  ruleFile: string;         // path relative to project root
  skillsDir: string;        // path relative to project root
  globalSkillsRel: string;  // path relative to $HOME — resolve via globalSkillsDir()
}

export function globalSkillsDir(agent: AgentConfig): string {
  // Read HOME at call time so tests can override the install root.
  const home = process.env.HOME || os.homedir();
  return path.join(home, agent.globalSkillsRel);
}

export const AGENTS: Record<string, AgentConfig> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    ruleFile: 'CLAUDE.md',
    skillsDir: '.claude/skills',
    globalSkillsRel: '.claude/skills',
  },
  codex: {
    id: 'codex',
    label: 'Codex / generic AGENTS.md',
    ruleFile: 'AGENTS.md',
    skillsDir: '.agents/skills',
    globalSkillsRel: '.agents/skills',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    ruleFile: 'GEMINI.md',
    skillsDir: '.gemini/skills',
    globalSkillsRel: '.gemini/skills',
  },
};

// Default project-init targets — these create/append AGENTS.md and CLAUDE.md.
export const DEFAULT_AGENT_IDS: string[] = ['claude-code', 'codex'];

// Default global-init targets — install user-level skills for every known agent.
export const GLOBAL_AGENT_IDS: string[] = ['claude-code', 'codex', 'gemini'];

export function detectInstalledAgents(projectRoot: string): AgentConfig[] {
  return Object.values(AGENTS).filter((a) =>
    fs.existsSync(path.join(projectRoot, a.ruleFile)),
  );
}
