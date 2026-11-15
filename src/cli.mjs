#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as inst from './installer.mjs';
import * as mcp from './mcp.mjs';

const HELP = `agk - Antigravity toolkit installer (v${inst.version()})

Usage:
  agk install   [target]  [--memory] [--dry-run]   Install/upgrade skills + rules into a repo (default: cwd)
  agk verify    [target]                           Check installed files against the manifest
  agk uninstall [target]  [--dry-run]              Remove unchanged toolkit files only
  agk mcp install   [--only github,perplexity] [--github-write] [--force] [--dry-run] [--config <file>]
  agk mcp uninstall [--dry-run] [--config <file>]
  agk mcp doctor    [--config <file>]

Notes: modified files are never overwritten or deleted. MCP config is user-level
(~/.gemini/config/mcp_config.json) and never contains secrets.`;

const list = (title, items) => items?.length && console.log(`${title} (${items.length}):\n${items.map((i) => `  ${i}`).join('\n')}`);

export function main(argv, out = console) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      memory: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, force: { type: 'boolean' },
      'github-write': { type: 'boolean' }, only: { type: 'string' }, config: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...rest] = positionals;
  const dryRun = !!values['dry-run'];
  if (!cmd || values.help || cmd === 'help') { out.log(HELP); return 0; }

  if (cmd === 'install') {
    const target = path.resolve(rest[0] ?? '.');
    const r = inst.install(target, { memory: !!values.memory, dryRun });
    out.log(`${dryRun ? '[dry-run] ' : ''}agy-toolkit ${r.version} -> ${target}`);
    list('created', r.created); list('updated', r.updated); list('removed (obsolete)', r.removed);
    list('preserved (locally modified or pre-existing; not overwritten)', r.preserved);
    list('kept obsolete (locally modified)', r.keptObsolete);
    out.log(`unchanged: ${r.unchanged.length}`);
    if (r.exclude && !r.exclude.file) out.log('note: not a git repository; no ignore rules were written.');
    return 0;
  }
  if (cmd === 'verify') {
    const r = inst.verify(rest[0] ?? '.');
    if (!r.installed) { out.log(r.problems[0]); return 1; }
    out.log(`installed ${r.version}${r.upToDate ? ' (up to date)' : ` (toolkit is ${r.current}; run install to upgrade)`}`);
    list('modified locally', r.modified); list('problems', r.problems);
    return r.problems.length ? 1 : 0;
  }
  if (cmd === 'uninstall') {
    const r = inst.uninstall(rest[0] ?? '.', { dryRun });
    out.log(`${dryRun ? '[dry-run] ' : ''}removed ${r.removed.length} file(s)`);
    list('preserved (modified)', r.preserved);
    return 0;
  }
  if (cmd === 'mcp') {
    const [sub] = rest; const file = values.config ?? mcp.DEFAULT_CONFIG;
    if (sub === 'install') {
      const only = values.only?.split(',').map((s) => s.trim());
      const r = mcp.installMcp({ file, only, force: !!values.force, dryRun, githubWrite: !!values['github-write'] });
      out.log(`${dryRun ? '[dry-run] ' : ''}${r.file}`);
      list('added', r.added); list('replaced', r.replaced); list('skipped', r.skipped);
      out.log('Set PERPLEXITY_API_KEY in your environment (never in files). See SETUP.md.');
      return 0;
    }
    if (sub === 'uninstall') { const r = mcp.uninstallMcp({ file, dryRun }); list('removed', r.removed); return 0; }
    if (sub === 'doctor') {
      const checks = mcp.doctorMcp({ file });
      for (const c of checks) out.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.check}${c.ok ? '' : `  -> ${c.hint}`}`);
      return checks.every((c) => c.ok) ? 0 : 1;
    }
  }
  out.log(HELP); return 2;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}
