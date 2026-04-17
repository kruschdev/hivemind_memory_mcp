import { test } from 'node:test';
import assert from 'node:assert';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Hivemind Memory MCP - SQLite Integration', async (t) => {
  const serverPath = path.resolve(__dirname, '../src/index.js');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      DB_MODE: 'sqlite',
      SQLITE_FILE: ':memory:', // Use in-memory SQLite to prevent writing to disk
      OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
      EMBED_MODEL: process.env.EMBED_MODEL || 'nomic-embed-text'
    }
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  
  try {
    await client.connect(transport);

    // 1. Health Check
    const health = await client.callTool({ name: 'health_check', arguments: {} });
    assert.strictEqual(health.content[0].text.includes('Server is healthy'), true);

    // 2. Add Memory
    const addResult = await client.callTool({
      name: 'add_memory',
      arguments: { category: 'lessons', content: 'Hivemind is a local memory system.' }
    });
    if (addResult.isError) throw new Error(addResult.content[0].text);
    assert.strictEqual(addResult.content[0].text.includes('Successfully saved'), true);

    // 3. Search Memory
    const searchResult = await client.callTool({
      name: 'search_memory',
      arguments: { category: 'lessons', query: 'local memory' }
    });
    console.log("Search Result:", searchResult.content[0].text);
    assert.strictEqual(searchResult.content[0].text.includes('Hivemind is a local memory system.'), true);
    
  } catch (err) {
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.message.includes('Embedding Generation Failed')) {
      console.warn('⚠️  Ollama is not running locally. Skipping test.');
    } else {
      throw err;
    }
  } finally {
    try {
      await transport.close();
    } catch(e) {}
  }
});
