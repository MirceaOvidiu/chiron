// Builds an Antigravity plugin bundle from kit/ and mcp.servers().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_DIR, version } from './installer.mjs';
import { servers } from './mcp.mjs';

export const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-toolkit');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) count += copyDir(s, d);
    else { fs.copyFileSync(s, d); count++; }
  }
  return count;
}

function consolidateRules() {
  const dir = path.join(KIT_DIR, '.agents', 'rules');
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  }).join('\n\n---\n\n') + '\n';
}

export function buildPlugin(outDir = DEFAULT_PLUGIN_DIR, { githubWrite = false, dryRun = false } = {}) {
  outDir = path.resolve(outDir);
  const manifest = {
    name: 'agy-toolkit',
    displayName: 'Antigravity Toolkit',
    version: version(),
    description: 'Reusable coding principles, STE communication rules, workflow skills, lifecycle hooks, subagents, and GitHub/Perplexity MCP.',
    author: 'agy-toolkit contributors',
    suggestedPrompts: [
      'Plan the next feature before writing code',
      'Review my current diff for bugs and regressions',
      'Prepare a commit message for staged changes',
    ],
  };

  if (dryRun) {
    return { outDir, dryRun: true, manifest };
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');

  const agentsRoot = path.join(KIT_DIR, '.agents');
  const filesCopied =
    copyDir(path.join(agentsRoot, 'skills'), path.join(outDir, 'skills')) +
    copyDir(path.join(agentsRoot, 'agents'), path.join(outDir, 'agents')) +
    copyDir(path.join(agentsRoot, 'scripts'), path.join(outDir, 'scripts'));

  const hooksSrc = path.join(agentsRoot, 'hooks.json');
  if (fs.existsSync(hooksSrc)) fs.copyFileSync(hooksSrc, path.join(outDir, 'hooks.json'));

  const rulesDir = path.join(outDir, 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'AGENTS.md'), consolidateRules());

  fs.writeFileSync(
    path.join(outDir, 'mcp_config.json'),
    JSON.stringify({ mcpServers: servers({ githubWrite }) }, null, 2) + '\n',
  );

  return { outDir, dryRun: false, filesCopied, manifest };
}
