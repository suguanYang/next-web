const DEP_BLACK_LIST = ['@clasp/node-tools'];

export const safeDependencies = (unsafe: Record<string, string>) => {
  return Object.keys(unsafe)
    .filter((name) => !name.startsWith('@types/')) //  we are not going to install types for runtime dependencies
    .filter((name) => !DEP_BLACK_LIST.includes(name))
    .reduce(
      (acc, name) => ({
        ...acc,
        [name]: unsafe[name],
      }),
      {} as Record<string, string>,
    );
};
