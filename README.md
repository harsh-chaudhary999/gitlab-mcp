# gitlab-mcp

MCP server for GitLab: projects, branches, repo files/tree, commits, merge requests. Runs as **stdio** (default) or **HTTP**.

## Requirements

- Node.js **18+**
- GitLab personal access token with the scopes you need (often `api`, plus `write_repository` if you commit)

## Setup

```bash
npm install
npm run build
cp .env.example .env
# edit .env — never commit it
```

| Variable | Required | Notes |
|----------|----------|--------|
| `GITLAB_TOKEN` | Yes | `glpat-…` token |
| `GITLAB_PROJECT_ID` | Yes | Numeric ID or URL-encoded path |
| `GITLAB_BASE_URL` | No | Default `https://gitlab.com` |
| `GITLAB_HOST` | No | Used if base URL unset |
| `MCP_HTTP_PORT` | No | HTTP mode only, default `3101` |

See `.env.example` for optional `MCP_SERVER_*`, `LOG_LEVEL`, `RATE_LIMIT_*`.

## Run

```bash
npm start          # stdio MCP
npm run start:http # HTTP → http://0.0.0.0:3101/mcp (or your `MCP_HTTP_PORT`)
```

## MCP client config (stdio)

Use **one** of these patterns after `npm run build`:

**A — run from repo root (loads `.env` via dotenv):**

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npm",
      "args": ["run", "start"],
      "cwd": "/path/to/gitlab-mcp"
    }
  }
}
```

**B — call `node` on the built file** (path must resolve from how your client spawns the process; absolute paths are reliable):

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "node",
      "args": ["/path/to/gitlab-mcp/dist/index.js"],
      "env": {
        "GITLAB_TOKEN": "…",
        "GITLAB_PROJECT_ID": "…",
        "GITLAB_BASE_URL": "https://gitlab.com"
      }
    }
  }
}
```

HTTP mode does **not** use `dist/index.js` in the client — start `npm run start:http` yourself, then point the client at `http://localhost:3101/mcp` (or your host/port).

## Tools

`gitlab_get_project`, branch create/list/delete, `gitlab_list_tree`, `gitlab_get_file`, `gitlab_get_folder_contents`, `gitlab_create_commit`, MR create/list/get/comment.

## Security

Do not commit `.env` or MCP JSON with real tokens. Rotate tokens if exposed.
