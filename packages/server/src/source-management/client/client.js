// set :host styles to make playwright detect the element as visible
const template =
  /*html*/
  `
<style>
:host {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  --monospace: 'SFMono-Regular', Consolas,
  'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --yellow: #e2aa53;
  --purple: #cfa4ff;
  --cyan: #2dd9da;
  --dim: #c9c9c9;

  --window-background: #181818;
  --window-color: #d8d8d8;
}

.backdrop {
  position: fixed;
  z-index: 99999;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  margin: 0;
  background: rgba(0, 0, 0, 0.66);
}

.window {
  font-family: var(--monospace);
  line-height: 1.5;
  width: 800px;
  color: var(--window-color);
  margin: 30px auto;
  padding: 25px 40px;
  position: relative;
  background: var(--window-background);
  border-radius: 6px 6px 8px 8px;
  box-shadow: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22);
  overflow: hidden;
  border-top: 8px solid var(--red);
  direction: ltr;
  text-align: left;
}

pre {
  font-family: var(--monospace);
  font-size: 16px;
  margin-top: 0;
  margin-bottom: 1em;
  overflow-x: scroll;
  scrollbar-width: none;
}

pre::-webkit-scrollbar {
  display: none;
}

.message {
  line-height: 1.3;
  font-weight: 600;
  white-space: pre-wrap;
}

.message-body {
  color: var(--red);
}

.plugin {
  color: var(--purple);
}

.file {
  color: var(--cyan);
  margin-bottom: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.frame {
  color: var(--yellow);
}

.stack {
  font-size: 13px;
  color: var(--dim);
}

.tip {
  font-size: 13px;
  color: #999;
  border-top: 1px dotted #999;
  padding-top: 13px;
}

code {
  font-size: 13px;
  font-family: var(--monospace);
  color: var(--yellow);
}

</style>
<div class="backdrop" part="backdrop">
  <div class="window" part="window">
    <pre class="message" part="message"><span class="plugin"></span><span class="message-body"></span></pre>
    <pre class="file" part="file"></pre>
    <pre class="frame" part="frame"></pre>
    <pre class="stack" part="stack"></pre>
  </div>
</div>
`;
const fileRE = /(?:[a-zA-Z]:\\|\/).*?:\d+:\d+/g;
const codeframeRE = /^(?:>?\s+\d+\s+\|.*|\s+\|\s*\^.*)\r?\n/gm;
// Allow `ErrorOverlay` to extend `HTMLElement` even in environments where
// `HTMLElement` was not originally defined.
const { HTMLElement = class {} } = globalThis;
class ErrorOverlay extends HTMLElement {
  constructor(err, links = true) {
    var _a;
    super();
    this.root = this.attachShadow({
      mode: 'open',
    });
    this.root.innerHTML = template;
    codeframeRE.lastIndex = 0;
    const hasFrame = err.frame;
    const message = hasFrame ? err.message.replace(codeframeRE, '') : err.message;
    if (err.plugin) {
      this.text('.plugin', `[plugin:${err.plugin}] `);
    }
    this.text('.message-body', message.trim());
    const [file] = (
      ((_a = err.loc) === null || _a === void 0 ? void 0 : _a.file) ||
      err.id ||
      'unknown file'
    ).split(`?`);
    if (err.loc) {
      this.text('.file', `${file}:${err.loc.line}:${err.loc.column}`);
    } else if (err.id) {
      this.text('.file', file);
    }
    if (hasFrame) {
      this.text('.frame', err.frame.trim());
    }
    this.text('.stack', err.stack);
    this.root.querySelector('.window').addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this.addEventListener('click', () => {
      this.close();
    });
  }
  text(selector, text) {
    const el = this.root.querySelector(selector);
    el.textContent = text;
  }
  close() {
    var _a;
    (_a = this.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(this);
  }
}
const overlayId = 'vite-error-overlay';
const { customElements } = globalThis;
// Ensure `customElements` is defined before the next line.
if (customElements && !customElements.get(overlayId)) {
  customElements.define(overlayId, ErrorOverlay);
}

const messageBuffer = [];
let socket;

const enableOverlay = true;
function createErrorOverlay(err) {
  if (!enableOverlay) return;
  clearErrorOverlay();
  document.body.appendChild(new ErrorOverlay(err));
}
function clearErrorOverlay() {
  document.querySelectorAll(overlayId).forEach((n) => n.close());
}

const sheetsMap = new Map();
function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  {
    if (style && !(style instanceof HTMLStyleElement)) {
      removeStyle(id);
      style = undefined;
    }
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.setAttribute('data-vite-dev-id', id);
      style.textContent = content;
      document.head.appendChild(style);
    } else {
      style.textContent = content;
    }
  }
  sheetsMap.set(id, style);
}
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    if (style instanceof CSSStyleSheet) {
      // @ts-expect-error: using experimental API
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== style);
    } else {
      document.head.removeChild(style);
    }
    sheetsMap.delete(id);
  }
}

function sendMessageBuffer() {
  if (socket.readyState === 1) {
    messageBuffer.forEach((msg) => socket.send(msg));
    messageBuffer.length = 0;
  }
}
const hotModulesMap = new Map();
const disposeMap = new Map();
const pruneMap = new Map();
const dataMap = new Map();
const customListenersMap = new Map();
const ctxToListenersMap = new Map();
function createHotContext(ownerPath) {
  if (!dataMap.has(ownerPath)) {
    dataMap.set(ownerPath, {});
  }
  // when a file is hot updated, a new context is created
  // clear its stale callbacks
  const mod = hotModulesMap.get(ownerPath);
  if (mod) {
    mod.callbacks = [];
  }
  // clear stale custom event listeners
  const staleListeners = ctxToListenersMap.get(ownerPath);
  if (staleListeners) {
    for (const [event, staleFns] of staleListeners) {
      const listeners = customListenersMap.get(event);
      if (listeners) {
        customListenersMap.set(
          event,
          listeners.filter((l) => !staleFns.includes(l)),
        );
      }
    }
  }
  const newListeners = new Map();
  ctxToListenersMap.set(ownerPath, newListeners);
  function acceptDeps(deps, callback = () => {}) {
    const mod = hotModulesMap.get(ownerPath) || {
      id: ownerPath,
      callbacks: [],
    };
    mod.callbacks.push({
      deps,
      fn: callback,
    });
    hotModulesMap.set(ownerPath, mod);
  }
  const hot = {
    get data() {
      return dataMap.get(ownerPath);
    },
    accept(deps, callback) {
      if (typeof deps === 'function' || !deps) {
        // self-accept: hot.accept(() => {})
        acceptDeps([ownerPath], ([mod]) => deps && deps(mod));
      } else if (typeof deps === 'string') {
        // explicit deps
        acceptDeps([deps], ([mod]) => callback && callback(mod));
      } else if (Array.isArray(deps)) {
        acceptDeps(deps, callback);
      } else {
        throw new Error(`invalid hot.accept() usage.`);
      }
    },
    // export names (first arg) are irrelevant on the client side, they're
    // extracted in the server for propagation
    acceptExports(_, callback) {
      acceptDeps([ownerPath], callback && (([mod]) => callback(mod)));
    },
    dispose(cb) {
      disposeMap.set(ownerPath, cb);
    },
    // @ts-expect-error untyped
    prune(cb) {
      pruneMap.set(ownerPath, cb);
    },
    // TODO
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    decline() {},
    // tell the server to re-perform hmr propagation from this module as root
    invalidate() {
      notifyListeners('vite:invalidate', {
        path: ownerPath,
      });
      this.send('vite:invalidate', {
        path: ownerPath,
      });
    },
    // custom events
    on(event, cb) {
      const addToMap = (map) => {
        const existing = map.get(event) || [];
        existing.push(cb);
        map.set(event, existing);
      };
      addToMap(customListenersMap);
      addToMap(newListeners);
    },
    send(event, data) {
      messageBuffer.push(
        JSON.stringify({
          type: 'custom',
          event,
          data,
        }),
      );
      sendMessageBuffer();
    },
  };
  return hot;
}

function injectQuery(url, queryToInject) {
  // skip urls that won't be handled by vite
  if (!url.startsWith('.') && !url.startsWith('/')) {
    return url;
  }
  // can't use pathname from URL since it may be relative like ../
  const pathname = url.replace(/#.*$/, '').replace(/\?.*$/, '');
  const { search, hash } = new URL(url, 'http://vitejs.dev');
  return `${pathname}?${queryToInject}${search ? `&` + search.slice(1) : ''}${hash || ''}`;
}

export { createErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
