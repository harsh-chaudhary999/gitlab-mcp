import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { gitlabAuth } from '../auth/gitlab-auth';
import { gitlabRateLimiter } from '../utils/rate-limiter';
import { parseApiError, MCPError, ErrorType } from '../utils/error-handler';

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
  description?: string | null;
  archived?: boolean;
  last_activity_at?: string;
}

export interface GitLabGroup {
  id: number;
  name: string;
  full_path: string;
  description?: string | null;
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
  private readonly projectId: string | undefined;
  private readonly groupId: string | undefined;
  // name -> encoded full path. Process-lifetime only; a renamed repo needs a restart.
  private readonly projectRefCache = new Map<string, string>();

  constructor() {
    this.projectId = gitlabAuth.getProjectId();
    this.groupId = gitlabAuth.getGroupId();
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

  /**
   * Resolve any project reference into something the GitLab API accepts.
   *
   * GitLab only understands a numeric ID or a URL-encoded full path (group%2Fproject) — a
   * bare project name yields a 404. Callers (and the LLMs driving them) naturally say
   * "the payments repo", so three input forms are accepted:
   *
   *   "41829304"                -> numeric ID, used as-is
   *   "group/payments"          -> full path, encoded (idempotent if already encoded)
   *   "payments"                -> plain name, resolved via search
   *
   * Name resolution is scoped to GITLAB_GROUP_ID when set, otherwise searched across every
   * project the token can see. Ambiguous names raise an error listing the candidates rather
   * than silently picking one — guessing which repo to commit to is not recoverable.
   */
  private async resolveProjectId(projectId?: string): Promise<string> {
    const ref = (projectId || this.projectId || '').trim();
    if (!ref) {
      throw new MCPError(
        ErrorType.VALIDATION_ERROR,
        'No project specified and no default configured. Pass projectId (numeric ID, ' +
        'full path like "group/repo", or the repo name), or set GITLAB_PROJECT_ID. ' +
        'Use gitlab_find_projects or gitlab_list_group_projects to discover repos.'
      );
    }

    // Numeric ID — nothing to resolve.
    if (/^\d+$/.test(ref)) return ref;

    // Full path, encoded or not. Decode first so re-encoding is idempotent and an
    // already-encoded "group%2Frepo" does not become "group%252Frepo".
    if (ref.includes('/') || ref.includes('%2F') || ref.includes('%2f')) {
      return encodeURIComponent(decodeURIComponent(ref));
    }

    return this.resolveProjectByName(ref);
  }

  /** Resolve a bare project name to an encoded full path, cached per process. */
  private async resolveProjectByName(name: string): Promise<string> {
    const cacheKey = name.toLowerCase();
    const cached = this.projectRefCache.get(cacheKey);
    if (cached) return cached;

    // Group scope first: narrower, faster, and much less likely to be ambiguous.
    const candidates = this.groupId
      ? await this.listGroupProjects(undefined, { search: name, includeSubgroups: true })
      : await this.requestAllPages<GitLabProject>(
          '/projects', { search: name, membership: true, simple: true }, 100, 5
        );

    // Prefer exact matches on display name or final path segment; GitLab's `search` is a
    // substring match, so "api" would otherwise happily return "api-gateway-legacy".
    const lower = name.toLowerCase();
    const exact = candidates.filter(p =>
      p.name?.toLowerCase() === lower ||
      p.path_with_namespace?.toLowerCase().split('/').pop() === lower
    );
    const matches = exact.length > 0 ? exact : candidates;

    if (matches.length === 0) {
      throw new MCPError(
        ErrorType.NOT_FOUND_ERROR,
        `No project matching "${name}" is visible to this token` +
        (this.groupId ? ` within group "${this.groupId}"` : '') +
        '. Check the name, or pass a numeric ID or full path like "group/repo". ' +
        'Use gitlab_find_projects to list what is reachable.'
      );
    }

    if (matches.length > 1) {
      throw new MCPError(
        ErrorType.VALIDATION_ERROR,
        `"${name}" is ambiguous — ${matches.length} projects match. Re-issue the call with ` +
        `one of these full paths (or its numeric ID): ` +
        matches.slice(0, 20).map(p => `${p.path_with_namespace} (id ${p.id})`).join(', ') +
        (matches.length > 20 ? `, and ${matches.length - 20} more` : ''),
        { candidates: matches.slice(0, 20).map(p => ({ id: p.id, path: p.path_with_namespace })) }
      );
    }

    const encoded = encodeURIComponent(matches[0].path_with_namespace);
    this.projectRefCache.set(cacheKey, encoded);
    return encoded;
  }

  /** Search projects reachable by this token, scoped to the group when one is configured. */
  async findProjects(search: string, groupId?: string): Promise<GitLabProject[]> {
    const gid = groupId || this.groupId;
    if (gid) {
      return this.listGroupProjects(gid, { search, includeSubgroups: true });
    }
    return this.requestAllPages<GitLabProject>(
      '/projects', { search, membership: true, simple: true }, 100, 5
    );
  }

  /** Resolve and URL-encode a group ("space") reference. */
  private resolveGroupId(groupId?: string): string {
    const gid = groupId || this.groupId;
    if (!gid) {
      throw new MCPError(
        ErrorType.VALIDATION_ERROR,
        'No group specified and no default configured. Pass groupId, or set GITLAB_GROUP_ID.'
      );
    }
    return encodeURIComponent(gid);
  }

  /** Paginate a list endpoint until a short page arrives. */
  private async requestAllPages<T>(
    url: string,
    params: Record<string, unknown> = {},
    perPage: number = 100,
    maxPages: number = 100
  ): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const items = await this.request<T[]>({
        method: 'GET',
        url,
        params: { ...params, per_page: perPage, page }
      });
      if (!Array.isArray(items)) break;
      all.push(...items);
      if (items.length < perPage) return all;
    }
    return all;
  }

  // --- Group ("space") ---

  async getGroup(groupId?: string): Promise<GitLabGroup> {
    const gid = this.resolveGroupId(groupId);
    return this.request<GitLabGroup>({ method: 'GET', url: `/groups/${gid}` });
  }

  /**
   * List repos (projects) in a group — the entry point for multi-repo access.
   *
   * includeSubgroups defaults to true: GitLab groups are usually nested, and a listing that
   * silently stopped at the top level would look like the subgroup repos do not exist.
   */
  async listGroupProjects(
    groupId?: string,
    options?: {
      includeSubgroups?: boolean;
      search?: string;
      includeArchived?: boolean;
      orderBy?: 'name' | 'path' | 'created_at' | 'updated_at' | 'last_activity_at';
    }
  ): Promise<GitLabProject[]> {
    const gid = this.resolveGroupId(groupId);
    // Deliberately no min_access_level: that restricts results to repos where the token
    // holder has explicit MEMBERSHIP, which would silently hide public/internal repos in
    // the group that the token can read perfectly well. GitLab already scopes the listing
    // to what the caller is allowed to see.
    const params: Record<string, unknown> = {
      include_subgroups: options?.includeSubgroups !== false,
      order_by: options?.orderBy || 'last_activity_at'
    };
    if (options?.search) params.search = options.search;
    // Omit the param entirely when archived repos are wanted — `archived=true` would
    // return ONLY archived ones, which is not the same as "include them".
    if (!options?.includeArchived) params.archived = false;

    return this.requestAllPages<GitLabProject>(`/groups/${gid}/projects`, params);
  }

  async listSubgroups(groupId?: string): Promise<GitLabGroup[]> {
    const gid = this.resolveGroupId(groupId);
    return this.requestAllPages<GitLabGroup>(`/groups/${gid}/subgroups`, {});
  }

  // --- Project ---

  async getProject(projectId?: string): Promise<GitLabProject> {
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabProject>({ method: 'GET', url: `/projects/${pid}` });
  }

  // --- Branches ---

  async listBranches(projectId?: string, search?: string): Promise<GitLabBranch[]> {
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabBranch[]>({
      method: 'GET',
      url: `/projects/${pid}/repository/branches`,
      params: search ? { search } : undefined
    });
  }

  async createBranch(branch: string, ref: string, projectId?: string): Promise<GitLabBranch> {
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabBranch>({
      method: 'POST',
      url: `/projects/${pid}/repository/branches`,
      params: { branch, ref }
    });
  }

  async deleteBranch(branch: string, projectId?: string): Promise<void> {
    const pid = await this.resolveProjectId(projectId);
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
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabCommit>({
      method: 'POST',
      url: `/projects/${pid}/repository/commits`,
      data: { branch, commit_message: commitMessage, actions }
    });
  }

  async getFile(filePath: string, ref: string, projectId?: string): Promise<{ content: string; encoding: string }> {
    const pid = await this.resolveProjectId(projectId);
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
    const pid = await this.resolveProjectId(projectId);
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
    const pid = await this.resolveProjectId(projectId);
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
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabMergeRequest[]>({
      method: 'GET',
      url: `/projects/${pid}/merge_requests`,
      params: { state: state || 'opened' }
    });
  }

  async getMergeRequest(mrIid: number, projectId?: string): Promise<GitLabMergeRequest> {
    const pid = await this.resolveProjectId(projectId);
    return this.request<GitLabMergeRequest>({
      method: 'GET',
      url: `/projects/${pid}/merge_requests/${mrIid}`
    });
  }

  async addMergeRequestNote(mrIid: number, body: string, projectId?: string): Promise<unknown> {
    const pid = await this.resolveProjectId(projectId);
    return this.request<unknown>({
      method: 'POST',
      url: `/projects/${pid}/merge_requests/${mrIid}/notes`,
      data: { body }
    });
  }
}

export const gitlabClient = new GitLabClient();
