import 'module-alias/register';

import { setUpRedis } from '@/service/redis';
import { setupRedisLock } from '@/service/lock';
import SharedDependecyManger from '@/shared-deps';

export default async () => {
  const client = await setUpRedis();
  client && setupRedisLock(client);
  const sharedDeps = new SharedDependecyManger();

  return sharedDeps.updatePackages();
};
