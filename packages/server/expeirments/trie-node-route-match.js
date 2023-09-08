class TrieNode {
  constructor() {
    this.children = {};
    this.handler = null;
  }
}

class PathTrie {
  constructor() {
    this.root = new TrieNode();
    this.depth = 2;
  }

  insert(path, handler) {
    let node = this.root;

    for (const part of path.split('/')) {
      if (part) {
        if (!node.children[part]) {
          node.children[part] = new TrieNode();
        }
        node = node.children[part];
      }
    }

    node.handler = handler;
  }

  match(path) {
    let node = this.root;
    let matchCount = 0;

    for (const part of path.split('/')) {
      if (part) {
        if (node.children[part]) {
          node = node.children[part];
          matchCount++;
        } else if (matchCount === this.depth) {
          break;
        } else {
          return null;
        }
      }
    }

    return node.handler;
  }
}

const PREVIEW_FILE_RESOURCE_PREFIX = '/sandbox/resource';
const PREVIEW_FILE_PRELOAD_RESOURCE = '/sandbox/preload';
const PREVIEW_FILE_ASSETS_PREFIX = '/sandbox/assets';

const trie = new PathTrie();
trie.insert(PREVIEW_FILE_RESOURCE_PREFIX, 'internalServer');
trie.insert(PREVIEW_FILE_ASSETS_PREFIX, 'tryhandleAssets');
trie.insert(PREVIEW_MODULE_INFO, 'getModuleInfo');
trie.insert(PREVIEW_FILE_PRELOAD_RESOURCE, 'preloadResource');

async function handleRequest(path) {
  const handler = trie.match(path);

  if (handler) {
    console.log('matched: ', handler);
  }
}

const testPath = '';

for (let i = 0; i <= 100000; i++) {
  handleRequest(testPath);
}
