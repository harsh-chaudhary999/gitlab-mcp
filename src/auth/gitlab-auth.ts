import { config } from '../config';

export class GitLabAuthManager {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor() {
    this.token = config.gitlab.token;
    this.baseUrl = config.gitlab.baseUrl;
  }

  getAuthHeader(): Record<string, string> {
    return { 'PRIVATE-TOKEN': this.token };
  }

  getDefaultHeaders(): Record<string, string> {
    return {
      ...this.getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getApiUrl(): string {
    return `${this.baseUrl}/api/v4`;
  }

  /** Default project used when a tool call omits projectId. Undefined in group-only setups. */
  getProjectId(): string | undefined {
    return config.gitlab.projectId;
  }

  /** Default group ("space") whose repos this server browses. Undefined in single-repo setups. */
  getGroupId(): string | undefined {
    return config.gitlab.groupId;
  }
}

export const gitlabAuth = new GitLabAuthManager();
