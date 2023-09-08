/** the lifecycle will manage preview app status */
import { getLock } from '@/service/lock';
import { getClient } from '@/service/redis';

const appRedisKey = (appId: string) => `preview-status:{${appId}}`;
const appErrorMsg = (appId: string) => `preview-error-msg:{${appId}}`;

export const MAX_TIMEOUT = 60 * 1000 * 10; // 10 minutes
export enum APP_STATUS {
  IDLE = 'idle',
  PENDING = 'pending',
  FAILED = 'failed',
}
export const pendingAppResource = async (appId: string) => {
  const lock = getLock();
  const unLock = await lock(`preview-${appId}`);
  try {
    const client = getClient();
    const status = await client.get(appRedisKey(appId));
    if (status === APP_STATUS.PENDING) {
      // the app resource was opreated by other process
      return false;
    }
    await client
      .pipeline()
      .del(appErrorMsg(appId))
      .set(appRedisKey(appId), APP_STATUS.PENDING, 'PX', MAX_TIMEOUT)
      .exec();
    return true;
  } finally {
    // Release the lock.
    await unLock();
  }
};

export const freeAppResource = async (appId: string) =>
  getClient().set(appRedisKey(appId), APP_STATUS.IDLE);

export const failAppResource = async (appId: string, errMsg: string) =>
  getClient()
    .pipeline()
    .set(appRedisKey(appId), APP_STATUS.FAILED)
    .set(appErrorMsg(appId), errMsg)
    .exec();

export const getAppStatus = async (appId: string) => {
  const client = getClient();
  const status = (await client.get(appRedisKey(appId))) || APP_STATUS.IDLE;

  if (status === APP_STATUS.FAILED) {
    return [status, await client.get(appErrorMsg(appId))];
  }

  return [status, null];
};
