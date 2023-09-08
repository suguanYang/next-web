import { Parser } from 'acorn';
import * as ESTree from 'estree';
import { ExternalValue, TransformModuleNameFn } from './types';

type Specifiers = (
  | ESTree.ImportSpecifier
  | ESTree.ImportDefaultSpecifier
  | ESTree.ImportNamespaceSpecifier
  | ESTree.ExportSpecifier
)[];

export const transformImports = (
  raw: string,
  externalValue: ExternalValue,
  transformModuleName: TransformModuleNameFn,
): string => {
  const ast = (Parser.parse(raw, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }) as unknown) as ESTree.Program;
  const specifiers = (ast.body[0] as ESTree.ImportDeclaration)?.specifiers as Specifiers;
  if (!specifiers) {
    // @TODO support export * from 'xxx'
    // console.log('specifier: ', raw, ast.body[0]);
    // if (ast.body[0]?.type === 'ExportAllDeclaration') {
    //   const { value } = ast.body[0].source;
    //   if (value === 'recoil') {
    //     return `export {${recoildExports.reduce((acc, cur) => acc + `${cur},\n`, '')}}`;
    //   }
    // }
    return '';
  }

  // when export * from 'EXTERNAL', we export members manunally for performance perspective
  const exportAll = externalValue === 'Recoil' ? 'export ' : '';
  return specifiers.reduce((s, specifier) => {
    const { local } = specifier;
    if (specifier.type === 'ImportDefaultSpecifier') {
      /**
       * source code: import React from 'react'
       * transformed: const React = (window['React']).default || window['React']
       */
      s += `const ${local.name} = (${transformModuleName(
        externalValue,
      )}).default || ${transformModuleName(externalValue)}\n`;
    } else if (specifier.type === 'ImportSpecifier') {
      /**
       * source code:
       * import { reactive, ref as r } from 'vue'
       * transformed:
       * const reactive = window['Vue'].reactive
       * const r = window['Vue'].ref
       */
      const { imported } = specifier;
      s += `${exportAll}const ${local.name} = ${transformModuleName(externalValue)}.${
        imported.name
      }\n`;
    } else if (specifier.type === 'ImportNamespaceSpecifier') {
      /**
       * source code: import * as vue from 'vue'
       * transformed: const vue = window['Vue']
       */
      s += `const ${local.name} = ${transformModuleName(externalValue)}\n`;
    } else if (specifier.type === 'ExportSpecifier') {
      /**
       * Re-export default import as named export
       * source code: export { default as React } from 'react'
       * transformed: export const React = window['React']
       *
       * Re-export default import as default export
       * source code: export { default } from 'react'
       * transformed: export default window['React']
       *
       * Re-export named import
       * source code: export { useState } from 'react'
       * transformed: export const useState = window['React'].useState
       *
       * Re-export named import as renamed export
       * source code: export { useState as useState2 } from 'react'
       * transformed: export const useState2 = window['React'].useState
       */
      const { exported } = specifier;
      const value = `${transformModuleName(externalValue)}${
        local.name !== 'default' ? `.${local.name}` : ''
      }`;
      if (exported.name === 'default') {
        s += `export default ${value}\n`;
      } else {
        s += `export const ${exported.name} = ${value}\n`;
      }
    }
    return s;
  }, '');
};
