import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { gitlabAuth } from '../auth/gitlab-auth';
import { gitlabRateLimiter } from '../utils/rate-limiter';
import { parseApiError } from '../utils/error-handler';

export interface GitLabBranch {
  name: string;
  commit: { id: string; message: string };
  merged: boolean;
  protected: boolean;
  web_url: string;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  web_url: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  web_url: string;
}

export interface CommitAction {
  action: 'create' | 'delete' | 'move' | 'update' | 'chmod';
  file_path: string;
  content?: string;
  previous_path?: string;
}

export class GitLabClient {
  private readonly client: AxiosInstance;
  private readonly projectId: string;

  constructor() {
    this.projectId = gitlabAuth.getProjectId();
    this.client = axios.create({
      baseURL: gitlabAuth.getApiUrl(),
      headers: gitlabAuth.getDefaultHeaders()
    });

    this.client.interceptors.response.use(
      response => response,
      error => { throw parseApiError(error); }
    );
  }

  private async request<T>(cfg: AxiosRequestConfig): Promise<T> {
    return gitlabRateLimiter.execute(async () => {
      const response = await this.client.request<T>(cfg);
      return response.data;
    });
  }

  // --- Project ---

  async getProject(projectId?: string): Promise<GitLabProject> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabProject>({ method: 'GET', url: `/projects/${pid}` });
  }

  // --- Branches ---

  async listBranches(projectId?: string, search?: string): Promise<GitLabBranch[]> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabBranch[]>({
      method: 'GET',
      url: `/projects/${pid}/repository/branches`,
      params: search ? { search } : undefined
    });
  }

  async createBranch(branch: string, ref: string, projectId?: string): Promise<GitLabBranch> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabBranch>({
      method: 'POST',
      url: `/projects/${pid}/repository/branches`,
      params: { branch, ref }
    });
  }

  async deleteBranch(branch: string, projectId?: string): Promise<void> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<void>({
      method: 'DELETE',
      url: `/projects/${pid}/repository/branches/${encodeURIComponent(branch)}`
    });
  }

  // --- Commits ---

  async createCommit(
    branch: string,
    commitMessage: string,
    actions: CommitAction[],
    projectId?: string
  ): Promise<GitLabCommit> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabCommit>({
      method: 'POST',
      url: `/projects/${pid}/repository/commits`,
      data: { branch, commit_message: commitMessage, actions }
    });
  }

  async getFile(filePath: string, ref: string, projectId?: string): Promise<{ content: string; encoding: string }> {
    const pid = encodeURIComponent(projectId || this.projectId);
    const encodedPath = encodeURIComponent(filePath);
    return this.request<{ content: string; encoding: string }>({
      method: 'GET',
      url: `/projects/${pid}/repository/files/${encodedPath}`,
      params: { ref }
    });
  }

  // --- Repository Tree ---

  async listTree(
    path?: string,
    ref?: string,
    recursive?: boolean,
    projectId?: string,
    perPage: number = 100
  ): Promise<Array<{ id: string; name: string; type: string; path: string; mode: string }>> {
    const pid = encodeURIComponent(projectId || this.projectId);
    const allItems: Array<{ id: string; name: string; type: string; path: string; mode: string }> = [];
    let page = 1;

    while (true) {
      const params: Record<string, unknown> = { per_page: perPage, page };
      if (path) params.path = path;
      if (ref) params.ref = ref;
      if (recursive) params.recursive = true;

      const items = await this.request<Array<{ id: string; name: string; type: string; path: string; mode: string }>>({
        method: 'GET',
        url: `/projects/${pid}/repository/tree`,
        params
      });

      allItems.push(...items);
      if (items.length < perPage) break;
      page++;
    }

    return allItems;
  }

  // --- Merge Requests ---

  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options?: {
      description?: string;
      labels?: string;
      removeSourceBranch?: boolean;
      squash?: boolean;
      assigneeId?: number;
      reviewerIds?: number[];
    },
    projectId?: string
  ): Promise<GitLabMergeRequest> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabMergeRequest>({
      method: 'POST',
      url: `/projects/${pid}/merge_requests`,
      data: {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description: options?.description,
        labels: options?.labels,
        remove_source_branch: options?.removeSourceBranch,
        squash: options?.squash,
        assignee_id: options?.assigneeId,
        reviewer_ids: options?.reviewerIds
      }
    });
  }

  async listMergeRequests(
    state?: 'opened' | 'closed' | 'merged' | 'all',
    projectId?: string
  ): Promise<GitLabMergeRequest[]> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabMergeRequest[]>({
      method: 'GET',
      url: `/projects/${pid}/merge_requests`,
      params: { state: state || 'opened' }
    });
  }

  async getMergeRequest(mrIid: number, projectId?: string): Promise<GitLabMergeRequest> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<GitLabMergeRequest>({
      method: 'GET',
      url: `/projects/${pid}/merge_requests/${mrIid}`
    });
  }

  async addMergeRequestNote(mrIid: number, body: string, projectId?: string): Promise<unknown> {
    const pid = encodeURIComponent(projectId || this.projectId);
    return this.request<unknown>({
      method: 'POST',
      url: `/projects/${pid}/merge_requests/${mrIid}/notes`,
      data: { body }
    });
  }
}

export const gitlabClient = new GitLabClient();
