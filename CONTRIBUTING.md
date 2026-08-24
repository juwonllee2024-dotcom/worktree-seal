# Contributing

Thanks for helping make agent-assisted coding safer.

## Before you start

1. Open an issue for behavior changes or larger features.
2. Keep the CLI local-first and dependency-free unless there is a strong reason otherwise.
3. Do not add telemetry, credential collection, silent installation, destructive cleanup, or automatic Git writes.

## Pull requests

```bash
npm ci
npm run verify
git diff --check
```

Add or update tests for every behavior change. Keep error codes stable and machine-readable. Explain platform-specific behavior for Windows, macOS, and Linux when relevant.

