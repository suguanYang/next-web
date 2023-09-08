/**
 * pre-optimizing
 * bundling css modules
 */
import { DepOptimizationMetadata, optimizeDeps, resolveConfig } from 'vite';

import configs from '@/config';
import { logger } from '@/utils/logger';
import { waitOnCondition } from '@/utils';
import { linkNecessaryFiles } from '@/shared-deps/link';

type PrebundlingStatus = 'pending' | 'success' | 'failed';

class Prebundler {
  private prebundlingStatus: PrebundlingStatus = 'pending';
  constructor() {}

  async prebundling() {
    logger.info('preview: link dependecies');
    await linkNecessaryFiles();

    logger.info('preview: start optimizing');

    const metadata = await optimizeDeps(await resolveConfig(configs(), 'serve'), true);
    await this.checkPrebundling(metadata);
    // await this.extraCssModules(metadata);
    this.prebundlingStatus = 'success';
  }

  private async checkPrebundling(metadata: DepOptimizationMetadata) {
    const needPrebundlingDeps = configs({}).optimizeDeps?.include || [];
    const unOptimizedDeps = needPrebundlingDeps.filter((dep) => !Boolean(metadata.optimized[dep]));
    if (unOptimizedDeps.length > 0) {
      return Promise.reject(
        'preview: can not find these optimized files: ' + unOptimizedDeps.join(','),
      );
    }
    return;
  }

  async waitOnPrebundling() {
    return waitOnCondition(
      () => this.prebundlingStatus !== 'pending',
      'preview wait on prebundling',
    ).then(() => this.prebundlingStatus);
  }
}

export default Prebundler;
