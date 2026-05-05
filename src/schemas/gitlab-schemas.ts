import { z } from 'zod';

const commitActionSchema = z.object({
  action: z.enum(['create', 'delete', 'move', 'update', 'chmod']),
  file_path: z.string().min(1),
  content: z.string().optional(),
  previous_path: z.string().optional()
});

export const gitlabSchemas = {
  // Project
  getProject: z.object({
    projectId: z.string().optional().describe('Project ID or URL-encoded path. Uses default if omitted.')
  }),

  // Branches
  listBranches: z.object({
    projectId: z.string().optional(),
    search: z.string().optional().describe('Filter branches by name')
  }),

  createBranch: z.object({
    branch: z.string().min(1).describe('New branch name'),
    ref: z.string().min(1).describe('Source branch or commit SHA to branch from'),
    projectId: z.string().optional()
  }),

  deleteBranch: z.object({
    branch: z.string().min(1).describe('Branch name to delete'),
    projectId: z.string().optional()
  }),

  // Commits
  createCommit: z.object({
    branch: z.string().min(1).describe('Target branch'),
    commitMessage: z.string().min(1).describe('Commit message'),
    actions: z.array(commitActionSchema).min(1).describe('File actions to include in the commit'),
    projectId: z.string().optional()
  }),

  getFile: z.object({
    filePath: z.string().min(1).describe('Path to the file in the repository'),
    ref: z.string().min(1).describe('Branch name, tag, or commit SHA'),
    projectId: z.string().optional()
  }),

  // Batch file fetch
  getFolderContents: z.object({
    path: z.string().describe('Folder path inside repository (e.g., "docs/guides")'),
    ref: z.string().optional().default('master').describe('Branch name, tag, or commit SHA'),
    extensions: z.array(z.string()).optional().default(['.md']).describe('File extensions to include (e.g., [".md", ".txt"])'),
    recursive: z.boolean().optional().default(true).describe('Include files from subdirectories'),
    projectId: z.string().optional()
  }),

  // Repository Tree
  listTree: z.object({
    path: z.string().optional().describe('Path inside repository to list (e.g., "src")'),
    ref: z.string().optional().default('master').describe('Branch name, tag, or commit SHA'),
    recursive: z.boolean().optional().default(true).describe('List files recursively in subdirectories'),
    projectId: z.string().optional()
  }),

  // Merge Requests
  createMergeRequest: z.object({
    sourceBranch: z.string().min(1).describe('Source branch'),
    targetBranch: z.string().min(1).describe('Target branch'),
    title: z.string().min(1).describe('MR title'),
    description: z.string().optional().describe('MR description (markdown)'),
    labels: z.string().optional().describe('Comma-separated labels'),
    removeSourceBranch: z.boolean().optional().describe('Delete source branch after merge'),
    squash: z.boolean().optional().describe('Squash commits on merge'),
    assigneeId: z.number().optional().describe('Assignee user ID'),
    reviewerIds: z.array(z.number()).optional().describe('Reviewer user IDs'),
    projectId: z.string().optional()
  }),

  listMergeRequests: z.object({
    state: z.enum(['opened', 'closed', 'merged', 'all']).optional().describe('Filter by state'),
    projectId: z.string().optional()
  }),

  getMergeRequest: z.object({
    mrIid: z.number().positive().describe('Merge request IID (internal ID)'),
    projectId: z.string().optional()
  }),

  addMergeRequestNote: z.object({
    mrIid: z.number().positive().describe('Merge request IID'),
    body: z.string().min(1).describe('Comment body (markdown)'),
    projectId: z.string().optional()
  })
};
