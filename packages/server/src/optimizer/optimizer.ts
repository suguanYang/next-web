/**
 * make the missing deps ditributed over the network
 */
import {
  build,
  InlineConfig,
  optimizeDeps,
  DepsOptimizer,
  resolveConfig,
  OptimizedDepInfo,
  DepOptimizationMetadata,
} from 'vite';

import configs from '@/config';
import { logger } from '@/utils/logger';
import { getLock } from '@/service/lock';
import { getClient } from '@/service/redis';
import { flattenId, ONE_DAY } from '@/utils';
// import uploadFiles from '@/service/uploadFiles';
import { OSS_DOMAIN_NAME } from '@/common/env-vars';
import { OptimizingNewDepsException } from '@/common/exceptions';
import { PREVIEW_ROOT_DIR, SHARED_DEPS_PATH } from '@/common/app';

type DepOptimizationMetadataWithVersion = DepOptimizationMetadata & {
  _version?: string;
};
class Optimizer {
  public processing?: Promise<any>;
  private OSS_TARGET_DIR = '/lib/esm';
  private NEW_DEPS_DIR = `${PREVIEW_ROOT_DIR}/.new_deps`;
  private SYNC_KEY = 'new-dependencies:';
  private opt?: DepsOptimizer;
  private originnalIsOptimizedFile: (id: string) => boolean = () => false;

  private workDir: string = SHARED_DEPS_PATH;

  constructor() {}

  setWorkDir(workDir: string) {
    this.workDir = workDir;
  }

  async init(viteOptimizer: DepsOptimizer) {
    this.opt = viteOptimizer;
    this.opt.registerMissingImport = this.registerMissingImport;
    this.originnalIsOptimizedFile = this.opt.isOptimizedDepFile;
    this.opt.isOptimizedDepFile = this.isOptimizedDepFile;
    this.opt.getOptimizedDepId = this.getOptimizedDepId;
  }

  async transform(dep: string, outDir: string, version?: string) {
    const config = configs({
      root: this.workDir, // use node_modules in workDir
      app: '', // no need to load runtime config
      build: true,
    });
    config.optimizeDeps!.entries = [this.workDir];
    config.optimizeDeps!.include = [dep];
    config.cacheDir = outDir;

    // no chunks!
    // config.optimizeDeps!.esbuildOptions!.splitting = false;
    const metadata = await optimizeDeps(await resolveConfig(config, 'serve'), true);

    const { optimized, depInfoList } = metadata;
    config.optimizeDeps!.include = [];
    const fileName = version ? `${flattenId(dep)}_${version}` : flattenId(dep);

    const buildConfig: InlineConfig = {
      ...config,
      root: '',
      build: {
        ...config.build,
        lib: {
          entry: {
            [dep]: optimized[dep].file,
          },
          name: dep,
          formats: ['es'],
          fileName,
        },
        outDir,
      },
    };
    // using plugins
    await build(buildConfig);

    // here we rewrite the file with uploaded file url
    optimized[dep].file = this.getOptimizedOSSAddress(fileName);
    const depInfo = depInfoList.find((info) => info.id === dep);
    depInfo!.file = this.getOptimizedOSSAddress(fileName);
    metadata.depInfoList = [depInfo!];

    return metadata;
  }

  async tryGetMetadataFromRemote(dep: string, version?: string) {
    const client = getClient();
    // try {
    const depInfoStr = await client.get(`${this.SYNC_KEY}${dep}`);
    const remoteDepInfo: DepOptimizationMetadataWithVersion = depInfoStr && JSON.parse(depInfoStr);
    const skipVersionCheck = !version;
    if (
      remoteDepInfo &&
      remoteDepInfo.hash &&
      (skipVersionCheck || remoteDepInfo._version === version)
    ) {
      // logger.info(`Optimizer: found dep: ${dep}@${version || ''} info from remote`);
      // remoteDepInfo.depInfoList.forEach(({ id }, i) => {
      //   if (id === dep) {
      //     remoteDepInfo.depInfoList[i].file = remoteDepInfo.depInfoList[i].file.replace(
      //       OSS_DOMAIN_NAME,
      //       'http://localhost:8002',
      //     );
      //   }
      // });
      // remoteDepInfo.optimized[dep].file = remoteDepInfo.optimized[dep].file.replace(
      //   OSS_DOMAIN_NAME,
      //   'http://localhost:8002',
      // );
      return remoteDepInfo;
    } else {
      return null;
      // logger.warn(`Optimizer: can not found remote dep: ${dep}, ${version} info`);
    }
    // } catch (error) {
    //   throw new OptimizingNewDepsException(
    //     `Optimizer: try get remote dep: ${dep} info failed, error: ${String(error)}`,
    //   );
    // }
  }

  async filterOptimizedDeps(deps: { [name: string]: string }) {
    const depNames = Object.keys(deps);
    const optimizedDeps = await Promise.all(
      depNames.map((n) =>
        this.tryGetMetadataFromRemote(n, deps[n]).then((meta) => (!!meta ? n : '')),
      ),
    );
    return depNames
      .filter((n) => !optimizedDeps.includes(n))
      .reduce(
        (acc, name) => ({
          ...acc,
          [name]: deps[name],
        }),
        {} as { [name: string]: string },
      );
  }

  async shipMetadata2Remote(dep: string, metadata: DepOptimizationMetadataWithVersion) {
    const client = getClient();
    // try {
    // logger.info(`Optimizer: try ship dep: ${dep} info to remote`);
    await client.set(`${this.SYNC_KEY}${dep}`, JSON.stringify(metadata));
    // } catch (error) {
    //   logger.error(`Optimizer: try ship remote dep: ${dep} info failed, error: ${String(error)}}`);
    // }
  }

  /**
   * if multiple same dep optimizing invoked, the lock will prevent the transform runing on same deps multiple times
   */
  async optimizing(dep: string, version?: string) {
    const lock = getLock();
    const release = await lock(`new-dep:${dep}-${version ? version : ''}`);
    let data: DepOptimizationMetadata;
    try {
      const remoteMetadata = await this.tryGetMetadataFromRemote(dep, version);
      if (remoteMetadata) {
        data = remoteMetadata;
      } else {
        const outDir = `${this.NEW_DEPS_DIR}/${flattenId(dep)}`;
        const metadata = await this.transform(dep, outDir, version);
        await this.uploadOptimized(outDir); // ensure files were uploaded before we ship the metadata
        await this.shipMetadata2Remote(dep, {
          ...metadata,
          _version: version,
        });
        data = metadata;
      }
    } catch (error: any) {
      const errMsg = `Optimizer: try optimzing dep: ${dep}@${version} failed, error: ${String(
        error,
      )}`;
      // logger.error(errMsg);
      // throw new OptimizingNewDepsException(
      //   `preview: try optimzing dep: ${dep} failed, detail: ${String(error)}`,
      // );
      return {
        error: errMsg,
      };
    } finally {
      await release();
    }

    // this.refreshMetadata(data!);
    const needsInterop = data!.depInfoList.find(({ id }) => id === dep)?.needsInterop;
    return {
      exports: [],
      hasImports: !needsInterop, // this can indicate vite
    } as any;
  }

  optimizedDepInfoFromFile(file: string): OptimizedDepInfo | undefined {
    const metadata = this.opt?.metadata;
    return metadata?.depInfoList.find((depInfo) => depInfo.file === file);
  }

  tryOptimizedResolve = async (id: string): Promise<string | undefined> => {
    // check remote info first, so we can always get the latest dep info
    const metadata = await this.tryGetMetadataFromRemote(id);
    if (metadata && metadata.optimized[id]) {
      const { depInfoList } = metadata;
      const remoteDepinfo = depInfoList.find((info) => info.id === id)!;

      // @COMPATIBLE: old version compatible
      if (remoteDepinfo) {
        // the vite internal need the metadata
        this.refreshMetadata(metadata);
        return this.getOptimizedDepId(remoteDepinfo);
      }
      // const optimizedAddr = this.getOptimizedOSSAddress(flattenId(id));
      // optimized[id].file = optimizedAddr;
      // remoteDepinfo.file = optimizedAddr;
      // metadata.depInfoList = [remoteDepinfo];
      // await this.shipMetadata2Remote(id, metadata);
      // this.refreshMetadata(metadata);

      // return this.getOptimizedDepId(remoteDepinfo);
    }

    const depInfo = this.optimizedDepInfoFromId(id);
    if (depInfo) {
      return this.getOptimizedDepId(depInfo);
    }
    logger.warn(
      `Optimizer: can not found dependency info from any metadata: ${id}, ${JSON.stringify(
        metadata,
      )}`,
    );
  };

  isOptimizedDepFile = (normalizedFsPath: string) =>
    this.originnalIsOptimizedFile(normalizedFsPath) || normalizedFsPath.startsWith(OSS_DOMAIN_NAME);
  // @LOCAL
  // normalizedFsPath.startsWith('http://localhost:8002');

  isLocalOptimizedDepFile = (normalizedFsPath: string) =>
    this.originnalIsOptimizedFile(normalizedFsPath) &&
    !normalizedFsPath.startsWith(OSS_DOMAIN_NAME);

  isOptimizedDepUrl = (url: string) => this.opt?.isOptimizedDepUrl(url);

  getBrowserHash = () => this.opt?.metadata.browserHash || '';

  // controll the vite behavior
  private registerMissingImport = (id: string, resolved: string) => {
    const optimized = this.opt!.metadata.optimized[id];
    if (optimized) {
      return optimized;
    }
    const chunk = this.opt!.metadata.chunks[id];
    if (chunk) {
      return chunk;
    }
    const discovered = this.opt!.metadata.discovered[id];
    if (discovered) {
      return discovered;
    }
    logger.info(`Optimizer: new dependency found: ${id}`);

    const promising = this.optimizing(id);
    this.processing = promising.then(() => (this.processing = undefined));
    const missing: OptimizedDepInfo = {
      id,
      file: this.getOptimizedOSSAddress(flattenId(id)),
      src: resolved,
      browserHash: '',
      // loading of this pre-bundled dep needs to await for its processing
      processing: promising.then(() => void 0),
      exportsData: promising,
    };
    this.opt?.metadata.depInfoList.push(missing);
    return missing;
  };

  private getOptimizedDepId = (depInfo: OptimizedDepInfo) => {
    return depInfo.file + '?v=' + this.getBrowserHash();
  };

  private optimizedDepInfoFromId = (id: string): OptimizedDepInfo | undefined => {
    const metadata = this.opt?.metadata;
    return metadata?.optimized[id] || metadata?.discovered[id] || metadata?.chunks[id];
  };

  // @WARN do not rely on internal metadata(a local state), we should use this carefully!
  private refreshMetadata(metadata: DepOptimizationMetadata) {
    this.opt!.metadata.optimized = {
      ...this.opt!.metadata.optimized,
      ...Object.entries(metadata.optimized).reduce((acc, [id, optimized]) => {
        return {
          ...acc,
          [id]: optimized,
        };
      }, {}),
    };
    // no chunks!
    // this.opt!.metadata.chunks
    this.opt!.metadata.depInfoList = this.opt!.metadata.depInfoList.filter(
      (info) => !metadata.depInfoList.some((newInfo) => newInfo.id === info.id),
    ).concat(metadata.depInfoList);
  }

  private getOptimizedOSSAddress(file: string) {
    return `${OSS_DOMAIN_NAME}${this.OSS_TARGET_DIR}/${file}.mjs`;
  }

  private async uploadOptimized(sourceDir: string) {
    // return uploadFiles({
    //   sourceFloder: sourceDir,
    //   targetFloder: this.OSS_TARGET_DIR,
    // });
  }
}

export default Optimizer;
