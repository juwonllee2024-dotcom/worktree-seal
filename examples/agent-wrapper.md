# Agent wrapper example

The guard only applies to commands launched through it. Put it in the command your agent or task runner actually invokes:

```json
{
  "scripts": {
    "agent": "worktree-seal run -- node tools/agent-task.mjs"
  }
}
```

Prepare the repository once:

```bash
worktree-seal init
worktree-seal arm --allow src,test,docs
npm run agent
```

If the agent writes `secrets.env`, `dist/`, or another path outside the armed list, the wrapper reports `PATH_NOT_ALLOWED` and exits with status `3`. It does not delete the file; inspect and remove it deliberately.

