#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import pkg from 'pg';
const { Pool } = pkg;
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configuration
const DB_MODE = process.env.DB_MODE || "sqlite"; // "sqlite" or "postgres"
const PG_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5441/krusch_memory";
const SQLITE_FILE = process.env.SQLITE_FILE || "./krusch_memory.db";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";
const AUTO_TAG = process.env.AUTO_TAG === "true";
const TAG_MODEL = process.env.TAG_MODEL || "llama3.2";
const SUMMARIZE_MODEL = process.env.SUMMARIZE_MODEL || TAG_MODEL;
const DECAY_RATE = parseFloat(process.env.DECAY_RATE || "0.01");

let pgPool = null;
let sqliteDb = null;

/**
 * Initialize Database Connection based on DB_MODE
 */
async function initDb() {
  if (DB_MODE === 'postgres') {
    pgPool = new Pool({ connectionString: PG_URL });
    try {
      await pgPool.query(`ALTER TABLE krusch_memory ADD COLUMN project VARCHAR(255)`);
    } catch (e) {
      // Ignore if column already exists
    }
    console.error(`[ide-memory-mcp] Connected to PostgreSQL at ${PG_URL}`);
  } else {
    sqliteDb = await open({
      filename: SQLITE_FILE,
      driver: sqlite3.Database
    });
    // Create sqlite schema if not exists
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS krusch_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Safe schema migration for older sqlite files
    try {
      await sqliteDb.exec(`ALTER TABLE krusch_memory ADD COLUMN tags TEXT`);
    } catch (e) {
      // Ignore if column already exists
    }
    try {
      await sqliteDb.exec(`ALTER TABLE krusch_memory ADD COLUMN project TEXT`);
    } catch (e) {
      // Ignore if column already exists
    }
    
    console.error(`[krusch-memory-mcp] Connected to local SQLite at ${SQLITE_FILE}`);
  }
}

/**
 * Generate embeddings using a local Ollama instance.
 */
async function embedText(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text
      })
    });
    
    if (!res.ok) {
      throw new Error(`Ollama API returned ${res.status}`);
    }
    
    const data = await res.json();
    return data.embedding; // Returns raw JS array
  } catch (err) {
    throw new Error(`Embedding Generation Failed: Make sure Ollama is running and '${EMBED_MODEL}' is pulled. Error: ${err.message}`);
  }
}

/**
 * Generate tags using Ollama if AUTO_TAG is true.
 */
async function generateTags(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TAG_MODEL,
        prompt: `Extract 3 to 5 concise keywords or tags from the following text. Respond ONLY with a comma-separated list of tags, nothing else.\n\nText: "${text}"`,
        stream: false
      })
    });
    
    if (!res.ok) {
      throw new Error(`Ollama Tag Generation returned ${res.status}`);
    }
    
    const data = await res.json();
    // Split by comma, trim whitespace
    const tags = data.response.split(',').map(t => t.trim()).filter(t => t.length > 0);
    return JSON.stringify(tags);
  } catch (err) {
    console.error(`[Krusch Memory] Warning: Tag generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Summarize memories using Ollama.
 */
async function summarizeMemories(texts) {
  const combined = texts.map((t, i) => `[Memory ${i+1}]: ${t}`).join('\n\n');
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SUMMARIZE_MODEL,
        prompt: `You are an AI assistant managing your own episodic memory. Review the following related memories and consolidate them into a single, concise memory. Merge new facts, remove outdated or redundant information, and keep all important technical details. Do not include introductory text, just the consolidated memory.\n\nMemories to consolidate:\n${combined}`,
        stream: false
      })
    });
    
    if (!res.ok) {
      throw new Error(`Ollama Generation returned ${res.status}`);
    }
    
    const data = await res.json();
    return data.response.trim();
  } catch (err) {
    throw new Error(`Summarization failed: ${err.message}`);
  }
}

/**
 * Cosine Similarity for SQLite array comparisons
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / Math.sqrt(normA * normB);
}

// Setup MCP Server
const server = new Server({ name: "krusch-memory-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_memory",
        description: "Add a new fact or memory to the persistent IDE database. Use this strictly to document bugs, priorities, lessons, or project outcomes.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Optional. The name of the current project (e.g., 't3code-dbos'). Helps prevent cross-project memory confusion." },
            category: { type: "string", enum: ['priorities', 'bugs', 'outcomes', 'lessons', 'activity'] },
            content: { type: "string" },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags. If omitted and AUTO_TAG is true, tags will be generated automatically." }
          },
          required: ["category", "content"]
        }
      },
      {
        name: "health_check",
        description: "Verify that the Krusch Memory MCP server is alive and functioning.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "search_memory",
        description: "Search the persistent IDE database for past lessons, bugs, priorities, or project outcomes via semantic embeddings.",
        inputSchema: {
          type: "object",
          properties: {
            active_project: { type: "string", description: "Optional. The name of the current project. Memories from this project will receive a slight relevance boost." },
            category: { type: "string", enum: ['priorities', 'bugs', 'outcomes', 'lessons', 'activity'] },
            query: { type: "string" },
            limit: { type: "number", default: 3 }
          },
          required: ["category", "query"]
        }
      },
      {
        name: "delete_memory",
        description: "Delete a specific memory from the database by its ID. Use this to prune outdated or incorrect memories.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "The ID of the memory to delete (returned from search_memory)." }
          },
          required: ["id"]
        }
      },
      {
        name: "update_memory",
        description: "Update the content of an existing memory by its ID. Will re-compute embeddings and tags.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "The ID of the memory to update." },
            content: { type: "string", description: "The new content for the memory." },
            tags: { type: "array", items: { type: "string" }, description: "Optional explicit tags." }
          },
          required: ["id", "content"]
        }
      },
      {
        name: "consolidate_memories",
        description: "Fetch all memories for a specific category (and optional project), use an LLM to summarize them into a single concise memory, and replace the old ones. Use this to prevent vector DB bloat.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", enum: ['priorities', 'bugs', 'outcomes', 'lessons', 'activity'] },
            project: { type: "string", description: "Optional. Limit consolidation to a specific project." }
          },
          required: ["category"]
        }
      }
    ]
  };
});

// Tool Call Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  
  try {
    if (request.params.name === "add_memory") {
      const { category, content, tags, project } = args;
      if (!category || !content) throw new McpError(ErrorCode.InvalidParams, "Missing params");

      const embeddingArray = await embedText(content);
      
      let finalTags = tags ? JSON.stringify(tags) : null;
      if (!finalTags && AUTO_TAG) {
        finalTags = await generateTags(content);
      }
      
      console.error(`[Krusch Memory] 📝 Storing new memory in category: ${category}...`);
      
      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          const embeddingStr = `[${embeddingArray.join(',')}]`;
          await client.query(`
            INSERT INTO krusch_memory (project, category, content, embedding, tags)
            VALUES ($1, $2, $3, $4::vector, $5)
          `, [project || null, category, content, embeddingStr, finalTags]);
        } finally {
          client.release();
        }
      } else {
        await sqliteDb.run(`
          INSERT INTO krusch_memory (project, category, content, embedding, tags)
          VALUES (?, ?, ?, ?, ?)
        `, [project || null, category, content, JSON.stringify(embeddingArray), finalTags]);
      }

      console.error(`[Krusch Memory] ✅ Successfully stored memory.`);
      return { content: [{ type: "text", text: `[Krusch Memory] ✅ Successfully saved memory to category: ${category}` }] };

    } else if (request.params.name === "search_memory") {
      const { category, query: searchQuery, limit = 3, active_project } = args;
      if (!category || !searchQuery) throw new McpError(ErrorCode.InvalidParams, "Missing params");

      console.error(`[Krusch Memory] 🔍 Searching category '${category}' for: "${searchQuery}"...`);

      const embeddingArray = await embedText(searchQuery);

      let results = [];
      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          const embeddingStr = `[${embeddingArray.join(',')}]`;
          const res = await client.query(`
            WITH semantic_matches AS (
              SELECT id, project, content, tags, created_at, embedding <=> $1::vector as distance
              FROM krusch_memory
              WHERE category = $2
              ORDER BY embedding <=> $1::vector
              LIMIT 100
            )
            SELECT 
              id,
              project,
              content, 
              tags, 
              created_at,
              ((1 - distance) + CASE WHEN project = $5 THEN 0.1 ELSE 0 END) * exp(-$4::float * EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/86400) as similarity
            FROM semantic_matches
            ORDER BY similarity DESC
            LIMIT $3
          `, [embeddingStr, category, limit, DECAY_RATE, active_project || null]);
          results = res.rows;
        } finally {
          client.release();
        }
      } else {
        const rows = await sqliteDb.all(`SELECT id, project, content, tags, created_at, embedding FROM krusch_memory WHERE category = ?`, [category]);
        const now = new Date();
        const scoredRows = rows.map(r => {
          const dbVec = JSON.parse(r.embedding);
          const createdAt = new Date(r.created_at);
          const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);
          const baseSimilarity = cosineSimilarity(embeddingArray, dbVec) + (active_project && r.project === active_project ? 0.1 : 0);
          const similarity = baseSimilarity * Math.exp(-DECAY_RATE * ageInDays);
          return {
            id: r.id,
            project: r.project,
            content: r.content,
            tags: r.tags,
            created_at: r.created_at,
            similarity: similarity
          };
        });
        scoredRows.sort((a, b) => b.similarity - a.similarity);
        results = scoredRows.slice(0, limit);
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `=== 🧠 Memory Retrieval: ${category} ===\n\nNo results found.` }] };
      }

      let output = `=== 🧠 Memory Retrieval: ${category} ===\n`;
      for (const r of results) {
        let tagsStr = '';
        if (r.tags) {
          try { tagsStr = ` [Tags: ${JSON.parse(r.tags).join(', ')}]`; } catch(e) {}
        }
        const dateStr = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'unknown';
        const projectStr = r.project ? ` | Project: ${r.project}` : '';
        output += `\n--- Match (Score: ${Number(r.similarity).toFixed(2)}) | ID: ${r.id} | Date: ${dateStr}${projectStr}${tagsStr} ---\n${r.content}\n`;
      }
      return { content: [{ type: "text", text: output }] };

    } else if (request.params.name === "delete_memory") {
      const { id } = args;
      if (!id) throw new McpError(ErrorCode.InvalidParams, "Missing memory ID");
      
      console.error(`[Krusch Memory] 🗑️ Deleting memory ID: ${id}...`);
      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          const res = await client.query(`DELETE FROM krusch_memory WHERE id = $1`, [id]);
          if (res.rowCount === 0) return { content: [{ type: "text", text: `[Krusch Memory] ⚠️ Memory ID ${id} not found.` }] };
        } finally {
          client.release();
        }
      } else {
        const res = await sqliteDb.run(`DELETE FROM krusch_memory WHERE id = ?`, [id]);
        if (res.changes === 0) return { content: [{ type: "text", text: `[Krusch Memory] ⚠️ Memory ID ${id} not found.` }] };
      }
      console.error(`[Krusch Memory] ✅ Successfully deleted memory ID: ${id}.`);
      return { content: [{ type: "text", text: `[Krusch Memory] ✅ Successfully deleted memory ID: ${id}` }] };

    } else if (request.params.name === "update_memory") {
      const { id, content, tags } = args;
      if (!id || !content) throw new McpError(ErrorCode.InvalidParams, "Missing params");
      
      console.error(`[Krusch Memory] 🔄 Updating memory ID: ${id}...`);
      const embeddingArray = await embedText(content);
      let finalTags = tags ? JSON.stringify(tags) : null;
      if (!finalTags && AUTO_TAG) {
        finalTags = await generateTags(content);
      }
      
      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          const embeddingStr = `[${embeddingArray.join(',')}]`;
          const res = await client.query(`
            UPDATE krusch_memory SET content = $1, embedding = $2::vector, tags = $3, created_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [content, embeddingStr, finalTags, id]);
          if (res.rowCount === 0) return { content: [{ type: "text", text: `[Krusch Memory] ⚠️ Memory ID ${id} not found.` }] };
        } finally {
          client.release();
        }
      } else {
        const res = await sqliteDb.run(`
          UPDATE krusch_memory SET content = ?, embedding = ?, tags = ?, created_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [content, JSON.stringify(embeddingArray), finalTags, id]);
        if (res.changes === 0) return { content: [{ type: "text", text: `[Krusch Memory] ⚠️ Memory ID ${id} not found.` }] };
      }
      console.error(`[Krusch Memory] ✅ Successfully updated memory ID: ${id}.`);
      return { content: [{ type: "text", text: `[Krusch Memory] ✅ Successfully updated memory ID: ${id}` }] };

    } else if (request.params.name === "consolidate_memories") {
      const { category, project } = args;
      if (!category) throw new McpError(ErrorCode.InvalidParams, "Missing category");

      console.error(`[Krusch Memory] 🗜️ Consolidating memories in category: '${category}' (Project: ${project || 'Global'})...`);
      
      let rows = [];
      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          if (project) {
            const res = await client.query(`SELECT id, content FROM krusch_memory WHERE category = $1 AND project = $2`, [category, project]);
            rows = res.rows;
          } else {
            const res = await client.query(`SELECT id, content FROM krusch_memory WHERE category = $1 AND project IS NULL`, [category]);
            rows = res.rows;
          }
        } finally {
          client.release();
        }
      } else {
        if (project) {
          rows = await sqliteDb.all(`SELECT id, content FROM krusch_memory WHERE category = ? AND project = ?`, [category, project]);
        } else {
          rows = await sqliteDb.all(`SELECT id, content FROM krusch_memory WHERE category = ? AND project IS NULL`, [category]);
        }
      }

      if (rows.length <= 1) {
        return { content: [{ type: "text", text: `[Krusch Memory] Not enough memories to consolidate (found ${rows.length}).` }] };
      }

      const textsToSummarize = rows.map(r => r.content);
      const idsToDelete = rows.map(r => r.id);

      console.error(`[Krusch Memory] Summarizing ${textsToSummarize.length} memories...`);
      const consolidatedContent = await summarizeMemories(textsToSummarize);

      console.error(`[Krusch Memory] Computing new embedding and tags...`);
      const embeddingArray = await embedText(consolidatedContent);
      let finalTags = null;
      if (AUTO_TAG) {
        finalTags = await generateTags(consolidatedContent);
      }

      if (DB_MODE === 'postgres') {
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`DELETE FROM krusch_memory WHERE id = ANY($1::int[])`, [idsToDelete]);
          const embeddingStr = `[${embeddingArray.join(',')}]`;
          await client.query(`
            INSERT INTO krusch_memory (project, category, content, embedding, tags)
            VALUES ($1, $2, $3, $4::vector, $5)
          `, [project || null, category, consolidatedContent, embeddingStr, finalTags]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      } else {
        try {
          await sqliteDb.run('BEGIN TRANSACTION');
          const placeholders = idsToDelete.map(() => '?').join(',');
          await sqliteDb.run(`DELETE FROM krusch_memory WHERE id IN (${placeholders})`, idsToDelete);
          await sqliteDb.run(`
            INSERT INTO krusch_memory (project, category, content, embedding, tags)
            VALUES (?, ?, ?, ?, ?)
          `, [project || null, category, consolidatedContent, JSON.stringify(embeddingArray), finalTags]);
          await sqliteDb.run('COMMIT');
        } catch (e) {
          await sqliteDb.run('ROLLBACK');
          throw e;
        }
      }

      console.error(`[Krusch Memory] ✅ Successfully consolidated ${idsToDelete.length} memories into 1.`);
      return { content: [{ type: "text", text: `[Krusch Memory] ✅ Successfully consolidated ${idsToDelete.length} memories into a single concise memory.` }] };

    } else if (request.params.name === "health_check") {
      return { content: [{ type: "text", text: `[Krusch Memory] 🟢 Server is healthy. Mode: ${DB_MODE}` }] };
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (err) {
    return { content: [{ type: "text", text: `[Error] ${err.message}` }], isError: true };
  }
});

// Start Server
async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error("[Fatal]", err);
  process.exit(1);
});
