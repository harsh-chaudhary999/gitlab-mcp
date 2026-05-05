import { MCPError, ErrorType } from './error-handler';

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
}

export class RateLimiter {
  private readonly requestsPerSecond: number;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private queue: QueueItem<unknown>[] = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(requestsPerSecond = 10, maxRetries = 3, baseDelay = 1000) {
    this.requestsPerSecond = requestsPerSecond;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  private getDelay(): number {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;
    return elapsed >= minInterval ? 0 : minInterval - elapsed;
  }

  private getBackoffDelay(retryCount: number): number {
    return this.baseDelay * Math.pow(2, retryCount) + Math.random() * 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown, retryCount: number): boolean {
    if (retryCount >= this.maxRetries) return false;
    if (error instanceof MCPError) {
      return error.type === ErrorType.RATE_LIMIT_ERROR || error.type === ErrorType.NETWORK_ERROR;
    }
    const status = (error as any)?.response?.status;
    return status !== undefined && status >= 500;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      const delay = this.getDelay();
      if (delay > 0) await this.sleep(delay);

      try {
        this.lastRequestTime = Date.now();
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        if (this.shouldRetry(error, item.retries)) {
          await this.sleep(this.getBackoffDelay(item.retries));
          this.queue.unshift({ ...item, retries: item.retries + 1 });
        } else {
          item.reject(error as Error);
        }
      }
    }

    this.processing = false;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0
      });
      this.processQueue();
    });
  }
}

export const gitlabRateLimiter = new RateLimiter(10, 3, 1000);
