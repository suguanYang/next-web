// this exception only used for interrupt vite processing on not existed source files
export class ResourceNotFoundException extends Error {
  constructor(msg: string) {
    super('ResourceNotFoundException ' + msg);
  }
}

export class ResourceFileNotFoundException extends Error {
  constructor(msg: string) {
    super('ResourceFileNotFoundException ' + msg);
  }
}

export class InvalideResourceException extends Error {
  constructor(msg: string) {
    super('InvalideResourceException ' + msg);
  }
}
export class OptimizingNewDepsException extends Error {}

export class EnvNotFoundException extends Error {
  constructor(msg: string) {
    super('EnvNotFoundException: env init failed ' + msg);
  }
}

