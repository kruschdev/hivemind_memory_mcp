# Advanced Topics: Krusch Memory MCP

## Database Modes & Migration

By default, Krusch Memory MCP uses SQLite. This is fast, zero-dependency, and perfect for individual developers storing thousands of memories. However, as your agent logs every interaction or file diff, you may want to migrate to PostgreSQL.

### Why Migrate to PostgreSQL?
PostgreSQL with the `pgvector` extension natively supports Hierarchical Navigable Small World (HNSW) indexing. This means that instead of a linear scan to calculate cosine similarity across every row (as SQLite does), Postgres finds the nearest neighbor instantly via the C-based index.

### How to Switch to PostgreSQL
1. Start the bundled database via Docker Compose:
   ```bash
   docker-compose up -d
   ```
2. Change your `DB_MODE` to `postgres` in the environment configuration:
   ```json
   "env": {
     "DB_MODE": "postgres",
     "DATABASE_URL": "postgres://postgres:postgres@localhost:5441/krusch_memory"
   }
   ```

*(Note: Data migration between SQLite and Postgres is currently manual. You will need to export your `krusch_memory.db` and insert it into the postgres table.)*

## Embedding & Tagging Models

Krusch Memory MCP leverages **Ollama** to ensure 100% privacy and local-first execution. The default model is `nomic-embed-text`.

### Swapping Embedding Models
If you prefer a different text embedding model (e.g., `mxbai-embed-large`), update the `EMBED_MODEL` environment variable:
```json
"env": {
  "EMBED_MODEL": "mxbai-embed-large"
}
```
**Warning**: Vector dimensions must match! If you switch embedding models, you cannot compare new vectors to old vectors. You will need to start a fresh database or re-embed your old data.

### Auto-Tagging Configurations
The MCP server can automatically tag memories via a local LLM if `AUTO_TAG=true`. By default, this uses `llama3.2`.
```json
"env": {
  "AUTO_TAG": "true",
  "TAG_MODEL": "llama3.2"
}
```

## Temporal Memory Decay

Krusch Memory MCP doesn't just treat all memory equally; it implements an **Exponential Temporal Decay** to gently lower the relevance score of older memories, mimicking human forgetfulness.

### The Math
```
Final Similarity = Base Cosine Similarity * e^(-DECAY_RATE * age_in_days)
```

By default, `DECAY_RATE` is `0.01`.
- A 30-day old memory retains ~74% of its original similarity weight.
- A 100-day old memory retains ~36% of its original similarity weight.

If you find that older architecture patterns are getting buried under newer noise, you can lower the decay rate (e.g., `0.001`), or disable it entirely by setting `DECAY_RATE=0.0`.
