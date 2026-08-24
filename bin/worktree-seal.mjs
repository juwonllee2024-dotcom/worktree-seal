#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createSealConfig,
  evaluateSeal,
  normalizeAllowlist,
  parsePorcelainZ,
} from '../src/seal-engine.mjs';

const VERSION = '0.1.0';
const CONFIG_NAME = 'worktree-seal.json';

class SealError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function git(cwd, args, { optional = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    if (optional) return '';
    throw new SealError('NOT_A_GIT_WORKTREE', (result.stderr || 'Git command failed.').trim());
  }
  return String(result.stdout || '').trim();
}

function resolveCommand(command) {
  if (process.platform !== 'win32' || path.extname(command)) return command;
  const lookup = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  if (lookup.status !== 0) return command;
  const candidates = String(lookup.stdout || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const resolved = candidates.find((value) => /\.(cmd|bat|exe)$/i.test(value)) || candidates[0] || command;
  // Keep bare commands bare so a .cmd shim in a quoted PATH such as
  // "C:\\Program Files\\nodejs" can still be launched by cmd.exe.
  return path.basename(resolved);
}

function usesWindowsScriptShim(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function repoSnapshot(cwd) {
  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  const gitDirRaw = git(cwd, ['rev-parse', '--git-dir']);
  const gitDir = path.resolve(cwd, gitDirRaw);
  return {
    repoRoot,
    gitDir,
    remote: git(cwd, ['remote', 'get-url', 'origin'], { optional: true }),
    branch: git(cwd, ['branch', '--show-current'], { optional: true }),
    commit: git(cwd, ['rev-parse', 'HEAD'], { optional: true }),
    changedPaths: parsePorcelainZ(git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])),
  };
}

function configPath(snapshot) {
  return path.join(snapshot.gitDir, CONFIG_NAME);
}

function loadConfig(snapshot) {
  const filename = configPath(snapshot);
  if (!fs.existsSync(filename)) throw new SealError('SEAL_NOT_FOUND', `No seal found for this worktree. Run worktree-seal init first.`);
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new SealError('INVALID_SEAL', `Could not read ${filename}: ${error.message}`);
  }
}

function saveConfig(snapshot, config) {
  fs.writeFileSync(configPath(snapshot), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function parseArgs(args) {
  const options = { json: false, allow: [] };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--allow') options.allow.push(...String(args[++index] || '').split(','));
    else positional.push(arg);
  }
  return { options, positional };
}

function report(result, { json = false } = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.ok) {
    process.stdout.write(`SEALED ✓ ${result.repoRoot || 'workspace'}\n`);
    if (result.branch) process.stdout.write(`  branch: ${result.branch}\n`);
    if (result.allow) process.stdout.write(`  allow: ${result.allow.join(', ') || '(none)'}\n`);
    return;
  }
  process.stdout.write(`BLOCKED ✗ ${result.repoRoot || 'workspace'}\n`);
  for (const current of result.issues || []) process.stdout.write(`  ${current.code}: ${current.message}\n`);
}

function check(cwd, options = {}) {
  const snapshot = repoSnapshot(cwd);
  const config = loadConfig(snapshot);
  const result = evaluateSeal(config, snapshot);
  return { ...result, repoRoot: snapshot.repoRoot, branch: snapshot.branch, allow: config.allow };
}

function commandInit(cwd, args) {
  const snapshot = repoSnapshot(cwd);
  const filename = configPath(snapshot);
  if (fs.existsSync(filename) && !args.includes('--force')) {
    throw new SealError('SEAL_EXISTS', 'A seal already exists. Use --force only when intentionally rebinding this worktree.');
  }
  const config = createSealConfig(snapshot);
  saveConfig(snapshot, config);
  report({ ok: true, repoRoot: snapshot.repoRoot, branch: snapshot.branch, allow: config.allow });
  return 0;
}

function commandArm(cwd, parsed) {
  const snapshot = repoSnapshot(cwd);
  const config = loadConfig(snapshot);
  const allow = normalizeAllowlist(parsed.options.allow);
  if (!allow.length) throw new SealError('ALLOWLIST_REQUIRED', 'Arm the seal with at least one path, for example --allow src,test.');
  const next = { ...config, allow, armedAt: Date.now(), armedCommit: snapshot.commit };
  saveConfig(snapshot, next);
  report({ ok: true, repoRoot: snapshot.repoRoot, branch: snapshot.branch, allow });
  return 0;
}

function commandCheck(cwd, parsed) {
  const result = check(cwd, parsed.options);
  report(result, parsed.options);
  return result.ok ? 0 : 1;
}

function commandRun(cwd, args) {
  const separator = args.indexOf('--');
  if (separator < 0 || !args[separator + 1]) throw new SealError('COMMAND_REQUIRED', 'Use worktree-seal run -- your-command args.');
  const before = check(cwd, {});
  if (!before.ok) {
    report(before);
    return 2;
  }
  const command = args[separator + 1];
  const commandArgs = args.slice(separator + 2);
  const resolvedCommand = resolveCommand(command);
  const child = spawnSync(resolvedCommand, commandArgs, {
    cwd: before.repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    // Windows requires a shell to launch .cmd/.bat shims such as npm.cmd.
    // Native executables keep the safer shell:false path.
    shell: usesWindowsScriptShim(resolvedCommand),
    env: { ...process.env, WORKTREE_SEAL_ROOT: before.repoRoot, WORKTREE_SEAL_BRANCH: before.branch || '' },
  });
  const after = check(cwd, {});
  if (!after.ok) {
    report(after);
    return 3;
  }
  if (child.error) throw new SealError('COMMAND_FAILED', child.error.message);
  return Number.isInteger(child.status) ? child.status : 1;
}

function help() {
  process.stdout.write(`Worktree Seal ${VERSION}\n\nStop coding agents from editing the wrong repository or file paths.\n\nUsage:\n  worktree-seal init [--force]\n  worktree-seal arm --allow src,test\n  worktree-seal check [--json]\n  worktree-seal run -- command args...\n\nThe seal is stored inside this worktree's .git directory and never changes tracked files.\n`);
}

function main(argv) {
  const [command = 'help', ...rest] = argv;
  if (command === '--version' || command === '-v') { process.stdout.write(`${VERSION}\n`); return 0; }
  if (command === 'help' || command === '--help' || command === '-h') { help(); return 0; }
  const parsed = parseArgs(rest);
  const cwd = process.cwd();
  if (command === 'init') return commandInit(cwd, rest);
  if (command === 'arm') return commandArm(cwd, parsed);
  if (command === 'check') return commandCheck(cwd, parsed);
  if (command === 'run') return commandRun(cwd, rest);
  throw new SealError('UNKNOWN_COMMAND', `Unknown command: ${command}`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const code = error instanceof SealError ? error.code : 'UNEXPECTED_ERROR';
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
