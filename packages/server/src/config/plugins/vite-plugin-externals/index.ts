import type { Plugin } from 'vite';
import MagicString from 'magic-string';
import { init, parse } from 'es-module-lexer';
import { Externals, TransformModuleNameFn } from './types';
import { transformImports } from './transform';
import { logger } from '@/utils/logger';
import { cleanUrl, JS_RE } from '@/utils';

const createTransformModuleName = () => {
  const transformModuleName: TransformModuleNameFn = (externalValue) => {
    if (typeof externalValue === 'string') {
      return `window['${externalValue}']`;
    }
    const values = externalValue.map((val) => `['${val}']`).join('');
    return `window${values}`;
  };
  return transformModuleName;
};

export function viteExternalsPlugin(externals: Externals = {}, build?: boolean): Plugin {
  const transformModuleName = createTransformModuleName();

  return {
    name: 'vite-plugin-externals',
    async transform(code, id) {
      if (!build && !JS_RE.test(cleanUrl(id))) {
        return null;
      }
      let s: undefined | MagicString;
      let hasError = false;
      try {
        await init;
        const [imports] = parse(code);
        imports.forEach(({ d: dynamic, n: dependence, ss: statementStart, se: statementEnd }) => {
          // filter dynamic import
          // if (dynamic !== -1) {
          //   return;
          // }

          if (!dependence) {
            return;
          }

          const externalValue = getExternalValue(dependence, externals);
          if (!externalValue) {
            return;
          }

          s = s || (s = new MagicString(code));
          if (dynamic !== -1) {
            // overwrite import('@xxx').then() => Promise.resolve(window[xxx]).then()
            s.overwrite(
              statementStart,
              statementEnd,
              `Promise.resolve(${transformModuleName(externalValue)})`,
            );
            return;
          }

          const raw = code.substring(statementStart, statementEnd);
          const newImportStr = transformImports(raw, externalValue, transformModuleName);
          s.overwrite(statementStart, statementEnd, '');
          s.appendLeft(0, newImportStr);
        });
      } catch (error) {
        hasError = true;
        if (!build) {
          logger.error(`preview: can not parse module ${id}, error: ${String(error)}`);
        }
      }
      if (hasError || !s) {
        return { code, map: null };
      }
      return {
        code: s.toString(),
        map: null,
      };
    },
  };
}

function getExternalValue(dependecy: string, externals: Externals) {
  const externalValue = externals[dependecy];

  if (externalValue) {
    return externalValue;
  }

  if (!dependecy.includes('lodash')) {
    return externalValue;
  }

  const dependecySubs = dependecy.split('/');
  let [main, ...rest] = dependecySubs;
  if (main === 'lodash-es') {
    main = 'lodash';
  }
  if (main !== 'lodash') {
    return externalValue;
  }
  const originExternalValue = externals[main];
  const restExternalValue = rest.map((r) => r);

  return typeof originExternalValue === 'string'
    ? [originExternalValue, ...restExternalValue]
    : originExternalValue.concat(restExternalValue);
}
