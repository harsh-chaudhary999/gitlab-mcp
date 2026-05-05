import axios from 'axios';

export enum ErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  NOT_FOUND_ERROR = 'not_found_error',
  VALIDATION_ERROR = 'validation_error',
  NETWORK_ERROR = 'network_error',
  PERMISSION_ERROR = 'permission_error',
  CONFLICT_ERROR = 'conflict_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export class MCPError extends Error {
  public readonly type: ErrorType;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode?: number;

  constructor(
    type: ErrorType,
    message: string,
    details?: Record<string, unknown>,
    statusCode?: number
  ) {
    super(message);
    this.name = 'MCPError';
    this.type = type;
    this.details = details;
    this.statusCode = statusCode;
  }

  toJSON() {
    return {
      success: false,
      error: {
        type: this.type,
        message: this.message,
        details: this.details,
        statusCode: this.statusCode
      }
    };
  }
}

export function parseApiError(error: unknown): MCPError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const message = typeof data === 'object' && data?.message
      ? data.message
      : typeof data === 'string'
        ? data
        : error.message;

    if (status === 401) {
      return new MCPError(ErrorType.AUTHENTICATION_ERROR, `Authentication failed: ${message}`, { data }, 401);
    }
    if (status === 403) {
      return new MCPError(ErrorType.PERMISSION_ERROR, `Permission denied: ${message}`, { data }, 403);
    }
    if (status === 404) {
      return new MCPError(ErrorType.NOT_FOUND_ERROR, `Not found: ${message}`, { data }, 404);
    }
    if (status === 409) {
      return new MCPError(ErrorType.CONFLICT_ERROR, `Conflict: ${message}`, { data }, 409);
    }
    if (status === 429) {
      return new MCPError(ErrorType.RATE_LIMIT_ERROR, `Rate limit exceeded`, { data }, 429);
    }
    if (status && status >= 500) {
      return new MCPError(ErrorType.UNKNOWN_ERROR, `Server error (${status}): ${message}`, { data }, status);
    }

    return new MCPError(ErrorType.UNKNOWN_ERROR, message, { data }, status);
  }

  if (error instanceof Error) {
    return new MCPError(ErrorType.UNKNOWN_ERROR, error.message);
  }

  return new MCPError(ErrorType.UNKNOWN_ERROR, 'An unknown error occurred');
}

export function formatSuccessResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
  };
}

export function formatErrorResponse(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const mcpError = error instanceof MCPError ? error : parseApiError(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(mcpError.toJSON(), null, 2) }],
    isError: true
  };
}
