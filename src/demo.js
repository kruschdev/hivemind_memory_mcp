#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, 'index.js');

console.log("========================================");
console.log("🧠 Krusch Memory MCP - CLI Demo");
console.log("========================================");
console.log("Starting local MCP server in SQLite in-memory mode...");

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: {
    ...process.env,
    DB_MODE: 'sqlite',
    SQLITE_FILE: ':memory:'
  }
});

const client = new Client({ name: "demo-client", version: "1.0.0" }, { capabilities: {} });

async function runDemo() {
  try {
    await client.connect(transport);
    console.log("✅ Connected to MCP Server via stdio.\n");

    console.log("⏳ 1. Running Health Check...");
    const health = await client.callTool({ name: 'health_check', arguments: {} });
    console.log(health.content[0].text);

    console.log("\n⏳ 2. Adding a test memory...");
    const addResult = await client.callTool({
      name: 'add_memory',
      arguments: { category: 'lessons', content: 'Krusch Memory MCP natively supports SQLite and Postgres pgvector!' }
    });
    console.log(addResult.content[0].text);

    console.log("\n⏳ 3. Searching for 'pgvector'...");
    const searchResult = await client.callTool({
      name: 'search_memory',
      arguments: { category: 'lessons', query: 'pgvector support' }
    });
    console.log(searchResult.content[0].text);

    console.log("\n🎉 Demo completed successfully!");

  } catch (err) {
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.message.includes('Embedding Generation Failed')) {
      console.log("\n❌ ERROR: Ollama is not running locally or the 'nomic-embed-text' model is missing.");
      console.log("Please ensure Ollama is running and execute: ollama run nomic-embed-text");
    } else {
      console.error("\n❌ Unexpected Error:", err.message);
    }
  } finally {
    try {
      await transport.close();
    } catch(e) {}
    process.exit(0);
  }
}

runDemo();
