/** Bounded concurrency for rate-limited vendor calls. */
export function makeConcurrencyLimiter(maxConcurrent: number) {
  if (maxConcurrent < 1) {
    throw new ValidationError("maxConcurrent must be at least 1");
  }

  let running = 0;
  const waiters: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (running < maxConcurrent) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiters.push(() => {
        running += 1;
        resolve();
      });
    });
  }

  function release(): void {
    running -= 1;
    const next = waiters.shift();
    if (next) next();
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export type ConcurrencyLimiter = ReturnType<typeof makeConcurrencyLimiter>;
