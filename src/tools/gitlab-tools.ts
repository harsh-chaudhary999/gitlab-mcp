import { z } from 'zod';
import { gitlabClient } from '../clients/gitlab-client';
import { gitlabSchemas } from '../schemas/gitlab-schemas';
import { formatSuccessResponse, formatErrorResponse } from '../utils/error-handler';

export const gitlabToolDefinitions = [
  // --- Group ("space") — start here for multi-repo work ---
  {
    name: 'gitlab_list_group_projects',
    description:
      'List all repositories (projects) in a GitLab group, including nested subgroups by ' +
      'default. Call this FIRST to discover which repos exist and their IDs, then pass ' +
      'projectId to any other tool to operate on a specific repo. A GitLab group is the ' +
      'equivalent of a workspace or space.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupId: { type: 'string', description: 'Group ID or URL-encoded full path. Uses configured default if omitted.' },
        includeSubgroups: { type: 'boolean', description: 'Include repos in nested subgroups (default: true)' },
        search: { type: 'string', description: 'Filter repos by name substring' },
        includeArchived: { type: 'boolean', description: 'Include archived repos (default: false)' },
        orderBy: {
          type: 'string',
          enum: ['name', 'path', 'created_at', 'updated_at', 'last_activity_at'],
          description: 'Sort field (default: last_activity_at)'
        }
      },
      required: []
    }
  },
  {
    name: 'gitlab_get_group',
    description: 'Get information about a GitLab group (space): name, full path, description, URL',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupId: { type: 'string', description: 'Group ID or URL-encoded full path. Uses configured default if omitted.' }
      },
      required: []
    }
  },
  {
    name: 'gitlab_list_subgroups',
    description: 'List direct subgroups of a GitLab group. Use to navigate a nested group structure.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupId: { type: 'string', description: 'Group ID or URL-encoded full path. Uses configured default if omitted.' }
      },
      required: []
    }
  },
  {
    name: 'gitlab_find_projects',
    description:
      'Search repositories by name across everything this token can access (or within the ' +
      'configured group). Use when you know a repo by name but not its ID or full path, or ' +
      'when no group is configured. Returns full paths you can pass as projectId.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Repo name or partial name' },
        groupId: { type: 'string', description: 'Restrict to this group (optional)' }
      },
      required: ['search']
    }
  },

  // --- Project ---
  {
    name: 'gitlab_get_project',
    description: 'Get project information including default branch, URL, and settings',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'Project ID or URL-encoded path. Uses configured default if omitted.' }
      },
      required: []
    }
  },

  // --- Branches ---
  {
    name: 'gitlab_list_branches',
    description: 'List branches in a GitLab project, optionally filtered by name',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'Project ID (optional, uses default)' },
        search: { type: 'string', description: 'Filter branches by name pattern' }
      },
      required: []
    }
  },
  {
    name: 'gitlab_create_branch',
    description: 'Create a new branch from an existing branch or commit SHA',
    inputSchema: {
      type: 'object' as const,
      properties: {
        branch: { type: 'string', description: 'New branch name' },
        ref: { type: 'string', description: 'Source branch name or commit SHA' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['branch', 'ref']
    }
  },
  {
    name: 'gitlab_delete_branch',
    description: 'Delete a branch from a GitLab project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        branch: { type: 'string', description: 'Branch name to delete' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['branch']
    }
  },

  // --- Batch File Fetch ---
  {
    name: 'gitlab_get_folder_contents',
    description: 'Recursively list all files in a repository folder and fetch their contents. Filters by file extension (default: .md). Returns all file paths and contents in one call.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Folder path inside repository (e.g., "docs/guides")' },
        ref: { type: 'string', description: 'Branch name, tag, or commit SHA (default: master)' },
        extensions: { type: 'array', items: { type: 'string' }, description: 'File extensions to include (default: [".md"])' },
        recursive: { type: 'boolean', description: 'Include files from subdirectories (default: true)' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['path']
    }
  },

  // --- Repository Tree ---
  {
    name: 'gitlab_list_tree',
    description: 'List files and directories in a repository path, optionally recursive. Useful for discovering all files in a folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Path inside repository to list (e.g., "src"). Omit for root.' },
        ref: { type: 'string', description: 'Branch name, tag, or commit SHA (default: master)' },
        recursive: { type: 'boolean', description: 'List files recursively in subdirectories (default: true)' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: []
    }
  },

  // --- Commits ---
  {
    name: 'gitlab_create_commit',
    description: 'Create a commit with one or more file actions (create, update, delete, move). Supports multi-file commits.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        branch: { type: 'string', description: 'Target branch for the commit' },
        commitMessage: { type: 'string', description: 'Commit message' },
        actions: {
          type: 'array',
          description: 'File actions — each has action (create/update/delete/move), file_path, and content',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['create', 'delete', 'move', 'update', 'chmod'], description: 'Action type' },
              file_path: { type: 'string', description: 'File path in the repository' },
              content: { type: 'string', description: 'File content (required for create/update)' },
              previous_path: { type: 'string', description: 'Previous path (for move action)' }
            },
            required: ['action', 'file_path']
          }
        },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['branch', 'commitMessage', 'actions']
    }
  },
  {
    name: 'gitlab_get_file',
    description: 'Get file content from a GitLab repository at a specific branch or commit',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: { type: 'string', description: 'Path to the file in the repository' },
        ref: { type: 'string', description: 'Branch name, tag, or commit SHA' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['filePath', 'ref']
    }
  },

  // --- Merge Requests ---
  {
    name: 'gitlab_create_merge_request',
    description: 'Create a merge request (MR) from source branch to target branch with title, description, labels, and options',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sourceBranch: { type: 'string', description: 'Source branch' },
        targetBranch: { type: 'string', description: 'Target branch' },
        title: { type: 'string', description: 'MR title' },
        description: { type: 'string', description: 'MR description (markdown supported)' },
        labels: { type: 'string', description: 'Comma-separated labels' },
        removeSourceBranch: { type: 'boolean', description: 'Delete source branch after merge' },
        squash: { type: 'boolean', description: 'Squash commits on merge' },
        assigneeId: { type: 'number', description: 'Assignee user ID' },
        reviewerIds: { type: 'array', items: { type: 'number' }, description: 'Reviewer user IDs' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['sourceBranch', 'targetBranch', 'title']
    }
  },
  {
    name: 'gitlab_list_merge_requests',
    description: 'List merge requests in a project, filtered by state (opened, closed, merged, all)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: { type: 'string', enum: ['opened', 'closed', 'merged', 'all'], description: 'Filter by MR state' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: []
    }
  },
  {
    name: 'gitlab_get_merge_request',
    description: 'Get details of a specific merge request by its IID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mrIid: { type: 'number', description: 'Merge request IID (internal project ID)' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['mrIid']
    }
  },
  {
    name: 'gitlab_add_mr_note',
    description: 'Add a comment/note to a merge request',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mrIid: { type: 'number', description: 'Merge request IID' },
        body: { type: 'string', description: 'Comment body (markdown supported)' },
        projectId: { type: 'string', description: 'Project ID (optional)' }
      },
      required: ['mrIid', 'body']
    }
  }
];

export async function handleGitLabTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    switch (toolName) {
      // Group ("space")
      case 'gitlab_list_group_projects': {
        const params = gitlabSchemas.listGroupProjects.parse(args);
        const projects = await gitlabClient.listGroupProjects(params.groupId, {
          includeSubgroups: params.includeSubgroups,
          search: params.search,
          includeArchived: params.includeArchived,
          orderBy: params.orderBy
        });
        // Return a trimmed shape: full GitLab project objects are ~100 fields each, which
        // would flood an agent's context for a group with dozens of repos.
        return formatSuccessResponse({
          total: projects.length,
          projects: projects.map(p => ({
            id: p.id,
            name: p.name,
            path_with_namespace: p.path_with_namespace,
            default_branch: p.default_branch,
            web_url: p.web_url,
            description: p.description ?? null,
            archived: p.archived ?? false,
            last_activity_at: p.last_activity_at
          }))
        });
      }
      case 'gitlab_get_group': {
        const params = gitlabSchemas.getGroup.parse(args);
        const result = await gitlabClient.getGroup(params.groupId);
        return formatSuccessResponse(result);
      }
      case 'gitlab_find_projects': {
        const params = gitlabSchemas.findProjects.parse(args);
        const projects = await gitlabClient.findProjects(params.search, params.groupId);
        return formatSuccessResponse({
          total: projects.length,
          // path_with_namespace is what you pass back as projectId.
          projects: projects.map(p => ({
            id: p.id,
            name: p.name,
            path_with_namespace: p.path_with_namespace,
            default_branch: p.default_branch,
            web_url: p.web_url,
            description: p.description ?? null,
            // null rather than false: the token-wide search uses GitLab's `simple`
            // representation, which omits this field — do not imply "not archived".
            archived: p.archived ?? null
          }))
        });
      }
      case 'gitlab_list_subgroups': {
        const params = gitlabSchemas.listSubgroups.parse(args);
        const groups = await gitlabClient.listSubgroups(params.groupId);
        return formatSuccessResponse({
          total: groups.length,
          subgroups: groups.map(g => ({
            id: g.id,
            name: g.name,
            full_path: g.full_path,
            description: g.description ?? null,
            web_url: g.web_url
          }))
        });
      }

      // Project
      case 'gitlab_get_project': {
        const params = gitlabSchemas.getProject.parse(args);
        const result = await gitlabClient.getProject(params.projectId);
        return formatSuccessResponse(result);
      }

      // Branches
      case 'gitlab_list_branches': {
        const params = gitlabSchemas.listBranches.parse(args);
        const result = await gitlabClient.listBranches(params.projectId, params.search);
        return formatSuccessResponse(result);
      }
      case 'gitlab_create_branch': {
        const params = gitlabSchemas.createBranch.parse(args);
        const result = await gitlabClient.createBranch(params.branch, params.ref, params.projectId);
        return formatSuccessResponse(result);
      }
      case 'gitlab_delete_branch': {
        const params = gitlabSchemas.deleteBranch.parse(args);
        await gitlabClient.deleteBranch(params.branch, params.projectId);
        return formatSuccessResponse({ success: true, message: `Branch '${params.branch}' deleted` });
      }

      // Batch File Fetch
      case 'gitlab_get_folder_contents': {
        const params = gitlabSchemas.getFolderContents.parse(args);
        const extensions = params.extensions;

        // Step 1: List all files in the folder
        const tree = await gitlabClient.listTree(
          params.path, params.ref, params.recursive, params.projectId
        );

        // Step 2: Filter by extension and type (blob = file)
        const matchingFiles = tree.filter(item => {
          if (item.type !== 'blob') return false;
          return extensions.some(ext => item.path.toLowerCase().endsWith(ext.toLowerCase()));
        });

        // Step 3: Fetch content of each matching file (in parallel, max 10 concurrent)
        const BATCH_SIZE = 10;
        const files: Array<{ path: string; content: string }> = [];

        for (let i = 0; i < matchingFiles.length; i += BATCH_SIZE) {
          const batch = matchingFiles.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (file) => {
              try {
                const result = await gitlabClient.getFile(file.path, params.ref || 'master', params.projectId);
                const content = result.encoding === 'base64'
                  ? Buffer.from(result.content, 'base64').toString('utf-8')
                  : result.content;
                return { path: file.path, content };
              } catch {
                return { path: file.path, content: `[Error: could not fetch file]` };
              }
            })
          );
          files.push(...results);
        }

        return formatSuccessResponse({
          folder: params.path,
          totalFilesInTree: tree.length,
          matchingFiles: files.length,
          extensions,
          files
        });
      }

      // Repository Tree
      case 'gitlab_list_tree': {
        const params = gitlabSchemas.listTree.parse(args);
        const result = await gitlabClient.listTree(
          params.path, params.ref, params.recursive, params.projectId
        );
        return formatSuccessResponse(result);
      }

      // Commits
      case 'gitlab_create_commit': {
        const params = gitlabSchemas.createCommit.parse(args);
        const result = await gitlabClient.createCommit(
          params.branch, params.commitMessage, params.actions, params.projectId
        );
        return formatSuccessResponse(result);
      }
      case 'gitlab_get_file': {
        const params = gitlabSchemas.getFile.parse(args);
        const result = await gitlabClient.getFile(params.filePath, params.ref, params.projectId);
        return formatSuccessResponse(result);
      }

      // Merge Requests
      case 'gitlab_create_merge_request': {
        const params = gitlabSchemas.createMergeRequest.parse(args);
        const result = await gitlabClient.createMergeRequest(
          params.sourceBranch,
          params.targetBranch,
          params.title,
          {
            description: params.description,
            labels: params.labels,
            removeSourceBranch: params.removeSourceBranch,
            squash: params.squash,
            assigneeId: params.assigneeId,
            reviewerIds: params.reviewerIds
          },
          params.projectId
        );
        return formatSuccessResponse(result);
      }
      case 'gitlab_list_merge_requests': {
        const params = gitlabSchemas.listMergeRequests.parse(args);
        const result = await gitlabClient.listMergeRequests(params.state, params.projectId);
        return formatSuccessResponse(result);
      }
      case 'gitlab_get_merge_request': {
        const params = gitlabSchemas.getMergeRequest.parse(args);
        const result = await gitlabClient.getMergeRequest(params.mrIid, params.projectId);
        return formatSuccessResponse(result);
      }
      case 'gitlab_add_mr_note': {
        const params = gitlabSchemas.addMergeRequestNote.parse(args);
        const result = await gitlabClient.addMergeRequestNote(params.mrIid, params.body, params.projectId);
        return formatSuccessResponse(result);
      }

      default:
        return formatErrorResponse(new Error(`Unknown GitLab tool: ${toolName}`));
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatErrorResponse(
        new Error(`Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
      );
    }
    return formatErrorResponse(error);
  }
}
