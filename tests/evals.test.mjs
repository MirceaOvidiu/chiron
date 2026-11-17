import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as inst from '../src/installer.mjs';
import * as scanner from '../src/scanner.mjs';
import * as plugin from '../src/plugin.mjs';
import * as exp from '../src/export.mjs';
import * as ste from '../src/ste-check.mjs';
import { main } from '../src/cli.mjs';
import { handleHook } from '../kit/.agents/scripts/hooks.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agk-eval-'));

test('MIT LICENSE file exists', () => {
  const text = fs.readFileSync(path.join(inst.ROOT, 'LICENSE'), 'utf8');
  assert.match(text, /MIT License/);
  assert.match(text, /Permission is hereby granted, free of charge/);
});

test('profile minimal installs only rules and core skills, without hooks or agents', () => {
  const d = tmp();
  inst.install(d, { profile: 'minimal' });
  assert.ok(fs.existsSync(path.join(d, '.agents/rules/coding-principles.md')));
  assert.ok(fs.existsSync(path.join(d, '.agents/skills/plan/SKILL.md')));
  assert.ok(!fs.existsSync(path.join(d, '.agents/hooks.json')));
  assert.ok(!fs.existsSync(path.join(d, '.agents/agents/agk-reviewer.md')));
  assert.ok(!fs.existsSync(path.join(d, '.agents/skills/github/SKILL.md')));
});

test('scanner discovers stack, preserves user notes, and detects staleness', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }));
  fs.mkdirSync(path.join(d, 'src'));
  inst.install(d, { memory: true });
  fs.appendFileSync(path.join(d, '.agents/memory/architecture.md'), '\nUser custom note: keep this.\n');

  const res = scanner.applyScan(d);
  assert.ok(res.stacks.includes('Node.js'));
  const arch = fs.readFileSync(path.join(d, '.agents/memory/architecture.md'), 'utf8');
  assert.match(arch, /User custom note: keep this\./);
  assert.match(arch, /Auto-discovered summary/);
  assert.equal(scanner.checkMemoryFreshness(d).stale, false);

  // Changing package.json marks memory stale until next scan.
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'vitest' } }));
  assert.equal(scanner.checkMemoryFreshness(d).stale, true);
  assert.equal(await main(['verify', d], { log() {} }), 0);
});

test('plugin build creates valid Antigravity plugin bundle with allowed fields only', () => {
  const out = path.join(tmp(), 'agy-toolkit');
  const dry = plugin.buildPlugin(out, { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.ok(!fs.existsSync(out));

  plugin.buildPlugin(out);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'plugin.json'), 'utf8'));
  const allowed = new Set(['name', 'description', 'logo', 'suggestedPrompts', 'displayName', 'version', 'author', 'homepage', 'repository', 'disabled']);
  for (const k of Object.keys(manifest)) assert.ok(allowed.has(k), `Unexpected plugin.json key: ${k}`);
  assert.ok(fs.existsSync(path.join(out, 'rules/AGENTS.md')));
  assert.ok(fs.existsSync(path.join(out, 'skills/plan/SKILL.md')));
  assert.ok(fs.existsSync(path.join(out, 'agents/agk-reviewer.md')));
  assert.ok(fs.existsSync(path.join(out, 'hooks.json')));
  assert.ok(fs.existsSync(path.join(out, 'scripts/hooks.mjs')));
  assert.ok(fs.existsSync(path.join(out, 'mcp_config.json')));
});

test('export generates single-file rules and refuses overwrite without --force', () => {
  const d = tmp();
  const r = exp.exportInstructions(d, { format: 'claude' });
  assert.ok(fs.existsSync(r.dest));
  assert.match(fs.readFileSync(r.dest, 'utf8'), /Simplified Technical English/);
  assert.throws(() => exp.exportInstructions(d, { format: 'claude' }), /already exists/);
  exp.exportInstructions(d, { format: 'claude', force: true });
  const cop = exp.exportInstructions(d, { format: 'copilot' });
  assert.ok(cop.dest.endsWith(path.join('.github', 'copilot-instructions.md')));
});

test('STE checker catches violations and passes all kit files', () => {
  const bad = 'We should utilize this tool to fix it.\n- Do not forget that instructions must always stay short and clear so readers never get confused when reading more than twenty-five words in one line.';
  const issues = ste.checkSteText(bad, 'sample.md');
  assert.ok(issues.some((i) => i.rule === 'simple-verbs'));
  assert.ok(issues.some((i) => i.rule === 'sentence-length'));
  assert.deepEqual(ste.checkStePaths([inst.KIT_DIR]), []);
});

test('hook evals: safety gate blocks secrets/destructive commands and verify gate enforces tests', () => {
  const ws = tmp();
  fs.writeFileSync(path.join(ws, 'package.json'), '{"name":"eval"}');
  const start = handleHook('SessionStart', { workspacePaths: [ws] });
  assert.match(start.injectSteps[0].systemMessage.systemMessage, /Node\.js/);

  // Secret token leak in write_file -> deny
  const leak = handleHook('PreToolUse', { toolCall: { name: 'write_file', args: { Path: 'a.js', Content: 'const t = "ghp_1234567890abcdefghij123456";' } } });
  assert.equal(leak.decision, 'deny');

  // Force push -> force_ask
  const forcePush = handleHook('PreToolUse', { toolCall: { name: 'run_command', args: { CommandLine: 'git push --force origin main' } } });
  assert.equal(forcePush.decision, 'force_ask');

  // Sensitive .env edit -> force_ask, but .env.example is ignored
  assert.equal(handleHook('PreToolUse', { toolCall: { name: 'write_file', args: { Path: '.env', Content: 'PORT=3000' } } }).decision, 'force_ask');
  assert.deepEqual(handleHook('PreToolUse', { toolCall: { name: 'write_file', args: { Path: '.env.example', Content: 'PORT=3000' } } }), {});

  // PostToolUse + Stop verification loop
  const convId = `eval-${Date.now()}`;
  handleHook('PostToolUse', { conversationId: convId, toolCall: { name: 'edit_file', args: { Path: path.join(ws, 'src/app.js') } } });
  const stopBlocked = handleHook('Stop', { conversationId: convId, terminationReason: 'NO_TOOL_CALL', continuationActive: false });
  assert.equal(stopBlocked.decision, 'continue');

  // Never loop when continuationActive is true
  const stopLoopGuard = handleHook('Stop', { conversationId: convId, terminationReason: 'NO_TOOL_CALL', continuationActive: true });
  assert.equal(stopLoopGuard.decision, 'stop');

  // Running tests clears the gate
  handleHook('PostToolUse', { conversationId: convId, toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } });
  const stopOk = handleHook('Stop', { conversationId: convId, terminationReason: 'NO_TOOL_CALL', continuationActive: false });
  assert.equal(stopOk.decision, 'stop');
});

test('hook CLI subprocess executes hooks.json command cleanly', () => {
  const hooksCfg = JSON.parse(fs.readFileSync(path.join(inst.KIT_DIR, '.agents/hooks.json'), 'utf8'));
  assert.ok(hooksCfg['agk-safety-gate'] && hooksCfg['agk-verify-gate'] && hooksCfg['agk-session-context']);
  const out = execFileSync('node', ['./scripts/hooks.mjs', 'PreToolUse'], {
    cwd: path.join(inst.KIT_DIR, '.agents'),
    input: JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git reset --hard' } } }),
  }).toString();
  assert.equal(JSON.parse(out).decision, 'force_ask');
});

test('subagent definitions and skill routing evals', () => {
  const agentsDir = path.join(inst.KIT_DIR, '.agents/agents');
  for (const name of ['agk-reviewer', 'agk-researcher']) {
    const raw = fs.readFileSync(path.join(agentsDir, `${name}.md`), 'utf8');
    assert.match(raw, new RegExp(`name: ${name}`));
    assert.match(raw, /subagent: true/);
    assert.match(raw, /mainAgent: false/);
    assert.match(raw, /tools: \[/);
  }
  const routes = [
    ['plan', /plan|scope|design/i],
    ['implement', /implement|fix|refactor/i],
    ['review', /review|diff|pull request/i],
    ['commit-prep', /commit/i],
    ['github', /github|issues|pull requests/i],
    ['perplexity-research', /up-to-date|documentation|research/i],
    ['project-memory', /architecture|conventions|decisions|memory/i],
  ];
  for (const [skill, re] of routes) {
    const text = fs.readFileSync(path.join(inst.KIT_DIR, '.agents/skills', skill, 'SKILL.md'), 'utf8');
    assert.match(text, re, `Skill ${skill} description missing expected routing keywords`);
  }
});
