// src/commands/init.ts
// Wire gscli into the current project: copy gscli-* skills into each detected
// agent's skills dir and inject a marker-delimited section into its rule file.
// Idempotent — re-running updates the section in place.

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { AGENTS, type AgentConfig, detectInstalledAgents } from '../utils/agents.js';
import { templatesDir } from '../utils/templates-dir.js';

export interface InitOpts {
  cwd?: string;
  agent?: string;
  force?: boolean;
}

const MARKER_START = '<!-- gscli-start -->';
const MARKER_END = '<!-- gscli-end -->';

export async function runInit(opts: InitOpts = {}): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());

  let agents: AgentConfig[];
  if (opts.agent) {
    const a = AGENTS[opts.agent];
    if (!a) {
      console.error(pc.red(`✗ unknown agent: ${opts.agent}`));
      console.error(`  known: ${Object.keys(AGENTS).join(', ')}`);
      return 1;
    }
    agents = [a];
  } else {
    agents = detectInstalledAgents(cwd);
    if (agents.length === 0) {
      console.error(pc.yellow(`! no agent rule file found in ${cwd}`));
      console.error('  Looked for: CLAUDE.md, AGENTS.md, GEMINI.md');
      console.error('  Pass --agent <id> to force one (claude-code | codex | gemini).');
      return 1;
    }
  }

  console.error(pc.cyan('▸ gscli init'));
  console.error(`  project: ${cwd}`);
  console.error(`  agents:  ${agents.map((a) => a.label).join(', ')}`);
  console.error('');

  const tdir = templatesDir();
  const skillsSrc = path.join(tdir, 'skills');
  if (!fs.existsSync(skillsSrc)) {
    console.error(pc.red(`✗ skills templates missing at ${skillsSrc}`));
    return 1;
  }
  const skillEntries = fs.readdirSync(skillsSrc, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('gscli-'))
    .map((e) => e.name);

  for (const agent of agents) {
    const skillsDst = path.join(cwd, agent.skillsDir);
    fs.mkdirSync(skillsDst, { recursive: true });
    for (const skill of skillEntries) {
      const from = path.join(skillsSrc, skill);
      const to = path.join(skillsDst, skill);
      if (fs.existsSync(to) && !opts.force) {
        console.error(pc.dim(`  · ${agent.label}: ${skill} already present (use --force to overwrite)`));
        continue;
      }
      copyDir(from, to);
      console.error(pc.green(`  ✓ ${agent.label}: installed ${skill} → ${path.relative(cwd, to)}`));
    }

    const rulePath = path.join(cwd, agent.ruleFile);
    injectSection(rulePath, agent);
    console.error(pc.green(`  ✓ ${agent.label}: updated ${agent.ruleFile}`));
  }

  console.error('');
  console.error(pc.green('gscli wired into project.'));
  console.error('  Try:  gscli "your query"');
  console.error('  Undo: gscli uninstall');
  return 0;
}

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function injectSection(rulePath: string, agent: AgentConfig): void {
  const body = renderSection(agent);
  let content = '';
  if (fs.existsSync(rulePath)) {
    content = fs.readFileSync(rulePath, 'utf8');
  }
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + MARKER_END.length);
    content = `${before}${body}${after}`;
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += `\n${body}\n`;
  }
  fs.writeFileSync(rulePath, content);
}

function renderSection(agent: AgentConfig): string {
  return `${MARKER_START}
## gscli — Google Search CLI

The user runs Google searches through the \`gscli\` CLI (logged-in Chrome via CDP, AI Mode, persistent history). Prefer \`gscli\` over generic WebSearch/WebFetch when fresh facts, recent news, or external links are needed.

**Skills:** \`${agent.skillsDir}/gscli-*/SKILL.md\`

| To … | Use … |
|------|-------|
| Run a Google search | \`gscli "<query>"\` |
| Use Google AI Mode | \`gscli "<query>" --ai\` |
| Multi-turn AI Mode | \`gscli "<q>" --ai -c -f "follow-up"\` |
| Merge recent searches | \`gscli --merge-history --merge-limit 5\` |
| Cache same query | \`gscli "<q>" --use-cache\` |
| Health check | \`gscli doctor\` |
| Full options | \`gscli --help\` |

**Rules:**
- Never read or write files under \`~/.gscli/chrome-profile\` — it's session state.
- Never edit \`~/.gscli/history/searches.jsonl\` by hand — append-only.
- Exit code 2 = blocked (CAPTCHA); surface to the user, do not retry blindly.
${MARKER_END}`;
}
