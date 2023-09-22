import path from "path";

export const PREVIEW_ROOT_DIR = path.join(process.cwd(), "assets");

export type PreviewInfo = {
  appId: string;
  rootDir: string;
};
export type Config = {
  appId: string;
  deployId: string;
  extraData: {};
  isDependentApp: boolean;
  pages?: string[] | undefined;
};

export const CACHE_DIR = `${PREVIEW_ROOT_DIR}/.esm`;
export const CACHE_DEP_DIR = path.join(CACHE_DIR, "deps");
export const CACHE_DEP_METADATA_PATH = path.join(
  CACHE_DEP_DIR,
  "_metadata.json"
);

export const PREVIEW_FILE_RESOURCE_PREFIX = "/sandbox/resource";
export const PREVIEW_FILE_PRELOAD_RESOURCE = "/sandbox/preload";
export const PREVIEW_FILE_ASSETS_PREFIX = "/sandbox/assets";
export const PREVIEW_MODULE_INFO = "/sandbox/modules";

// sometime the server need to behind the gateway, and the forward rule must
// match some part of http path, this is not a problem for a backend service since
// these part of path usually will be cut off by the gateway, but for sandbox
// it must also make the frontend resource(the import paths) acknowledge it,
export const _TODO_ROUTER_NAME_BEFORE_PREVIEW_SERVICE = "";

export const FS_PREFIX = "/@fs/";

export const PREVIEW_CLIENT_SCRIPTS = path.join(
  process.cwd(),
  "src/source-management/client"
);

export const SHARED_DEPS_PATH = path.join(process.cwd(), "shared-deps");

export const SHARED_DEPS_PACKAGE_JSON_PATH = path.join(
  SHARED_DEPS_PATH,
  "package.json"
);

export const SHARED_DEPS_NODE_MODULES_PATH = path.join(
  SHARED_DEPS_PATH,
  "node_modules"
);

export const OUT_DIR = path.join(process.cwd(), "output");
