// Antigravity lifecycle hook handler (SessionStart, PreToolUse, PostToolUse, Stop).
// Reads JSON context from stdin and writes JSON decisions to stdout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CODE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs',
  '.java', '.cs', '.rb', '.php', '.c', '.cpp', '.h', '.hpp', '.sh', '.ps1',
]);

const SECRET_RE = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /pplx-[A-Za-z0-9]{20,}/,
  /sk-ant-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const DENY_CMDS = [
  /\brm\s+-[^\n]*r[^\n]*f[^\n]*\s+(\/|~|\$HOME)(\s|$)/i,
  /Remove-Item\s+[^\n]*-Recurse[^\n]*([A-Za-z]:\\|\/)\s*$/i,
  /\b(mkfs|format\s+[A-Za-z]:)\b/i,
  /\b(echo|Write-Output|printf)\b[^\n]*(PERPLEXITY_API_KEY|GITHUB_PERSONAL_ACCESS_TOKEN|GH_TOKEN)/i,
];

const ASK_CMDS = [
  /\bgit\s+push\s+[^\n]*(--force|-f\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[^\n]*f/i,
];

const TEST_CMD_RE = /\b(npm\s+(test|run\s+(test|lint|build|check))|pnpm\s+(test|run\s+(test|lint|build))|yarn\s+(test|lint|build)|node\s+--test|pytest|cargo\s+(test|check)|go\s+test|vitest|jest|eslint|tsc|ruff|mypy|flake8)\b/i;

const SENSITIVE_FILE_RE = /(?:^|[\\/])(\.env(?:\.(?!example$|template$)[^\\/.]+)?|[^\\/]+\.(?:pem|key|p12)|id_rsa|id_ed25519|mcp[-_]config\.json)$/i;

function stateFile(payload) {
  const key = payload.conversationId || payload.workspacePaths?.[0] || payload.cwd || 'default';
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `agk-hook-state-${hash}.json`);
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { editedCode: false, testedAfterEdit: false }; }
}

function writeState(file, state) {
  try { fs.writeFileSync(file, JSON.stringify(state)); } catch { /* ignore temp write errors */ }
}

function detectSessionSummary(wsRoot) {
  if (!wsRoot || !fs.existsSync(wsRoot)) return '';
  const stacks = [];
  if (fs.existsSync(path.join(wsRoot, 'package.json'))) stacks.push('Node.js');
  if (fs.existsSync(path.join(wsRoot, 'pyproject.toml')) || fs.existsSync(path.join(wsRoot, 'requirements.txt'))) stacks.push('Python');
  if (fs.existsSync(path.join(wsRoot, 'Cargo.toml'))) stacks.push('Rust');
  if (fs.existsSync(path.join(wsRoot, 'go.mod'))) stacks.push('Go');

  const memDir = path.join(wsRoot, '.agents', 'memory');
  let memNote = 'No local project memory directory.';
  if (fs.existsSync(memDir)) {
    const files = fs.readdirSync(memDir).filter((f) => f.endsWith('.md'));
    const todoCount = files.filter((f) => fs.readFileSync(path.join(memDir, f), 'utf8').includes('_TODO_')).length;
    memNote = todoCount ? `Project memory has ${todoCount} unfilled template(s).` : `Project memory is active (${files.length} file(s)).`;
  }
  const stackText = stacks.length ? `Detected stack: ${stacks.join(', ')}.` : 'Stack not detected from root manifests.';
  return `[agy-toolkit] ${stackText} ${memNote}`;
}

export function handleHook(event, payload = {}) {
  if (event === 'SessionStart') {
    const ws = payload.workspacePaths?.[0] || payload.cwd;
    const msg = detectSessionSummary(ws);
    if (!msg) return {};
    return { injectSteps: [{ systemMessage: { systemMessage: msg } }] };
  }

  if (event === 'PreToolUse') {
    const tool = payload.toolCall?.name || '';
    const args = payload.toolCall?.args || {};
    if (tool === 'run_command') {
      const cmd = String(args.CommandLine || '');
      for (const re of DENY_CMDS) {
        if (re.test(cmd)) return { decision: 'deny', reason: 'Blocked by agk-safety-gate: destructive command or secret exposure.' };
      }
      for (const re of ASK_CMDS) {
        if (re.test(cmd)) return { decision: 'force_ask', reason: 'agk-safety-gate: confirm destructive Git operation.' };
      }
    }
    if (tool === 'write_file' || tool === 'edit_file') {
      const target = String(args.Path || args.TargetFile || '');
      const text = String(args.Content || args.Replacement || '');
      for (const re of SECRET_RE) {
        if (re.test(text)) return { decision: 'deny', reason: 'Blocked by agk-safety-gate: detected secret token pattern in file content.' };
      }
      if (SENSITIVE_FILE_RE.test(target)) {
        return { decision: 'force_ask', reason: `agk-safety-gate: confirm modification to sensitive file (${path.basename(target)}).` };
      }
    }
    return {};
  }

  if (event === 'PostToolUse') {
    const tool = payload.toolCall?.name || '';
    const args = payload.toolCall?.args || {};
    const sf = stateFile(payload);
    const state = readState(sf);
    if (tool === 'write_file' || tool === 'edit_file') {
      const target = String(args.Path || args.TargetFile || '');
      const ext = path.extname(target).toLowerCase();
      if (CODE_EXTS.has(ext) && !/[\\/]\.agents[\\/]/.test(target)) {
        state.editedCode = true;
        state.testedAfterEdit = false;
        writeState(sf, state);
      }
    } else if (tool === 'run_command' && !payload.error) {
      const cmd = String(args.CommandLine || '');
      if (TEST_CMD_RE.test(cmd)) {
        state.editedCode = false;
        state.testedAfterEdit = true;
        writeState(sf, state);
      }
    }
    return {};
  }

  if (event === 'Stop') {
    if (payload.continuationActive || payload.terminationReason !== 'NO_TOOL_CALL') {
      return { decision: 'stop' };
    }
    const sf = stateFile(payload);
    const state = readState(sf);
    if (state.editedCode && !state.testedAfterEdit) {
      return {
        decision: 'continue',
        reason: 'Code files changed, and no test or check command ran afterward. Run the relevant tests or checks before finishing.',
      };
    }
    return { decision: 'stop' };
  }

  return {};
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { raw = ''; }
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }
  const event = process.argv[2] || payload.hookEventName || '';
  process.stdout.write(JSON.stringify(handleHook(event, payload)) + '\n');
}
