// src/utils/agents.ts
// Minimal AI agent registry. Each entry: where the rule file lives in a
// project (e.g. CLAUDE.md, AGENTS.md, GEMINI.md), and where its per-project
// skills directory lives. `gscli init` injects a marker-delimited section
// into the rule file and copies the gscli-* skills into skillsDir.

import fs from 'node:fs';
import path from 'node:path';

export interface AgentConfig {
  id: string;
  label: string;
  ruleFile: string;
  skillsDir: string;
}

export const AGENTS: Record<string, AgentConfig> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    ruleFile: 'CLAUDE.md',
    skillsDir: '.claude/skills',
  },
  codex: {
    id: 'codex',
    label: 'Codex / generic AGENTS.md',
    ruleFile: 'AGENTS.md',
    skillsDir: '.agents/skills',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    ruleFile: 'GEMINI.md',
    skillsDir: '.gemini/skills',
  },
};

export function detectInstalledAgents(projectRoot: string): AgentConfig[] {
  return Object.values(AGENTS).filter((a) =>
    fs.existsSync(path.join(projectRoot, a.ruleFile)),
  );
}
