#!/usr/bin/env node

// Simple smoke test for Script Kit MCP HTTP server
// Usage: node app/scripts/mcp-smoke-test.js [url]
// Default URL: http://localhost:3580/mcp
// Exits with code 0 on success, non-zero on failure

import { execSync } from 'node:child_process';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

const mcpUrl = process.argv[2] || 'http://localhost:3580/mcp';
const base = new URL(mcpUrl);
const healthUrl = `${base.origin}/health`;

// Use built-in fetch in modern Node; fallback to node-fetch if absent.
let fetchFn;
if (typeof fetch === 'function') {
  fetchFn = fetch;
} else {
  fetchFn = (await import('node-fetch')).default;
}

async function waitForHealth(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchFn(healthUrl);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  return false;
}

(async () => {
  process.stdout.write(`Checking MCP server at ${healthUrl}...\n`);
  const up = await waitForHealth();
  if (!up) {
    console.error('MCP server did not respond to /health');
    process.exit(1);
  }

  process.stdout.write('MCP server is up. Listing tools...\n');
  let tools;
  try {
    const stdout = execSync(`npx --yes @modelcontextprotocol/inspector --cli --method tools/list ${mcpUrl}`, {
      encoding: 'utf8',
    });
    tools = JSON.parse(stdout);
  } catch (err) {
    console.error('Failed to run MCP inspector:', err);
    process.exit(1);
  }

  if (!Array.isArray(tools) || tools.length === 0) {
    console.error('No tools returned by MCP server');
    process.exit(1);
  }

  process.stdout.write(`Discovered ${tools.length} tool(s):\n`);
  for (const t of tools) {
    process.stdout.write(`  • ${t.name} — ${Object.keys(t.inputSchema.properties || {}).length} param(s)\n`);
  }

  process.stdout.write('Smoke test passed!\n');
})();
