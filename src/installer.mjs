// Manifest-based installer: installs kit/ files into a target repository safely.
// Ownership rule: a file is "ours" only if the manifest recorded its hash AND the
// on-disk content still matches. Anything else is user content and is never overwritten/deleted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_DIR = path.join(ROOT, 'kit');
export const MEMORY_TEMPLATES = path.join(ROOT, 'memory-templates');
export const MANIFEST_REL = '.agents/.toolkit-manifest.json';
const EXCLUDE_MARK = '# agy-toolkit (local)';

export const version = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [posix(path.relative(base, full))];
  });
}

const MINIMAL_SKILLS = new Set(['plan', 'implement', 'review', 'commit-prep']);
export const PROFILES = ['standard', 'minimal'];

function includeInProfile(rel, profile) {
  if (profile === 'standard') return true;
  if (profile !== 'minimal') throw new Error(`Unknown profile "${profile}". Use: ${PROFILES.join(', ')}`);
  if (rel.startsWith('.agents/rules/')) return true;
  const m = rel.match(/^\.agents\/skills\/([^/]+)\//);
  return !!(m && MINIMAL_SKILLS.has(m[1]));
}

/** Files to install: kit/** (filtered by profile) and optionally memory templates under .agents/memory/. */
export function plannedFiles({ memory = false, profile = 'standard' } = {}) {
  if (!PROFILES.includes(profile)) throw new Error(`Unknown profile "${profile}". Use: ${PROFILES.join(', ')}`);
  const map = new Map();
  for (const rel of walk(KIT_DIR)) {
    if (includeInProfile(rel, profile)) map.set(rel, path.join(KIT_DIR, rel));
  }
  if (memory) for (const rel of walk(MEMORY_TEMPLATES)) map.set(`.agents/memory/${rel}`, path.join(MEMORY_TEMPLATES, rel));
  return map;
}

export function readManifest(target) {
  const p = path.join(target, MANIFEST_REL);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { corrupt: true, files: {} }; }
}

function writeManifest(target, files, extra = {}) {
  const p = path.join(target, MANIFEST_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ toolkit: 'agy-toolkit', version: version(), source: sourceRevision(), files, ...extra }, null, 2) + '\n');
  fs.renameSync(tmp, p); // atomic: partial failure never leaves a half-written manifest
}

function sourceRevision() {
  try { return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

/** Resolve the git exclude file (handles worktrees via git itself). Returns null for non-git dirs. */
export function gitExcludePath(target) {
  try {
    const out = execFileSync('git', ['-C', target, 'rev-parse', '--git-path', 'info/exclude'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return path.resolve(target, out);
  } catch { return null; }
}

export function addExcludes(target, patterns) {
  const file = gitExcludePath(target);
  if (!file) return { file: null, added: [] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const added = patterns.filter((p) => !lines.includes(p));
  if (added.length) {
    if (text.length && !text.endsWith('\n')) text += '\n'; // file may lack a final newline
    if (!lines.includes(EXCLUDE_MARK)) text += EXCLUDE_MARK + '\n';
    text += added.join('\n') + '\n';
    fs.writeFileSync(file, text);
  }
  return { file, added };
}

export function removeExcludes(target) {
  const file = gitExcludePath(target);
  if (!file || !fs.existsSync(file)) return;
  const ours = new Set([EXCLUDE_MARK, `/${MANIFEST_REL}`, '/.agents/memory/']);
  const kept = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !ours.has(l));
  fs.writeFileSync(file, kept.join('\n').replace(/\n*$/, '\n').replace(/^\n$/, ''));
}

/**
 * Install or upgrade. Returns a report; with dryRun nothing is written.
 * Works for first install, repeat install, upgrade, and upgrade from a pre-manifest install.
 */
export function install(target, { memory = false, dryRun = false, profile = 'standard' } = {}) {
  target = path.resolve(target);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`Target is not a directory: ${target}`);
  const planned = plannedFiles({ memory, profile });
  const prev = readManifest(target);
  const prevFiles = prev?.files ?? {};
  const files = { ...prevFiles };
  const report = { created: [], updated: [], unchanged: [], preserved: [], removed: [], keptObsolete: [], dryRun, profile };

  for (const [rel, src] of planned) {
    const dest = path.join(target, rel);
    const buf = fs.readFileSync(src);
    const h = sha(buf);
    const exists = fs.existsSync(dest);
    if (!exists) {
      report.created.push(rel);
    } else {
      const cur = sha(fs.readFileSync(dest));
      if (cur === h) { report.unchanged.push(rel); files[rel] = h; continue; }
      const owned = prevFiles[rel] && prevFiles[rel] === cur; // unmodified kit file from earlier version
      if (!owned) { report.preserved.push(rel); continue; }  // user edit, or pre-manifest file: never overwrite
      report.updated.push(rel);
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
    files[rel] = h;
  }

  // Obsolete: previously ours, no longer shipped.
  for (const rel of Object.keys(prevFiles)) {
    if (planned.has(rel)) continue;
    const dest = path.join(target, rel);
    if (!fs.existsSync(dest)) { delete files[rel]; continue; }
    if (sha(fs.readFileSync(dest)) === prevFiles[rel]) {
      report.removed.push(rel);
      if (!dryRun) fs.rmSync(dest);
      delete files[rel];
    } else { report.keptObsolete.push(rel); delete files[rel]; }
  }

  if (!dryRun) {
    writeManifest(target, files, { memory, profile, ...(prev?.scanHash ? { scanHash: prev.scanHash } : {}) });
    const patterns = [`/${MANIFEST_REL}`];
    if (memory) patterns.push('/.agents/memory/'); // project memory stays local, never in team commits
    report.exclude = addExcludes(target, patterns);
    pruneEmptyDirs(target, [...report.removed]);
  }
  report.version = version();
  return report;
}

function pruneEmptyDirs(target, rels) {
  for (const rel of rels) {
    let dir = path.dirname(path.join(target, rel));
    while (dir.startsWith(target) && dir !== target && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
  }
}

/** Remove only unchanged kit files. Modified and generated files (e.g. memory content) are preserved. */
export function uninstall(target, { dryRun = false } = {}) {
  target = path.resolve(target);
  const m = readManifest(target);
  if (!m) throw new Error('No toolkit manifest found; nothing to uninstall.');
  const report = { removed: [], preserved: [], missing: [], dryRun };
  for (const [rel, h] of Object.entries(m.files)) {
    const dest = path.join(target, rel);
    if (!fs.existsSync(dest)) { report.missing.push(rel); continue; }
    if (sha(fs.readFileSync(dest)) === h) { report.removed.push(rel); if (!dryRun) fs.rmSync(dest); }
    else report.preserved.push(rel);
  }
  if (!dryRun) {
    fs.rmSync(path.join(target, MANIFEST_REL), { force: true });
    pruneEmptyDirs(target, [...report.removed, MANIFEST_REL]);
    removeExcludes(target);
  }
  return report;
}

export function verify(target) {
  target = path.resolve(target);
  const m = readManifest(target);
  if (!m) return { installed: false, problems: ['Not installed (no manifest).'] };
  const problems = []; const modified = [];
  if (m.corrupt) problems.push('Manifest is corrupt; re-run install.');
  for (const [rel, h] of Object.entries(m.files)) {
    const dest = path.join(target, rel);
    if (!fs.existsSync(dest)) problems.push(`Missing: ${rel}`);
    else if (sha(fs.readFileSync(dest)) !== h) modified.push(rel);
  }
  return { installed: true, version: m.version, current: version(), upToDate: m.version === version(), problems, modified };
}
