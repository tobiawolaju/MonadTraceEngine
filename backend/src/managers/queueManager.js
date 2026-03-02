export class TaskQueue {
  constructor({ concurrency, maxSize, name }) {
    this.concurrency = concurrency;
    this.maxSize = maxSize;
    this.name = name;
    this.running = 0;
    this.queue = [];
    this.paused = false;
  }

  get depth() {
    return this.queue.length;
  }

  hasCapacity() {
    return this.queue.length < this.maxSize;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.#drain();
  }

  async push(task, { retries = 0, retryDelayMs = 500 } = {}) {
    if (!this.hasCapacity()) {
      const error = new Error(`[queue:${this.name}] Queue full (${this.maxSize})`);
      error.code = 'QUEUE_FULL';
      throw error;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, retries, retryDelayMs });
      this.#drain();
    });
  }

  #drain() {
    if (this.paused) return;

    while (this.running < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift();
      this.running += 1;

      Promise.resolve()
        .then(() => entry.task())
        .then((result) => entry.resolve(result))
        .catch((error) => {
          if (entry.retries > 0) {
            setTimeout(() => {
              this.queue.unshift({
                ...entry,
                retries: entry.retries - 1,
                retryDelayMs: Math.min(entry.retryDelayMs * 2, 5000)
              });
              this.#drain();
            }, entry.retryDelayMs);
          } else {
            entry.reject(error);
          }
        })
        .finally(() => {
          this.running -= 1;
          this.#drain();
        });
    }
  }
}
