---
description: Resume krusch-memory-mcp development with project-scoped context
---

# /continue — Krusch Memory MCP

## Steps

1. **Context Load (Project-Scoped)**:
   - Read `GEMINI_INFLIGHT.md` in this project root.
   - Query `mcp_homelab-memory_mcp_homelab-memory_search(category: 'activity', query: 'krusch-memory-mcp')`.
   - Query `mcp_homelab-memory_mcp_homelab-memory_search(category: 'lessons', query: 'krusch-memory-mcp pgvector embedding ollama')`.
   - Query `mcp_homelab-memory_mcp_homelab-memory_search(category: 'bugs', query: 'krusch-memory-mcp')`.
   - Query `mcp_nuggets-memory_nudges(kinds: ['project', 'user'], query: 'krusch-memory-mcp')`.
   - **Zero-Trust**: Execute `pg_git_semantic_search(project: 'krusch-agentic-mcp')` to verify codebase state.

2. **Health Checks**:
   - Verify kruschdb is reachable: `ssh kruschserv "docker exec openclaw-db psql -U openclaw -d kruschdb -c 'SELECT 1'"`.
   - Verify Ollama embedding model: `curl -s http://10.0.0.19:11434/api/tags | grep -E 'nomic-embed|qwen2.5-coder'`.
   - Run tests: `npm test`.

3. **Transient State Check**: Look for any pending schema changes or dual-DB migration work in `GEMINI_INFLIGHT.md`.

4. **Execution**: Generate `task.md` and begin work autonomously.
