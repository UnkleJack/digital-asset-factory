export class Semaphore {
  private available: number;
  private waiters: (() => void)[] = [];

  constructor(size: number) {
    this.available = size;
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.available > 0) this.available--;
    else await new Promise<void>((resolve) => this.waiters.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.available++;
    }
  }
}
