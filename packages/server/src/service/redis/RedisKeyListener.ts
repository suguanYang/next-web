import { getClient } from '.';
import { logger } from '@/utils/logger';

interface Task {
  key: string;
  ready: (val: string) => boolean;
  listeners: ((val: string) => void)[];
  //   fail: (errorMsg: string) => void;
  //   retryTimes: number;
}

// fire event once
export default class RedisKeyListener {
  static instance: RedisKeyListener;
  private queue: Map<string, Task>;

  private running: boolean = false;

  static getInstance() {
    if (!RedisKeyListener.instance) {
      RedisKeyListener.instance = new RedisKeyListener();
    }

    return RedisKeyListener.instance;
  }

  listen(
    key: string,
    listener: (val: string) => void,
    options: {
      ready: (val: string) => boolean;
    },
  ) {
    if (this.queue.has(key)) {
      const task = this.queue.get(key)!;
      this.queue.set(key, {
        ...task,
        listeners: task.listeners.concat(listener),
      });
      return;
    }
    this.queue.set(key, {
      key,
      ready: options.ready,
      listeners: [listener],
    });

    if (!this.running) {
      this.run();
      this.running = true;
    }

    return true;
  }

  clearListener(key: string) {
    if (this.queue.has(key)) {
      this.queue.delete(key);
    }
  }

  info() {
    return this.queue;
  }

  private constructor() {
    this.queue = new Map();
  }

  // read only, no need for lock
  private async run() {
    try {
      if (this.queue.size === 0) {
        this.running = false;
        return;
      }

      const client = getClient();
      const keys = [...this.queue.keys()];

      const results = await client.mget([...keys]).then((res) =>
        res.map((val, idx) => ({
          key: keys[idx],
          val,
        })),
      );
      logger.info(`KeyListener: check on these redis keys: ${JSON.stringify(results)}`);

      for (const { key, val } of results) {
        if (key && val && this.queue.has(key)) {
          const { listeners, ready } = this.queue.get(key)!;
          // fire on ready
          if (ready(val)) {
            listeners.forEach((listener) => {
              try {
                listener(val);
              } catch (error) {
                logger.warn(`KeyListener: failed to excute listener for key: ${key}`);
              }
            });
            this.clearListener(key);
          }
        }
      }
    } catch (error) {
      logger.error(`KeyListener: failed to listen, error: ${String(error)}`);
    }

    setTimeout(this.run.bind(this), 3000);
  }
}
