import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../src/index.js');

/**
 * Helper: create a connected MCP client with in-memory SQLite.
 */
async function createClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      DB_MODE: 'sqlite',
      SQLITE_FILE: ':memory:',
      OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
      EMBED_MODEL: process.env.EMBED_MODEL || 'nomic-embed-text'
    }
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

/**
 * Check if Ollama is reachable before running embedding-dependent tests.
 */
async function isOllamaAvailable() {
  try {
    const res = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

describe('Krusch Memory MCP - SQLite Integration', async () => {
  const ollamaUp = await isOllamaAvailable();

  test('health_check returns healthy status', async () => {
    const { client, transport } = await createClient();
    try {
      const health = await client.callTool({ name: 'health_check', arguments: {} });
      assert.ok(health.content[0].text.includes('Server is healthy'));
      assert.ok(health.content[0].text.includes('sqlite'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('health_check includes version', async () => {
    const { client, transport } = await createClient();
    try {
      const health = await client.callTool({ name: 'health_check', arguments: {} });
      assert.ok(health.content[0].text.includes('Version:'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('add_memory stores and search_memory retrieves', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      const addResult = await client.callTool({
        name: 'add_memory',
        arguments: { category: 'lessons', content: 'Unit testing is essential for MCP servers.' }
      });
      assert.ok(!addResult.isError);
      assert.ok(addResult.content[0].text.includes('Successfully saved'));

      const searchResult = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'lessons', query: 'unit testing' }
      });
      assert.ok(searchResult.content[0].text.includes('Unit testing is essential'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('add_memory rejects content exceeding max length', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      const hugeContent = 'x'.repeat(60000); // exceeds 50KB default
      const addResult = await client.callTool({
        name: 'add_memory',
        arguments: { category: 'lessons', content: hugeContent }
      });
      assert.ok(addResult.isError);
      assert.ok(addResult.content[0].text.includes('exceeds maximum length'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('delete_memory removes a stored memory', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'bugs', content: 'Memory to be deleted.' }
      });

      // Search to find the ID
      const searchResult = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'bugs', query: 'deleted' }
      });
      const match = searchResult.content[0].text.match(/ID: (\d+)/);
      assert.ok(match, 'Should find the memory with an ID');
      const memoryId = parseInt(match[1]);

      const deleteResult = await client.callTool({
        name: 'delete_memory',
        arguments: { id: memoryId }
      });
      assert.ok(!deleteResult.isError);
      assert.ok(deleteResult.content[0].text.includes('Successfully deleted'));

      // Verify it's gone
      const searchAgain = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'bugs', query: 'deleted' }
      });
      assert.ok(searchAgain.content[0].text.includes('No results found'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('delete_memory returns warning for non-existent ID', async () => {
    const { client, transport } = await createClient();
    try {
      const result = await client.callTool({
        name: 'delete_memory',
        arguments: { id: 99999 }
      });
      assert.ok(result.content[0].text.includes('not found'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('update_memory changes content', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'priorities', content: 'Original priority content.' }
      });

      const search1 = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'priorities', query: 'original priority' }
      });
      const match = search1.content[0].text.match(/ID: (\d+)/);
      assert.ok(match);
      const memoryId = parseInt(match[1]);

      const updateResult = await client.callTool({
        name: 'update_memory',
        arguments: { id: memoryId, content: 'Updated priority content with new details.' }
      });
      assert.ok(!updateResult.isError);
      assert.ok(updateResult.content[0].text.includes('Successfully updated'));

      const search2 = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'priorities', query: 'updated priority' }
      });
      assert.ok(search2.content[0].text.includes('Updated priority content'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('update_memory returns warning for non-existent ID', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      const result = await client.callTool({
        name: 'update_memory',
        arguments: { id: 99999, content: 'This should not work.' }
      });
      assert.ok(result.content[0].text.includes('not found'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('list_memories returns stored memories', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'activity', content: 'First activity log.' }
      });
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'activity', content: 'Second activity log.' }
      });

      const listResult = await client.callTool({
        name: 'list_memories',
        arguments: { category: 'activity' }
      });
      assert.ok(!listResult.isError);
      assert.ok(listResult.content[0].text.includes('Memory List'));
      assert.ok(listResult.content[0].text.includes('First activity log'));
      assert.ok(listResult.content[0].text.includes('Second activity log'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('list_memories returns empty message for empty category', async () => {
    const { client, transport } = await createClient();
    try {
      const listResult = await client.callTool({
        name: 'list_memories',
        arguments: { category: 'outcomes' }
      });
      assert.ok(listResult.content[0].text.includes('No memories found'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('project separation boosts active_project results', { skip: !ollamaUp && 'Ollama not available' }, async () => {
    const { client, transport } = await createClient();
    try {
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'lessons', content: 'Use pgvector for semantic search.', project: 'project-alpha' }
      });
      await client.callTool({
        name: 'add_memory',
        arguments: { category: 'lessons', content: 'Use pgvector for vector indexing.', project: 'project-beta' }
      });

      const result = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'lessons', query: 'pgvector', active_project: 'project-alpha' }
      });
      // The first result should be from project-alpha due to the +0.1 boost
      const text = result.content[0].text;
      const firstMatch = text.indexOf('Project: project-alpha');
      const secondMatch = text.indexOf('Project: project-beta');
      assert.ok(firstMatch < secondMatch, 'Active project should appear first due to boost');
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('search_memory returns no results for empty category', async () => {
    const { client, transport } = await createClient();
    try {
      const result = await client.callTool({
        name: 'search_memory',
        arguments: { category: 'outcomes', query: 'anything' }
      });
      // This will error because Ollama is needed for embedding, or return empty
      if (!result.isError) {
        assert.ok(result.content[0].text.includes('No results found'));
      }
    } finally {
      try { await transport.close(); } catch {}
    }
  });

  test('unknown tool returns error', async () => {
    const { client, transport } = await createClient();
    try {
      const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
      // The MCP SDK may return an error response or throw depending on version
      if (result?.isError) {
        assert.ok(result.content[0].text.includes('Unknown tool') || result.content[0].text.includes('Error'));
      } else {
        // If no error, something is wrong
        assert.fail('Should have returned an error for unknown tool');
      }
    } catch (err) {
      // Some SDK versions throw instead of returning isError
      assert.ok(err.message.includes('Unknown tool') || err.code === -32601 || err.message.includes('Method not found'));
    } finally {
      try { await transport.close(); } catch {}
    }
  });
});
