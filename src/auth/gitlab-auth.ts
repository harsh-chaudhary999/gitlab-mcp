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

  getProjectId(): string {
    return config.gitlab.projectId;
  }
}

export const gitlabAuth = new GitLabAuthManager();
