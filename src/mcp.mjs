// Merges toolkit MCP server definitions into Antigravity's mcp_config.json.
// Never stores secrets: credentials come from environment variables at runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULT_CONFIG = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
export const COPILOT_CONFIG = path.join(os.homedir(), '.copilot', 'mcp-config.json');

// GitHub Copilot CLI needs an explicit transport type and tool allow-list per server.
const toCopilot = (d) => (d.url ? { type: 'http', url: d.url, tools: ['*'] } : { type: 'local', command: d.command, args: d.args, tools: ['*'] });

// Server names are global in Antigravity, so they are prefixed to avoid collisions.
export function servers({ platform = process.platform, githubWrite = false, format = 'antigravity' } = {}) {
  const npx = platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npx', '-y', '@perplexity-ai/mcp-server'] } // npx is a .cmd shim on Windows
    : { command: 'npx', args: ['-y', '@perplexity-ai/mcp-server'] };
  const all = {
    'agk-github': {
      // Read-only toolset by default; writes need an explicit opt-in (--github-write).
      url: githubWrite ? 'https://api.githubcopilot.com/mcp/' : 'https://api.githubcopilot.com/mcp/readonly',
    },
    'agk-perplexity': { ...npx }, // reads PERPLEXITY_API_KEY from the environment
  };
  return format === 'copilot' ? Object.fromEntries(Object.entries(all).map(([k, v]) => [k, toCopilot(v)])) : all;
}

function load(file) {
  if (!fs.existsSync(file)) return { mcpServers: {} };
  const text = fs.readFileSync(file, 'utf8');
  let cfg;
  try { cfg = JSON.parse(text || '{}'); } catch { throw new Error(`Cannot parse ${file}; fix it manually (not modified).`); }
  cfg.mcpServers ??= {};
  return cfg;
}

function save(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

export const defaultFile = (format) => (format === 'copilot' ? COPILOT_CONFIG : DEFAULT_CONFIG);

export function installMcp({ file, only, force = false, dryRun = false, ...opts } = {}) {
  file ??= defaultFile(opts.format);
  const cfg = load(file);
  const report = { file, added: [], skipped: [], replaced: [], dryRun };
  for (const [name, def] of Object.entries(servers(opts))) {
    if (only && !only.includes(name.replace('agk-', ''))) continue;
    const cur = cfg.mcpServers[name];
    if (cur && JSON.stringify(cur) === JSON.stringify(def)) { report.skipped.push(`${name} (already configured)`); continue; }
    if (cur && !force) { report.skipped.push(`${name} (exists with different settings; use --force)`); continue; }
    (cur ? report.replaced : report.added).push(name);
    cfg.mcpServers[name] = def;
  }
  if (!dryRun && (report.added.length || report.replaced.length)) save(file, cfg);
  return report;
}

export function uninstallMcp({ file = DEFAULT_CONFIG, dryRun = false } = {}) {
  const report = { file, removed: [], dryRun };
  if (!fs.existsSync(file)) return report;
  const cfg = load(file);
  for (const name of Object.keys(servers())) {
    if (cfg.mcpServers[name]) { report.removed.push(name); delete cfg.mcpServers[name]; }
  }
  if (!dryRun && report.removed.length) save(file, cfg);
  return report;
}

/** Diagnostic checks: config entries, env vars, runtime tools, and optional live endpoint probe. */
export async function doctorMcp({ file = DEFAULT_CONFIG, env = process.env, live = false, checkNpx = true } = {}) {
  let cfg = { mcpServers: {} };
  let configValid = true;
  if (fs.existsSync(file)) {
    try { cfg = load(file); } catch { configValid = false; }
  }
  const out = [];
  if (fs.existsSync(file)) out.push({ check: `${path.basename(file)} parses as JSON`, ok: configValid, hint: `fix JSON syntax in ${file}` });
  for (const name of Object.keys(servers())) out.push({ check: `${name} configured`, ok: !!cfg.mcpServers[name], hint: 'run: agk mcp install' });
  out.push({ check: 'PERPLEXITY_API_KEY set in this shell', ok: !!env.PERPLEXITY_API_KEY, hint: 'set it as a user environment variable, then restart Antigravity' });

  const major = Number(process.versions.node.split('.')[0]);
  out.push({ check: `Node.js >= 20 (found ${process.versions.node})`, ok: major >= 20, hint: 'upgrade Node.js to version 20 or newer' });

  if (checkNpx) {
    let npxOk = false;
    try {
      const cmd = process.platform === 'win32' ? 'cmd' : 'npx';
      const args = process.platform === 'win32' ? ['/c', 'npx', '--version'] : ['--version'];
      execFileSync(cmd, args, { stdio: 'ignore', timeout: 5000 });
      npxOk = true;
    } catch { npxOk = false; }
    out.push({ check: 'npx available in PATH', ok: npxOk, hint: 'install Node.js/npm and restart Antigravity' });
  }

  if (live) {
    let ghOk = false;
    let ghStatus = 'unreachable';
    try {
      const res = await fetch('https://api.githubcopilot.com/mcp/readonly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8000),
      });
      ghStatus = `HTTP ${res.status}`;
      ghOk = res.status === 200 || res.status === 401 || res.status === 400 || res.status === 405;
    } catch (e) { ghStatus = e.message; }
    out.push({ check: `GitHub MCP endpoint reachable (${ghStatus})`, ok: ghOk, hint: 'check network/proxy or use Docker fallback in SETUP.md' });
  }
  return out;
}
