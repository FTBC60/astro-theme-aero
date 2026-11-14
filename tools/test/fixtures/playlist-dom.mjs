import { createPlaylistPanel } from '../../../src/scripts/playlist-panel.ts';

// A controlled DOM stand-in for events, focus and observer lifetimes, not browser layout.
class TestNode extends EventTarget {
  parentNode = null;
  children = [];
  get parentElement() { return this.parentNode instanceof TestElement ? this.parentNode : null; }
  get isConnected() { return this instanceof TestDocument || Boolean(this.parentNode?.isConnected); }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
}

class TestElement extends TestNode {
  attributes = new Map();
  dataset = {};
  hidden = false;
  inert = false;
  scrollTop = 0;
  scrollLeft = 0;
  clientTop = 0;
  clientHeight = 800;
  overflowY = 'visible';
  rect = { top: 0, bottom: 800, height: 800 };
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    const classes = new Set();
    this.classList = {
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    };
    const properties = new Map();
    this.style = {
      top: '',
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
      getPropertyValue: (name) => properties.get(name) ?? '',
    };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attribute = selector.slice(1, -1);
    return attribute.startsWith('data-')
      ? Object.hasOwn(this.dataset, attribute.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()))
      : this.attributes.has(attribute);
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  getBoundingClientRect() { return this.rect; }
  focus() { this.ownerDocument.activeElement = this; }
}

class TestDocument extends TestNode {
  activeElement = null;
  createElement() { return new TestElement(this); }
}

export function playlistHarness(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const document = new TestDocument();
  const window = new EventTarget();
  const frames = new Map();
  // The fixture does not run CSS transitions, so use reduced motion by default.
  // Individual tests can opt into the timer/transition completion path.
  const reducedMotion = { matches: true };
  let frameId = 0;
  const observers = [];
  class Observer {
    targets = new Set();
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
    trigger() { if (this.targets.size) this.callback(); }
  }
  Object.assign(window, {
    Node: TestNode, Element: TestElement, AbortController, ResizeObserver: Observer, MutationObserver: Observer,
    visualViewport: Object.assign(new EventTarget(), { offsetTop: 0, height: 844 }),
    matchMedia: () => reducedMotion,
    getComputedStyle: (element) => ({ overflowY: element.overflowY, paddingTop: '2px', paddingBottom: '6px' }),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  document.defaultView = window;
  document.body = document.createElement();
  document.documentElement = { clientHeight: 844 };
  document.append(document.body);
  const element = (parent, className, dataKey) => {
    const node = document.createElement();
    if (className) node.classList.toggle(className, true);
    if (dataKey) node.dataset[dataKey] = '';
    parent.append(node);
    return node;
  };
  const newSidebar = () => {
    const sidebar = element(document.body);
    sidebar.overflowY = 'auto';
    return sidebar;
  };
  const sidebar = newSidebar();
  const player = element(sidebar);
  player.rect = { top: 400, bottom: 500, height: 100 };
  const content = element(player, 'player-content');
  content.rect = player.rect;
  const controls = element(content, 'music-controls');
  controls.rect = player.rect;
  const toggle = element(controls, '', 'playlistToggle');
  const panel = element(content, '', 'playlistPanel');
  panel.hidden = true;
  panel.inert = true;
  panel.rect = { top: 0, bottom: 300, height: 300 };
  const inner = element(panel, 'playlist-accordion-inner');
  const playlistWindow = element(inner, 'playlist-window');
  const closeButton = element(playlistWindow, '', 'playlistClose');
  const body = element(playlistWindow, 'playlist-window-body');
  element(body, 'playlist-heading');
  const items = element(body, 'playlist-items');
  items.rect = { top: 0, bottom: 200, height: 200 };
  const track = element(items, '', 'trackIndex');
  track.dataset.trackIndex = '0';
  const label = element(track);
  element(body, 'playlist-feedback');
  const outside = element(document.body);
  const selected = [];
  const state = { plays: 0 };
  const dispose = createPlaylistPanel(player, {
    openLabel: 'Open playlist', closeLabel: 'Close playlist', onSelect: (index) => { selected.push(index); state.plays++; },
  });
  const dispatch = (target, type, properties = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    let propagationStopped = false;
    const stopPropagation = event.stopPropagation.bind(event);
    event.stopPropagation = () => { propagationStopped = true; stopPropagation(); };
    Object.defineProperty(event, 'target', { value: properties.target ?? target });
    for (const [name, value] of Object.entries(properties)) if (name !== 'target') Object.defineProperty(event, name, { value });
    // EventTarget supplies abortable listeners; this fixture adds the bubbling parent path.
    for (let node = target; node; node = node.parentNode) {
      node.dispatchEvent(event);
      if (propagationStopped) break;
    }
    return event;
  };
  const open = () => { if (toggle.getAttribute('aria-expanded') !== 'true') dispatch(toggle, 'click', { pointerType: 'mouse', detail: 1 }); };
  const close = () => { if (toggle.getAttribute('aria-expanded') === 'true') dispatch(toggle, 'click', { pointerType: 'mouse', detail: 1 }); };
  const pointer = (type, properties = {}) => dispatch(type === 'pointerdown' ? track : document, type, {
    pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 50, clientY: 50, ...properties,
  });
  const click = (properties = {}) => dispatch(label, 'click', { detail: 1, pointerType: 'touch', pointerId: 1, ...properties });
  const tap = (properties = {}) => { pointer('pointerdown', properties); pointer('pointerup', properties); click(properties); };
  const scroll = (target = items) => dispatch(document, 'scroll', { target });
  const scrollEnd = (target = items) => dispatch(document, 'scrollend', { target });
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); };
  t.after(dispose);
  return { document, window, reducedMotion, sidebar, newSidebar, player, panel, inner, items, toggle, closeButton, track, label, outside, state, selected, frames, observers,
    dispatch, open, close, dispose, pointer, click, tap, scroll, scrollEnd, flushFrames };
}
