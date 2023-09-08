import { InlineConfig, mergeConfig } from 'vite';

import { PREVIEW_ROOT_DIR } from '@/common/app';
import base from '@/config/base-config';
import runtime from '@/config/runtime-config';

type Config = {
  root: string;
  app: string;
  build: boolean;
};

type UserConfig = Partial<Config>;

const resolveConfigs = (userConfig: UserConfig = {}): Config => {
  if (!userConfig?.root) {
    userConfig.root = PREVIEW_ROOT_DIR;
  }

  if (userConfig?.app === undefined) {
    userConfig.app = 'runtime';
  }
  if (userConfig?.build === undefined) {
    userConfig.build = false;
  }

  return userConfig as Config;
};

export default (config?: UserConfig): InlineConfig => {
  const { root, app, build } = resolveConfigs(config);
  if (app === 'runtime') {
    return mergeConfig(base(root), runtime(root));
  }
  return base(root, build);
};
