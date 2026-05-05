import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  gitlab: z.object({
    baseUrl: z.string().min(1, 'GITLAB_BASE_URL is required'),
    token: z.string().min(1, 'GITLAB_TOKEN is required'),
    projectId: z.string().min(1, 'GITLAB_PROJECT_ID is required')
  }),
  server: z.object({
    name: z.string().default('gitlab-mcp'),
    version: z.string().default('1.0.0'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
  }),
  rateLimit: z.object({
    requestsPerSecond: z.number().positive().default(10)
  })
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    gitlab: {
      baseUrl: process.env.GITLAB_BASE_URL || `https://${process.env.GITLAB_HOST || 'gitlab.com'}`,
      token: process.env.GITLAB_TOKEN || '',
      projectId: process.env.GITLAB_PROJECT_ID || ''
    },
    server: {
      name: process.env.MCP_SERVER_NAME || 'gitlab-mcp',
      version: process.env.MCP_SERVER_VERSION || '1.0.0',
      logLevel: process.env.LOG_LEVEL || 'info'
    },
    rateLimit: {
      requestsPerSecond: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_SECOND || '10', 10)
    }
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

export const config = loadConfig();
