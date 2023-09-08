import path from 'path';

import Koa from 'koa';
import 'module-alias/register';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';

import '@/utils/sentry';
import ApiRouter from '@/api';
import PreviewServer from '@/server';
import { logger } from '@/utils/logger';
import { setUpRedis } from '@/service/redis';
import { setupRedisLock } from '@/service/lock';
import Prebundler from '@/optimizer/prebundler';
import SharedDependecyManger from '@/shared-deps';
import { PORT } from '@/common/env-vars';
import runingInBackground from '@/shared-deps/background-job';
import { OptimizingNewDepsException } from '@/common/exceptions';
import { checkOnResourcesConsistency } from '@/source-management/remote-source';

const app = new Koa();

const start = async () => {
  try {

    // const bundler = new Prebundler();
    // await bundler.prebundling();

    const client = await setUpRedis();
    client && setupRedisLock(client);

    const previewServer = PreviewServer.getInstance();
    await previewServer.start(app);

    // const depManager = new SharedDependecyManger();

    const rootRouter = new Router();

    app.use(bodyParser());

    app.use(ApiRouter.routes());
    app.use(rootRouter.routes());
    app.use(rootRouter.allowedMethods());

    const server = app.listen(PORT);

    // try {
    //   const errors = await depManager.updatePackages();
    //   if (errors.length > 0) {
    //     // server.close();
    //     logger.error(`App: update packages error: ${JSON.stringify(errors)}`);
    //     // throw new OptimizingNewDepsException(JSON.stringify(errors));
    //   }
    // } catch (error) {
    //   logger.error(`App: update packages error: ${JSON.stringify(error)}`);
    // }
    // depManager.firstRan = true;

    checkOnResourcesConsistency();

    // runingInBackground();

    logger.info(
      `App: this server is running at http://localhost:${PORT},process-id:${process.pid}`,
    );
    return Promise.resolve(server);
  } catch (error) {
    logger.error(`App: server start error, ${JSON.stringify(error)}`);
    return Promise.reject(error);
  }
};

start();
