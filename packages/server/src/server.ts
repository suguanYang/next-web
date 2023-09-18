import { ServerResponse } from "http";

import mime from "mime";
import qs from "querystring";
import Koa, { Next } from "koa";
import KoaConnect from "koa-connect";
import { RouterContext } from "koa-router";
import { createServer, ModuleGraph } from "vite";
import type { DepsOptimizer, InlineConfig, ViteDevServer } from "vite";

import {
  cleanUrl,
  waitOnCondition,
  asModuleSpecifierInfo,
  moduleSpecifierInfo2Str,
  INVALID_APP_QUERY_PLACEHOLDER,
} from "@/utils";
import {
  PREVIEW_MODULE_INFO,
  PREVIEW_FILE_ASSETS_PREFIX,
  PREVIEW_FILE_RESOURCE_PREFIX,
  PREVIEW_FILE_PRELOAD_RESOURCE,
  _TODO_ROUTER_NAME_BEFORE_PREVIEW_SERVICE,
} from "@/common/app";
import configs from "@/config";
import { logger } from "@/utils/logger";
import {
  visited,
  resourceKey,
  tryLoadResource,
  fetchResourceOrThrow,
  useLatestAppResourceIfNotMatch,
} from "@/source-management/remote-source";
import Optimizer from "@/optimizer/optimizer";
import { consumeError } from "@/source-management/error";
import { ResourceNotFoundException } from "@/common/exceptions";

class PreviewServer {
  private status: "ready" | "wait" = "wait";
  private internalServer?: ViteDevServer;
  private static instance: PreviewServer;
  private ensureEntryFromUrl?: ModuleGraph["ensureEntryFromUrl"];

  public optimizer: Optimizer;

  async start(app: Koa) {
    const config = configs();

    this.optimizerSetter(config);
    this.internalServer = await createServer(config);

    // theres no files
    this.internalServer.moduleGraph.fileToModulesMap = {
      get() {},
      set() {},
    } as any;
    this.internalServer.moduleGraph.safeModulesPath = {
      add() {},
      has() {},
    } as any;
    this.ensureEntryFromUrl = this.internalServer.moduleGraph.ensureEntryFromUrl.bind(
      this.internalServer.moduleGraph
    );
    // @ts-ignore
    this.internalServer.moduleGraph.ensureEntryFromUrl = this.ensureEntryFromUrlOverride;
    // @TODO vite upgrade
    // this.ensureEntryFromUrl = this.internalServer.moduleGraph._ensureEntryFromUrl.bind(
    //   this.internalServer.moduleGraph,
    // );
    // this.internalServer.moduleGraph._ensureEntryFromUrl = this.ensureEntryFromUrlOverride;
    this.status = "ready";
    app.use(this.middleware);
    app.use(this.errorMiddleware);
    logger.info("preview server start success");
  }

  invalidateModuleById(id: string) {
    if (!this.internalServer) {
      return false;
    }

    // @ts-ignore
    if (this.internalServer._pendingRequests.get(id)) {
      logger.warn(`PreviewServer: module still be used: ${id}`);
      return false;
    }
    const mod = this.internalServer?.moduleGraph.idToModuleMap.get(id);
    if (mod) {
      // const id2File = cleanUrl(id);
      const id2Url = id;
      this.internalServer?.moduleGraph.idToModuleMap.delete(id);
      this.internalServer?.moduleGraph.urlToModuleMap.delete(id2Url);
      // this.internalServer?.moduleGraph.fileToModulesMap.delete(id2File);
      this.internalServer.moduleGraph.invalidateModule(mod);
    }

    return true;
  }

  async destory() {
    return this.internalServer?.close();
  }

  static getInstance() {
    if (!PreviewServer.instance) {
      PreviewServer.instance = new PreviewServer();
    }
    return PreviewServer.instance;
  }

  static async getInstanceAsync() {
    return waitOnCondition(
      () => PreviewServer.instance.status === "ready",
      "PreviewServer: wait on preview server init"
    ).then(() => this.instance);
  }

  private constructor() {
    this.optimizer = new Optimizer();
  }

  private optimizerSetter(config: InlineConfig) {
    // Hacking
    const context = this;
    const originSet = WeakMap.prototype.set;
    WeakMap.prototype.set = function (key: any, val: DepsOptimizer) {
      const weakMapInstance = this;

      if (
        key?.root === config.root &&
        key?.plugins?.some((p: any) => p.name === "vite-plugin-externals") &&
        val?.metadata?.hash
      ) {
        context.optimizer.init(val);
      }

      return originSet.bind(weakMapInstance)(key, val);
    };
  }

  private middleware = async (ctx: RouterContext, next: Next) => {
    if (ctx.request.path.startsWith(PREVIEW_FILE_RESOURCE_PREFIX)) {
      ctx.req.url = `${_TODO_ROUTER_NAME_BEFORE_PREVIEW_SERVICE}${ctx.req.url}`; // match the base

      this.onResEnd(ctx.res, ctx);

      if (await this.tryApplyLtsVersionToQuery(ctx)) {
        return KoaConnect(this.internalServer!.middlewares)(ctx as any, next);
      }

      return;
    }

    if (ctx.request.path.startsWith(PREVIEW_FILE_ASSETS_PREFIX)) {
      this.onResEnd(ctx.res, ctx);
      return this.tryhandleAssets(ctx);
    }

    if (ctx.request.path.endsWith(PREVIEW_MODULE_INFO)) {
      return this.getModuleInfo(ctx);
    }

    if (ctx.request.path.endsWith(PREVIEW_FILE_PRELOAD_RESOURCE)) {
      return this.preloadResource(ctx);
    }

    // these actually used for local development
    // const paths = ctx.request.path.split('/');
    // const firstPath = paths.length > 1 ? paths[1] : '';
    // if (proxyAPIs[`/${firstPath}`]) {
    //   return KoaConnect(this.internalServer!.middlewares)(ctx as any, next);
    // }

    // if (ctx.request.path.startsWith('/springrwxcsfzncopycopy3904766265229330997')) {
    //   return this.html(ctx);
    // }

    await next();
  };

  private async tryApplyLtsVersionToQuery(ctx: RouterContext) {
    const {
      // sandbox,
      h,
      appId,
    } = asModuleSpecifierInfo(ctx.request.query);

    // only app source code have valid appId on query
    if (appId === INVALID_APP_QUERY_PLACEHOLDER) {
      return true;
    }

    try {
      const latestVersion = await useLatestAppResourceIfNotMatch(appId, h);
      if (latestVersion !== h)
        // TODO(@wangbinq): we should do a fully reload on the client
        // ensure use latest version to load resource
        ctx.req.url = `${
          ctx.request.path
        }?h=${latestVersion}&${moduleSpecifierInfo2Str({
          appId,
          // sandbox,
        })}`;

      // const id = ctx.request.url.replace(PREVIEW_FILE_RESOURCE_PREFIX, '');
      // if (Number(sandbox) > OVER_SANDBOX) {
      //   visitedOverSandbox.set(id, true);
      // }
      // visited.get(resourceKey(appId))?.set(id, true);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        ctx.res.statusCode = 200;
        ctx.type = "application/javascript";
        ctx.res.end(`
          const message = '前端资源已失效，请重新进行前端构建, 资源最后生成时间${new Date(
            Number(h || "0")
          ).toLocaleDateString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}'
          alert(message);
        `);
        return false;
      }
      logger.error(
        `PreviewServer: can not handle request: ${
          ctx.req.url
        }: detail: ${String(error)}`
      );
    }

    return true;
  }

  private getModuleInfo(ctx: RouterContext) {
    const moduleGraph = this.internalServer?.moduleGraph;

    if (moduleGraph) {
      const visitedNest = Array.from(visited.keys()).reduce(
        (acc, k) =>
          visited.get(k) ? acc.concat(Array.from(visited.get(k)!.keys())) : acc,
        [] as string[]
      );
      const { idToModuleMap, urlToModuleMap, fileToModulesMap } = moduleGraph;

      const appMods = {
        // idToModuleMap: Array.from(idToModuleMap.keys()),
        // urlToModuleMap: Array.from(urlToModuleMap.keys()),
        // fileToModulesMap: fileToModulesMap,
        // visited: visitedNest,
        // total: {
        idToModuleMap: idToModuleMap.size,
        urlToModuleMap: urlToModuleMap.size,
        visited: visitedNest.length,
        // overSandbox: visitedOverSandbox.size,
        // },
      };

      ctx.response.status = 200;
      ctx.type = "application/json";
      ctx.body = JSON.stringify(appMods);
      return;
    }

    ctx.response.status = 404;
  }

  private async preloadResource(ctx: RouterContext) {
    const { appId } = ctx.request.query as any;

    try {
      const appFiles = await fetchResourceOrThrow(appId);

      ctx.response.status = 200;
      ctx.type = "application/javascript";
      ctx.body = JSON.stringify(
        Object.keys(appFiles)
          .map((fileName) => fileName)
          .filter(
            (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx")
          )
      );
    } catch (error) {
      ctx.response.status = 404;
      return;
    }
  }

  private async tryhandleAssets(ctx: RouterContext) {
    try {
      const query = ctx.request.query;
      const { assetId } = query as { assetId: string };
      const decodedId = decodeURIComponent(assetId);
      const [pureUrl, idQueryStr] = decodedId.split("?");
      const { appId, h } = asModuleSpecifierInfo(qs.parse(idQueryStr));
      if (appId) {
        await useLatestAppResourceIfNotMatch(appId, h);

        const content = tryLoadResource(appId, pureUrl);

        ctx.body = Buffer.from(content || "", "base64");
        ctx.type = mime.getType(pureUrl) || "";
      }
    } catch (error) {
      logger.error(
        `PreviewServer: can not handle assets request: ${
          ctx.request.url
        }, detail: ${String(error)}`
      );
      ctx.status = 404;
    }
  }

  private ensureEntryFromUrlOverride = async (
    rawUrl: string,
    ssr?: boolean,
    setIsSelfAccepting = true
  ) => {
    try {
      const queryStr = rawUrl.split("?")[1];
      const { appId } = asModuleSpecifierInfo(qs.parse(queryStr || ""));
      if (appId !== INVALID_APP_QUERY_PLACEHOLDER) {
        const resurceKey = resourceKey(appId);
        if (!visited.get(resurceKey)) {
          visited.set(resurceKey, new Map());
        }

        visited.get(resurceKey)!.set(rawUrl, true);
      }
    } catch (error) {
      logger.error(
        `PreviewServer: can not set module info, detail: ${String(error)}`
      );
    }

    return this.ensureEntryFromUrl!(rawUrl, ssr, setIsSelfAccepting);
  };

  // vite server can not transform this request, try to find error message
  private errorMiddleware = async (ctx: RouterContext, next: Next) => {
    const err = consumeError(cleanUrl(ctx.request.url));
    if (err) {
      ctx.response.status = 200;
      ctx.type = "application/javascript";
      ctx.body = `
      // if you dig into this file, it means something wrong with this file, and the error is represented as the import path
      import "\\n ${err.id} \\n compile error \\n ${err.message} \\n detail: \\n ${err.frame}";`;
      // ctx.set('Cache-Control', '');
      // ctx.set('Expires', '');
      return;
    }

    await next();
  };

  private onResEnd(res: ServerResponse, ctx: RouterContext) {
    // Hacking!! rewriting res end
    const originEnd = res.end.bind(res);
    res.end = (content) => {
      this.strongCache(ctx);
      (async () => {
        await this.responseWaitingOnOptimizer();
        originEnd(content);
      })();
      return res;
    };

    return res;
  }

  private async responseWaitingOnOptimizer() {
    // do not send response if optimizer is still processing new dep
    this.optimizer?.processing && (await this.optimizer.processing);
  }

  // one week cache for both source code and deps
  private strongCache = (ctx: RouterContext) => {
    // ensure the client will get the latest resource
    // if (ctx.request.path.endsWith('sandbox-wrapper.tsx')) {
    //   return;
    // }
    const status = ctx.response.status;
    // samplingLog(ctx.response, ctx.request.url);
    if (status >= 400 || status < 200) {
      logger.error(
        `PreviewServer: can not handle request: ${
          ctx.req.url
        }, response: ${JSON.stringify(ctx.response)}`
      );
      return;
    }
    ctx.set("Cache-Control", "public, max-age=604800");
    ctx.set("Expires", new Date(Date.now() + 604800000).toUTCString());
  };
}

export default PreviewServer;
