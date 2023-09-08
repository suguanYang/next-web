import path from 'path';

import cron from 'node-cron';
import Piscina from 'piscina';

import { logger } from '@/utils/logger';

const backgroundSharedDepsMangerTask = new Piscina({
  filename: path.join(__dirname, './worker.js'),
  maxThreads: 1,
  niceIncrement: 100,
});

const runingInBackground = () => {
  let runing = false;

  cron.schedule('*/30 * * * *', () => {
    (async () => {
      try {
        if (runing) {
          return;
        }
        runing = true;
        logger.info('SharedDependecyManger: update components runing every 30 minutes.......');
        const errors = await backgroundSharedDepsMangerTask.run({});
        if (errors.length > 0) {
          logger.error(
            `SharedDependecyManger: update packages in background failed: ${JSON.stringify(
              errors,
            )}`,
          );
        }
        await backgroundSharedDepsMangerTask.destroy();
        runing = false;
      } catch (error) {
        logger.error(
          `SharedDependecyManger: failed to update components, retry, detail: ${String(error)}`,
        );
        runing = false;
      }
    })();
  });
};

export default runingInBackground;
