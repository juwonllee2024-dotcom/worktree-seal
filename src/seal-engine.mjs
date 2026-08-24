export const SEAL_VERSION = 1;

export function normalizeRemote(value = '') {
  return String(value || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

export function normalizeRelativePath(value = '') {
  const raw = String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!raw || raw === '.' || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return '';
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..')) return '';
  return parts.join('/');
}

export function normalizeAllowlist(values = []) {
  const list = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(list.map(normalizeRelativePath).filter(Boolean))].sort();
}

export function pathAllowed(value, allow = []) {
  const relative = normalizeRelativePath(value);
  if (!relative) return false;
  const normalized = normalizeAllowlist(allow);
  return normalized.some((entry) => entry === '.' || relative === entry || relative.startsWith(`${entry}/`));
}

export function createSealConfig({ repoRoot, remote = '', branch = '', commit = '', allow = [], createdAt = Date.now() } = {}) {
  return {
    version: SEAL_VERSION,
    repoRoot: String(repoRoot || ''),
    remote: normalizeRemote(remote),
    branch: String(branch || ''),
    commit: String(commit || ''),
    allow: normalizeAllowlist(allow),
    createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : Date.now(),
  };
}

export function parsePorcelainZ(output = '') {
  const tokens = String(output || '').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index];
    const status = record.slice(0, 2);
    const firstPath = record.slice(3);
    if (!firstPath) continue;
    if (status.includes('R') || status.includes('C')) {
      const target = tokens[index + 1];
      if (target) {
        paths.push(target);
        index += 1;
      }
      continue;
    }
    paths.push(firstPath);
  }
  return paths.map(normalizeRelativePath).filter(Boolean);
}

function canonicalRoot(value) {
  const resolved = String(value || '').replaceAll('/', '\\').replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function issue(code, message, expected, actual) {
  return { code, message, expected, actual };
}

export function evaluateSeal(config, snapshot = {}) {
  const issues = [];
  if (!config || config.version !== SEAL_VERSION) {
    issues.push(issue('INVALID_SEAL', 'Seal metadata is missing or uses an unsupported version.', SEAL_VERSION, config?.version));
    return { ok: false, issues };
  }
  if (canonicalRoot(config.repoRoot) !== canonicalRoot(snapshot.repoRoot)) {
    issues.push(issue('ROOT_MISMATCH', 'Current git root is not the sealed workspace.', config.repoRoot, snapshot.repoRoot));
  }
  if (config.remote && normalizeRemote(config.remote) !== normalizeRemote(snapshot.remote)) {
    issues.push(issue('REMOTE_MISMATCH', 'Current origin remote is not the sealed repository.', config.remote, snapshot.remote));
  }
  if (config.branch && config.branch !== String(snapshot.branch || '')) {
    issues.push(issue('BRANCH_MISMATCH', 'Current branch is not the sealed branch.', config.branch, snapshot.branch));
  }
  if (config.commit && config.commit !== String(snapshot.commit || '')) {
    issues.push(issue('COMMIT_MISMATCH', 'HEAD moved after the workspace was sealed.', config.commit, snapshot.commit));
  }
  for (const changedPath of snapshot.changedPaths || []) {
    if (!pathAllowed(changedPath, config.allow)) {
      issues.push(issue('PATH_NOT_ALLOWED', `Changed path is outside the armed allowlist: ${changedPath}`, config.allow, changedPath));
    }
  }
  return { ok: issues.length === 0, issues };
}
