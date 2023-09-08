import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeFile } from 'fs/promises';
import { isMainThread } from 'worker_threads';

import { readJson, writeJSON } from 'fs-extra';

import {
  PREVIEW_ROOT_DIR,
  SHARED_DEPS_PATH,
  SHARED_DEPS_PACKAGE_JSON_PATH,
  SHARED_DEPS_NODE_MODULES_PATH,
} from '@/common/app';
import Optimizer from '@/optimizer/optimizer';
import { safeDependencies } from '@/common/dependency';

const MAX_PARALLEL_OPTIMIZE_SIZE = isMainThread ? 10 : 5;

function* chunk<T extends any[]>(arr: T, size: number): Generator<T[number][]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
  // if (arr.length <= size) {
  //   // return arr;
  //   return [...chunked, arr];
  // }

  // return chunk(arr.split(size, arr.length), [...chunked, arr.split(0, size)])
}

export default class SharedDependecyManger {
  private optimizer: Optimizer;
  private npmRegistry: string;

  firstRan = false;

  constructor() {
    this.optimizer = new Optimizer();
    this.npmRegistry = 'xxx';
  }

  async updatePackages() {
    const currentPackageJson = await readJson(SHARED_DEPS_PACKAGE_JSON_PATH);

    // no need partial tolerance here
    // const [sharedDepsFromGitlab, depsFromComponentCenter] = await Promise.all([
    //   getSharedDeps(),
    //   getComponentsInfo(),
    // ]);

    // however, we need to install full deps from component center to prevent inconsistent version when deps are importing each others
    const newPackageJson = {
      ...currentPackageJson,
      dependencies: {
        ...currentPackageJson.dependencies,
        // we do not trust any deps from remote
        ...safeDependencies({
          // ...sharedDepsFromGitlab,
          // ...depsFromComponentCenter,
        }),
      },
    };

    // no need to update if dependencies are not changed
    if (
      JSON.stringify(currentPackageJson.dependencies) ===
      JSON.stringify(newPackageJson.dependencies)
    ) {
      return [];
    }

    await writeJSON(SHARED_DEPS_PACKAGE_JSON_PATH, newPackageJson, {
      replacer: null,
      spaces: 2,
    });

    await this.installPackages();

    const dynamicDepsWithVersion = await this.gainDynamicDepSpecificVersions();

    const unOptimizedDeps = await this.optimizer.filterOptimizedDeps(dynamicDepsWithVersion);

    const optimizingQueue = [
      ...Object.entries(unOptimizedDeps),
      // ...Object.entries(unOptimizedSubDeps),
    ].map(([name, version]) => ({
      task: () => this.optimizer.optimizing(name, version),
      name: `${name}@${version}`,
    }));

    // const results = await Promise.allSettled([
    //   ...optimizingQueue.map(task => task()).
    // ...unOptmizedDepNames.map((name) => this.optimizer.optimizing(name, unOptimizedDeps[name])),
    // ...unOptimizedSubDepNames.map((name) =>
    //   this.optimizer.optimizing(name, unOptimizedSubDeps[name]),
    // ),
    // ]);

    const results = await this.runTasks(optimizingQueue);

    const errors = (results.filter(
      ({ status }) => status === 'fulfilled',
    ) as PromiseFulfilledResult<{
      error?: string;
    }>[])
      .filter(({ value }) => !!value.error)
      .map(({ value }) => value.error);

    return errors;
  }

  private async installPackages() {
    const promise = promisify(exec)(`npx pnpm install --prod --registry=${this.npmRegistry}`, {
      cwd: SHARED_DEPS_PATH,
    });

    const child = promise.child;
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', function (data) {
      console.log('stdout: ' + data);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', function (data) {
      console.log('stderr: ' + data);
    });
    await promise;
  }

  private async gainDynamicDepSpecificVersions() {
    const out = await promisify(exec)(`npx pnpm list --json`, {
      cwd: SHARED_DEPS_PATH,
    });
    const depsWithVersion = JSON.parse(out.stdout)[0];

    // do not optimize on unsafe new deps
    return safeDependencies(
      Object.keys(depsWithVersion.dependencies).reduce(
        (acc, name) => ({
          ...acc,
          [name]: depsWithVersion.dependencies[name].version,
        }),
        {},
      ),
    );
  }

  private async runTasks(
    tasks: {
      task: () => Promise<any>;
      name: string;
    }[],
  ) {
    const results = [];

    const batchChunks = [...chunk(tasks, MAX_PARALLEL_OPTIMIZE_SIZE)];

    console.info(`SharedDependecyManger: run opitimizing batch: ${JSON.stringify(batchChunks)}`);

    for (const batch of batchChunks) {
      results.push(...(await Promise.allSettled([...batch.map(({ task }) => task())])));
    }

    return results;
  }
}
