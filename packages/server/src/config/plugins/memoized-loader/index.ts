import path from "path";
import { readFile } from "fs/promises";

import qs from "qs";
import { normalizePath, Plugin } from "vite";

import {
  cleanUrl,
  bareImportRE,
  isExternalUrl,
  DEFAULT_ASSETS_RE,
  asModuleSpecifierInfo,
  INVALID_APP_QUERY_PLACEHOLDER,
} from "@/utils";
import PreviewServer from "@/server";
import { logger } from "@/utils/logger";
import { SERVICE_DOMAIN_NAME } from "@/common/env-vars";
import { FS_PREFIX, PREVIEW_FILE_ASSETS_PREFIX } from "@/common/app";
import {
  tryLoadResource,
  tryResolveMemoizedFile,
} from "@/source-management/remote-source";

const extractQueryFromImporter = (importer: string) => importer?.split("?")[1];

const memoizedLoader = (root: string): Plugin => {
  const cwd = process.cwd();
  return {
    name: "memoized-loader",
    async resolveId(id, importer) {
      const server = PreviewServer.getInstance();

      if (server.optimizer.isOptimizedDepUrl(id)) {
        return `${root}${id}`; // resolve to local file system
      }

      if (isExternalUrl(id)) {
        return {
          id,
          external: true,
        };
      }

      if (id.startsWith(FS_PREFIX)) {
        return null;
      }

      // these are resolved to local file, like vite client scripts, and direct import from node_modules
      if (id.startsWith(cwd)) {
        return null;
      }

      // these are already resolved sources(by alias) requests from client
      if (id.startsWith("/")) {
        return id;
      }

      //relative
      if (id.startsWith(".") && importer) {
        const basedir = path.dirname(importer);
        const fsPath = path.resolve(basedir, id);
        const normalizedFsPath = normalizePath(fsPath);
        // chunks, importer is an optimized dep
        if (server.optimizer.isOptimizedDepFile(normalizedFsPath) && importer) {
          // const queryStr = extractQueryFromImporter(importer);

          // if (!queryStr) {
          //   logger.error(`preview: invalid v for resource: ${id}, from importer: ${importer}`);
          return `${normalizedFsPath}?v=${server.optimizer.getBrowserHash()}`;
          // }
          // return `${normalizedFsPath}?${queryStr}`;
        }

        const queryStr = extractQueryFromImporter(importer);
        const {
          appId,
          //  sandbox,
        } = asModuleSpecifierInfo(qs.parse(queryStr || ""));
        // ensure its a app resource request
        if (appId === INVALID_APP_QUERY_PLACEHOLDER) {
          return null;
        }
        return tryResolveMemoizedFile(
          appId,
          fsPath
          // sandbox
        );
      }

      // try append sandbox id to deps
      if (bareImportRE.test(id) && importer) {
        const resolved = await server.optimizer.tryOptimizedResolve(id);

        if (resolved) {
          // const queryStr = extractQueryFromImporter(importer);

          // // bare import from deps
          // if (server.optimizer.isLocalOptimizedDepFile(importer)) {
          //   return `${cleanUrl(resolved)}?${queryStr}`;
          // }

          // const query = qs.parse(queryStr || '');
          // const { sandbox } = asModuleSpecifierInfo(query);
          // if (sandbox === INVALID_APP_QUERY_PLACEHOLDER) {
          //   // if the dependency encountered in the optimized file was excluded from the optimization
          //   // the dependency needs to be resolved starting from the original source location of the optimized file
          //   // because starting from cache dir will not find the dependency if it was not hoisted
          //   return resolved;
          // }
          return resolved;
        }
      }

      logger.info(
        `preview: bypass memoized loader resolve for ${id} from ${importer}`
      );
      return null;
    },
    async load(id) {
      const server = PreviewServer.getInstance();

      if (DEFAULT_ASSETS_RE.test(cleanUrl(id))) {
        return `export default "${SERVICE_DOMAIN_NAME}${PREVIEW_FILE_ASSETS_PREFIX}?assetId=${encodeURIComponent(
          id
        )}"`;
      }

      if (server.optimizer?.isLocalOptimizedDepFile(id)) {
        const file = cleanUrl(id);

        try {
          return await readFile(file, "utf-8");
        } catch (e) {
          logger.error(
            `preview: can not read optimizing file, detail: ${String(e)}`
          );
        }
      }

      const queryStr = id?.split("?")[1];
      const { appId } = asModuleSpecifierInfo(qs.parse(queryStr || ""));

      if (appId !== INVALID_APP_QUERY_PLACEHOLDER) {
        // try load from memoized files
        const file = tryLoadResource(appId, id);
        return file;
      }

      // logger.info(`preview: bypass memoized loader load for ${id}`);
      return null;
    },
    enforce: "pre",
  };
};

export default memoizedLoader;
