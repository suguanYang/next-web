import path from "path";

import { FileManager } from "less";

import { aliasResove } from "@/config/alias";
import { PREVIEW_ROOT_DIR } from "@/common/app";
import { tryExtractAppInfoFromPath } from "@/utils";
import {
  tryLoadResource,
  tryResolveMemoizedFile,
} from "@/source-management/remote-source";

class MemoizedFile extends FileManager {
  constructor() {
    super();
  }

  supports() {
    return true;
  }
  supportsSync() {
    return false;
  }
  async resolve(filename: any, dir: any) {
    const basedir = dir ? dir : PREVIEW_ROOT_DIR;

    const { appId, pureAppPath } = tryExtractAppInfoFromPath(
      path.resolve(basedir, filename),
      PREVIEW_ROOT_DIR
    );

    const alias = aliasResove(filename, "");

    const resolvedAlias = alias ? `/${appId}/${alias}` : pureAppPath;

    if (!appId) {
      return null;
    }
    const resolvedPath = tryResolveMemoizedFile(
      appId,
      resolvedAlias,
      // '1',
      true
    );
    if (!resolvedPath) {
      return null;
    }

    return {
      appId,
      path: resolvedPath,
    };
  }

  async loadFile(filename: string, dir: string, opts: any, env: any) {
    const resolved = await this.resolve(filename, dir);
    if (!resolved) {
      return await super.loadFile(filename, dir, opts, env);
    }

    const contents = tryLoadResource(
      resolved.appId,
      resolved.path
    );
    if (!contents) {
      return await super.loadFile(filename, dir, opts, env);
    }
    return {
      filename,
      contents: contents,
    };
  }
}

export default () => ({
  install(less: any, pluginManager: any) {
    pluginManager.addFileManager(new MemoizedFile());
  },
});
