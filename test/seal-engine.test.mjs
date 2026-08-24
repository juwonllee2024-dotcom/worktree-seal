import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSealConfig,
  evaluateSeal,
  parsePorcelainZ,
  pathAllowed,
} from '../src/seal-engine.mjs';

const config = createSealConfig({
  repoRoot: 'C:\\work\\demo',
  remote: 'https://github.com/example/demo.git',
  branch: 'main',
  commit: 'abc123',
  allow: ['src', 'test'],
  createdAt: 100,
});

test('seal config records one workspace identity and a narrow allowlist', () => {
  assert.equal(config.version, 1);
  assert.equal(config.repoRoot, 'C:\\work\\demo');
  assert.deepEqual(config.allow, ['src', 'test']);
  assert.equal(pathAllowed('src/app.js', config.allow), true);
  assert.equal(pathAllowed('src/../secrets.env', config.allow), false);
  assert.equal(pathAllowed('docs/plan.md', config.allow), false);
});

test('porcelain-z status parsing keeps spaces and rename targets intact', () => {
  const status = ` M src/app.js\0?? test/new case.js\0R  old.js\0src/new.js\0`;
  assert.deepEqual(parsePorcelainZ(status), ['src/app.js', 'test/new case.js', 'src/new.js']);
});

test('matching root, remote, branch, and allowed diff passes the seal', () => {
  const result = evaluateSeal(config, {
    repoRoot: 'C:\\work\\demo',
    remote: 'https://github.com/example/demo',
    branch: 'main',
    commit: 'abc123',
    changedPaths: ['src/app.js', 'test/app.test.mjs'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('wrong workspace and disallowed files fail loudly with machine-readable reasons', () => {
  const result = evaluateSeal(config, {
    repoRoot: 'C:\\work\\other',
    remote: 'https://github.com/example/demo',
    branch: 'feature/wrong',
    commit: 'different',
    changedPaths: ['docs/leak.md'],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    'ROOT_MISMATCH',
    'BRANCH_MISMATCH',
    'COMMIT_MISMATCH',
    'PATH_NOT_ALLOWED',
  ]);
});
