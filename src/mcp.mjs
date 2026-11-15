// Merges toolkit MCP server definitions into Antigravity's mcp_config.json.
// Never stores secrets: credentials come from environment variables at runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');

// Server names are global in Antigravity, so they are prefixed to avoid collisions.
export function servers({ platform = process.platform, githubWrite = false } = {}) {
  const npx = platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npx', '-y', '@perplexity-ai/mcp-server'] } // npx is a .cmd shim on Windows
    : { command: 'npx', args: ['-y', '@perplexity-ai/mcp-server'] };
  return {
    'agk-github': {
      // Read-only toolset by default; writes need an explicit opt-in (--github-write).
      url: githubWrite ? 'https://api.githubcopilot.com/mcp/' : 'https://api.githubcopilot.com/mcp/readonly',
    },
    'agk-perplexity': { ...npx }, // reads PERPLEXITY_API_KEY from the environment
  };
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

export function installMcp({ file = DEFAULT_CONFIG, only, force = false, dryRun = false, ...opts } = {}) {
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

/** Non-network checks: config entries, env vars, npx availability. */
export function doctorMcp({ file = DEFAULT_CONFIG, env = process.env } = {}) {
  const cfg = fs.existsSync(file) ? load(file) : { mcpServers: {} };
  const out = [];
  for (const name of Object.keys(servers())) out.push({ check: `${name} configured`, ok: !!cfg.mcpServers[name], hint: 'run: agk mcp install' });
  out.push({ check: 'PERPLEXITY_API_KEY set in this shell', ok: !!env.PERPLEXITY_API_KEY, hint: 'set it as a user environment variable, then restart Antigravity' });
  return out;
}
