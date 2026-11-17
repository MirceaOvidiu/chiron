import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import nodeCrypto from 'node:crypto';
const sync = (s) => nodeCrypto.createHash('sha256').update(s).digest('hex');
import * as inst from '../src/installer.mjs';
import * as mcp from '../src/mcp.mjs';
import { main } from '../src/cli.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agk-'));
const gitRepo = () => { const d = tmp(); execFileSync('git', ['init', '-q', d]); return d; };
const skill = (d) => path.join(d, '.agents/skills/plan/SKILL.md');
const exclude = (d) => fs.readFileSync(path.join(d, '.git/info/exclude'), 'utf8');

test('fresh install then repeat install is idempotent', () => {
  const d = gitRepo();
  const a = inst.install(d);
  assert.ok(a.created.length > 5);
  assert.ok(fs.existsSync(skill(d)));
  const b = inst.install(d);
  assert.equal(b.created.length + b.updated.length + b.preserved.length, 0);
  assert.equal(b.unchanged.length, a.created.length);
  assert.equal(inst.verify(d).problems.length, 0);
});

test('existing user files are preserved, not overwritten', () => {
  const d = tmp();
  fs.mkdirSync(path.dirname(skill(d)), { recursive: true });
  fs.writeFileSync(skill(d), 'mine');
  const r = inst.install(d);
  assert.deepEqual(r.preserved, ['.agents/skills/plan/SKILL.md']);
  assert.equal(fs.readFileSync(skill(d), 'utf8'), 'mine');
  inst.uninstall(d);
  assert.equal(fs.readFileSync(skill(d), 'utf8'), 'mine'); // not ours, never deleted
});

test('upgrade updates unchanged files, keeps locally modified ones, removes obsolete ones', () => {
  const d = tmp();
  inst.install(d);
  const m = inst.readManifest(d);
  // Simulate an older version: an obsolete file and an older plan skill content.
  fs.writeFileSync(path.join(d, '.agents/rules/old.md'), 'old');
  fs.writeFileSync(skill(d), 'older version');
  const crypto = sync;
  m.files['.agents/rules/old.md'] = crypto('old');
  m.files['.agents/skills/plan/SKILL.md'] = crypto('older version');
  fs.writeFileSync(path.join(d, inst.MANIFEST_REL), JSON.stringify(m));
  // Local edit on another file.
  const review = path.join(d, '.agents/skills/review/SKILL.md');
  fs.appendFileSync(review, '\nlocal edit');

  const r = inst.install(d);
  assert.deepEqual(r.updated, ['.agents/skills/plan/SKILL.md']);
  assert.deepEqual(r.removed, ['.agents/rules/old.md']);
  assert.ok(r.preserved.includes('.agents/skills/review/SKILL.md'));
  assert.ok(fs.readFileSync(review, 'utf8').endsWith('local edit'));
  assert.ok(!fs.existsSync(path.join(d, '.agents/rules/old.md')));
});

test('first upgrade from a pre-manifest install preserves differing files', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.agents/rules'), { recursive: true });
  fs.writeFileSync(path.join(d, '.agents/rules/clear-writing.md'), 'hand-copied, edited');
  const r = inst.install(d);
  assert.ok(r.preserved.includes('.agents/rules/clear-writing.md'));
  assert.equal(fs.readFileSync(path.join(d, '.agents/rules/clear-writing.md'), 'utf8'), 'hand-copied, edited');
});

test('uninstall removes unchanged files, preserves modified and memory content, cleans dirs and excludes', () => {
  const d = gitRepo();
  inst.install(d, { memory: true });
  fs.appendFileSync(path.join(d, '.agents/memory/architecture.md'), '\nreal facts');
  fs.appendFileSync(path.join(d, '.agents/skills/github/SKILL.md'), '\nedit');
  const r = inst.uninstall(d);
  assert.ok(r.preserved.includes('.agents/memory/architecture.md'));
  assert.ok(r.preserved.includes('.agents/skills/github/SKILL.md'));
  assert.ok(!fs.existsSync(skill(d)));
  assert.ok(!fs.existsSync(path.join(d, inst.MANIFEST_REL)));
  assert.ok(!fs.existsSync(path.join(d, '.agents/skills/plan')));
  assert.ok(!exclude(d).includes('agy-toolkit'));
});

test('dry-run writes nothing', () => {
  const d = tmp();
  const r = inst.install(d, { dryRun: true });
  assert.ok(r.created.length > 0);
  assert.deepEqual(fs.readdirSync(d), []);
});

test('git exclude: appended after file without final newline, local-only artifacts ignored, no duplicates', () => {
  const d = gitRepo();
  const ex = path.join(d, '.git/info/exclude');
  fs.writeFileSync(ex, 'existing-rule'); // no trailing newline
  inst.install(d, { memory: true });
  inst.install(d, { memory: true });
  const text = exclude(d);
  assert.ok(text.startsWith('existing-rule\n'));
  assert.equal(text.split('/.agents/memory/').length, 2);
  const ignored = execFileSync('git', ['-C', d, 'status', '--porcelain', '--ignored', '-uall']).toString();
  assert.ok(!ignored.includes('?? .agents/memory'), 'memory must not show as untracked');
  assert.ok(ignored.includes('.agents/skills/plan/SKILL.md')); // kit files are shareable
});

test('git worktree: excludes go to the shared git dir location resolved by git', () => {
  const main = gitRepo();
  execFileSync('git', ['-C', main, '-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '--allow-empty', '-qm', 'init']);
  const wt = path.join(tmp(), 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt]);
  const r = inst.install(wt, { memory: true });
  assert.ok(r.exclude.file && fs.readFileSync(r.exclude.file, 'utf8').includes('/.agents/memory/'));
  const st = execFileSync('git', ['-C', wt, 'status', '--porcelain', '-uall']).toString();
  assert.ok(!st.includes('.agents/memory'));
});

test('non-git directory installs and reports no ignore rules', () => {
  const d = tmp();
  assert.equal(inst.install(d).exclude.file, null);
});

test('verify detects missing and modified files', () => {
  const d = tmp();
  assert.equal(inst.verify(d).installed, false);
  inst.install(d);
  fs.rmSync(skill(d));
  fs.appendFileSync(path.join(d, '.agents/skills/review/SKILL.md'), 'x');
  const v = inst.verify(d);
  assert.equal(v.problems.length, 1);
  assert.equal(v.modified.length, 1);
});

test('corrupt manifest does not crash install', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, '.agents'));
  fs.writeFileSync(path.join(d, inst.MANIFEST_REL), '{not json');
  assert.doesNotThrow(() => inst.install(d));
});

test('install into missing target fails clearly', () => {
  assert.throws(() => inst.install(path.join(tmp(), 'nope')), /not a directory/);
});

// ---- MCP ----
const cfgFile = () => path.join(tmp(), 'cfg', 'mcp_config.json');

test('mcp install creates config with both servers and no secrets', () => {
  const f = cfgFile();
  const r = mcp.installMcp({ file: f });
  assert.deepEqual(r.added.sort(), ['agk-github', 'agk-perplexity']);
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(!/key|token|bearer/i.test(text.replace(/PERPLEXITY|mcp-server/gi, '')));
  const cfg = JSON.parse(text);
  assert.match(cfg.mcpServers['agk-github'].url, /readonly$/);
});

test('mcp install merges, preserves other servers, makes a backup, and is idempotent', () => {
  const f = cfgFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ mcpServers: { other: { command: 'x' } }, extra: 1 }));
  mcp.installMcp({ file: f });
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(cfg.mcpServers.other.command, 'x');
  assert.equal(cfg.extra, 1);
  assert.ok(fs.existsSync(`${f}.bak`));
  const again = mcp.installMcp({ file: f });
  assert.equal(again.added.length, 0);
});

test('mcp install does not overwrite customized entry without --force; github-write and platform variants', () => {
  const f = cfgFile();
  mcp.installMcp({ file: f });
  const r1 = mcp.installMcp({ file: f, githubWrite: true });
  assert.ok(r1.skipped[0].includes('--force') || r1.skipped.some((s) => s.includes('--force')));
  const r2 = mcp.installMcp({ file: f, githubWrite: true, force: true, only: ['github'] });
  assert.deepEqual(r2.replaced, ['agk-github']);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers['agk-github'].url, 'https://api.githubcopilot.com/mcp/');
  assert.equal(mcp.servers({ platform: 'win32' })['agk-perplexity'].command, 'cmd');
  assert.equal(mcp.servers({ platform: 'linux' })['agk-perplexity'].command, 'npx');
});

test('mcp rejects invalid JSON without modifying it; uninstall removes only ours; dry-run is inert', () => {
  const f = cfgFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{bad');
  assert.throws(() => mcp.installMcp({ file: f }), /Cannot parse/);
  assert.equal(fs.readFileSync(f, 'utf8'), '{bad');

  const g = cfgFile();
  assert.equal(mcp.installMcp({ file: g, dryRun: true }).added.length, 2);
  assert.ok(!fs.existsSync(g));
  mcp.installMcp({ file: g });
  const cfg = JSON.parse(fs.readFileSync(g, 'utf8')); cfg.mcpServers.other = { url: 'https://x' };
  fs.writeFileSync(g, JSON.stringify(cfg));
  mcp.uninstallMcp({ file: g });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(g, 'utf8')).mcpServers), ['other']);
});

test('doctor reports missing env var and config without network access', async () => {
  const f = cfgFile();
  mcp.installMcp({ file: f });
  const checks = await mcp.doctorMcp({ file: f, env: {}, checkNpx: false });
  assert.equal(checks.filter((c) => !c.ok).length, 1);
  assert.ok((await mcp.doctorMcp({ file: f, env: { PERPLEXITY_API_KEY: 'x' }, checkNpx: false })).every((c) => c.ok));
});

test('cli: install/verify/uninstall and mcp via --config', async () => {
  const d = tmp(); const logs = [];
  const out = { log: (s) => logs.push(s) };
  assert.equal(await main(['install', d], out), 0);
  assert.equal(await main(['verify', d], out), 0);
  assert.equal(await main(['mcp', 'install', '--config', cfgFile(), '--only', 'github'], out), 0);
  assert.equal(await main(['uninstall', d], out), 0);
  assert.equal(await main(['verify', d], out), 1);
  assert.equal(await main(['bogus'], out), 2);
});

test('kit content is generic: no company names, credentials, or internal URLs', () => {
  const root = path.resolve(inst.ROOT);
  const bad = /smaragd|atlassian\.net|ghp_[A-Za-z0-9]{10}|sk-[A-Za-z0-9]{10}|pplx-[A-Za-z0-9]{10}/i;
  for (const dir of ['kit', 'memory-templates', 'src']) {
    for (const rel of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      const p = path.join(root, dir, rel);
      if (fs.statSync(p).isFile()) assert.ok(!bad.test(fs.readFileSync(p, 'utf8')), p);
    }
  }
});

test('every skill has name+description frontmatter matching its directory', () => {
  const dir = path.join(inst.KIT_DIR, '.agents/skills');
  for (const s of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8');
    assert.match(t, new RegExp(`^---\\r?\\nname: ${s}\\r?\\ndescription:`));
  }
});

test('always-on rules exist; STE rule follows its own sentence-length limit', () => {
  const dir = path.join(inst.KIT_DIR, '.agents/rules');
  for (const f of ['coding-principles.md', 'simplified-technical-english.md']) {
    assert.match(fs.readFileSync(path.join(dir, f), 'utf8'), /^---\r?\ntrigger: always_on\r?\n---/);
  }
  const body = fs.readFileSync(path.join(dir, 'simplified-technical-english.md'), 'utf8').split('---').slice(2).join('');
  const sentences = body.replace(/`[^`]*`|"[^"]*"|\(https?:[^)]*\)/g, 'x').split(/[.:;?!\r\n]+/).filter((s) => s.trim());
  const long = sentences.filter((s) => s.trim().split(/\s+/).length > 25);
  assert.deepEqual(long, []);
});

test('mcp copilot format: typed servers with tool allow-list, merged into existing empty config', () => {
  const f = cfgFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{\n\t"mcpServers": {}\n}');
  const r = mcp.installMcp({ file: f, format: 'copilot', platform: 'win32' });
  assert.equal(r.added.length, 2);
  const s = JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers;
  assert.deepEqual(s['agk-github'], { type: 'http', url: 'https://api.githubcopilot.com/mcp/readonly', tools: ['*'] });
  assert.equal(s['agk-perplexity'].type, 'local');
  assert.deepEqual(s['agk-perplexity'].tools, ['*']);
  assert.equal(mcp.defaultFile('copilot'), mcp.COPILOT_CONFIG);
});
