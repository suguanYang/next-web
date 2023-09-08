import type { Cluster, Redis } from 'ioredis';

import {
  RedisLockSetupException,
  AcquireLockExceedMaxLimitException,
} from '@/service/lock/exceptions';

// use 3 minutes of timeout, since the lock maybe used as the dep optimizing key
const defaultTimeout = 60 * 1000 * 3; // 3 minute
const maxRetryCount = 300; // set the max acquire time: maxRetryCount * retryDelay = 60s
const RETRY_DELAY = 200;
async function acquireLock(
  client: Cluster | Redis,
  lockName: string,
  timeout: number,
  retryDelay: number,
  onLockAcquired: (to: number) => void,
  retryCount = 0,
) {
  function retry() {
    setTimeout(function () {
      acquireLock(client, lockName, timeout, retryDelay, onLockAcquired, retryCount + 1);
    }, retryDelay);
  }

  var lockTimeoutValue = Date.now() + timeout + 1;

  client
    .set(lockName, lockTimeoutValue, 'PX', timeout, 'NX')
    .then((res) => {
      if (res === null) {
        retry();
        return;
      }
      onLockAcquired(lockTimeoutValue);
    })
    .catch((err) => {
      if (maxRetryCount < retryCount) {
        throw new AcquireLockExceedMaxLimitException(err);
      }
      retry();
    });
}

let lock: (name: string) => Promise<() => Promise<void>>;
export function setupRedisLock(client: Cluster | Redis, retryDelay: number = RETRY_DELAY) {
  if (!client) {
    throw new RedisLockSetupException();
  }

  lock = function (lockName: string): Promise<() => Promise<void>> {
    return new Promise(function (taskToPerform) {
      lockName = `lock:{${lockName}}`;
      acquireLock(client, lockName, defaultTimeout, retryDelay, function (lockTimeoutValue) {
        taskToPerform(
          () =>
            // return release lock function
            new Promise((resolve, reject) => {
              if (lockTimeoutValue > Date.now()) {
                client
                  .del(lockName)
                  .then((res) => resolve())
                  .catch((err) => reject(err));
                return;
              }
              // the lock already timeout, dot not release, since other clients may use it
              resolve();
            }),
        );
      });
    });
  };
}

export const getLock = () => lock;
