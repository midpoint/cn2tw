/* 简繁通 content script：偵測頁面文字、轉換、還原、動態內容與詞彙標註。
   轉換語意與網站／CLI 共用 epub-core.js：命中詞彙的片段直接輸出，未命中的片段才過 OpenCC。 */
(() => {
  'use strict';
  if (globalThis.__JFT_CONTENT__) return;
  globalThis.__JFT_CONTENT__ = true;

  const Core = globalThis.EpubCore;
  const OpenCC = globalThis.OpenCC;
  const TERMS_RAW = globalThis.JFT_TERMS || null;
  const TERMS = (() => {
    if (!Core || !TERMS_RAW || !Array.isArray(TERMS_RAW.files)) return [];
    try { return Core.normalizeTerms(TERMS_RAW.files); } catch (e) { return []; }
  })();
  const DATA_VERSION = TERMS_RAW && TERMS_RAW.version ? String(TERMS_RAW.version) : '';

  const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  const CJK_GLOBAL = /[\u3400-\u9FFF\uF900-\uFAFF]/g;
  const KANA_GLOBAL = /[\u3040-\u30FF]/g;
  const HANGUL_GLOBAL = /[\uAC00-\uD7AF]/g;
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select', 'option',
    'code', 'pre', 'kbd', 'samp', 'var', 'svg', 'math', 'canvas',
    '[contenteditable]:not([contenteditable="false" i])',
    '[translate="no" i]', '.notranslate', '[data-jft-skip]', '.jft-term'
  ].join(',');
  // 表單控制項的文字內容跳過，但 placeholder/title/aria-label 仍可轉換。
  const ATTR_SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'template',
    'code', 'pre', 'kbd', 'samp', 'var', 'svg', 'math', 'canvas',
    '[contenteditable]:not([contenteditable="false" i])',
    '[translate="no" i]', '.notranslate', '[data-jft-skip]', '.jft-term'
  ].join(',');
  const ATTRS = ['title', 'alt', 'placeholder', 'aria-label'];

  const state = {
    settings: null,
    override: null, // null（自動）| 'to-tw' | 'to-cn' | 'paused'
    status: 'loading',
    direction: null,
    source: null,
    sourceInfo: null,
    stats: { terms: 0, chars: 0, nodes: 0 },
    records: [],
    converted: false,
    ctx: null,
    observer: null,
    scheduled: null,
    idleId: null,
    pendingText: new Set(),
    pendingOwnText: new Set(),
    pendingRoots: new Set(),
    ownNodes: new WeakSet(),
    lastWrite: new WeakMap(),
    convCache: new Map(),
    idxCache: new Map(),
    resourceError: !Core || !OpenCC
  };

  const browserTarget = () => /^zh-(cn|sg|hans|my)\b/i.test(navigator.language || '') ? 'cn' : 'tw';
  const defaults = () => ({ enabled: true, target: browserTarget(), terms: true, annotate: false });

  function normalizeSettings(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    return {
      enabled: raw.enabled !== false,
      target: raw.target === 'cn' ? 'cn' : raw.target === 'tw' ? 'tw' : d.target,
      terms: raw.terms !== false,
      annotate: raw.annotate === true
    };
  }

  const sameSettings = (a, b) => !!a && !!b &&
    a.enabled === b.enabled && a.target === b.target &&
    a.terms === b.terms && a.annotate === b.annotate;

  function getConv(from, to) {
    if (!OpenCC || !Core) return null;
    const key = from + '>' + to;
    if (!state.convCache.has(key)) {
      try { state.convCache.set(key, Core.makeGlyphConverter(OpenCC, from, to)); }
      catch (e) { return null; }
    }
    return state.convCache.get(key);
  }

  function getIndex(direction, termsOn) {
    if (!termsOn || !TERMS.length || !Core) return null;
    if (state.idxCache.has(direction)) return state.idxCache.get(direction);
    let idx = null;
    try {
      const convs = direction === 'to-tw'
        ? { twToCn: getConv('tw', 'cn'), cnToTw: getConv('cn', 'tw') }
        : {};
      idx = Core.buildTermIndex(TERMS, direction, convs).idx;
    } catch (e) { idx = null; }
    state.idxCache.set(direction, idx);
    return idx;
  }

  function makeCtx(direction, termsOn) {
    const conv = direction === 'to-tw'
      ? getConv('cn', termsOn ? 'twp' : 'tw')
      : getConv('tw', 'cn');
    if (!conv) return null;
    const idx = getIndex(direction, termsOn);
    return {
      direction,
      conv,
      idx,
      annotate: !!(termsOn && idx && state.settings && state.settings.annotate),
      hitConv: direction === 'to-tw' ? hit => hit.repl : hit => conv(hit.repl)
    };
  }

  /* 與 Core.applyTerms 相同的分段替換，另外保留每段是否命中，供標註使用。 */
  function convertSegments(src, ctx) {
    if (!ctx.idx) return [{ text: ctx.conv(src), hit: null }];
    const segs = [];
    let plain = '';
    let i = 0;
    const flush = () => {
      if (plain) { segs.push({ text: ctx.conv(plain), hit: null }); plain = ''; }
    };
    while (i < src.length) {
      const cand = ctx.idx.get(src.charAt(i));
      let hit = null;
      if (cand) {
        for (const c of cand) {
          if (src.startsWith(c.pat, i)) { hit = c; break; }
        }
      }
      if (!hit) { plain += src.charAt(i++); continue; }
      if (hit.repl === null) { plain += src.substr(i, hit.pat.length); i += hit.pat.length; continue; }
      flush();
      segs.push({ text: ctx.hitConv(hit), hit });
      i += hit.pat.length;
    }
    flush();
    return segs;
  }

  function hitTitle(hit, output, direction) {
    const note = String(hit.t.note || '').trim().replace(/^[。；;，,]\s*/, '');
    let text = direction === 'to-tw'
      ? `原文「${hit.pat}」→ 台灣地區「${output}」`
      : `原文「${hit.pat}」→ 簡體「${output}」`;
    if (note) text += '。' + note;
    return text;
  }

  const isSkipped = el => !!(el && el.closest && el.closest(SKIP_SELECTOR));
  const isAttrSkipped = el => !!(el && el.closest && el.closest(ATTR_SKIP_SELECTOR));

  /* 只比對字形：用便宜的 tw→cn 轉換器逐字看多少字會變。
     繁體字變得多（≥8%）→ 原文繁體；幾乎不變 → 原文簡體。
     不使用 twp／詞彙庫，避免把使用中國大陸詞彙的繁體頁誤判成簡體。 */
  function detectSourceInfo() {
    if (state.sourceInfo) return state.sourceInfo;
    const lang = (document.documentElement.getAttribute('lang') || '').trim();
    if (/^zh-(hans|cn|sg|my)\b/i.test(lang)) return (state.sourceInfo = { script: 'cn', cjk: true });
    if (/^zh-(hant|tw|hk|mo)\b/i.test(lang)) return (state.sourceInfo = { script: 'tw', cjk: true });

    const sample = document.body ? document.body.innerText.slice(0, 3000) : '';
    const chars = sample.match(CJK_GLOBAL) || [];
    if (chars.length < 20) return (state.sourceInfo = { script: null, cjk: false });
    const kana = (sample.match(KANA_GLOBAL) || []).length;
    const hangul = (sample.match(HANGUL_GLOBAL) || []).length;
    if (kana > chars.length || hangul > chars.length) {
      return (state.sourceInfo = { script: null, cjk: false });
    }

    const conv = getConv('tw', 'cn');
    if (!conv) return (state.sourceInfo = { script: null, cjk: true });
    const uniq = [...new Set(chars)].slice(0, 400);
    let changed = 0;
    for (const ch of uniq) if (conv(ch) !== ch) changed++;
    const ratio = uniq.length ? changed / uniq.length : 0;
    return (state.sourceInfo = { script: ratio >= 0.08 ? 'tw' : 'cn', cjk: true, ratio });
  }

  function pageExcluded() {
    try {
      if (document.designMode === 'on') return true;
      const root = document.documentElement;
      return !!(root && root.matches('[translate="no" i],.notranslate,[data-jft-skip]'));
    } catch (e) { return false; }
  }

  function planForPage() {
    if (state.resourceError) return { state: 'error' };
    if (!state.settings) return { state: 'loading' };
    if (!state.settings.enabled) return { state: 'disabled' };
    if (pageExcluded()) return { state: 'excluded' };
    const info = detectSourceInfo();
    if (!info.cjk) return { state: 'notChinese' };
    if (state.override === 'paused') return { state: 'paused' };
    const direction = state.override === 'to-tw' || state.override === 'to-cn'
      ? state.override
      : state.settings.target === 'cn' ? 'to-cn' : 'to-tw';
    if (state.override) return { state: 'convert', direction, source: info.script };
    const targetScript = direction === 'to-tw' ? 'tw' : 'cn';
    if (!info.script) return { state: 'unknown', direction };
    if (info.script === targetScript) return { state: 'already', direction, source: info.script };
    return { state: 'convert', direction, source: info.script };
  }

  function countHits(segs) {
    let n = 0;
    for (const s of segs) if (s.hit) n++;
    return n;
  }

  function convertTextNode(node, ctx) {
    if (!node || node.nodeType !== 3 || !node.isConnected) return;
    const parent = node.parentElement;
    if (!parent || parent.tagName === 'TITLE' || isSkipped(parent)) return;
    const src = node.data;
    if (!src || !CJK_RE.test(src)) return;
    const segs = convertSegments(src, ctx);
    const output = segs.map(s => s.text).join('');
    if (output === src) return;
    const terms = countHits(segs);

    if (ctx.annotate && terms) {
      const frag = document.createDocumentFragment();
      const parts = [];
      for (const seg of segs) {
        if (seg.hit) {
          const span = document.createElement('span');
          span.className = 'jft-term';
          span.title = hitTitle(seg.hit, seg.text, ctx.direction);
          const tn = document.createTextNode(seg.text);
          span.appendChild(tn);
          state.ownNodes.add(span);
          state.ownNodes.add(tn);
          state.lastWrite.set(tn, seg.text);
          frag.appendChild(span);
          parts.push(span);
        } else {
          const tn = document.createTextNode(seg.text);
          state.ownNodes.add(tn);
          state.lastWrite.set(tn, seg.text);
          frag.appendChild(tn);
          parts.push(tn);
        }
      }
      parent.insertBefore(frag, node);
      node.data = '';
      state.ownNodes.add(node);
      state.lastWrite.set(node, '');
      state.records.push({ kind: 'group', parent, anchor: node, parts, original: src, output });
    } else {
      node.data = output;
      state.lastWrite.set(node, output);
      state.records.push({ kind: 'text', node, original: src, output });
    }
    state.stats.terms += terms;
    state.stats.chars += src.length;
    state.stats.nodes++;
  }

  function walkText(root, ctx) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.data || !CJK_RE.test(node.data)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.tagName === 'TITLE' || isSkipped(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) convertTextNode(node, ctx);
  }

  function convertAttributesIn(root, ctx) {
    if (!root || root.nodeType !== 1) return;
    const els = [];
    if (root.matches && root.matches('[title],[alt],[placeholder],[aria-label]')) els.push(root);
    if (root.querySelectorAll) els.push(...root.querySelectorAll('[title],[alt],[placeholder],[aria-label]'));
    for (const el of els) {
      if (!el.isConnected || isAttrSkipped(el)) continue;
      for (const name of ATTRS) {
        const val = el.getAttribute(name);
        if (!val || !CJK_RE.test(val)) continue;
        const segs = convertSegments(val, ctx);
        const output = segs.map(s => s.text).join('');
        if (output === val) continue;
        el.setAttribute(name, output);
        state.records.push({ kind: 'attr', el, name, original: val, output });
        state.stats.terms += countHits(segs);
        state.stats.chars += val.length;
        state.stats.nodes++;
      }
    }
  }

  function convertTitle(ctx) {
    const src = document.title;
    if (!src || !CJK_RE.test(src)) return;
    const segs = convertSegments(src, ctx);
    const output = segs.map(s => s.text).join('');
    if (output === src) return;
    document.title = output;
    state.records.push({ kind: 'title', original: src, output });
    state.stats.terms += countHits(segs);
    state.stats.chars += src.length;
    state.stats.nodes++;
  }

  function convertRoot(root, ctx) {
    if (!root || !root.isConnected) return;
    if (root.nodeType === 3) { convertTextNode(root, ctx); return; }
    if (root.nodeType !== 1) return;
    if (isSkipped(root)) {
      // 表單控制項的內容跳過，但 placeholder/title 等屬性仍值得轉換。
      if (root.matches('input,textarea,select,option')) convertAttributesIn(root, ctx);
      return;
    }
    walkText(root, ctx);
    convertAttributesIn(root, ctx);
  }

  function convertDocument(ctx) {
    convertTitle(ctx);
    if (document.body) convertRoot(document.body, ctx);
  }

  function cancelScheduled() {
    if (state.scheduled) { clearTimeout(state.scheduled); state.scheduled = null; }
    if (state.idleId && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(state.idleId);
      state.idleId = null;
    }
    state.pendingText.clear();
    state.pendingOwnText.clear();
    state.pendingRoots.clear();
  }

  function restoreAll() {
    cancelScheduled();
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    for (let i = state.records.length - 1; i >= 0; i--) {
      const r = state.records[i];
      try {
        if (r.kind === 'text') {
          if (r.node.isConnected && r.node.data === r.output) r.node.data = r.original;
        } else if (r.kind === 'group') {
          if (!r.anchor || !r.anchor.isConnected || r.anchor.parentNode !== r.parent) continue;
          if (!r.parts.every(p => p.isConnected && p.parentNode === r.parent)) continue;
          const current = r.parts.map(p => p.textContent).join('');
          if (r.anchor.data === '' && current === r.output) {
            for (const p of r.parts) r.parent.removeChild(p);
            r.anchor.data = r.original;
          } else if (r.anchor.data === '') {
            // 頁面改寫了我們建立的標註節點：移除分段，把目前可見文字收回 anchor。
            for (const p of r.parts) r.parent.removeChild(p);
            r.anchor.data = current;
          } else {
            // 頁面直接改寫 anchor：移除分段，保留頁面寫入的 anchor 內容。
            for (const p of r.parts) r.parent.removeChild(p);
          }
        } else if (r.kind === 'attr') {
          if (r.el.isConnected && r.el.getAttribute(r.name) === r.output) r.el.setAttribute(r.name, r.original);
        } else if (r.kind === 'title') {
          if (document.title === r.output) document.title = r.original;
        }
      } catch (e) { /* 頁面已改寫，保留頁面現況 */ }
    }
    state.records = [];
    state.stats = { terms: 0, chars: 0, nodes: 0 };
    state.converted = false;
    state.ctx = null;
    state.direction = null;
    state.ownNodes = new WeakSet();
    state.lastWrite = new WeakMap();
  }

  function startObserver() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(onMutations);
    state.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function schedulePending() {
    if (state.scheduled) return;
    state.scheduled = setTimeout(() => {
      state.scheduled = null;
      const run = () => flushPending();
      if (typeof requestIdleCallback === 'function') {
        state.idleId = requestIdleCallback(run, { timeout: 800 });
      } else {
        run();
      }
    }, 150);
  }

  function onMutations(mutations) {
    if (!state.converted || !state.ctx) return;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const node = m.target;
        if (!node || node.nodeType !== 3 || !node.isConnected) continue;
        if (!document.body || !document.body.contains(node)) continue;
        if (node.parentElement && node.parentElement.tagName === 'TITLE') continue;
        if (state.ownNodes.has(node)) {
          if (state.lastWrite.get(node) === node.data) continue;
          // 頁面改寫了標註片段中的普通文字節點：照一般文字重新轉換（不重新標註）。
          if (node.parentElement && node.parentElement.closest('.jft-term')) continue;
          state.pendingOwnText.add(node);
          continue;
        }
        state.pendingText.add(node);
      } else if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 3) {
            if (!state.ownNodes.has(node) && node.isConnected && document.body && document.body.contains(node)) {
              state.pendingText.add(node);
            }
          } else if (node.nodeType === 1) {
            if (!node.isConnected || !document.body) continue;
            if (node !== document.body && !document.body.contains(node)) continue;
            if (state.ownNodes.has(node)) continue;
            if (isSkipped(node) && !node.matches('input,textarea,select,option')) continue;
            state.pendingRoots.add(node);
          }
        }
      }
    }
    if (state.pendingText.size || state.pendingOwnText.size || state.pendingRoots.size) schedulePending();
  }

  function convertUpdatedPart(node, ctx) {
    if (!node || node.nodeType !== 3 || !node.isConnected) return;
    const parent = node.parentElement;
    if (!parent || parent.tagName === 'TITLE' || isSkipped(parent)) return;
    const src = node.data;
    if (!src || !CJK_RE.test(src)) return;
    const segs = convertSegments(src, ctx);
    const output = segs.map(s => s.text).join('');
    if (output === src) return;
    node.data = output;
    state.lastWrite.set(node, output);
    state.records.push({ kind: 'text', node, original: src, output });
    state.stats.terms += countHits(segs);
    state.stats.chars += src.length;
    state.stats.nodes++;
  }

  function flushPending() {
    state.idleId = null;
    if (!state.converted || !state.ctx) return;
    const ctx = state.ctx;
    const roots = [...state.pendingRoots];
    const texts = [...state.pendingText];
    const ownTexts = [...state.pendingOwnText];
    state.pendingRoots.clear();
    state.pendingText.clear();
    state.pendingOwnText.clear();
    for (const root of roots) {
      if (root.isConnected) convertRoot(root, ctx);
    }
    const inRoot = node => roots.some(r => r.nodeType === 1 && r.contains(node));
    for (const node of texts) {
      if (node.isConnected && !inRoot(node)) convertTextNode(node, ctx);
    }
    for (const node of ownTexts) {
      if (node.isConnected && !inRoot(node)) convertUpdatedPart(node, ctx);
    }
  }

  function updateBadge() {
    let text = '';
    let color = '#1f7a63';
    let title = '简繁通';
    if (state.status === 'converted' && state.direction) {
      text = state.direction === 'to-tw' ? '繁' : '简';
      color = state.direction === 'to-tw' ? '#1f7a63' : '#a34d2b';
      title = state.direction === 'to-tw' ? '简繁通：已轉為繁體' : '简繁通：已轉為簡體';
    }
    try {
      chrome.runtime.sendMessage({ type: 'jft:badge', text, color, title }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) { /* 擴充重新載入時 context 可能已失效 */ }
  }

  function getStatus() {
    const s = state.settings || defaults();
    return {
      ok: true,
      urlKind: 'web',
      state: state.status,
      direction: state.direction,
      source: state.source,
      override: state.override || 'auto',
      stats: { ...state.stats },
      enabled: !!s.enabled,
      target: s.target,
      terms: !!s.terms,
      annotate: !!s.annotate,
      dataVersion: DATA_VERSION,
      termCount: TERMS.length
    };
  }

  function refresh() {
    if (!state.settings) { state.status = 'loading'; return; }
    if (state.records.length || state.converted || state.ctx) restoreAll();
    else cancelScheduled();

    if (state.resourceError) {
      state.status = 'error';
      state.direction = null;
      updateBadge();
      return;
    }

    const plan = planForPage();
    state.source = plan.source !== undefined
      ? plan.source
      : state.sourceInfo ? state.sourceInfo.script : null;
    if (plan.state !== 'convert') {
      state.status = plan.state;
      state.direction = plan.direction || null;
      state.converted = false;
      updateBadge();
      return;
    }

    const termsOn = !!state.settings.terms && TERMS.length > 0;
    const ctx = makeCtx(plan.direction, termsOn);
    if (!ctx) {
      state.status = 'error';
      state.direction = null;
      state.converted = false;
      updateBadge();
      return;
    }
    state.ctx = ctx;
    state.direction = plan.direction;
    state.stats = { terms: 0, chars: 0, nodes: 0 };
    try {
      convertDocument(ctx);
    } catch (e) {
      state.status = 'error';
      restoreAll();
      updateBadge();
      return;
    }
    state.converted = true;
    state.status = 'converted';
    startObserver();
    updateBadge();
  }

  function normalizeOverride(value) {
    return value === 'to-tw' || value === 'to-cn' || value === 'paused' ? value : null;
  }

  function boot() {
    const applySettings = data => {
      const next = normalizeSettings(data && data.jft);
      if (!state.settings || !sameSettings(state.settings, next)) {
        state.settings = next;
        refresh();
      }
    };
    try {
      chrome.storage.sync.get('jft', applySettings);
    } catch (e) {
      applySettings(null);
    }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes.jft) return;
        const next = normalizeSettings(changes.jft.newValue);
        if (sameSettings(state.settings, next)) return;
        state.settings = next;
        refresh();
      });
    } catch (e) { /* 不在擴充環境時仍可用預設值測試 */ }
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || typeof msg.type !== 'string') return false;
        try {
          if (msg.type === 'jft:getStatus') {
            sendResponse(getStatus());
          } else if (msg.type === 'jft:setOverride') {
            state.override = normalizeOverride(msg.value);
            refresh();
            sendResponse({ ok: true, status: getStatus() });
          } else if (msg.type === 'jft:restore') {
            state.override = 'paused';
            refresh();
            sendResponse({ ok: true, status: getStatus() });
          } else if (msg.type === 'jft:toggle') {
            state.override = state.status === 'converted' ? 'paused' : null;
            refresh();
            sendResponse({ ok: true, status: getStatus() });
          } else {
            return false;
          }
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        return false;
      });
    } catch (e) { /* 同上 */ }

    // SPA 初始內容可能比 content script 晚出現；若一開始判定沒有中文，稍後再試。
    const retryDetection = () => {
      if (state.status !== 'notChinese' || !state.settings || !state.settings.enabled || pageExcluded()) return;
      state.sourceInfo = null;
      refresh();
    };
    if (document.readyState !== 'complete') window.addEventListener('load', retryDetection, { once: true });
    setTimeout(retryDetection, 1500);
    setTimeout(retryDetection, 4000);
  }

  // 開發／自動化測試用；content script 的隔離世界不影響頁面。
  globalThis.__JFT_TEST__ = {
    getStatus,
    refresh,
    restoreAll,
    segments(src, direction, termsOn) {
      const saved = state.settings;
      if (!state.settings) state.settings = defaults();
      const ctx = makeCtx(direction === 'to-cn' ? 'to-cn' : 'to-tw', termsOn !== false);
      state.settings = saved;
      if (!ctx) return null;
      const segs = convertSegments(String(src), ctx);
      return {
        text: segs.map(s => s.text).join(''),
        count: countHits(segs),
        segments: segs.map(s => ({ text: s.text, hit: !!s.hit, pat: s.hit ? s.hit.pat : null }))
      };
    }
  };

  boot();
})();
