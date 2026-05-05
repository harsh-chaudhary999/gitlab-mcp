import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config';
import { gitlabToolDefinitions, handleGitLabTool } from './tools/gitlab-tools';

const allTools = [...gitlabToolDefinitions];
const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>> = {};
gitlabToolDefinitions.forEach(t => { toolHandlers[t.name] = (a) => handleGitLabTool(t.name, a); });

export function createGitLabMcpServer(): Server {
  const server = new Server(
    { name: config.server.name, version: config.server.version },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    try {
      return await handler((args as Record<string, unknown>) ?? {});
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { message: msg } }, null, 2) }], isError: true };
    }
  });
  return server;
}
