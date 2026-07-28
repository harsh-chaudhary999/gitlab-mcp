# gitlab-mcp

MCP server for GitLab: projects, branches, repo files/tree, commits, merge requests. Runs as **stdio** (default) or **HTTP**.

## Scope: group ("space") or single repo

**Both are optional.** A GitLab **group** is the equivalent of a workspace or space.

| Variable | Effect |
|---|---|
| `GITLAB_GROUP_ID` | Browse every repo in the group, nested subgroups included. Narrows name lookups. |
| `GITLAB_PROJECT_ID` | Default repo, used when a call omits `projectId`. |
| *neither* | **Token-only mode.** Any repo the token can see is reachable; name lookups search all accessible projects. Logged as a warning at startup. |

## How a repo reference is resolved

`projectId` accepts three forms, so you can say what you actually know:

| You pass | Resolution |
|---|---|
| `41829304` | Numeric ID — used directly |
| `mygroup/payments` | Full path — URL-encoded (idempotent if already encoded) |
| `payments` | **Plain name — resolved by search** |

Name resolution is scoped to `GITLAB_GROUP_ID` when set, otherwise searched across every
project the token can access, and cached for the process lifetime.

GitLab's own API accepts **only** the first two forms — a bare name returns 404 — so the
name path is resolved here before the call is made.

Two failure modes are deliberate rather than silent:

- **Not found** → error naming the token's visible scope, suggesting `gitlab_find_projects`
- **Ambiguous** (`"api"` matching `api-gateway` and `api-legacy`) → error **listing the
  candidate full paths and IDs** so the caller can retry precisely. It never guesses:
  picking the wrong repo to commit to is not recoverable.

Because GitLab's `search` is a substring match, exact matches on display name or final path
segment are preferred before falling back to partial hits.

### Multi-repo workflow

```
gitlab_list_group_projects              -> every repo in the group (needs a group)
gitlab_find_projects  { search }        -> search by name (works with no group)
gitlab_get_file       { projectId, … }  -> then address any repo by id, path, or name
```

Every existing tool already accepts an optional `projectId`, so once you know a repo's ID
you can operate on any repo in the group. With `GITLAB_PROJECT_ID` set, omitting
`projectId` falls back to that default.

`gitlab_list_group_projects` includes subgroups by default (nested groups are the norm, and
stopping at the top level would make subgroup repos look like they don't exist) and excludes
archived repos unless you ask for them. It returns a trimmed projection — id, path, default
branch, URL, description, archived, last activity — because full GitLab project objects run
to ~100 fields each and would flood an agent's context for a group with dozens of repos.

`gitlab_list_subgroups` navigates the group tree when you want subgroup-by-subgroup control
rather than one flat listing.

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
