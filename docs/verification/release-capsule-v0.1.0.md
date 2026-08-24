# Verification record — v0.1.0

This record is generated from a clean checkout of the release commit.

## Commands

| Check | Result |
| --- | --- |
| `npm ci` | ✅ pass; no dependencies installed |
| `npm run verify` | ✅ pass; 8 tests passed and both source files passed `node --check` |
| `npm audit --audit-level=high` | ✅ pass; 0 vulnerabilities |
| `git diff --check` | ✅ pass |
| package smoke test | ✅ pass; packed tarball installed in a clean temp prefix and printed `0.1.0` |

## End-to-end behavior

- Input: `worktree-seal init`, then `worktree-seal arm --allow src,test`, then `worktree-seal run -- <command>`.
- Expected safe result: the command runs only when root, remote, branch, commit, and changed paths match the seal.
- Expected blocked result: a new `docs-leak.md` produces `PATH_NOT_ALLOWED` and a non-zero exit status.

## Artifact

The release tarball is `worktree-seal-0.1.0.tgz`.

SHA-256: `8f5963a55854822099aba22229aee57c18bd08d909695472e2eea8febd6eed4c`

The verification record is intentionally excluded from the npm tarball so this checksum remains reproducible.
