import path from 'path';

import { isMainThread } from 'worker_threads';

const rootPath = path.resolve(process.cwd());
const LOG_FILE_SIZE = 1024 * 1024 * 5;
const LOG_BACK_FILE_NUM = 3;

const log = (config: Record<string, any>) => {
  // the worker should not report log
  if (!isMainThread) {
    return {
      logger: {
        info: console.log,
        warn: console.warn,
        error: console.error,
      },
    };
  }

  const { level } = config;
  const log4js = require('log4js');
  log4js.configure({
    disableClustering: true,
    appenders: {
      allLogSandbox: {
        type: 'file',
        filename: path.resolve(rootPath, './log/all.log'),
        keepFileExt: true,
        maxLogSize: LOG_FILE_SIZE,
        backups: LOG_BACK_FILE_NUM,
      },
      infoLogSandbox: {
        type: 'file',
        filename: path.resolve(rootPath, './log/info.log'),
        keepFileExt: true,
        maxLogSize: LOG_FILE_SIZE,
        backups: LOG_BACK_FILE_NUM,
      },
      errorLogSandbox: {
        type: 'file',
        filename: path.resolve(rootPath, './log/error.log'),
        keepFileExt: true,
        maxLogSize: LOG_FILE_SIZE,
        backups: LOG_BACK_FILE_NUM,
      },
      warnLogSandbox: {
        type: 'file',
        filename: path.resolve(rootPath, './log/warn.log'),
        keepFileExt: true,
        maxLogSize: LOG_FILE_SIZE,
        backups: LOG_BACK_FILE_NUM,
      },
      errorSandbox: {
        type: 'logLevelFilter',
        level: 'ERROR',
        appender: 'errorLogSandbox',
        maxLevel: 'ERROR',
      },
      infoSandbox: {
        type: 'logLevelFilter',
        level: 'INFO',
        appender: 'infoLogSandbox',
        maxLevel: 'INFO',
      },
      warnSandbox: {
        type: 'logLevelFilter',
        level: 'WARN',
        appender: 'warnLogSandbox',
        maxLevel: 'WARN',
      },
      consoleSandbox: {
        type: 'console',
      },
    },
    categories: {
      default: {
        appenders: ['consoleSandbox'],
        level: level,
        enableCallStack: true,
      },
      sandbox: {
        appenders: [
          'consoleSandbox',
          'allLogSandbox',
          'errorSandbox',
          'infoSandbox',
          'warnSandbox'
        ],
        level: level,
        enableCallStack: true,
      },
    },
  });
  const logger = log4js.getLogger('sandbox');

  return {
    logger,
  };
};

const LEVEL = 'info';
const logInstance = log({
  level: LEVEL,
  port: 0,
});
export const logger = logInstance.logger;
