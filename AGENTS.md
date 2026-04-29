# Krusch Memory MCP - Agent Context

This file provides architectural context and rules for any AI agent or LLM operating within this repository. 

## Project Overview
This repository contains a standalone **Model Context Protocol (MCP)** server. Its primary function is to provide IDEs (like Cursor, Claude Desktop, or VS Code) with persistent semantic memory using vector embeddings. 

## Architecture & Rules

1. **The MCP SDK**: All communication must strictly adhere to the official `@modelcontextprotocol/sdk`. We use `StdioServerTransport` for all I/O.
2. **Dual-Database Support**: The core functionality must unconditionally support two distinct database modes via the `DB_MODE` environment variable:
   - `sqlite` (Default): Uses a local `.db` file and raw Javascript cosine similarity math. DO NOT try to import `sqlite-vss` or any C-extensions. Keep the mathematical fallback lightweight.
   - `postgres`: Uses `pgvector` for enterprise scale (HNSW indexing).
3. **Embeddings Strategy**: This project explicitly avoids hardcoded cloud APIs (like OpenAI or Google) to remain local-first. We rely on a local `Ollama` instance (usually `http://localhost:11434/api/embeddings`) using the `nomic-embed-text` model. Any changes to the `embedText()` function must preserve this localized architecture.
4. **Environment Variables**: Always use `dotenv` and provide safe fallbacks for all connections.

## Development Workflows
- If adding a new capability, ensure it is exposed via the `ListToolsRequestSchema`.
- Always return explicit, human-readable strings inside the `content: [{ type: "text", text: ... }]` response block for `CallToolRequestSchema`. 

## Hazards
- **NEVER** log sensitive embeddings or massive vector arrays to `console.log()` as it will saturate the `stdio` pipe and crash the MCP transport. Error logs should only use `console.error()`.

## 🤖 Agent Enforcement Patterns (For End-Users)

If you are using Krusch Memory MCP in your own projects, you should strictly enforce its usage through workspace rules and standardized folders to maximize context retention.

### 1. The Workspace Zero-Trust Rule
To prevent your agent from suffering from "Goldfish Memory" or confidently hallucinating outdated context, add a **Zero-Trust Verification** rule to your global AI instructions (e.g., `.cursorrules` or Claude Desktop's Global System Prompt):

> **### 🛑 ZERO-TRUST CONTEXT VERIFICATION**
> Before executing a research task, writing code, or answering architectural questions in a new session, you MUST independently execute a Vector Database query to pull the latest codebase realities. 
> **Execution:** You must physically execute the `search_memory` tool for `priorities`, `bugs`, or `lessons` related to the current topic. If you proceed without querying memory first, you are violating the core partnership agreement.

### 2. The `.agent/` Directory Structure
Instead of polluting the project root with dozens of markdown files, agents should store their custom workflows and rules in a dedicated `.agent/` folder. A standard implementation using Krusch Memory looks like this:

- `.agent/rules/project-rules.md` — A single distilled file containing strict project-specific constraints (e.g., framework versions, styling rules).
- `.agent/workflows/close.md` — Step-by-step instructions for the `/close` workflow (dictates exactly when and how the agent should call the `add_memory` tool to document bugs and outcomes).
- `.agent/workflows/continue.md` — Step-by-step instructions for the `/continue` workflow (dictates exactly how the agent should read the `INFLIGHT.md` state file and call `search_memory`).
- `.agent/workflows/maintenance.md` — Instructions for memory maintenance. When memories become too bloated or redundant, the agent should proactively call `consolidate_memories` to merge overlapping facts, or `delete_memory`/`update_memory` to prune invalid architectural assumptions.
- `.agent/skills/` — Custom markdown files acting as specialized tools or execution wrappers for the project.
