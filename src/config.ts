import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  gitlab: z.object({
    baseUrl: z.string().min(1, 'GITLAB_BASE_URL is required'),
    token: z.string().min(1, 'GITLAB_TOKEN is required'),
    // Group ("space") to browse. With this set the server is multi-repo: list the projects
    // in the group, then pass projectId per call. Numeric ID or URL-encoded full path.
    groupId: z.string().optional(),
    // Optional default project, used when a tool call omits projectId. Convenient for
    // single-repo setups; unnecessary when working group-wide.
    projectId: z.string().optional()
    // Neither is required. With only a token, the server runs in "token-only" mode: any
    // repo the token can see is reachable by numeric ID, full path, or plain name (resolved
    // by search). A group narrows that search and removes most name ambiguity.
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
      // Empty string -> undefined, so the "at least one of group/project" check works and
      // an unset default never produces a /projects//... URL.
      groupId: process.env.GITLAB_GROUP_ID || undefined,
      projectId: process.env.GITLAB_PROJECT_ID || undefined
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

  const cfg = result.data;
  if (!cfg.gitlab.groupId && !cfg.gitlab.projectId) {
    // Valid, but worth flagging: a plain project name then has to be searched across every
    // repo the token can see, which is slower and far more likely to be ambiguous.
    console.error(
      '[config] No GITLAB_GROUP_ID or GITLAB_PROJECT_ID set — running in token-only mode. ' +
      'Repos are reachable by numeric ID, full path, or name (resolved by search across all ' +
      'accessible projects). Set GITLAB_GROUP_ID to scope name lookups to one group.'
    );
  }

  return cfg;
}

export const config = loadConfig();
