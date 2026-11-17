#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as inst from './installer.mjs';
import * as mcp from './mcp.mjs';
import * as scanner from './scanner.mjs';
import * as plugin from './plugin.mjs';
import * as exp from './export.mjs';
import * as ste from './ste-check.mjs';

const HELP = `agk - Antigravity toolkit installer (v${inst.version()})

Usage:
  agk install   [target]  [--profile standard|minimal] [--memory] [--dry-run]
  agk verify    [target]
  agk uninstall [target]  [--dry-run]
  agk scan      [target]  [--dry-run]
  agk export    [target]  --format agents-md|claude|copilot [--force] [--dry-run]
  agk plugin build   [dir] [--github-write] [--dry-run]
  agk plugin install       [--github-write] [--dry-run]
  agk check-ste [paths...]
  agk mcp install   [--only github,perplexity] [--github-write] [--format antigravity|copilot] [--force] [--dry-run] [--config <file>]
  agk mcp uninstall [--dry-run] [--config <file>]
  agk mcp doctor    [--live] [--config <file>]

Notes: modified files are never overwritten or deleted. MCP config is user-level
(~/.gemini/config/mcp_config.json) and never contains secrets.`;

const list = (out, title, items) => items?.length && out.log(`${title} (${items.length}):\n${items.map((i) => `  ${i}`).join('\n')}`);

export async function main(argv, out = console) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      memory: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, force: { type: 'boolean' },
      'github-write': { type: 'boolean' }, live: { type: 'boolean' },
      only: { type: 'string' }, format: { type: 'string' }, config: { type: 'string' },
      profile: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...rest] = positionals;
  const dryRun = !!values['dry-run'];
  if (!cmd || values.help || cmd === 'help') { out.log(HELP); return 0; }

  if (cmd === 'install') {
    const target = path.resolve(rest[0] ?? '.');
    const r = inst.install(target, { memory: !!values.memory, dryRun, profile: values.profile ?? 'standard' });
    out.log(`${dryRun ? '[dry-run] ' : ''}agy-toolkit ${r.version} (${r.profile}) -> ${target}`);
    list(out, 'created', r.created); list(out, 'updated', r.updated); list(out, 'removed (obsolete)', r.removed);
    list(out, 'preserved (locally modified or pre-existing; not overwritten)', r.preserved);
    list(out, 'kept obsolete (locally modified)', r.keptObsolete);
    out.log(`unchanged: ${r.unchanged.length}`);
    if (r.exclude && !r.exclude.file) out.log('note: not a git repository; no ignore rules were written.');
    return 0;
  }
  if (cmd === 'verify') {
    const target = rest[0] ?? '.';
    const r = inst.verify(target);
    if (!r.installed) { out.log(r.problems[0]); return 1; }
    out.log(`installed ${r.version}${r.upToDate ? ' (up to date)' : ` (toolkit is ${r.current}; run install to upgrade)`}`);
    list(out, 'modified locally', r.modified); list(out, 'problems', r.problems);
    const fresh = scanner.checkMemoryFreshness(target);
    if (fresh.stale) out.log(`warning: ${fresh.reason}`);
    return r.problems.length ? 1 : 0;
  }
  if (cmd === 'uninstall') {
    const r = inst.uninstall(rest[0] ?? '.', { dryRun });
    out.log(`${dryRun ? '[dry-run] ' : ''}removed ${r.removed.length} file(s)`);
    list(out, 'preserved (modified)', r.preserved);
    return 0;
  }
  if (cmd === 'scan') {
    const r = scanner.applyScan(rest[0] ?? '.', { dryRun });
    out.log(`${dryRun ? '[dry-run] ' : ''}scanned ${r.target} (stack: ${r.stacks.join(', ') || 'none'})`);
    list(out, 'updated', r.updated);
    return 0;
  }
  if (cmd === 'export') {
    const r = exp.exportInstructions(rest[0] ?? '.', { format: values.format ?? 'agents-md', force: !!values.force, dryRun });
    out.log(`${dryRun ? '[dry-run] ' : ''}exported ${r.format} -> ${r.dest} (${r.bytes} bytes)`);
    return 0;
  }
  if (cmd === 'plugin') {
    const [sub, dir] = rest;
    if (sub === 'build' || sub === 'install') {
      const target = sub === 'install' ? plugin.DEFAULT_PLUGIN_DIR : path.resolve(dir ?? 'dist/agy-toolkit');
      const r = plugin.buildPlugin(target, { githubWrite: !!values['github-write'], dryRun });
      out.log(`${dryRun ? '[dry-run] ' : ''}plugin ${r.manifest.version} -> ${r.outDir}`);
      if (sub === 'install') out.log('Manage in Antigravity Customizations UI: [agy-toolkit](customization://agy-toolkit)');
      return 0;
    }
  }
  if (cmd === 'check-ste') {
    const targets = rest.length ? rest : ['.'];
    const issues = ste.checkStePaths(targets);
    for (const iss of issues) out.log(`${iss.file}:${iss.line} [${iss.rule}] ${iss.detail}`);
    out.log(issues.length ? `found ${issues.length} STE issue(s)` : 'STE check passed (0 issues)');
    return issues.length ? 1 : 0;
  }
  if (cmd === 'mcp') {
    const [sub] = rest; const format = values.format ?? 'antigravity'; const file = values.config ?? mcp.defaultFile(format);
    if (sub === 'install') {
      const only = values.only?.split(',').map((s) => s.trim());
      const r = mcp.installMcp({ file, only, force: !!values.force, dryRun, githubWrite: !!values['github-write'], format });
      out.log(`${dryRun ? '[dry-run] ' : ''}${r.file}`);
      list(out, 'added', r.added); list(out, 'replaced', r.replaced); list(out, 'skipped', r.skipped);
      out.log('Set PERPLEXITY_API_KEY in your environment (never in files). See SETUP.md.');
      return 0;
    }
    if (sub === 'uninstall') { const r = mcp.uninstallMcp({ file, dryRun }); list(out, 'removed', r.removed); return 0; }
    if (sub === 'doctor') {
      const checks = await mcp.doctorMcp({ file, live: !!values.live });
      for (const c of checks) out.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.check}${c.ok ? '' : `  -> ${c.hint}`}`);
      return checks.every((c) => c.ok) ? 0 : 1;
    }
  }
  out.log(HELP); return 2;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
}
