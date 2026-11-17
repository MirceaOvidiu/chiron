// Checks Markdown documents against the toolkit's Simplified Technical English (STE) guidelines.
// Reports sentence length (> 20 words in instructions, > 25 in prose), contractions, and banned verbs.
import fs from 'node:fs';
import path from 'node:path';

const CONTRACTION_RE = /\b(don't|doesn't|didn't|won't|wouldn't|can't|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|it's|that's|there's|what's|you're|we're|they're|i'm|let's)\b/i;
const DISCOURAGED_RE = /\b(utilize|utilizes|utilized|utilizing|initiate|initiates|initiated|leverage|leverages|leveraged)\b/i;

function stripFrontmatter(text) {
  return text.startsWith('---\n') || text.startsWith('---\r\n')
    ? text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    : text;
}

function cleanLine(line) {
  return line
    .replace(/`[^`]*`/g, 'code')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'url')
    .replace(/"[^"]*"/g, 'quote');
}

export function checkSteText(text, label = '<input>') {
  const issues = [];
  const lines = stripFrontmatter(text).split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('<!--') || trimmed === '---') continue;

    const isInstruction = /^([-*]|\d+\.)\s+/.test(trimmed);
    const cleaned = cleanLine(trimmed.replace(/^([-*]|\d+\.)\s+/, '').replace(/^>\s*/, ''));
    const limit = isInstruction ? 20 : 25;

    const con = cleaned.match(CONTRACTION_RE);
    if (con) issues.push({ file: label, line: i + 1, rule: 'no-contractions', detail: `Contraction "${con[0]}"` });

    const verb = cleaned.match(DISCOURAGED_RE);
    if (verb) issues.push({ file: label, line: i + 1, rule: 'simple-verbs', detail: `Use simpler verb instead of "${verb[0]}"` });

    for (const part of cleaned.split(/[.!?]+(?:\s|$)/)) {
      const words = part.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
      if (words.length > limit) {
        issues.push({ file: label, line: i + 1, rule: 'sentence-length', detail: `${words.length} words (limit ${limit})` });
      }
    }
  }
  return issues;
}

export function checkStePaths(targets) {
  const files = [];
  const collect = (p) => {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) throw new Error(`Path not found: ${p}`);
    if (fs.statSync(abs).isFile()) { if (abs.endsWith('.md')) files.push(abs); return; }
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      collect(path.join(abs, e.name));
    }
  };
  for (const t of targets) collect(t);
  return files.flatMap((f) => checkSteText(fs.readFileSync(f, 'utf8'), f));
}
