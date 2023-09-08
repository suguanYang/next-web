import path from 'path';
import fs from 'fs/promises';
import { performance } from 'perf_hooks';

import dayjs from 'dayjs';

export const isJSON = (str: string) => {
  try {
    if (typeof str === 'string' && str.length > 0) {
      const res = JSON.parse(str);
      return res;
    }
    return false;
  } catch (error) {
    return false;
  }
};

export async function isFileExists(file: string) {
  return fs
    .stat(file)
    .then(() => true)
    .catch(() => false);
}

export function randomNumberFromRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// DO NOT CHANGE THE ORDER!!
const LOCK_FILE_FORMATS = ['package-lock.json', 'yarn.lock'] as const;
export const lookupLockFile = async (dir: string): Promise<string> => {
  for (const format of LOCK_FILE_FORMATS) {
    const fullPath = path.join(dir, format);
    if (await isFileExists(fullPath)) {
      return fullPath;
    }
  }

  return '';
};

export const waitOnCondition = async (
  condition: () => Promise<boolean> | boolean,
  timeoutMsg: string,
  option?: {
    interval?: number;
    retry?: number;
  },
) =>
  new Promise((res, rej) => {
    // 40 seconds default timeout
    const { interval = 200, retry = 200 } = option || {};
    const checkOnCondition = async (remainRetry: number) => {
      try {
        if (remainRetry <= 0) {
          rej(new Error(timeoutMsg + ' timeout'));
          return;
        }
        if (await condition()) {
          res(null);
          return;
        }
        // setImmediate(() => wait(done, timeout, condition, startTime));
        // do not run an exhausted check, use setTimeout here
        setTimeout(() => checkOnCondition(remainRetry - 1), interval);
      } catch (error) {
        rej(error);
      }
    };

    checkOnCondition(retry);
  });

type IterateDirectoryOptions = {
  dirPath: string;
  exclude?: RegExp[];
  depth?: number;
  onFile: (filePath: string) => Promise<void>;
};
export async function iterateDirectory(options: IterateDirectoryOptions) {
  const { dirPath, exclude, depth, onFile } = options;

  // Default the depth to -1, which means no limit
  const maxDepth = depth || -1;

  async function iterate(dir: string, currentDepth: number) {
    const items = await fs.readdir(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);

      if (exclude && exclude.some((pattern) => pattern.test(itemPath))) {
        continue;
      }

      const stats = await fs.stat(itemPath);
      if (stats.isDirectory()) {
        if (maxDepth === -1 || currentDepth < maxDepth) {
          await iterate(itemPath, currentDepth + 1);
        }
      } else {
        await onFile(itemPath);
      }
    }
  }

  await iterate(dirPath, 0);
}

export const timer = () => {
  const now = new Date().getTime();

  return () => Math.ceil((new Date().getTime() - now) / 1000);
};

export const flattenId = (id: string): string =>
  id
    .replace(/[\/:]/g, '_')
    .replace(/[\.]/g, '__')
    .replace(/(\s*>\s*)/g, '___');

export const ONE_DAY = 24 * 60 * 60 * 1000;
export const ONE_YEAR = ONE_DAY * 365;

const externalRE = /^(https?:)?\/\//;
export const isExternalUrl = (url: string): boolean => externalRE.test(url);
export const bareImportRE = /^[\w@](?!.*:\/\/)/;

const queryRE = /\?.*$/s;
const hashRE = /#.*$/s;

export const cleanUrl = (url: string): string => url.replace(hashRE, '').replace(queryRE, '');

const KNOWN_ASSET_TYPES = [
  // images
  'png',
  'jpe?g',
  'jfif',
  'pjpeg',
  'pjp',
  'gif',
  'svg',
  'ico',
  'webp',
  'avif',

  // media
  'mp4',
  'webm',
  'ogg',
  'mp3',
  'wav',
  'flac',
  'aac',

  // fonts
  'woff2?',
  'eot',
  'ttf',
  'otf',

  // other
  'webmanifest',
  'pdf',
  'txt',
];
export const DEFAULT_ASSETS_RE = new RegExp('\\.(' + KNOWN_ASSET_TYPES.join('|') + ')(\\?.*)?$');

type ModuleSpecifierInfo = {
  h: string;
  appId: string;
  // sandbox: string;
  platform: string;
};
export const INVALID_APP_QUERY_PLACEHOLDER = 'unknown';
// DO NOT CHANGE THE ORDER!
// the order is the part of the moduleSpecifier
export const moduleSpecifierInfo2Str = (query: Omit<ModuleSpecifierInfo, 'h'>) =>
  `appId=${query.appId}&platform=${query.platform}`;
// &sandbox=${query.sandbox}

export const asModuleSpecifierInfo = (query: any) => {
  return {
    h: query.h || INVALID_APP_QUERY_PLACEHOLDER,
    appId: query.appId || INVALID_APP_QUERY_PLACEHOLDER,
    // sandbox: query.sandbox || INVALID_APP_QUERY_PLACEHOLDER,
    platform: query.platform || INVALID_APP_QUERY_PLACEHOLDER,
  };
};

export const JS_RE = /\.(m?ts|[jt]sx|js)$/;

export const tryExtractAppInfoFromPath = (p: string, root: string) => {
  const pureAppPath = p.replace(root, '');

  const [_, appId, platform] = pureAppPath?.split('/') || [];

  return {
    appId,
    platform,
    pureAppPath,
  };
};

export const mapToObj = (map: Map<string, any>): any[] =>
  Array.from(map.entries(), ([k, v]) =>
    v instanceof Map ? { key: k, value: mapToObj(v) } : { key: k, value: v },
  );

export const millisecondsUntilEndOfToday = () => {
  return dayjs().endOf('day').diff(dayjs());
};

export function timeFrom(start: number, subtract = 0): string {
  const time: number | string = performance.now() - start - subtract;
  return (time.toFixed(2) + `ms`).padEnd(5, ' ');
}
