// closure-lite — the small part of the Google Closure Library the catalog uses,
// re-implemented without the (discontinued) library and its goog.provide/
// goog.require module system.
//
// Goal: the catalog must look and behave EXACTLY as before. So this is a
// faithful port, not a redesign: same DOM structure and CSS class names
// (catalog/src/css/*.less style them), same events, same mouse/keyboard
// handling, same highlighting rules (Template relies on the highlighted menu
// index to fill dependent fields) and the same menu positioning.
//
// Ported from the Closure Library (version 20171203), which is
// Copyright The Closure Library Authors, Apache License 2.0.

const goog = {};

// ---------------------------------------------------------------------------
// base

goog.isDef = (val) => val !== undefined;
goog.isString = (val) => typeof val == 'string';
goog.isNumber = (val) => typeof val == 'number';
goog.isArray = (val) => Array.isArray(val);
goog.isObject = (val) => {
  const type = typeof val;
  return (type == 'object' && val != null) || type == 'function';
};
goog.bind = (fn, selfObj, ...args) => fn.bind(selfObj, ...args);
goog.getCssName = (className, opt_modifier) =>
  opt_modifier ? className + '-' + opt_modifier : className;

goog.inherits = function (childCtor, parentCtor) {
  childCtor.superClass_ = parentCtor.prototype;
  childCtor.prototype = Object.create(parentCtor.prototype);
  childCtor.prototype.constructor = childCtor;
  childCtor.base = function (me, methodName, ...args) {
    return parentCtor.prototype[methodName].apply(me, args);
  };
};

// ---------------------------------------------------------------------------
// array / object / string

goog.array = {
  forEach(arr, f, opt_obj) {
    const arr2 = goog.isString(arr) ? arr.split('') : arr;
    for (let i = 0, l = arr.length; i < l; i++) {
      if (i in arr2) f.call(opt_obj, arr2[i], i, arr);
    }
  },
  map(arr, f, opt_obj) {
    const res = new Array(arr.length);
    const arr2 = goog.isString(arr) ? arr.split('') : arr;
    for (let i = 0, l = arr.length; i < l; i++) {
      if (i in arr2) res[i] = f.call(opt_obj, arr2[i], i, arr);
    }
    return res;
  },
  filter(arr, f, opt_obj) {
    const res = [];
    const arr2 = goog.isString(arr) ? arr.split('') : arr;
    for (let i = 0, l = arr.length; i < l; i++) {
      if (i in arr2 && f.call(opt_obj, arr2[i], i, arr)) res.push(arr2[i]);
    }
    return res;
  },
  // NB: returns null (not undefined) when nothing matches.
  find(arr, f, opt_obj) {
    const arr2 = goog.isString(arr) ? arr.split('') : arr;
    for (let i = 0, l = arr.length; i < l; i++) {
      if (i in arr2 && f.call(opt_obj, arr2[i], i, arr)) {
        return goog.isString(arr) ? arr.charAt(i) : arr[i];
      }
    }
    return null;
  },
  indexOf(arr, obj, opt_fromIndex) {
    return Array.prototype.indexOf.call(arr, obj, opt_fromIndex);
  },
};

goog.object = {
  // for..in on purpose: Closure iterated inherited enumerable keys too
  forEach(obj, f, opt_obj) {
    for (const key in obj) f.call(opt_obj, obj[key], key, obj);
  },
  setIfUndefined(obj, key, value) {
    return key in obj ? obj[key] : (obj[key] = value);
  },
};

goog.string = {
  repeat: (string, length) => new Array(length + 1).join(string),
  padNumber(num, length, opt_precision) {
    const s = goog.isDef(opt_precision) ? num.toFixed(opt_precision) : String(num);
    let index = s.indexOf('.');
    if (index == -1) index = s.length;
    return goog.string.repeat('0', Math.max(0, length - index)) + s;
  },
  trim: (str) => str.replace(/^[\s\xa0]+|[\s\xa0]+$/g, ''),
  startsWith: (str, prefix) => str.lastIndexOf(prefix, 0) == 0,
  collapseBreakingSpaces: (str) =>
    str.replace(/[\t\r\n ]+/g, ' ').replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, ''),
  htmlEscape: (str) => String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};

// ---------------------------------------------------------------------------
// html (only what the template dialog needs)

class SafeHtml {
  constructor(html) { this.html_ = html; }
  getTypedStringValue() { return this.html_; }
  static htmlEscape(text) {
    return text instanceof SafeHtml ? text : new SafeHtml(goog.string.htmlEscape(text));
  }
  static create(tagName, opt_attributes, opt_content) {
    const content = opt_content == null ? [] : [].concat(opt_content);
    const inner = content.map((c) => SafeHtml.htmlEscape(c).html_).join('');
    return new SafeHtml('<' + tagName + '>' + inner + '</' + tagName + '>');
  }
  static concat(...parts) {
    return new SafeHtml(parts.map((p) => SafeHtml.htmlEscape(p).html_).join(''));
  }
}
SafeHtml.EMPTY = new SafeHtml('');
goog.html = {
  SafeHtml,
  legacyconversions: { safeHtmlFromString: (html) => new SafeHtml(String(html)) },
};

// ---------------------------------------------------------------------------
// dom

const TAGS_TO_IGNORE = { SCRIPT: 1, STYLE: 1, HEAD: 1, IFRAME: 1, OBJECT: 1 };
const PREDEFINED_TAG_VALUES = { IMG: ' ', BR: '\n' };
const DIRECT_ATTRIBUTE_MAP = {
  cellpadding: 'cellPadding', cellspacing: 'cellSpacing', colspan: 'colSpan',
  frameborder: 'frameBorder', height: 'height', maxlength: 'maxLength',
  nonce: 'nonce', role: 'role', rowspan: 'rowSpan', type: 'type',
  usemap: 'useMap', valign: 'vAlign', width: 'width',
};

function getTextContent_(node, buf) {
  if (node.nodeName in TAGS_TO_IGNORE) {
    // ignore
  } else if (node.nodeType == 3) {
    buf.push(node.nodeValue);
  } else if (node.nodeName in PREDEFINED_TAG_VALUES) {
    buf.push(PREDEFINED_TAG_VALUES[node.nodeName]);
  } else {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      getTextContent_(child, buf);
    }
  }
}

function setProperties(element, properties) {
  goog.object.forEach(properties, (val, key) => {
    if (val && val.getTypedStringValue) val = val.getTypedStringValue();
    if (key == 'style') {
      element.style.cssText = val;
    } else if (key == 'class') {
      element.className = val;
    } else if (key == 'for') {
      element.htmlFor = val;
    } else if (DIRECT_ATTRIBUTE_MAP.hasOwnProperty(key)) {
      element.setAttribute(DIRECT_ATTRIBUTE_MAP[key], val);
    } else if (goog.string.startsWith(key, 'aria-') || goog.string.startsWith(key, 'data-')) {
      element.setAttribute(key, val);
    } else {
      element[key] = val;
    }
  });
}

function appendChildren(parent, args, startIndex) {
  const childHandler = (child) => {
    if (child) parent.appendChild(goog.isString(child) ? document.createTextNode(child) : child);
  };
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    // array-like but not a node: append its items
    if (arg && typeof arg == 'object' && !arg.nodeType && typeof arg.length == 'number') {
      goog.array.forEach(Array.prototype.slice.call(arg), childHandler);
    } else {
      childHandler(arg);
    }
  }
}

goog.dom = {
  TagName: { A: 'A', DIV: 'DIV', I: 'I', INPUT: 'INPUT', SPAN: 'SPAN', B: 'B', P: 'P' },
  NodeType: { ELEMENT: 1, TEXT: 3, DOCUMENT: 9 },
  createDom(tagName, opt_attributes, ...children) {
    const element = document.createElement(String(tagName));
    if (opt_attributes) {
      if (goog.isString(opt_attributes)) {
        element.className = opt_attributes;
      } else if (goog.isArray(opt_attributes)) {
        element.className = opt_attributes.join(' ');
      } else {
        setProperties(element, opt_attributes);
      }
    }
    if (children.length) appendChildren(element, children, 0);
    return element;
  },
  append(parent, ...children) { appendChildren(parent, children, 0); },
  removeChildren(node) {
    let child;
    while ((child = node.firstChild)) node.removeChild(child);
  },
  getElementsByTagNameAndClass(opt_tag, opt_class, opt_el) {
    const parent = opt_el || document;
    const tag = opt_tag && opt_tag != '*' ? String(opt_tag).toUpperCase() : '';
    if (opt_class) return parent.querySelectorAll(tag + '.' + opt_class);
    return parent.getElementsByTagName(tag || '*');
  },
  getParentElement: (element) => element.parentElement,
  insertSiblingBefore(newNode, refNode) {
    if (refNode.parentNode) refNode.parentNode.insertBefore(newNode, refNode);
  },
  insertSiblingAfter(newNode, refNode) {
    if (refNode.parentNode) refNode.parentNode.insertBefore(newNode, refNode.nextSibling);
  },
  getOuterHtml: (element) => element.outerHTML,
  getRawTextContent(node) {
    const buf = [];
    getTextContent_(node, buf);
    return buf.join('');
  },
  contains(parent, descendant) {
    if (!parent || !descendant) return false;
    return parent == descendant || parent.contains(descendant);
  },
  classlist: {
    contains: (element, className) => element.classList.contains(className),
    add: (element, className) => element.classList.add(className),
    remove: (element, className) => element.classList.remove(className),
    enable(element, className, enabled) {
      if (enabled) element.classList.add(className);
      else element.classList.remove(className);
    },
  },
  safe: {
    setInnerHtml(elem, html) {
      elem.innerHTML = html instanceof SafeHtml ? html.getTypedStringValue() : String(html);
    },
  },
};

// ---------------------------------------------------------------------------
// events

goog.events = {
  EventType: {
    CLICK: 'click', KEYDOWN: 'keydown', KEYPRESS: 'keypress', MOUSEDOWN: 'mousedown',
    MOUSEUP: 'mouseup', MOUSEOVER: 'mouseover', MOUSEOUT: 'mouseout',
    BLUR: 'blur', FOCUS: 'focus', FOCUSIN: 'focusin', INPUT: 'input', RESIZE: 'resize',
  },
  KeyCodes: {
    TAB: 9, ENTER: 13, ESC: 27, END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
  },
  // Listen on a DOM node or on one of our components (custom events).
  listen(src, type, listener, opt_capture, opt_handler) {
    if (src instanceof EventTarget_) {
      return src.listen(type, listener, opt_handler);
    }
    const fn = (e) => listener.call(opt_handler, e);
    src.addEventListener(type, fn, !!opt_capture);
    return { src, type, fn, capture: !!opt_capture };
  },
  unlistenByKey(key) {
    if (key && key.src) key.src.removeEventListener(key.type, key.fn, key.capture);
  },
};

// Custom event target with Closure-like semantics: dispatchEvent returns false
// when a listener returned false or called preventDefault(); events bubble to
// the parent event target unless stopPropagation() was called.
class Event_ {
  constructor(type, target) {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.defaultPrevented = false;
    this.propagationStopped_ = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped_ = true; }
}

function initEventTarget(self) {
  self.listeners_ = {};
  self.parentEventTarget_ = null;
}

class EventTarget_ {
  constructor() { initEventTarget(this); }
  setParentEventTarget(parent) { this.parentEventTarget_ = parent; }
  listen(type, fn, opt_scope) {
    (this.listeners_[type] = this.listeners_[type] || []).push({ fn, scope: opt_scope });
  }
  dispatchEvent(e) {
    if (goog.isString(e)) e = new Event_(e, this);
    else if (!e.target) e.target = this;
    let rv = true;
    for (let t = this; t && !e.propagationStopped_; t = t.parentEventTarget_) {
      e.currentTarget = t;
      const list = (t.listeners_[e.type] || []).slice();
      for (const l of list) {
        if (l.fn.call(l.scope, e) === false) rv = false;
      }
    }
    return rv && !e.defaultPrevented;
  }
}

// ---------------------------------------------------------------------------
// Timer (only the knob the catalog sets)

goog.Timer = { defaultTimerObject: window };

// ---------------------------------------------------------------------------
// style / positioning (ported from goog.style and goog.positioning)

const style = {
  getComputed: (el, prop) => {
    const cs = window.getComputedStyle(el, null);
    return cs ? cs[prop] || cs.getPropertyValue(prop) || '' : '';
  },
  getStyle(el, prop) { return this.getComputed(el, prop) || el.style[prop]; },
  setElementShown(el, isShown) { el.style.display = isShown ? '' : 'none'; },
  pixel: (value) => (typeof value == 'number' ? value + 'px' : value),
  setPosition(el, x, y) {
    el.style.left = style.pixel(x);
    el.style.top = style.pixel(y);
  },
  getDocumentScroll() {
    const el = document.scrollingElement || document.documentElement;
    return { x: window.pageXOffset || el.scrollLeft, y: window.pageYOffset || el.scrollTop };
  },
  getViewportSize() {
    const el = document.compatMode == 'CSS1Compat' ? document.documentElement : document.body;
    return { width: el.clientWidth, height: el.clientHeight };
  },
  getSize(el) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if ((!goog.isDef(w) || (!w && !h)) && el.getBoundingClientRect) {
      // display:none elements are measured while temporarily shown
      if (style.getStyle(el, 'display') == 'none') {
        const s = el.style;
        const orig = [s.display, s.visibility, s.position];
        s.visibility = 'hidden';
        s.position = 'absolute';
        s.display = 'inline';
        const size = { width: el.offsetWidth, height: el.offsetHeight };
        [s.display, s.visibility, s.position] = orig;
        return size;
      }
      const r = el.getBoundingClientRect();
      return { width: r.right - r.left, height: r.bottom - r.top };
    }
    return { width: w, height: h };
  },
  getPageOffset(el) {
    const viewportElement = document.documentElement;
    if (el == viewportElement) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    const scroll = style.getDocumentScroll();
    return { x: box.left + scroll.x, y: box.top + scroll.y };
  },
  getBounds(el) {
    const o = style.getPageOffset(el);
    const s = style.getSize(el);
    return { left: o.x, top: o.y, width: s.width, height: s.height };
  },
  getOffsetParent(element) {
    let positionStyle = style.getStyle(element, 'position');
    let skipStatic = positionStyle == 'fixed' || positionStyle == 'absolute';
    for (let parent = element.parentNode; parent && parent != document; parent = parent.parentNode) {
      if (parent.nodeType == 11 && parent.host) parent = parent.host;
      positionStyle = style.getStyle(parent, 'position');
      skipStatic = skipStatic && positionStyle == 'static' &&
        parent != document.documentElement && parent != document.body;
      if (!skipStatic && (parent.scrollWidth > parent.clientWidth ||
          parent.scrollHeight > parent.clientHeight || positionStyle == 'fixed' ||
          positionStyle == 'absolute' || positionStyle == 'relative')) {
        return parent;
      }
    }
    return null;
  },
  getVisibleRectForElement(element) {
    const visibleRect = { top: 0, right: Infinity, bottom: Infinity, left: 0 };
    const body = document.body;
    const documentElement = document.documentElement;
    const scrollEl = document.scrollingElement || documentElement;
    for (let el = element; (el = style.getOffsetParent(el));) {
      if ((el.clientHeight != 0 || el != body) &&
          (el != body && el != documentElement && style.getStyle(el, 'overflow') != 'visible')) {
        const pos = style.getPageOffset(el);
        pos.x += el.clientLeft;
        pos.y += el.clientTop;
        visibleRect.top = Math.max(visibleRect.top, pos.y);
        visibleRect.right = Math.min(visibleRect.right, pos.x + el.clientWidth);
        visibleRect.bottom = Math.min(visibleRect.bottom, pos.y + el.clientHeight);
        visibleRect.left = Math.max(visibleRect.left, pos.x);
      }
    }
    const scrollX = scrollEl.scrollLeft;
    const scrollY = scrollEl.scrollTop;
    visibleRect.left = Math.max(visibleRect.left, scrollX);
    visibleRect.top = Math.max(visibleRect.top, scrollY);
    const winSize = style.getViewportSize();
    visibleRect.right = Math.min(visibleRect.right, scrollX + winSize.width);
    visibleRect.bottom = Math.min(visibleRect.bottom, scrollY + winSize.height);
    return visibleRect.top >= 0 && visibleRect.left >= 0 &&
      visibleRect.bottom > visibleRect.top && visibleRect.right > visibleRect.left ?
      visibleRect : null;
  },
  getBorderBox(el) {
    const px = (p) => parseFloat(style.getComputed(el, p)) || 0;
    return { left: px('borderLeftWidth'), top: px('borderTopWidth') };
  },
  scrollIntoContainerView(element, container) {
    const elementPos = style.getPageOffset(element);
    const containerPos = style.getPageOffset(container);
    const containerBorder = style.getBorderBox(container);
    const relX = elementPos.x - containerPos.x - containerBorder.left;
    const relY = elementPos.y - containerPos.y - containerBorder.top;
    const elementSize = style.getSize(element);
    const spaceX = container.clientWidth - elementSize.width;
    const spaceY = container.clientHeight - elementSize.height;
    let scrollLeft = container.scrollLeft;
    let scrollTop = container.scrollTop;
    scrollLeft += Math.min(relX, Math.max(relX - spaceX, 0));
    scrollTop += Math.min(relY, Math.max(relY - spaceY, 0));
    container.scrollLeft = scrollLeft;
    container.scrollTop = scrollTop;
  },
};

const CornerBit = { BOTTOM: 1, CENTER: 2, RIGHT: 4, FLIP_RTL: 8 };
const Corner = { TOP_START: CornerBit.FLIP_RTL, BOTTOM_START: CornerBit.BOTTOM | CornerBit.FLIP_RTL };
const Overflow = {
  IGNORE: 0, ADJUST_X: 1, FAIL_X: 2, ADJUST_Y: 4, FAIL_Y: 8, RESIZE_WIDTH: 16, RESIZE_HEIGHT: 32,
  ADJUST_X_EXCEPT_OFFSCREEN: 64 | 1, ADJUST_Y_EXCEPT_OFFSCREEN: 128 | 4,
};
const OverflowStatus = {
  NONE: 0, ADJUSTED_X: 1, ADJUSTED_Y: 2, WIDTH_ADJUSTED: 4, HEIGHT_ADJUSTED: 8,
  FAILED_LEFT: 16, FAILED_RIGHT: 32, FAILED_TOP: 64, FAILED_BOTTOM: 128, FAILED_OUTSIDE_VIEWPORT: 256,
};
OverflowStatus.FAILED = 16 | 32 | 64 | 128 | 256;
OverflowStatus.FAILED_HORIZONTAL = 16 | 32;
OverflowStatus.FAILED_VERTICAL = 64 | 128;

const positioning = {
  getEffectiveCorner(element, corner) {
    const rtl = style.getStyle(element, 'direction') == 'rtl';
    return ((corner & CornerBit.FLIP_RTL && rtl ? corner ^ CornerBit.RIGHT : corner) & ~CornerBit.FLIP_RTL);
  },
  flipCornerHorizontal: (corner) => corner ^ CornerBit.RIGHT,
  flipCornerVertical: (corner) => corner ^ CornerBit.BOTTOM,
  getOffsetParentPageOffset(movableElement) {
    let topLeft;
    const parent = movableElement.offsetParent;
    if (parent) {
      const isBody = parent.tagName == 'HTML' || parent.tagName == 'BODY';
      if (!isBody || style.getComputed(parent, 'position') != 'static') {
        topLeft = style.getPageOffset(parent);
        if (!isBody) {
          topLeft = { x: topLeft.x - parent.scrollLeft, y: topLeft.y - parent.scrollTop };
        }
      }
    }
    return topLeft || { x: 0, y: 0 };
  },
  getVisiblePart_(el) {
    const rect = style.getBounds(el);
    const box = style.getVisibleRectForElement(el);
    if (box) {
      // goog.math.Rect.intersection (a no-op when they do not intersect)
      const x0 = Math.max(rect.left, box.left);
      const x1 = Math.min(rect.left + rect.width, box.right);
      if (x0 <= x1) {
        const y0 = Math.max(rect.top, box.top);
        const y1 = Math.min(rect.top + rect.height, box.bottom);
        if (y0 <= y1) {
          rect.left = x0; rect.top = y0; rect.width = x1 - x0; rect.height = y1 - y0;
        }
      }
    }
    return rect;
  },
  positionAtAnchor(anchorElement, anchorElementCorner, movableElement, movableElementCorner, opt_overflow) {
    const movableParentTopLeft = positioning.getOffsetParentPageOffset(movableElement);
    const anchorRect = positioning.getVisiblePart_(anchorElement);
    const corner = positioning.getEffectiveCorner(anchorElement, anchorElementCorner);
    let offsetLeft = anchorRect.left;
    if (corner & CornerBit.RIGHT) offsetLeft += anchorRect.width;
    else if (corner & CornerBit.CENTER) offsetLeft += anchorRect.width / 2;
    const absolutePos = {
      x: offsetLeft - movableParentTopLeft.x,
      y: anchorRect.top + (corner & CornerBit.BOTTOM ? anchorRect.height : 0) - movableParentTopLeft.y,
    };
    let viewport;
    if (opt_overflow) {
      viewport = style.getVisibleRectForElement(movableElement);
      if (viewport) {
        viewport.top -= movableParentTopLeft.y;
        viewport.right -= movableParentTopLeft.x;
        viewport.bottom -= movableParentTopLeft.y;
        viewport.left -= movableParentTopLeft.x;
      }
    }
    return positioning.positionAtCoordinate(absolutePos, movableElement, movableElementCorner, viewport, opt_overflow);
  },
  positionAtCoordinate(absolutePos, movableElement, movableElementCorner, opt_viewport, opt_overflow) {
    const corner = positioning.getEffectiveCorner(movableElement, movableElementCorner);
    const elementSize = style.getSize(movableElement);
    const result = positioning.getPositionAtCoordinate(
      { x: absolutePos.x, y: absolutePos.y }, { ...elementSize }, corner, opt_viewport, opt_overflow);
    if (result.status & OverflowStatus.FAILED) return result.status;
    style.setPosition(movableElement, result.rect.left, result.rect.top);
    if (result.rect.width != elementSize.width || result.rect.height != elementSize.height) {
      movableElement.style.width = result.rect.width + 'px';
      movableElement.style.height = result.rect.height + 'px';
    }
    return result.status;
  },
  getPositionAtCoordinate(absolutePos, elementSize, elementCorner, opt_viewport, opt_overflow) {
    let status = OverflowStatus.NONE;
    if (elementCorner != 0) {
      if (elementCorner & CornerBit.RIGHT) absolutePos.x -= elementSize.width;
      else if (elementCorner & CornerBit.CENTER) absolutePos.x -= elementSize.width / 2;
      if (elementCorner & CornerBit.BOTTOM) absolutePos.y -= elementSize.height;
    }
    if (opt_overflow) {
      status = opt_viewport ?
        positioning.adjustForViewport_(absolutePos, elementSize, opt_viewport, opt_overflow) :
        OverflowStatus.FAILED_OUTSIDE_VIEWPORT;
    }
    return {
      rect: { left: absolutePos.x, top: absolutePos.y, width: elementSize.width, height: elementSize.height },
      status,
    };
  },
  adjustForViewport_(pos, size, viewport, overflow) {
    let status = OverflowStatus.NONE;
    if ((overflow & Overflow.ADJUST_X_EXCEPT_OFFSCREEN) == Overflow.ADJUST_X_EXCEPT_OFFSCREEN &&
        (pos.x < viewport.left || pos.x >= viewport.right)) {
      overflow &= ~Overflow.ADJUST_X;
    }
    if ((overflow & Overflow.ADJUST_Y_EXCEPT_OFFSCREEN) == Overflow.ADJUST_Y_EXCEPT_OFFSCREEN &&
        (pos.y < viewport.top || pos.y >= viewport.bottom)) {
      overflow &= ~Overflow.ADJUST_Y;
    }
    if (pos.x < viewport.left && overflow & Overflow.ADJUST_X) {
      pos.x = viewport.left;
      status |= OverflowStatus.ADJUSTED_X;
    }
    if (overflow & Overflow.RESIZE_WIDTH) {
      const originalX = pos.x;
      if (pos.x < viewport.left) {
        pos.x = viewport.left;
        status |= OverflowStatus.WIDTH_ADJUSTED;
      }
      if (pos.x + size.width > viewport.right) {
        size.width = Math.max(Math.min(viewport.right - pos.x, originalX + size.width - viewport.left), 0);
        status |= OverflowStatus.WIDTH_ADJUSTED;
      }
    }
    if (pos.x + size.width > viewport.right && overflow & Overflow.ADJUST_X) {
      pos.x = Math.max(viewport.right - size.width, viewport.left);
      status |= OverflowStatus.ADJUSTED_X;
    }
    if (overflow & Overflow.FAIL_X) {
      status |= (pos.x < viewport.left ? OverflowStatus.FAILED_LEFT : 0) |
        (pos.x + size.width > viewport.right ? OverflowStatus.FAILED_RIGHT : 0);
    }
    if (pos.y < viewport.top && overflow & Overflow.ADJUST_Y) {
      pos.y = viewport.top;
      status |= OverflowStatus.ADJUSTED_Y;
    }
    if (overflow & Overflow.RESIZE_HEIGHT) {
      const originalY = pos.y;
      if (pos.y < viewport.top) {
        pos.y = viewport.top;
        status |= OverflowStatus.HEIGHT_ADJUSTED;
      }
      if (pos.y + size.height > viewport.bottom) {
        size.height = Math.max(Math.min(viewport.bottom - pos.y, originalY + size.height - viewport.top), 0);
        status |= OverflowStatus.HEIGHT_ADJUSTED;
      }
    }
    if (pos.y + size.height > viewport.bottom && overflow & Overflow.ADJUST_Y) {
      pos.y = Math.max(viewport.bottom - size.height, viewport.top);
      status |= OverflowStatus.ADJUSTED_Y;
    }
    if (overflow & Overflow.FAIL_Y) {
      status |= (pos.y < viewport.top ? OverflowStatus.FAILED_TOP : 0) |
        (pos.y + size.height > viewport.bottom ? OverflowStatus.FAILED_BOTTOM : 0);
    }
    return status;
  },
  // goog.positioning.MenuAnchoredPosition(anchor, BOTTOM_START, true)
  //   .reposition(menu, TOP_START)
  repositionMenu(anchorElement, menuElement) {
    const adjustCorner = (status, corner) => {
      if (status & OverflowStatus.FAILED_HORIZONTAL) corner = positioning.flipCornerHorizontal(corner);
      if (status & OverflowStatus.FAILED_VERTICAL) corner = positioning.flipCornerVertical(corner);
      return corner;
    };
    const failAll = Overflow.FAIL_X | Overflow.FAIL_Y;
    const lastResort = Overflow.ADJUST_X_EXCEPT_OFFSCREEN | Overflow.ADJUST_Y_EXCEPT_OFFSCREEN;
    let anchorCorner = Corner.BOTTOM_START;
    let movableCorner = Corner.TOP_START;
    let status = positioning.positionAtAnchor(anchorElement, anchorCorner, menuElement, movableCorner, failAll);
    if (status & OverflowStatus.FAILED) {
      anchorCorner = adjustCorner(status, anchorCorner);
      movableCorner = adjustCorner(status, movableCorner);
      status = positioning.positionAtAnchor(anchorElement, anchorCorner, menuElement, movableCorner, failAll);
      if (status & OverflowStatus.FAILED) {
        anchorCorner = adjustCorner(status, anchorCorner);
        movableCorner = adjustCorner(status, movableCorner);
        positioning.positionAtAnchor(anchorElement, anchorCorner, menuElement, movableCorner, lastResort);
      }
    }
  },
};

// ---------------------------------------------------------------------------
// ui: Component basics

let nextId = 0;
const nextComponentId = () => ':' + (nextId++).toString(36);

function initComponent(self) {
  initEventTarget(self);
  self.element_ = null;
  self.inDocument_ = false;
  self.id_ = null;
  self.domListeners_ = [];
  self.handler_ = {
    listen(src, type, fn) {
      self.domListeners_.push(goog.events.listen(src, type, fn, false, self));
      return this;
    },
  };
}

class Component_ extends EventTarget_ {
  constructor() {
    super();
    initComponent(this);
  }
  getId() { return this.id_ || (this.id_ = nextComponentId()); }
  getElement() { return this.element_; }
  setElementInternal(element) { this.element_ = element; }
  getHandler() { return this.handler_; }
  getDomHelper() { return domHelper; }
  isInDocument() { return this.inDocument_; }
  render(opt_parentElement) {
    if (!this.element_) this.createDom();
    (opt_parentElement || document.body).appendChild(this.element_);
    this.enterDocument();
  }
  enterDocument() { this.inDocument_ = true; }
}

const domHelper = {
  createDom: (...args) => goog.dom.createDom(...args),
  removeChildren: (node) => goog.dom.removeChildren(node),
  getDocument: () => document,
};

// ---------------------------------------------------------------------------
// ui.Dialog (goog.ui.ModalPopup + goog.ui.Dialog, as the template uses it)

function initDialog(self, opt_class) {
  initComponent(self);
  self.class_ = opt_class || 'modal-dialog';
  self.title_ = '';
  self.content_ = null;
  self.buttons_ = {}; // Closure defaults to an OK/Cancel set; the template sets null
  self.escapeToCancel_ = true;
  self.hasTitleCloseButton_ = true;
  self.draggable_ = true;
  self.backgroundElementOpacity_ = 0.5;
  self.visible_ = false;
  self.bgEl_ = null;
  self.tabCatcherElement_ = null;
  self.titleEl_ = null;
  self.titleTextEl_ = null;
  self.titleCloseEl_ = null;
  self.contentEl_ = null;
  self.buttonEl_ = null;
  self.lastFocus_ = null;
  self.hiddenElements_ = null;
  self.backwardTabWrapInProgress_ = false;
}

// Callable the old way too: ms.Template does goog.ui.Dialog.call(this, ...)
function Dialog(opt_class) {
  initDialog(this, opt_class);
}

class DialogImpl extends Component_ {
  createDom() {
    // goog.ui.ModalPopup.createDom
    const element = document.createElement('div');
    this.setElementInternal(element);
    element.classList.add(this.class_);
    element.tabIndex = 0;
    style.setElementShown(element, false);
    this.bgEl_ = goog.dom.createDom('div', goog.getCssName(this.class_, 'bg'));
    style.setElementShown(this.bgEl_, false);
    this.tabCatcherElement_ = document.createElement('span');
    style.setElementShown(this.tabCatcherElement_, false);
    this.tabCatcherElement_.tabIndex = 0;
    this.tabCatcherElement_.style.position = 'absolute';

    // goog.ui.Dialog.createDom
    this.titleEl_ = goog.dom.createDom('div', goog.getCssName(this.class_, 'title'),
      this.titleTextEl_ = goog.dom.createDom('span',
        { className: goog.getCssName(this.class_, 'title-text'), id: this.getId() }, this.title_),
      this.titleCloseEl_ = goog.dom.createDom('span', goog.getCssName(this.class_, 'title-close')));
    goog.dom.append(element, this.titleEl_,
      this.contentEl_ = goog.dom.createDom('div', goog.getCssName(this.class_, 'content')),
      this.buttonEl_ = goog.dom.createDom('div', goog.getCssName(this.class_, 'buttons')));
    this.titleTextEl_.setAttribute('role', 'heading');
    this.titleCloseEl_.setAttribute('role', 'button');
    this.titleCloseEl_.tabIndex = 0;
    this.titleCloseEl_.setAttribute('aria-label', 'Close');
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-labelledby', this.titleTextEl_.id || '');
    if (this.content_) goog.dom.safe.setInnerHtml(this.contentEl_, this.content_);
    style.setElementShown(this.titleCloseEl_, this.hasTitleCloseButton_);
    style.setElementShown(this.buttonEl_, !!this.buttons_);
    this.setBackgroundElementOpacity(this.backgroundElementOpacity_);
  }

  enterDocument() {
    // goog.ui.ModalPopup.enterDocument
    this.element_.parentNode.insertBefore(this.bgEl_, this.element_);
    super.enterDocument();
    // goog.ui.Dialog.enterDocument
    this.getHandler()
      .listen(this.element_, 'keydown', this.onKey_)
      .listen(this.element_, 'keypress', this.onKey_)
      .listen(this.titleCloseEl_, 'click', this.onTitleCloseClick_);
    this.element_.setAttribute('role', 'dialog');
    if (this.titleTextEl_.id !== '') this.element_.setAttribute('aria-labelledby', this.titleTextEl_.id);
    goog.dom.insertSiblingAfter(this.tabCatcherElement_, this.element_);
    this.getHandler().listen(document, 'focusin', this.onFocus);
    this.setA11YDetectBackground(false);
  }

  getContentElement() {
    if (!this.getElement()) this.render();
    return this.contentEl_;
  }
  getBackgroundElement() { return this.bgEl_; }
  setSafeHtmlContent(html) {
    this.content_ = html;
    if (this.contentEl_) goog.dom.safe.setInnerHtml(this.contentEl_, html);
  }
  setDraggable(draggable) {
    this.draggable_ = draggable;
    if (this.getElement() && !draggable) this.titleEl_.classList.remove(goog.getCssName(this.class_, 'title-draggable'));
  }
  setButtonSet(buttons) {
    this.buttons_ = buttons;
    if (this.buttonEl_) {
      if (!this.buttons_) goog.dom.safe.setInnerHtml(this.buttonEl_, SafeHtml.EMPTY);
      style.setElementShown(this.buttonEl_, !!this.buttons_);
    }
  }
  getButtonSet() { return this.buttons_; }
  setBackgroundElementOpacity(opacity) {
    this.backgroundElementOpacity_ = opacity;
    if (this.getElement() && this.bgEl_) this.bgEl_.style.opacity = opacity;
  }
  isVisible() { return this.visible_; }

  setVisible(visible) {
    if (visible == this.isVisible()) return;
    if (!this.isInDocument()) this.render();
    // goog.ui.ModalPopup.setVisible
    this.setA11YDetectBackground(visible);
    if (visible) this.show_();
    else this.hide_();
  }

  show_() {
    this.lastFocus_ = document.activeElement;
    this.resizeBackground_();
    this.reposition();
    this.resizeListener_ = goog.events.listen(window, 'resize', this.resizeBackground_, false, this);
    this.showPopupElement_(true);
    this.focus();
    this.visible_ = true;
    this.dispatchEvent('show');
    this.dispatchEvent('aftershow');
  }

  hide_() {
    goog.events.unlistenByKey(this.resizeListener_);
    this.visible_ = false;
    this.showPopupElement_(false);
    this.dispatchEvent('hide');
    this.dispatchEvent('afterhide');
    this.returnFocus_();
  }

  returnFocus_() {
    try {
      const body = document.body;
      const active = document.activeElement || body;
      if (!this.lastFocus_ || this.lastFocus_ == body) {
        this.lastFocus_ = null;
        return;
      }
      if (active == body || goog.dom.contains(this.getElement(), active)) this.lastFocus_.focus();
    } catch (e) {
      // swallow, as Closure did
    }
    this.lastFocus_ = null;
  }

  showPopupElement_(visible) {
    style.setElementShown(this.bgEl_, visible);
    style.setElementShown(this.getElement(), visible);
    style.setElementShown(this.tabCatcherElement_, visible);
  }

  resizeBackground_() {
    style.setElementShown(this.bgEl_, false);
    const viewSize = style.getViewportSize();
    const w = Math.max(viewSize.width, Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
    const h = Math.max(viewSize.height, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    style.setElementShown(this.bgEl_, true);
    this.bgEl_.style.width = w + 'px';
    this.bgEl_.style.height = h + 'px';
  }

  reposition() {
    let x = 0;
    let y = 0;
    if (style.getComputed(this.getElement(), 'position') != 'fixed') {
      const scroll = style.getDocumentScroll();
      x = scroll.x;
      y = scroll.y;
    }
    const popupSize = style.getSize(this.getElement());
    const viewSize = style.getViewportSize();
    const left = Math.max(x + viewSize.width / 2 - popupSize.width / 2, 0);
    const top = Math.max(y + viewSize.height / 2 - popupSize.height / 2, 0);
    style.setPosition(this.getElement(), left, top);
    style.setPosition(this.tabCatcherElement_, left, top);
  }

  focus() {
    try {
      this.getElement().focus();
    } catch (e) {
      // swallow, as Closure did
    }
  }

  // Focus left the dialog through the tab catcher: bring it back.
  onFocus(e) {
    if (this.backwardTabWrapInProgress_) {
      this.backwardTabWrapInProgress_ = false;
    } else if (e.target == this.tabCatcherElement_) {
      setTimeout(() => this.focus(), 0);
    }
  }

  setupBackwardTabWrap() {
    this.backwardTabWrapInProgress_ = true;
    try {
      this.tabCatcherElement_.focus();
    } catch (e) {
      // swallow, as Closure did
    }
    setTimeout(() => { this.backwardTabWrapInProgress_ = false; }, 0);
  }

  // goog.ui.ModalAriaVisibilityHelper
  setA11YDetectBackground(hide) {
    if (hide) {
      if (!this.hiddenElements_) this.hiddenElements_ = [];
      const topLevelChildren = document.body.children;
      for (let i = 0; i < topLevelChildren.length; i++) {
        const child = topLevelChildren[i];
        if (child != this.element_ && child.getAttribute('aria-hidden') !== 'true') {
          child.setAttribute('aria-hidden', 'true');
          this.hiddenElements_.push(child);
        }
      }
    } else if (this.hiddenElements_) {
      for (let i = 0; i < this.hiddenElements_.length; i++) {
        this.hiddenElements_[i].removeAttribute('aria-hidden');
      }
      this.hiddenElements_ = null;
    }
  }

  onTitleCloseClick_() {
    if (!this.hasTitleCloseButton_) return;
    this.setVisible(false);
  }

  // Overridden by the template; Closure's default is equivalent for no buttons.
  onKey_() {}
}

Dialog.prototype = DialogImpl.prototype;
Dialog.prototype.constructor = Dialog;

Dialog.Event = class extends Event_ {
  constructor(key, caption) {
    super('dialogselect');
    this.key = key;
    this.caption = caption;
  }
};

// ---------------------------------------------------------------------------
// ui.MenuItem / ui.ComboBoxItem

const State = { HOVER: 0x02, ACTIVE: 0x04 };

class MenuItem extends EventTarget_ {
  constructor(content) {
    super();
    this.content_ = content;
    this.enabled_ = true;
    this.visible_ = true;
    this.state_ = 0;
    this.element_ = null;
    this.contentEl_ = null;
    this.parent_ = null;
    this.id_ = null;
    this.sticky_ = false;
  }
  getId() { return this.id_ || (this.id_ = nextComponentId()); }
  getElement() { return this.element_; }
  getParent() { return this.parent_; }

  createDom() {
    // goog.ui.MenuItemRenderer.createDom
    const el = document.createElement('div');
    el.className = 'goog-menuitem' + (this.enabled_ ? '' : ' goog-menuitem-disabled') +
      (this.state_ & State.HOVER ? ' goog-menuitem-highlight' : '') +
      (this.state_ & State.ACTIVE ? ' goog-menuitem-active' : '');
    el.setAttribute('role', 'menuitem');
    if (!this.enabled_) el.setAttribute('aria-disabled', 'true');
    el.id = this.getId();
    this.contentEl_ = document.createElement('div');
    this.contentEl_.className = 'goog-menuitem-content';
    this.setContentInternal_(this.content_);
    el.appendChild(this.contentEl_);
    if (!this.visible_) {
      style.setElementShown(el, false);
      el.setAttribute('aria-hidden', 'true');
    }
    this.element_ = el;
  }

  setContentInternal_(content) {
    goog.dom.removeChildren(this.contentEl_);
    if (goog.isString(content)) {
      this.contentEl_.textContent = content;
    } else if (content) {
      goog.array.forEach(content, (n) => this.contentEl_.appendChild(n));
    }
  }

  setContent(content) {
    this.content_ = content;
    if (this.element_) this.setContentInternal_(content);
  }
  getContent() { return this.content_; }

  getCaption() {
    const content = this.content_;
    if (goog.isArray(content)) {
      const caption = goog.array.map(content, (node) => goog.dom.getRawTextContent(node)).join('');
      return goog.string.collapseBreakingSpaces(caption);
    }
    if (!content) return '';
    return goog.string.collapseBreakingSpaces(goog.isString(content) ? content : goog.dom.getRawTextContent(content));
  }

  isEnabled() { return this.enabled_; }
  setEnabled(enable) {
    if (!enable) {
      this.setActive(false);
      this.setHighlighted(false);
    }
    if (this.enabled_ != enable) {
      this.enabled_ = enable;
      if (this.element_) {
        goog.dom.classlist.enable(this.element_, 'goog-menuitem-disabled', !enable);
        this.element_.setAttribute('aria-disabled', String(!enable));
      }
    }
  }

  isVisible() { return this.visible_; }
  setVisible(visible) {
    if (this.visible_ != visible) {
      if (this.element_) {
        style.setElementShown(this.element_, visible);
        this.element_.setAttribute('aria-hidden', String(!visible));
      }
      this.visible_ = visible;
    }
  }

  hasState(state) { return !!(this.state_ & state); }
  setState_(state, enable, className) {
    if (enable != this.hasState(state)) {
      if (this.element_) goog.dom.classlist.enable(this.element_, className, enable);
      this.state_ = enable ? this.state_ | state : this.state_ & ~state;
    }
  }
  isHighlighted() { return this.hasState(State.HOVER); }
  // NB: like Closure, a disabled item can be highlighted programmatically
  // (keyboard / matching typed text), but not by the mouse.
  setHighlighted(highlight) {
    if (this.hasState(State.HOVER) != highlight &&
        this.dispatchEvent(highlight ? 'highlight' : 'unhighlight')) {
      this.setState_(State.HOVER, highlight, 'goog-menuitem-highlight');
    }
  }
  isActive() { return this.hasState(State.ACTIVE); }
  setActive(active) {
    if (this.hasState(State.ACTIVE) != active) {
      this.setState_(State.ACTIVE, active, 'goog-menuitem-active');
    }
  }

  // goog.ui.Control.performActionInternal
  performActionInternal(e) {
    const actionEvent = new Event_('action', this);
    if (e) {
      actionEvent.altKey = e.altKey;
      actionEvent.ctrlKey = e.ctrlKey;
      actionEvent.metaKey = e.metaKey;
      actionEvent.shiftKey = e.shiftKey;
    }
    return this.dispatchEvent(actionEvent);
  }

  // goog.ui.Control key handling: only Enter triggers the action
  handleKeyEvent(e) {
    if (this.isVisible() && this.isEnabled() &&
        e.keyCode == goog.events.KeyCodes.ENTER && this.performActionInternal(e)) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }

  handleMouseOver() {
    if (this.isEnabled()) this.setHighlighted(true);
  }
  handleMouseOut() {
    this.setActive(false);
    this.setHighlighted(false);
  }
  handleMouseDown(e) {
    if (this.isEnabled()) {
      this.setHighlighted(true);
      if (e.button == 0) this.setActive(true);
    }
    if (e.button == 0) e.preventDefault();
  }
  handleMouseUp(e) {
    if (this.isEnabled()) {
      this.setHighlighted(true);
      if (this.isActive() && this.performActionInternal(e)) this.setActive(false);
    }
  }

  // goog.ui.ComboBoxItem
  setSticky(sticky) { this.sticky_ = sticky; }
  isSticky() { return this.sticky_; }
  setFormatFromToken(token) {
    if (this.isEnabled()) {
      const caption = this.getCaption();
      const index = caption.toLowerCase().indexOf(token);
      if (index >= 0) {
        this.setContent([
          document.createTextNode(caption.substr(0, index)),
          goog.dom.createDom('b', null, caption.substr(index, token.length)),
          document.createTextNode(caption.substr(index + token.length)),
        ]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ui.Menu (a vertical goog.ui.Container, not focusable)

class Menu extends EventTarget_ {
  constructor() {
    super();
    this.children_ = [];
    this.element_ = null;
    this.visible_ = true;
    this.highlightedIndex_ = -1;
    this.mouseButtonPressed_ = false;
    this.allowHighlightDisabled_ = false;
    this.listen('highlight', this.handleHighlightItem_, this);
    this.listen('unhighlight', this.handleUnHighlightItem_, this);
  }
  getElement() { return this.element_; }
  getChildCount() { return this.children_.length; }
  getChildAt(index) { return this.children_[index] || null; }
  indexOfChild(child) { return this.children_.indexOf(child); }

  createDom() {
    const el = document.createElement('div');
    el.className = 'goog-menu goog-menu-vertical';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-haspopup', 'true');
    if (!this.visible_) style.setElementShown(el, false);
    this.element_ = el;
    for (const child of this.children_) {
      if (!child.getElement()) child.createDom();
      el.appendChild(child.getElement());
    }
  }

  enterDocument() {
    const el = this.element_;
    const owner = (target) => {
      for (let node = target; node && node !== el; node = node.parentNode) {
        const child = this.children_.find((c) => c.getElement() === node);
        if (child) return child;
      }
      return null;
    };
    // mouse events of the items (goog.ui.Container.handleChildMouseEvents_)
    el.addEventListener('mouseover', (e) => {
      const c = owner(e.target);
      if (c && !(e.relatedTarget && c.getElement().contains(e.relatedTarget))) c.handleMouseOver(e);
    });
    el.addEventListener('mouseout', (e) => {
      const c = owner(e.target);
      if (c && !(e.relatedTarget && c.getElement().contains(e.relatedTarget))) c.handleMouseOut(e);
    });
    el.addEventListener('mousedown', (e) => {
      // goog.ui.Container.handleMouseDown: keep the focus in the input
      this.mouseButtonPressed_ = true;
      e.preventDefault();
      const c = owner(e.target);
      if (c) c.handleMouseDown(e);
    });
    el.addEventListener('mouseup', (e) => {
      const c = owner(e.target);
      if (c) c.handleMouseUp(e);
    });
    document.addEventListener('mouseup', () => { this.mouseButtonPressed_ = false; });
  }

  addChildAt(child, index, render) {
    child.parent_ = this;
    child.setParentEventTarget(this);
    this.children_.splice(index, 0, child);
    if (this.highlightedIndex_ >= index) this.highlightedIndex_++;
    if (render && this.element_) {
      if (!child.getElement()) child.createDom();
      const next = this.children_[index + 1];
      this.element_.insertBefore(child.getElement(), next ? next.getElement() : null);
    }
  }
  removeChildAt(index) {
    const child = this.children_[index];
    if (!child) return null;
    if (index == this.highlightedIndex_) {
      child.setHighlighted(false);
    } else if (index < this.highlightedIndex_) {
      this.highlightedIndex_--;
    }
    this.children_.splice(index, 1);
    if (child.getElement() && child.getElement().parentNode) {
      child.getElement().parentNode.removeChild(child.getElement());
    }
    child.parent_ = null;
    child.setParentEventTarget(null);
    return child;
  }

  isVisible() { return this.visible_; }
  setVisible(visible) {
    if (this.visible_ != visible) {
      this.visible_ = visible;
      if (this.element_) style.setElementShown(this.element_, visible);
      return true;
    }
    return false;
  }
  setMouseButtonPressed(pressed) { this.mouseButtonPressed_ = pressed; }
  isMouseButtonPressed() { return this.mouseButtonPressed_; }
  setAllowHighlightDisabled(allow) { this.allowHighlightDisabled_ = allow; }

  getHighlightedIndex() { return this.highlightedIndex_; }
  getHighlighted() { return this.getChildAt(this.highlightedIndex_); }
  setHighlightedIndex(index) {
    const child = this.getChildAt(index);
    if (child) {
      child.setHighlighted(true);
    } else if (this.highlightedIndex_ > -1) {
      this.getHighlighted().setHighlighted(false);
    }
    if (child && child.getElement() && this.element_) {
      style.scrollIntoContainerView(child.getElement(), this.element_);
    }
  }
  setHighlighted(item) { this.setHighlightedIndex(this.indexOfChild(item)); }

  handleHighlightItem_(e) {
    const index = this.indexOfChild(e.target);
    if (index > -1 && index != this.highlightedIndex_) {
      const prev = this.getHighlighted();
      if (prev) prev.setHighlighted(false);
      this.highlightedIndex_ = index;
      const item = this.getHighlighted();
      if (this.isMouseButtonPressed()) item.setActive(true);
    }
    if (e.target.getElement() != null && this.element_) {
      this.element_.setAttribute('aria-activedescendant', e.target.getElement().id);
    }
  }
  handleUnHighlightItem_(e) {
    if (e.target == this.getHighlighted()) this.highlightedIndex_ = -1;
    if (this.element_) this.element_.removeAttribute('aria-activedescendant');
  }

  canHighlightItem(item) {
    return (this.allowHighlightDisabled_ || item.isEnabled()) && item.isVisible();
  }
  highlightHelper(fn, startIndex) {
    let curIndex = startIndex < 0 ? -1 : startIndex;
    const numItems = this.getChildCount();
    curIndex = fn(curIndex, numItems);
    let visited = 0;
    while (visited <= numItems) {
      const control = this.getChildAt(curIndex);
      if (control && this.canHighlightItem(control)) {
        this.setHighlightedIndex(curIndex);
        return true;
      }
      visited++;
      curIndex = fn(curIndex, numItems);
    }
    return false;
  }

  // goog.ui.Container.handleKeyEvent (+ Menu mnemonics, which plain items lack)
  handleKeyEvent(e) {
    if (this.isVisible() && this.getChildCount() != 0 && this.handleKeyEventInternal(e)) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }
  handleKeyEventInternal(e) {
    const highlighted = this.getHighlighted();
    if (highlighted && highlighted.handleKeyEvent(e)) return true;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
    const K = goog.events.KeyCodes;
    switch (e.keyCode) {
      case K.HOME:
        this.highlightHelper((i, max) => (i + 1) % max, this.getChildCount() - 1);
        break;
      case K.END:
        this.highlightHelper((i, max) => { i--; return i < 0 ? max - 1 : i; }, 0);
        break;
      case K.UP:
        this.highlightHelper((i, max) => { i--; return i < 0 ? max - 1 : i; }, this.highlightedIndex_);
        break;
      case K.DOWN:
        this.highlightHelper((i, max) => (i + 1) % max, this.highlightedIndex_);
        break;
      default:
        return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// ui.ComboBox (with goog.ui.LabelInput behaviour for its <input>)

// goog.a11y.aria.setState(el, 'label', v): an empty value removes the attribute
function setAriaLabel(el, value) {
  if (value === '' || value == undefined) el.removeAttribute('aria-label');
  else el.setAttribute('aria-label', value);
}

const BLUR_DISMISS_TIMER_MS = 250;

function initComboBox(self) {
  initComponent(self);
  self.enabled_ = true;
  self.menu_ = new Menu();
  self.menu_.setParentEventTarget(self);
  self.input_ = null;
  self.button_ = null;
  self.defaultText_ = '';
  self.fieldName_ = '';
  self.visibleCount_ = -1;
  self.lastToken_ = null;
  self.dismissTimer_ = null;
  self.label_ = '';
  self.inputHasFocus_ = false;
  self.matchFunction_ = goog.string.startsWith;
  // setupMenu_
  self.menu_.setVisible(false);
  self.menu_.setAllowHighlightDisabled(true);
}

// Callable the old way too: ms.ComboBox does goog.ui.ComboBox.call(this)
function ComboBox() {
  initComboBox(this);
}

class ComboBoxImpl extends Component_ {
  createDom() {
    this.input_ = goog.dom.createDom('input', { name: this.fieldName_, type: 'text', autocomplete: 'off' });
    this.button_ = goog.dom.createDom('span', 'goog-combobox-button');
    this.setElementInternal(goog.dom.createDom('span', 'goog-combobox', this.input_, this.button_));
    this.input_.setAttribute('label', this.defaultText_);
    // goog.ui.LabelInput.decorate(input)
    this.label_ = this.input_.getAttribute('label') || '';
    if (document.activeElement == this.input_) {
      this.inputHasFocus_ = true;
      this.input_.classList.remove('label-input-label');
    }
    this.input_.placeholder = this.label_;
    setAriaLabel(this.input_, this.label_);
    this.input_.addEventListener('focus', () => {
      this.inputHasFocus_ = true;
      this.input_.classList.remove('label-input-label');
    });
    this.input_.addEventListener('blur', () => {
      this.inputHasFocus_ = false;
      this.checkLabel_();
    });
    this.checkLabel_();
    // the menu is a child rendered into the combobox element
    this.menu_.createDom();
    this.menu_.enterDocument();
    this.getElement().appendChild(this.menu_.getElement());
  }

  enterDocument() {
    super.enterDocument();
    const h = this.getHandler();
    h.listen(this.getElement(), 'mousedown', this.onComboMouseDown_);
    h.listen(document, 'mousedown', this.onDocClicked_);
    h.listen(this.input_, 'blur', this.onInputBlur_);
    // Closure fed this from goog.events.KeyHandler, which in today's browsers
    // only delivered keys that fire 'keypress' (Enter and characters), so the
    // arrows, Home/End never worked. They do now (keydown); Tab keeps moving to
    // the next field as before (see handleKeyEvent).
    h.listen(this.input_, 'keydown', this.handleKeyEvent);
    h.listen(this.input_, 'input', this.onInputEvent_);
    this.menu_.listen('action', this.onMenuSelected_, this);
  }

  // --- goog.ui.LabelInput
  hasChanged_() { return this.input_.value != '' && this.input_.value != this.label_; }
  checkLabel_() {
    if (this.input_.placeholder != this.label_) this.input_.placeholder = this.label_;
    setAriaLabel(this.input_, this.label_);
    if (!this.hasChanged_()) {
      if (!this.inputHasFocus_) this.input_.classList.add('label-input-label');
    } else {
      this.input_.classList.remove('label-input-label');
    }
  }
  setLabelInputValue_(s) {
    this.input_.value = s;
    this.checkLabel_();
  }
  getLabelInputValue_() { return this.hasChanged_() ? this.input_.value : ''; }

  // --- public API used by the template
  setEnabled(enabled) {
    this.enabled_ = enabled;
    this.input_.disabled = !enabled;
    goog.dom.classlist.enable(this.input_, 'label-input-label-disabled', !enabled);
    goog.dom.classlist.enable(this.getElement(), 'goog-combobox-disabled', !enabled);
  }
  isEnabled() { return this.enabled_; }
  dismiss() {
    this.clearDismissTimer_();
    this.hideMenu_();
    this.menu_.setHighlightedIndex(-1);
  }
  addItem(item) {
    this.menu_.addChildAt(item, this.menu_.getChildCount(), true);
    this.visibleCount_ = -1;
  }
  addItemAt(item, n) {
    this.menu_.addChildAt(item, n, true);
    this.visibleCount_ = -1;
  }
  removeItemAt(n) {
    const child = this.menu_.removeChildAt(n);
    this.visibleCount_ = -1;
    return child;
  }
  getItemAt(n) { return this.menu_.getChildAt(n); }
  getItemCount() { return this.menu_.getChildCount(); }
  getMenu() { return this.menu_; }
  getInputElement() { return this.input_; }
  setDefaultText(text) {
    this.defaultText_ = text;
    // goog.ui.LabelInput.setLabel (native placeholder)
    if (this.input_) {
      this.input_.placeholder = text;
      this.label_ = text;
      setAriaLabel(this.input_, this.label_);
    }
  }
  getDefaultText() { return this.defaultText_; }
  setValue(value) {
    if (this.getLabelInputValue_() != value) {
      this.setLabelInputValue_(value);
      this.handleInputChange_();
    }
  }
  getValue() { return this.getLabelInputValue_(); }
  getTokenText_() { return goog.string.trim(this.getLabelInputValue_().toLowerCase()); }

  // --- menu visibility
  getNumberOfVisibleItems_() {
    if (this.visibleCount_ == -1) {
      let count = 0;
      for (let i = 0, n = this.menu_.getChildCount(); i < n; i++) {
        if (this.menu_.getChildAt(i).isVisible()) count++;
      }
      this.visibleCount_ = count;
    }
    return this.visibleCount_;
  }
  maybeShowMenu_(showAll) {
    const isVisible = this.menu_.isVisible();
    const numVisibleItems = this.getNumberOfVisibleItems_();
    if (isVisible && numVisibleItems == 0) {
      this.hideMenu_();
    } else if (!isVisible && numVisibleItems > 0) {
      if (showAll) {
        this.setItemVisibilityFromToken_('');
        this.setItemHighlightFromToken_(this.getTokenText_());
      }
      setTimeout(() => this.clearDismissTimer_(), 1);
      this.showMenu_();
    }
    this.positionMenu();
  }
  positionMenu() {
    if (this.menu_ && this.menu_.isVisible()) {
      positioning.repositionMenu(this.getElement(), this.menu_.getElement());
    }
  }
  showMenu_() {
    this.menu_.setVisible(true);
    this.getElement().classList.add('goog-combobox-active');
  }
  hideMenu_() {
    this.menu_.setVisible(false);
    this.getElement().classList.remove('goog-combobox-active');
  }
  clearDismissTimer_() {
    if (this.dismissTimer_) {
      clearTimeout(this.dismissTimer_);
      this.dismissTimer_ = null;
    }
  }

  // --- event handlers
  onComboMouseDown_(e) {
    if (this.enabled_ && (e.target == this.getElement() || e.target == this.input_ ||
        goog.dom.contains(this.button_, e.target))) {
      if (this.menu_.isVisible()) {
        this.dismiss();
      } else {
        this.maybeShowMenu_(true);
        this.input_.select();
        this.menu_.setMouseButtonPressed(true);
        e.preventDefault();
      }
    }
    e.stopPropagation();
  }
  onDocClicked_(e) {
    if (!goog.dom.contains(this.menu_.getElement(), e.target)) this.dismiss();
  }
  onMenuSelected_(e) {
    const item = e.target;
    if (this.dispatchEvent(new Event_('action', this))) {
      const caption = item.getCaption();
      if (this.getLabelInputValue_() != caption) {
        this.setLabelInputValue_(caption);
        this.dispatchEvent('change');
      }
      this.dismiss();
    }
    e.stopPropagation();
  }
  onInputBlur_() {
    this.clearDismissTimer_();
    this.dismissTimer_ = setTimeout(() => this.dismiss(), BLUR_DISMISS_TIMER_MS);
  }
  handleKeyEvent(e) {
    const isMenuVisible = this.menu_.isVisible();
    if (isMenuVisible && this.menu_.handleKeyEvent(e)) return true;
    let handled = false;
    const K = goog.events.KeyCodes;
    switch (e.keyCode) {
      case K.ESC:
        if (isMenuVisible) {
          this.dismiss();
          handled = true;
        }
        break;
      // K.TAB: Closure would pick the highlighted item (even the disabled
      // "type a value" hint); it never did in practice, so Tab is left alone.
      case K.UP:
      case K.DOWN:
        if (!isMenuVisible) {
          this.maybeShowMenu_(true);
          handled = true;
        }
        break;
      default:
        break;
    }
    if (handled) e.preventDefault();
    return handled;
  }
  onInputEvent_() {
    this.handleInputChange_();
  }
  handleInputChange_() {
    const token = this.getTokenText_();
    this.setItemVisibilityFromToken_(token);
    if (document.activeElement == this.input_) this.maybeShowMenu_(false);
    const highlighted = this.menu_.getHighlighted();
    if (token == '' || !highlighted || !highlighted.isVisible()) this.setItemHighlightFromToken_(token);
    this.lastToken_ = token;
    this.dispatchEvent('change');
  }
  setItemVisibilityFromToken_(token) {
    let count = 0;
    const recheckHidden = !this.matchFunction_(token, this.lastToken_);
    for (let i = 0, n = this.menu_.getChildCount(); i < n; i++) {
      const item = this.menu_.getChildAt(i);
      if (!item.isVisible() && !recheckHidden) continue;
      const caption = item.getCaption();
      const visible = item.isSticky() || (caption && this.matchFunction_(caption.toLowerCase(), token));
      item.setFormatFromToken(token);
      item.setVisible(!!visible);
      if (item.isVisible()) count++;
    }
    this.visibleCount_ = count;
  }
  setItemHighlightFromToken_(token) {
    if (token == '') {
      this.menu_.setHighlightedIndex(-1);
      return;
    }
    for (let i = 0, n = this.menu_.getChildCount(); i < n; i++) {
      const item = this.menu_.getChildAt(i);
      const caption = item.getCaption();
      if (caption && this.matchFunction_(caption.toLowerCase(), token)) {
        this.menu_.setHighlightedIndex(i);
        item.setFormatFromToken(token);
        return;
      }
    }
    this.menu_.setHighlightedIndex(-1);
  }
}

ComboBox.prototype = ComboBoxImpl.prototype;
ComboBox.prototype.constructor = ComboBox;

goog.ui = { Dialog, ComboBox, ComboBoxItem: MenuItem };

export default goog;
