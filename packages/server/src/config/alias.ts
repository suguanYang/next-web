import { Alias } from 'vite';

export const ALIAS = {

} as const;

const buildEntries = (root: string) =>
  Object.entries(ALIAS).map<Alias>(([name, src]) => ({
    find: name,
    replacement: root + src,
  }));
function matches(pattern: string | RegExp, importee: string) {
  if (pattern instanceof RegExp) {
    return pattern.test(importee);
  }
  if (importee.length < pattern.length) {
    return false;
  }
  if (importee === pattern) {
    return true;
  }
  return importee.startsWith(pattern + '/');
}

export const aliasResove = (importee: string, root: string) => {
  const matchedEntry = buildEntries(root).find((entry) => matches(entry.find, importee));
  if (!matchedEntry) {
    return null;
  }

  return importee.replace(matchedEntry.find, matchedEntry.replacement);
};
