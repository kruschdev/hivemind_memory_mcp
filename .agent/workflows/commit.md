---
description: Commit krusch-memory-mcp changes and push to GitHub
---

# /commit — Krusch Memory MCP

> krusch-memory-mcp has its own git remote (`kruschdev/krusch_memory_mcp`) separate from the homelab monorepo.

## Steps

// turbo-all

0. **Session close gate** — Run this project's `/close` if not already done.

1. Check current state:
```bash
git status
git diff --stat
```

2. Review the actual changes:
```bash
git diff
```

3. Summarize what changed and why.

4. Suggest a conventional commit message using `type(scope): description`.

5. Wait for user approval.

6. **Semantic Sync**: Update pg-git embeddings for this project.
```bash
node /home/kruschdev/homelab/projects/pg-git/scripts/sync_to_pg.js .
```

7. Stage, commit, and push:
```bash
git add -A
git commit -m "<approved message>"
git push origin main
```
