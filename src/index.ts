#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config';
import { createGitLabMcpServer } from './server-impl';

const server = createGitLabMcpServer();

async function main() {
  console.error(`Starting ${config.server.name} v${config.server.version}...`);
  console.error(`GitLab: ${config.gitlab.baseUrl} | Project: ${config.gitlab.projectId}`);
  console.error(`Tools registered`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Server connected and ready');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
