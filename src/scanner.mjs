// Discovers verified repository facts (stack, scripts, structure) to populate
// local .agents/memory/ files and detect when memory becomes stale.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { addExcludes, readManifest, MANIFEST_REL } from './installer.mjs';

const START_MARK = '<!-- agk:scan:start -->';
const END_MARK = '<!-- agk:scan:end -->';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.agents', 'dist', 'build', '.venv', 'venv', 'target', '__pycache__']);
const MANIFEST_FILES = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod'];

function fingerprint(target) {
  const h = crypto.createHash('sha256');
  let count = 0;
  for (const rel of MANIFEST_FILES) {
    const p = path.join(target, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      h.update(rel).update('\0').update(fs.readFileSync(p));
      count++;
    }
  }
  return count ? h.digest('hex').slice(0, 16) : null;
}

export function scanRepo(target) {
  target = path.resolve(target);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Target is not a directory: ${target}`);
  }
  const stacks = [];
  const commands = [];
  let purpose = null;
  let packageManager = null;

  const pkgPath = path.join(target, 'package.json');
  if (fs.existsSync(pkgPath)) {
    stacks.push('Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.description) purpose = `${pkg.name || path.basename(target)}: ${pkg.description}`;
      else if (pkg.name) purpose = pkg.name;
      for (const [k, v] of Object.entries(pkg.scripts || {})) commands.push(`npm run ${k} (\`${v}\`)`);
    } catch { /* ignore invalid package.json */ }
    if (fs.existsSync(path.join(target, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(target, 'yarn.lock'))) packageManager = 'yarn';
    else if (fs.existsSync(path.join(target, 'package-lock.json'))) packageManager = 'npm';
  }
  if (fs.existsSync(path.join(target, 'pyproject.toml')) || fs.existsSync(path.join(target, 'requirements.txt'))) {
    stacks.push('Python');
    commands.push('pytest (if configured)');
  }
  if (fs.existsSync(path.join(target, 'Cargo.toml'))) {
    stacks.push('Rust');
    commands.push('cargo test', 'cargo build');
  }
  if (fs.existsSync(path.join(target, 'go.mod'))) {
    stacks.push('Go');
    commands.push('go test ./...');
  }

  const dirs = fs.readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => `${e.name}/`)
    .sort();

  const wfDir = path.join(target, '.github', 'workflows');
  const workflows = fs.existsSync(wfDir)
    ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/i.test(f)).sort()
    : [];

  return {
    target,
    stacks,
    purpose,
    packageManager,
    commands,
    dirs,
    workflows,
    fingerprint: fingerprint(target),
  };
}

function replaceBlock(existing, blockBody, fallbackHeader) {
  const block = `${START_MARK}\n${blockBody.trim()}\n${END_MARK}`;
  const re = new RegExp(`${START_MARK}[\\s\\S]*?${END_MARK}`);
  if (!existing) return `${fallbackHeader}\n\n${block}\n`;
  if (re.test(existing)) return existing.replace(re, block);
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}\n`;
}

export function applyScan(target, { dryRun = false } = {}) {
  const info = scanRepo(target);
  const memDir = path.join(info.target, '.agents', 'memory');
  const archPath = path.join(memDir, 'architecture.md');
  const convPath = path.join(memDir, 'conventions.md');

  const archBlock = [
    '## Auto-discovered summary',
    `- **Stack**: ${info.stacks.length ? info.stacks.join(', ') : 'Unknown'}`,
    info.purpose ? `- **Project**: ${info.purpose}` : null,
    info.dirs.length ? `- **Top-level folders**: ${info.dirs.join(', ')}` : null,
    info.workflows.length ? `- **CI workflows**: ${info.workflows.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const convBlock = [
    '## Auto-discovered commands',
    info.packageManager ? `- **Package manager**: ${info.packageManager}` : null,
    info.commands.length ? `- **Commands**: ${info.commands.join('; ')}` : '- **Commands**: None detected from root manifests',
  ].filter(Boolean).join('\n');

  const archCur = fs.existsSync(archPath) ? fs.readFileSync(archPath, 'utf8') : '';
  const convCur = fs.existsSync(convPath) ? fs.readFileSync(convPath, 'utf8') : '';
  const archNext = replaceBlock(archCur, archBlock, '# Architecture');
  const convNext = replaceBlock(convCur, convBlock, '# Conventions');

  if (!dryRun) {
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(archPath, archNext);
    fs.writeFileSync(convPath, convNext);
    addExcludes(info.target, ['/.agents/memory/']);
    const m = readManifest(info.target);
    if (m && !m.corrupt) {
      m.scanHash = info.fingerprint;
      fs.writeFileSync(path.join(info.target, MANIFEST_REL), JSON.stringify(m, null, 2) + '\n');
    }
  }
  return { ...info, updated: ['.agents/memory/architecture.md', '.agents/memory/conventions.md'], dryRun };
}

export function checkMemoryFreshness(target) {
  target = path.resolve(target);
  const m = readManifest(target);
  if (!m || !m.scanHash) return { checked: false, stale: false };
  const current = fingerprint(target);
  if (current === m.scanHash) return { checked: true, stale: false };
  return { checked: true, stale: true, reason: 'Project manifests changed since last agk scan; run: agk scan' };
}
