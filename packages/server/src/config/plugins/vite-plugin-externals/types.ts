export type ExternalValue = string | string[];

export type Externals = Record<string, ExternalValue>;

export type TransformModuleNameFn = (externalValue: ExternalValue) => string;
