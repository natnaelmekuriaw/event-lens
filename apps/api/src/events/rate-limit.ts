import { HttpException } from '@nestjs/common';

export class ProjectRateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly limit = 3000,
    private readonly capacity = 10000,
    private readonly now = Date.now,
  ) {}
  consume(projectId: string, count: number): void {
    const now = this.now();
    let current = this.windows.get(projectId);
    if (!current || current.until <= now) {
      for (const [key, window] of this.windows)
        if (window.until <= now) this.windows.delete(key);
      if (this.windows.size >= this.capacity && !this.windows.has(projectId))
        throw new HttpException('Ingestion is busy. Retry shortly.', 429);
      current = { count: 0, until: now + 60000 };
      this.windows.set(projectId, current);
    }
    if (current.count + count > this.limit)
      throw new HttpException(
        'Project ingestion rate exceeded. Retry after one minute.',
        429,
      );
    current.count += count;
  }
}
