import qs from "qs";
import { Alias } from "vite";
import postcssUrl from "postcss-url";
import type { InlineConfig } from "vite";

import { ALIAS } from "@/config/alias";
import { logger } from "@/utils/logger";
import LessPluginImport from "@/config/plugins/less";
import errorCatchup from "@/config/plugins/error-catchup";
import memoizedLoader from "@/config/plugins/memoized-loader";
import { PREVIEW_FILE_ASSETS_PREFIX } from "@/common/app";
import { SERVICE_DOMAIN_NAME } from "@/common/env-vars";
import { tryResolveMemoizedFile } from "@/source-management/remote-source";
import { asModuleSpecifierInfo, tryExtractAppInfoFromPath } from "@/utils";

export default (root: string): InlineConfig => ({
  root,
  mode: "production",
  plugins: [errorCatchup(root), memoizedLoader(root)],
  resolve: {
    alias: Object.entries(ALIAS)
      .map<Alias>(([name, src]) => ({
        find: name,
        replacement: root + src,
        customResolver: (source: string, importer: string = "") => {
          const queryStr = importer?.split("?")[1];
          const query = asModuleSpecifierInfo(qs.parse(queryStr || ""));
          const {
            // sandbox,
            appId,
          } = query;
          const filePath = `/${appId}/${source.replace(root, "")}`;

          return tryResolveMemoizedFile(
            appId,
            filePath
            // sandbox
          );
        },
      }))
      .concat([
        { find: /^[\/]?@vite\/client/, replacement: `${root}/client.js` },
        { find: /^[\/]app-styles.css/, replacement: `${root}/app-styles.css` },
        {
          find: /^[\/]app-styles-pc.css/,
          replacement: `${root}/app-styles-pc.css`,
        },
        {
          find: /^[\/]app-styles-mobile.css/,
          replacement: `${root}/app-styles-mobile.css`,
        },
        { find: /^[\/]polyfill.js/, replacement: `${root}/polyfill.js` },
      ]),
  },
  css: {
    postcss: {
      plugins: [
        postcssUrl({
          url: (asset, dir) => {
            try {
              // if (asset.absolutePath?.startsWith(root)) {
              // no query here, try resolve appID from path
              const { appId, pureAppPath } = tryExtractAppInfoFromPath(
                asset.absolutePath || "",
                root
              );

              const resolved =
                appId &&
                tryResolveMemoizedFile(appId, pureAppPath || "invalid assets");
              if (resolved) {
                return `${SERVICE_DOMAIN_NAME}${PREVIEW_FILE_ASSETS_PREFIX}?assetId=${encodeURIComponent(
                  resolved
                )}`;
              }
              // }
            } catch (error) {
              logger.warn(`postcss: ${String(error)}`);
            }

            return asset.url;
          },
        }),
      ],
    } as any,
    preprocessorOptions: {
      less: {
        plugins: [LessPluginImport()],
      },
    },
  },
  customLogger: {
    error: (errMsg) => logger.error(`preview: ${errMsg}`),
    info: () => {},
    warn: () => {},
    warnOnce: () => {},
    hasWarned: false,
    clearScreen: () => {},
    hasErrorLogged: () => false,
  },
  server: {
    hmr: false,
    watch: {
      // since we do not rely on the file system, we shoud disable the watch
      // ********************* disable watch *********************
      usePolling: true,
      depth: 0,
      interval: 99999999,
      // *********************************************************
      ignored: "**/**/tsconfig.json", // vite will reload when tsconfig changes, ignore it
    },
    fs: {
      allow: [root],
    },
  },
});
