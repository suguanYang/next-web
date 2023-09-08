import path from 'path';
import fs from 'fs/promises';

import { ensureDir, copy } from 'fs-extra';

import {
  PREVIEW_ROOT_DIR,
  SHARED_DEPS_PATH,
  PREVIEW_CLIENT_SCRIPTS,
  SHARED_DEPS_NODE_MODULES_PATH,
} from '@/common/app';
import { logger } from '@/utils/logger';
import { isFileExists, lookupLockFile } from '@/utils';

export const linkNecessaryFiles = async () => {
  await ensureDir(PREVIEW_ROOT_DIR);

  logger.info(`preview: copy client scripts to output`);
  await copy(PREVIEW_CLIENT_SCRIPTS, PREVIEW_ROOT_DIR);

  const lockFile = await lookupLockFile(SHARED_DEPS_PATH);
  if (lockFile) {
    logger.info(`preview: move lock file: ${lockFile} to root folder`);
    fs.copyFile(lockFile, `${PREVIEW_ROOT_DIR}/${path.parse(lockFile).base}`);
  }
  const nodeModulesDir = `${PREVIEW_ROOT_DIR}/node_modules`;
  logger.info(`preview: link node_modules to root folder`);
  // re-link
  if (await isFileExists(nodeModulesDir)) {
    await fs.rm(nodeModulesDir, {
      recursive: true,
      force: true,
    });
  }

  return process.platform === 'win32'
    ? fs.symlink(SHARED_DEPS_NODE_MODULES_PATH, nodeModulesDir, 'junction')
    : fs.symlink(SHARED_DEPS_NODE_MODULES_PATH, nodeModulesDir, 'dir');
};
