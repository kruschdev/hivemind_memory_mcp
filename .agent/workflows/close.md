---
description: Pause krusch-memory-mcp and save semantic state
---

# /close — Krusch Memory MCP

## Steps

1. **Semantic Snapshot**:
   ```bash
   node /home/kruschdev/homelab/projects/pg-git/scripts/sync_to_pg.js /home/kruschdev/homelab/projects/krusch-memory-mcp
   ```

2. **Update GEMINI_INFLIGHT.md**:
   - Create or overwrite `GEMINI_INFLIGHT.md` in this project root.
   - Include: DB_MODE context (sqlite vs postgres), any pending schema migrations, Ollama embedding model status.

3. **Log Activity**:
   - Execute `mcp_homelab-memory_mcp_homelab-memory_add` with `category: 'activity'` and content: `[krusch-memory-mcp] <description>`.

4. **Save Steering Facts**:
   - Store any new patterns via `mcp_nuggets-memory_remember` with `kind: 'project'`, key prefixed `krusch-memory-mcp:`.

5. **Summarize**: 
   > "Memory MCP state saved. See you next session."
