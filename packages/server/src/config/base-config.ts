import path from 'path';
import { InlineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import {
  CACHE_DIR,
  SHARED_DEPS_PATH,
  PREVIEW_FILE_RESOURCE_PREFIX,
  SHARED_DEPS_NODE_MODULES_PATH,
  _TODO_ROUTER_NAME_BEFORE_PREVIEW_SERVICE,
} from '@/common/app';
import { viteExternalsPlugin } from '@/config/plugins/vite-plugin-externals';

const dayjsEsmAlias = {
  find: 'dayjs/plugin',
  replacement: 'dayjs/esm/plugin',
  customResolver(source: string) {
    return path.join(SHARED_DEPS_NODE_MODULES_PATH, `${source}/index.js`);
  },
};

export default (root: string, build?: boolean): InlineConfig => ({
  root,
  cacheDir: CACHE_DIR,
  base: _TODO_ROUTER_NAME_BEFORE_PREVIEW_SERVICE + PREVIEW_FILE_RESOURCE_PREFIX + '/', // the duc-sandbox was behind the /service path
  plugins: [
    react({
      jsxRuntime: 'classic',
      fastRefresh: false,
    }),
    // viteExternalsPlugin(EXTERNALS, build),
  ],
  resolve: {
    alias: [dayjsEsmAlias],
  },
  esbuild: {
    sourcemap: false,
    treeShaking: false,
    target: 'es2017',
  },
  build: {
    rollupOptions: {
      plugins: [
        {
          name: 'react/jsx-runtime',
          resolveId(source) {
            if (source === 'react/jsx-runtime') {
              return `${SHARED_DEPS_NODE_MODULES_PATH}/react/cjs/react-jsx-runtime.production.min.js`;
            }
          },
        },
        // {
        //   name: 'optimized-for-build',
        //   resolveId(source, importer, options) {
        //     if (preservedDeps.includes(source)) {
        //       return `${CACHE_DEP_DIR}/${flattenId(source)}.js`;
        //     }
        //   },
        // },
      ],
    },
    minify: false,
    sourcemap: false,
  },
  optimizeDeps: {
    // prevent vite crawl on shared folder
    entries: [SHARED_DEPS_PATH],
    // disabled: true,
    // exclude: [...Object.keys(EXTERNALS)],
    // include: preservedDeps,
    esbuildOptions: {
      sourcemap: false,
      target: 'es2017',
      splitting: false,
      // chunkNames: '[name]',
      plugins: [
        {
          name: 'exclude-plugin',
          setup(build) {
            // build.onResolve({ filter: externalMatcher }, (args) => {
            //   return { external: true }; // do not optimize these deps
            // });
            build.onResolve({ filter: /^lodash\// }, (args) => {
              return { external: true }; // do not optimize these deps
            });
          },
        },
        {
          name: 'dayjs-use-esm-plugin',
          setup(build) {
            build.onResolve({ filter: /^dayjs\/plugin\// }, (args) => {
              const esmpath = args.path.replace('dayjs/plugin', 'dayjs/esm/plugin');
              return {
                path: path.join(SHARED_DEPS_NODE_MODULES_PATH, `${esmpath}/index.js`),
              };
            });
          },
        },
        {
          name: 'reduxjs-use-cjs',
          setup(build) {
            build.onResolve({ filter: new RegExp('@reduxjs/toolkit') }, (args) => {
              return {
                path: path.join(SHARED_DEPS_NODE_MODULES_PATH, '@reduxjs/toolkit/dist/index.js'),
              };
            });
          },
        },
        // {
        //   name: 'react-infinite-scroller',
        //   setup(build) {
        //     build.onResolve({ filter: new RegExp('react-infinite-scroller') }, (args) => {
        //       return {
        //         path: path.join(
        //           SHARED_DEPS_NODE_MODULES_PATH,
        //           'react-infinite-scroller/src/InfiniteScroll.js',
        //         ),
        //       };
        //     });
        //   },
        // },
      ],
    },
  },
  logLevel: 'error',
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
    devSourcemap: false,
  },
  server: {
    watch: {},
    // proxy: {
    //   ...proxy(),
    // },
    fs: {
      allow: [SHARED_DEPS_NODE_MODULES_PATH, root],
    },
    // cors: IS_LOCAL ? true : false, // the cors header will be overwrited by gateway in production
    middlewareMode: true,
    preTransformRequests: true,
  },
});
