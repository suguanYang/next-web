/**
 * lazy load remote file resources
 * when requests coming:
 *  1. try to check on local cache(resource) and remote cache(update local cache and vite graph)
 *  2. try to load from local cache
 *  3. try to load from disk(only for pre-optimized files)
 *
 * when we have local resouces
 *  1. try to check consistency(version)
 *  2. update resource and invalidate module graph if in-consistency found
 */
import { readFile } from "fs/promises";
import { performance } from "perf_hooks";

import cron from "node-cron";

import {
  timer,
  ONE_YEAR,
  cleanUrl,
  timeFrom,
  iterateDirectory,
  DEFAULT_ASSETS_RE,
  moduleSpecifierInfo2Str,
  millisecondsUntilEndOfToday,
} from "@/utils";
import {
  InvalideResourceException,
  ResourceNotFoundException,
  ResourceFileNotFoundException,
} from "@/common/exceptions";
import PreviewServer from "@/server";
import { logger } from "@/utils/logger";
import { getLock } from "@/infra/lock";
import { getClient } from "@/service/redis";
import { OUT_DIR, PreviewInfo } from "@/common/app";

// using same hash slot with {appID}
const redisSourcesKey = (appId: string) => `preview-resources:{${appId}}`;
export const redisVersionKey = (appId: string) => `preview-version:{${appId}}`;

// use local cache to reduce the network overhead
export const resourceKey = (appId: string) => `${appId}`;
const resources: Map<string, Map<string, string> | undefined> = new Map();
export const visited: Map<string, Map<string, boolean> | undefined> = new Map();
// export const OVER_SANDBOX = 2;
// export const visitedOverSandbox = new Map();

const mergeResource = async (appId: string, files: Record<string, string>) => {
  try {
    const latestResourceStr = await getClient().get(redisSourcesKey(appId));
    const latestResource = JSON.parse(latestResourceStr || "{}");

    const newResource = {
      ...latestResource,
      ...files,
    };

    return newResource;
  } catch (error) {
    logger.error(
      `preview: failed to merge resource ${appId}, ${error?.toString()}`
    );
  }

  return files;
};
const IGNORED_RESOURCES = [
  /\.MD$/,
  /\.d.ts$/,
  /\.json$/,
  /\.html$/,
  /\.gitkeep$/,
  /\.gitignore$/,
  // /__PAGE_SCHEMA__\.json$/,
  // /_new\.json$/,
  /yarn\.lock$/,
  // /package-lock\.json$/,
  // /package\.json$/,
  // /tsconfig\.json$/,
  /webpack-overrides\.js/,
];

// lock not required here since it belongs to the process of resource generation, its already has lock on it
export const writeToRemote = async (
  app: PreviewInfo,
  incremental?: boolean
) => {
  const version = new Date().getTime();
  const { appId, rootDir } = app;
  const stop = timer();
  logger.info(`preview: start copying app ${appId} resources to remote`);
  const localAppRootDir = `${rootDir}`;

  const files: Record<string, string> = {};

  await iterateDirectory({
    dirPath: localAppRootDir,
    exclude: [
      new RegExp(`^${localAppRootDir}/\.git$`),
      new RegExp(`^${localAppRootDir}/node_modules$`),
      new RegExp(`^${localAppRootDir}/static$`),
      new RegExp(`^${localAppRootDir}/metadata$`),
      new RegExp(`^${localAppRootDir}/i18n$`),
      ...IGNORED_RESOURCES,
    ],
    async onFile(filePath) {
      if (DEFAULT_ASSETS_RE.test(filePath)) {
        logger.info(`preivew: customer assets find: ${filePath}`);
        files[filePath.replace(OUT_DIR, "")] = await readFile(
          filePath,
          "base64"
        );
        return;
      }

      let sourceContent = await readFile(filePath, "utf-8");

      files[filePath.replace(OUT_DIR, "")] = sourceContent;
    },
  });

  const client = getClient();
  const lock = getLock();
  const unLock = await lock(redisSourcesKey(appId));
  const expireTime = millisecondsUntilEndOfToday();
  try {
    // start transaction
    await client
      .multi()
      .set(
        redisSourcesKey(appId),
        JSON.stringify(incremental ? await mergeResource(appId, files) : files),
        "PX",
        expireTime
      )
      // the files are commonly greater than 4M, its not a good idea to transfer these
      // files over tcp, since there will be many round-trips over the network.
      // use a version key to check the consistency will decrease average round-trips
      .set(redisVersionKey(appId), version, "PX", expireTime)
      .exec();

    logger.info(
      `preivew: write app ${appId} resources to remote in ${stop()} seconds`
    );
  } catch (error) {
    logger.error(
      `preivew: write app ${appId} resources to remote in failed, detail: ${String(
        error
      )}`
    );
  } finally {
    await unLock();
  }
};

// ensure resources[appId] exists otherwise throw exception
export const fetchResourceOrThrow = async (appId: string) => {
  const perfNow = performance.now();
  const client = getClient();
  try {
    const resource = await client.get(redisSourcesKey(appId));
    const version = await client.get(redisVersionKey(appId));
    if (resource && version) {
      // ensure version
      const files: Record<string, string> = JSON.parse(resource);
      files._version = version;
      resources.set(resourceKey(appId), new Map(Object.entries(files))); // store to local
      // visited.set(resourceKey(appId), new Map());

      logger.info(
        `preivew: get app ${resourceKey(
          appId
        )} resources to local in ${timeFrom(perfNow)}`
      );
      return files;
    }
  } catch (err) {
    logger.error(
      `preview: can not fetch resource for ${resourceKey(
        appId
      )}, detail: ${String(err)}`
    );
  }
  // expired or no resources on the remote
  throw new ResourceNotFoundException(
    `preivew: ${resourceKey(appId)} resouces not existed`
  );
};

export const tryLoadResource = (appId: string, file: string) => {
  if (!resources.has(resourceKey(appId))) {
    throw new ResourceFileNotFoundException(
      `preview: can not load resource ${resourceKey(appId)} with file: ${file}`
    );
  }
  const pureFileId = cleanUrl(file);
  const content = resources.get(resourceKey(appId))?.get(pureFileId);
  if (typeof content !== "string") {
    throw new InvalideResourceException(
      `preview: invalid resource ${resourceKey(
        appId
      )} load ${pureFileId}, current version: ${resources
        .get(resourceKey(appId))
        ?.get("_version")}}`
    );
  }
  return content;
};

const EXTENSIONS = [".tsx", ".ts", ".js"];
const CSS_EXTENSIONS = [".css", ".less", "scss", "sass"];
export const tryResolveMemoizedFile = (
  appId: string,
  tryFile: string,
  // sandbox: string = '1',
  isCss?: boolean
) => {
  if (!resources.has(resourceKey(appId))) {
    throw new ResourceFileNotFoundException(
      `preview: can not resolve resource ${resourceKey(
        appId
      )} with file: ${tryFile}`
    );
  }
  const testFiles: string[] = [];
  testFiles.push(tryFile);
  const exts = isCss ? CSS_EXTENSIONS : EXTENSIONS;
  exts.forEach((ext) => {
    testFiles.push(tryFile + ext);
  });
  exts.forEach((ext) => {
    testFiles.push(tryFile + "/index" + ext);
  });

  let finalPath: string | null = null;
  // if (IS_SINGLE_ENV) {
  testFiles.forEach((testFile) => {
    if (resources.get(resourceKey(appId))!.has(testFile)) {
      finalPath = testFile;
      return;
    }
  });
  // } else {
  //   testFiles.forEach((file) => {
  //     try {
  //       lstatSync(file); // vite resolver does not support async function call
  //       finalPath = file;
  //     } catch (error) {
  //       // console.log("errrr: ");
  //     }
  //   });
  // }

  if (finalPath === null) {
    throw new InvalideResourceException(
      `preview: invalid resource ${resourceKey(
        appId
      )} resolve ${tryFile}, current version: ${resources
        .get(resourceKey(appId))
        ?.get("_version")}}`
    );
  }

  const resolved = `${finalPath}?h=${resources
    .get(resourceKey(appId))!
    .get("_version")}&${moduleSpecifierInfo2Str({
    appId,
    // sandbox,
  })}`;
  // here we add visted again since there may exist dynamic imports
  // if (!visited.get(resourceKey(appId))) {
  //   visited.set(resourceKey(appId), new Map());
  // }
  // if (Number(sandbox) > OVER_SANDBOX) {
  //   visitedOverSandbox.set(resolved, true);
  // }
  // visited.get(resourceKey(appId))!.set(resolved, true);

  return resolved;
};

const useLatestAppResource = async (id: string) => {
  const key = resourceKey(id);
  const client = getClient();
  const version = await client.get(redisVersionKey(id));
  // the remote file has been expired
  if (!version) {
    invalidateAppResourcesByKey(key);
    // logger.warn(`preview: remote file expired: ${id} version: ${version}`);
    throw new ResourceNotFoundException(`preivew: ${id} resources not existed`);
  }

  // update local resource if version mismatch
  if (!resources.has(key) || version !== resources.get(key)!.get("_version")) {
    logger.info(
      `preview: version mismatch detected between local files and remote for resource: ${resourceKey(
        id
      )}`
    );
    invalidateAppResourcesByKey(key);
    await fetchResourceOrThrow(id);
  }

  return resources.get(key)!.get("_version");
};

export const useLatestAppResourceIfNotMatch = async (
  id: string,
  v?: string
) => {
  // ensure resources exists
  if (resources.get(resourceKey(id))?.get("_version") === v) {
    return v;
  }

  return useLatestAppResource(id);
};

export const checkOnResourcesConsistency = () => {
  const useLatestResource = async () => {
    const ids = resources.keys();
    await Promise.all(
      Array.from(ids).map((id) => {
        return useLatestAppResource(id);
      })
    );
  };

  let running = false;

  cron.schedule("* * * * *", () => {
    (async () => {
      try {
        if (running) {
          return;
        }
        running = true;
        logger.info(
          "checkOnResourcesConsistency and memory check runing every minutes......."
        );
        memoryUsageCheck();
        await useLatestResource();
        running = false;
      } catch (error) {
        if (error instanceof ResourceNotFoundException) {
          return;
        }
        logger.error(
          `preview: failed to check remote file consistency, retry, detail: ${String(
            error
          )}`
        );
        running = false;
      }
    })();
  });
};

// invalidate app resources that has been visited
const invalidateAppResourcesByKey = (key: string) => {
  if (resources.has(key) && visited.has(key)) {
    const server = PreviewServer.getInstance();

    const perfNow = performance.now();
    // A faster approach that compare to iterate on the module graph to found the invalidated
    // The alogrithom that have a time complexty of O(len(visited module)) * O(1), since we can get the invalidate
    // mod in O(1) with Hash Map. Otherwise we need to compare on the id string which has a worse case of O(n) and
    // cause a total complexity of O(len(moduleGraphas) * n)
    for (const id of visited.get(key)!.keys()) {
      server?.invalidateModuleById(id) && visited.get(key)?.delete(id);
    }

    if (visited.get(key)?.size === 0) {
      visited.delete(key);
      resources.delete(key);
    } else {
      logger.warn(`preview: can not clear module graph for resource ${key}`);
    }
    logger.info(
      `preview: invalidate app resource ${key} in ${timeFrom(perfNow)}`
    );
  }
};

// 4 GiB
const LOWER_BOUND = 4194304000;
// 6 GiB
const UPPER_BOUND = 6640000000;
const memoryUsageCheck = () => {
  const rss = process.memoryUsage().rss;
  if (rss < LOWER_BOUND) {
    return;
  }
  logger.warn(`preview: memory over size, current: ${rss / 1024 / 1024}MB!!`);
  const isToUpperBound = rss >= UPPER_BOUND;

  const resourceKeys = Array.from(visited.keys());

  const prepareToRuin = resourceKeys.slice(
    0,
    isToUpperBound ? resourceKeys.length : Math.ceil(resourceKeys.length / 2)
  );
  logger.warn(
    `preview: start destory visted module graph: ${prepareToRuin.length}`
  );
  for (const key of prepareToRuin) {
    invalidateAppResourcesByKey(key);
  }

  // server.invalidateModulesByBound(isToUpperBound);
  // do not store too much sandbox!
  // if (visitedOverSandbox.size > 0) {
  //   logger.info('preview: invalidating oversized sandbox');
  //   // cause a total complexity of O(len(moduleGraphas) * n)
  //   for (const id of visitedOverSandbox.keys()) {
  //     const isClear = server?.invalidateModuleById(id);

  //     isClear && visitedOverSandbox.delete(id);
  //   }
  // }
};
