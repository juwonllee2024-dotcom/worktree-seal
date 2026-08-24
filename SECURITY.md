# Security Policy

## Scope

Worktree Seal is a local command wrapper. It does not send data to a service, manage credentials, or promise OS-level sandboxing.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose local files, bypass a seal, or execute an unexpected command. Use GitHub's private security advisory flow for this repository when available. Include:

- the Worktree Seal version and operating system;
- the exact command and repository layout;
- a minimal reproduction that does not contain secrets;
- the expected and observed behavior.

If private reporting is unavailable, open an issue containing only a high-level description and ask for a private channel. Remove tokens, private source, and personal paths from all reports.

## Security expectations

- The allowlist is a safety boundary, not a permission grant for arbitrary shell code.
- Do not run an untrusted agent command with access to secrets just because it is wrapped.
- Review `git diff` after every run.
- Keep Worktree Seal and Git updated.

