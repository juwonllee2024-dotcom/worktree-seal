import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'worktree-seal.mjs');

function run(cwd, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-seal-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Worktree Seal Test'], { cwd });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/demo.git'], { cwd });
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'src', 'app.js'), 'export const answer = 42;\n');
  execFileSync('git', ['add', '.'], { cwd });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd });
  return cwd;
}

test('CLI seals, arms, and checks a clean worktree', () => {
  const cwd = fixture();
  assert.equal(run(cwd, ['init']).status, 0);
  assert.equal(run(cwd, ['arm', '--allow', 'src,test']).status, 0);
  const check = run(cwd, ['check', '--json']);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).ok, true);
});

test('CLI blocks a command whose post-run diff escapes the armed paths', () => {
  const cwd = fixture();
  assert.equal(run(cwd, ['init']).status, 0);
  assert.equal(run(cwd, ['arm', '--allow', 'src,test']).status, 0);
  const result = run(cwd, ['run', '--', process.execPath, '-e', "require('fs').writeFileSync('docs-leak.md','wrong root')"]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /PATH_NOT_ALLOWED|blocked/i);
});

test('CLI refuses to run from a different repository after the seal is created', () => {
  const cwd = fixture();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-seal-other-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: other });
  assert.equal(run(cwd, ['init']).status, 0);
  const result = run(other, ['check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /SEAL_NOT_FOUND|ROOT_MISMATCH|seal/i);
});

test('CLI can launch the platform command shim used by package scripts', { skip: process.platform !== 'win32' }, () => {
  const cwd = fixture();
  assert.equal(run(cwd, ['init']).status, 0);
  assert.equal(run(cwd, ['arm', '--allow', 'src']).status, 0);
  const result = run(cwd, ['run', '--', 'npm', '--version']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
});
