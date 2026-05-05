#!/usr/bin/env node

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config';
import { createGitLabMcpServer } from './server-impl';

const PORT = parseInt(process.env.MCP_HTTP_PORT || '3101', 10);

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  // Allow long-running tool calls (e.g., batch file fetches)
  req.setTimeout(300000);  // 5 min
  res.setTimeout(300000);
  const server = createGitLabMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => transport.close().catch(() => {}));
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.error(`${config.server.name} HTTP server listening on http://0.0.0.0:${PORT}/mcp`);
});
