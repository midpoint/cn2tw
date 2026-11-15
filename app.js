(function () {
  'use strict';

  const CFG = Object.assign({ repo: '', branch: 'main' }, window.SITE_CONFIG || {});
  const hasRepo = CFG.repo && !CFG.repo.startsWith('YOUR-');

  const MODES = {
    'cn-twp': { from: 'cn', to: 'twp', h: ['简', '繁'], inKey: 'mode.cn-twp.in', outKey: 'mode.cn-twp.out', descKey: 'mode.cn-twp.desc' },
    'cn-tw': { from: 'cn', to: 'tw', h: ['简', '繁'], inKey: 'mode.cn-tw.in', outKey: 'mode.cn-tw.out', descKey: 'mode.cn-tw.desc' },
    'cn-hk': { from: 'cn', to: 'hk', h: ['简', '繁'], inKey: 'mode.cn-hk.in', outKey: 'mode.cn-hk.out', descKey: 'mode.cn-hk.desc' },
    'tw-cn': { from: 'tw', to: 'cn', h: ['繁', '简'], inKey: 'mode.tw-cn.in', outKey: 'mode.tw-cn.out', descKey: 'mode.tw-cn.desc' }
  };
  const KIND_LABEL = { vocab: 'kind.vocab', loaded: 'kind.loaded', false: 'kind.false' };
  const SAMPLE = '我们的软件团队正在开发一个新的网络应用程序，默认使用充电宝供电的摄像头。\n这个项目的含金量很高，领导说要给用户提供情绪价值，下沉市场也要覆盖。\n请把文件发到我的邮箱，视频的质量也没有问题。';

  const $ = id => document.getElementById(id);
  const Core = window.EpubCore;
  const t = (k, ...args) => (window.I18N ? window.I18N.t(k, ...args) : k);
  const kindLabel = k => t(KIND_LABEL[k] || k);
  const input = $('input'), output = $('output');
  let mode = 'cn-twp', terms = [], files = [], matcher = null;
  const convCache = {};

  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const load = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  let epubDir = load('s2t-epubdir') === 'to-tw' ? 'to-tw' : 'to-cn';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const flash = (id, msg) => { const el = $(id); el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2400); };

  /* 狀態訊息以 key 記錄，切換介面語言時可重繪 */
  const statusEl = $('status');
  let statusState = { key: 'status.loadingDict', args: [], err: false };
  function setStatus(key, args, err) {
    statusState = key ? { key, args: args || [], err: !!err } : null;
    if (!key) { statusEl.textContent = ''; statusEl.classList.remove('err'); return; }
    statusEl.textContent = t(key, ...(args || []));
    statusEl.classList.toggle('err', !!err);
  }
  function renderStatus() {
    if (!statusState) { statusEl.textContent = ''; statusEl.classList.remove('err'); return; }
    statusEl.textContent = t(statusState.key, ...statusState.args);
    statusEl.classList.toggle('err', statusState.err);
  }

  function getConv(from, to) {
    if (!window.OpenCC) return null;
    const k = from + '>' + to;
    if (!convCache[k]) convCache[k] = Core.makeGlyphConverter(OpenCC, from, to);
    return convCache[k];
  }
  const { firstAlt, usable, alts } = Core;


  /* 詞彙索引：首字 → 候選詞（長詞優先），同時收簡體與繁體寫法 */
  function buildMatcher(m) {
    if (matcher && matcher.mode === m && matcher.n === terms.length) return matcher;
    const idx = new Map();
    const add = (pat, t, role) => {
      if (!pat) return;
      if (!idx.has(pat[0])) idx.set(pat[0], []);
      idx.get(pat[0]).push({ pat, t, role });
    };
    const toS = getConv('tw', 'cn'), toT = getConv('cn', 'tw');
    for (const t of terms) {
      if (m === 'tw-cn') {
        if (t.kind !== 'vocab' || t.oneway) continue;
        const tw = firstAlt(t.tw);
        if (usable(tw)) add(tw, t, 'rev');
      } else {
        const forms = new Set([t.cn]);
        if (toS) forms.add(toS(t.cn));
        if (toT) forms.add(toT(t.cn));
        forms.forEach(f => add(f, t, 'fwd'));
      }
    }
    idx.forEach(list => list.sort((a, b) => b.pat.length - a.pat.length));
    matcher = { mode: m, n: terms.length, idx };
    return matcher;
  }

  /* 逐字標示字形差異；長度不同時在小視窗內找回同步點 */
  function diffHtml(src, out) {
    const a = [...src], b = [...out];
    let html = '', changed = 0;
    if (a.length === b.length) {
      for (let i = 0; i < b.length; i++) {
        if (a[i] !== b[i]) { changed++; html += '<mark>' + esc(b[i]) + '</mark>'; } else html += esc(b[i]);
      }
      return { html, changed };
    }
    let i = 0, j = 0;
    while (j < b.length) {
      if (a[i] === b[j]) { html += esc(b[j]); i++; j++; continue; }
      let si = -1, sj = -1;
      search: for (let d = 1; d <= 8; d++) for (let x = 0; x <= d; x++) {
        const y = d - x;
        if (i + x < a.length && j + y < b.length && a[i + x] === b[j + y] && a[i + x + 1] === b[j + y + 1]) { si = i + x; sj = j + y; break search; }
      }
      if (sj < 0) { si = a.length; sj = b.length; }
      for (; j < sj; j++) { html += '<mark>' + esc(b[j]) + '</mark>'; changed++; }
      i = si;
    }
    return { html, changed };
  }

  /* 使用者點選的說法：「詞#第幾次出現」→ 文字；原文或模式改變就清空 */
  const picks = new Map(), pickOpts = new Map();
  let pickedFor = '';

  function render() {
    const src = input.value;
    $('inCount').textContent = t('count.chars', [...src.replace(/\s/g, '')].length);
    const M = MODES[mode], conv = getConv(M.from, M.to);
    if (!conv) { output.textContent = ''; $('found').hidden = true; return; }
    const { idx } = buildMatcher(mode);
    if (pickedFor !== mode + '\n' + src) { picks.clear(); pickedFor = mode + '\n' + src; }
    pickOpts.clear();
    const canPick = mode === 'cn-twp' || mode === 'cn-tw', occ = {};
    let html = '', changed = 0, plain = '';
    const hits = new Map();
    const flush = () => { if (!plain) return; const d = diffHtml(plain, conv(plain)); html += d.html; changed += d.changed; plain = ''; };

    for (let i = 0; i < src.length;) {
      const cand = idx.get(src[i]);
      let hit = null;
      if (cand) for (const c of cand) { if (src.startsWith(c.pat, i)) { hit = c; break; } }
      if (!hit) { plain += src[i]; i++; continue; }
      flush();
      const term = hit.t, raw = hit.pat;
      let shown, cls;
      if (hit.role === 'rev') { shown = conv(term.cn); cls = 't-vocab'; }
      else if (term.kind === 'vocab' && mode === 'cn-twp' && usable(firstAlt(term.tw))) { shown = firstAlt(term.tw); cls = 't-vocab'; }
      else { shown = conv(raw); cls = term.kind === 'loaded' ? 't-loaded' : term.kind === 'false' ? 't-false' : 't-hint'; }
      let tip = hit.role === 'rev'
        ? t('tip.rev', raw, term.cn)
        : t('tip.fwd', term.cn) + (term.tw ? t('tip.tw', term.tw) : '') + (term.note ? '。' + term.note : '');
      const key = term.cn + '#' + (occ[term.cn] = (occ[term.cn] || 0) + 1), orig = conv(raw);
      const opts = canPick && hit.role === 'fwd' ? alts(term.tw).filter(x => x !== orig) : [];
      let attrs = '';
      if (opts.length) {
        pickOpts.set(key, { opts, orig });
        if (picks.has(key)) { shown = picks.get(key); cls = 't-picked ' + (shown === orig ? 't-hint' : 't-vocab'); }
        tip += t('tip.pick');
        attrs = ' data-k="' + esc(key) + '" tabindex="0" role="button" aria-haspopup="menu"';
        cls += ' pick';
      }
      html += '<span class="t ' + cls + '" title="' + esc(tip) + '"' + attrs + '>' + esc(shown) + '</span>';
      if (shown !== raw) changed += [...shown].length;
      hits.set(term.cat + '/' + term.cn, term);
      i += raw.length;
    }
    flush();
    output.innerHTML = html;
    $('outCount').textContent = t('count.changed', changed, hits.size);
    renderFound([...hits.values()]);
  }

  function renderFound(list) {
    const box = $('found'), ul = $('foundList');
    if (!list.length || mode === 'tw-cn') { box.hidden = true; ul.innerHTML = ''; return; }
    const order = { loaded: 0, false: 1, vocab: 2 };
    list.sort((a, b) => order[a.kind] - order[b.kind]);
    ul.innerHTML = list.map(term =>
      '<li class="' + term.kind + '"><span class="pair">' + esc(term.cn) + ' → ' + esc(term.tw || t('term.noTw')) +
      '</span><span class="note">' + esc(kindLabel(term.kind)) + (term.note ? ' · ' + esc(term.note) : '') + '</span></li>').join('');
    box.hidden = false;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    syncModeHeader();
    render();
  }

  function syncModeHeader() {
    const M = MODES[mode];
    $('hFrom').textContent = M.h[0]; $('hTo').textContent = M.h[1];
    $('inLabel').textContent = t(M.inKey); $('outLabel').textContent = t(M.outKey); $('modeDesc').textContent = t(M.descKey);
  }

  /* ---------- 分頁 ---------- */
  const VIEWS = { conv: 'viewConv', lib: 'viewLib', epub: 'viewEpub' };
  let activeTab = 'conv';
  function showTab(name) {
    activeTab = name;
    for (const [k, id] of Object.entries(VIEWS)) {
      const v = $(id);
      v.hidden = k !== name;
      v.style.display = k === name ? 'flex' : 'none';
    }
    $('tabConv').setAttribute('aria-selected', name === 'conv');
    $('tabLib').setAttribute('aria-selected', name === 'lib');
    $('tabEpub').setAttribute('aria-selected', name === 'epub');
    syncHeader();
    $('modes').hidden = name !== 'conv';
    store('s2t-tab', name);
  }
  function syncHeader() {
    if (activeTab === 'epub') {
      const toTw = epubDir === 'to-tw';
      $('hFrom').textContent = toTw ? '简' : '繁';
      $('hTo').textContent = toTw ? '繁' : '简';
      $('modeDesc').textContent = t(toTw ? 'epub.head.toTw' : 'epub.head.toCn');
    } else {
      syncModeHeader();
    }
  }
  $('tabConv').addEventListener('click', () => showTab('conv'));
  $('tabLib').addEventListener('click', () => showTab('lib'));
  $('tabEpub').addEventListener('click', () => showTab('epub'));

  /* ---------- 詞彙庫（唯讀） ---------- */
  let fKind = '', fCat = '', fQ = '', libVersion = '', libEmptyKey = 'lib.loading';
  function renderLib() {
    $('libCount').textContent = terms.length;
    $('libCount').title = libVersion ? t('lib.versionTitle', libVersion) : '';
    const sel = $('catSel'), cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(t('lib.allCats')) + '</option>' + files.map(f => '<option>' + esc(f.category) + '</option>').join('');
    sel.value = cur;
    const fc = $('fCat'), fcur = fc.value;
    fc.innerHTML = files.map(f => '<option value="' + esc(f.file) + '">' + esc(f.category) + '</option>').join('');
    if (fcur) fc.value = fcur;

    const q = fQ.trim().toLowerCase();
    const list = terms.filter(t => (!fKind || t.kind === fKind) && (!fCat || t.cat === fCat) &&
      (!q || [t.cn, t.tw, t.note, t.cat].join(' ').toLowerCase().includes(q)));
    $('rows').innerHTML = list.map(term =>
      '<tr><td class="cn">' + esc(term.cn) + '</td><td>' + esc(term.tw || '—') + '</td><td><span class="kind ' + term.kind + '">' +
      esc(kindLabel(term.kind)) + '</span></td><td class="category">' + esc(term.cat) + '</td><td class="note">' + esc(term.note || '') + '</td></tr>').join('');
    const empty = $('libEmpty');
    empty.hidden = list.length > 0;
    if (!list.length) empty.textContent = terms.length ? t('lib.empty') : t(libEmptyKey);
  }
  $('q').addEventListener('input', e => { fQ = e.target.value; renderLib(); });
  $('catSel').addEventListener('change', e => { fCat = e.target.value; renderLib(); });
  $('kindChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    fKind = b.dataset.kind;
    document.querySelectorAll('#kindChips .chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    renderLib();
  });

  /* ---------- 提議新增：產生 JSON 片段與 GitHub 連結 ---------- */
  let snippetGenerated = false;
  $('termForm').addEventListener('submit', e => {
    e.preventDefault();
    const entry = { cn: $('fCn').value.trim(), tw: $('fTw').value.trim(), kind: $('fKind').value };
    const note = $('fNote').value.trim();
    if (note) entry.note = note;
    if (!entry.cn) { flash('fMsg', t('form.needCn')); return; }
    const file = $('fCat').value;
    const cat = (files.find(f => f.file === file) || {}).category || '';
    const dup = terms.find(t => t.cn === entry.cn);
    const snippet = JSON.stringify(entry, null, 2).replace(/^/gm, '    ') + ',';
    $('snippet').textContent = snippet;
    snippetGenerated = true;
    $('copySnippet').disabled = false;
    if (hasRepo) {
      const edit = $('editLink'), issue = $('issueLink');
      edit.href = 'https://github.com/' + CFG.repo + '/edit/' + CFG.branch + '/data/' + file;
      edit.hidden = false;
      const body = t('form.issueCat') + cat + '\n\n```json\n' + JSON.stringify(entry, null, 2) + '\n```';
      issue.href = 'https://github.com/' + CFG.repo + '/issues/new?title=' + encodeURIComponent(t('form.issueTitle') + entry.cn) + '&body=' + encodeURIComponent(body);
      issue.hidden = false;
    }
    flash('fMsg', dup ? t('form.dup', entry.cn, dup.cat) : t('form.generated', file));
  });
  $('copySnippet').addEventListener('click', () => {
    const text = $('snippet').textContent;
    try { navigator.clipboard.writeText(text).then(() => flash('sMsg', t('msg.copied')), () => flash('sMsg', t('msg.copyManual'))); }
    catch (e) { flash('sMsg', t('msg.copyManual')); }
  });

  /* ---------- 點選其他說法 ---------- */
  const menu = document.createElement('div');
  menu.className = 'alt-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.appendChild(menu);
  let menuKey = null;
  const closeMenu = () => { if (!menu.hidden) { menu.hidden = true; menuKey = null; } };
  const findSpan = k => [...output.querySelectorAll('.pick')].find(s => s.dataset.k === k);

  function openMenu(span) {
    const k = span.dataset.k, o = pickOpts.get(k);
    if (!o) return;
    const cur = span.textContent;
    menu.innerHTML = '<div class="hd">' + esc(t('menu.title')) + '</div>' +
      o.opts.map(x => '<button type="button" role="menuitem" data-v="' + esc(x) + '"' + (x === cur ? ' class="cur"' : '') + '>' + esc(x) + '</button>').join('') +
      '<button type="button" role="menuitem" data-v="' + esc(o.orig) + '"' + (o.orig === cur ? ' class="cur"' : '') + '>' + esc(t('menu.keep', o.orig)) + '</button>';
    menu.hidden = false; menuKey = k;
    const r = span.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    (menu.querySelector('.cur') || menu.querySelector('button')).focus({ preventScroll: true });
  }

  output.addEventListener('click', e => {
    const s = e.target.closest('.pick');
    if (s) { if (menuKey === s.dataset.k) closeMenu(); else openMenu(s); }
  });
  output.addEventListener('keydown', e => {
    const s = e.target.closest('.pick');
    if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(s); }
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !menuKey) return;
    const k = menuKey;
    picks.set(k, b.dataset.v); closeMenu(); render();
    const s = findSpan(k); if (s) s.focus();
  });
  menu.addEventListener('keydown', e => {
    const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    else if (e.key === 'Escape') { const k = menuKey; closeMenu(); const s = findSpan(k); if (s) s.focus(); }
  });
  document.addEventListener('mousedown', e => { if (!menu.contains(e.target) && !e.target.closest('.pick')) closeMenu(); });
  addEventListener('resize', closeMenu);
  output.addEventListener('scroll', closeMenu);
  addEventListener('scroll', closeMenu, true);

  /* ---------- 轉換器事件 ---------- */
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  input.addEventListener('input', () => { render(); store('s2t-draft', input.value.slice(0, 20000)); });
  $('clear').addEventListener('click', () => { input.value = ''; render(); store('s2t-draft', ''); input.focus(); });
  $('paste').addEventListener('click', () => { input.value = SAMPLE; if (mode === 'tw-cn') setMode('cn-twp'); else render(); });
  $('hl').addEventListener('change', e => output.classList.toggle('plain', !e.target.checked));
  $('swap').addEventListener('click', () => { input.value = output.textContent; setMode(mode === 'tw-cn' ? 'cn-twp' : 'tw-cn'); });
  $('copy').addEventListener('click', () => {
    const text = output.textContent, toast = $('toast');
    const done = () => { toast.textContent = t('msg.copied'); setTimeout(() => toast.textContent = '', 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(output); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast.textContent = t('msg.selectCopy'); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  });

  function syncRepoLine() {
    if (hasRepo) $('repoLine').innerHTML = ' ' + esc(t('foot.repo')) + '<a href="https://github.com/' + esc(CFG.repo) + '" target="_blank" rel="noopener">' + esc(CFG.repo) + '</a>';
  }
  syncRepoLine();

  /* ---------- 啟動 ---------- */
  // 每次打開都從「簡→繁＋台灣地區詞彙」開始，不沿用上次的模式；詞彙頁的「用轉換器試試」會帶 ?q=詞
  const q = new URLSearchParams(location.search).get('q');
  try { localStorage.removeItem('s2t-mode'); } catch (e) {}
  input.value = q || load('s2t-draft') || SAMPLE;
  if (!window.OpenCC) setStatus('status.dictFail', [], true); else renderStatus();
  $('snippet').textContent = t('form.snippetInit');
  setMode(mode);
  renderLib();
  const savedTab = load('s2t-tab');
  showTab(q ? 'conv' : savedTab === 'lib' || savedTab === 'epub' ? savedTab : 'conv');

  /* ---------- 載入詞彙庫 data/*.json ---------- */
  const libReady = (async () => {
    try {
      const index = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
      const loaded = await Promise.all(index.files.map(async file => {
        const d = await (await fetch('data/' + file, { cache: 'no-cache' })).json();
        return { file, category: d.category, terms: d.terms || [] };
      }));
      files = loaded.map(({ file, category }) => ({ file, category }));
      terms = Core.normalizeTerms(loaded);
      matcher = null;
      libVersion = index.version || '';
      renderLib(); render();
      if (window.OpenCC) {
        setStatus('status.libLoaded', [libVersion, terms.length]);
        const shown = statusState;
        setTimeout(() => { if (statusState === shown) setStatus(null); }, 2000);
      }
    } catch (e) {
      const key = location.protocol === 'file:' ? 'status.libFileFail' : 'status.libFail';
      libEmptyKey = key;
      setStatus(key, [], true);
      renderLib();
    }
  })();

  /* ---------- EPUB 轉換 ---------- */
  let epubFile = null, epubUrlObj = '', epubBusy = false, epubDone = null, epubNote = null, epubError = null;

  const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const epubMsg = (text, err) => { const el = $('epubMsg'); el.textContent = text; el.classList.toggle('err', !!err); };
  const setProgress = pct => { $('epubProg').value = Math.max(0, Math.min(100, pct)); };
  const dirCfg = () => {
    const toTw = epubDir === 'to-tw';
    return {
      toTw,
      convFrom: toTw ? 'cn' : 'tw',
      convTo: toTw ? ($('optTerms').checked ? 'twp' : 'tw') : 'cn',
      lang: toTw ? 'zh-TW' : 'zh-CN'
    };
  };
  const EPUB_ERR = {
    NO_CONTAINER: 'epub.err.NO_CONTAINER',
    BAD_CONTAINER: 'epub.err.BAD_CONTAINER',
    NO_JSZIP: 'epub.err.NO_JSZIP',
    NO_CONTENT: 'epub.err.NO_CONTENT',
    DRM: 'epub.err.DRM'
  };
  const epubErrText = e => (e && e.code && EPUB_ERR[e.code]) ? t(EPUB_ERR[e.code]) : (e && e.message ? e.message : String(e));
  const epubSet = (key, args, err) => {
    epubNote = { key, args: args || [], err: !!err };
    epubError = null;
    epubMsg(t(key, ...(args || [])), err);
  };

  function syncEpubDir() {
    document.querySelectorAll('#epubDir .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.dir === epubDir));
    const toTw = epubDir === 'to-tw';
    $('epubTitle').textContent = t(toTw ? 'epub.title.toTw' : 'epub.title');
    $('epubDropBig').textContent = t(toTw ? 'epub.drop.toTw' : 'epub.drop');
    $('optTermsText').textContent = t(toTw ? 'epub.optTerms.toTw' : 'epub.optTerms');
    $('optMetaText').textContent = t(toTw ? 'epub.optMeta.toTw' : 'epub.optMeta');
    $('epubDl').textContent = t(toTw ? 'epub.dl.toTw' : 'epub.dl');
    if (activeTab === 'epub') syncHeader();
  }

  function clearEpubResult() {
    epubDone = null;
    if (epubUrlObj) { URL.revokeObjectURL(epubUrlObj); epubUrlObj = ''; }
    const dl = $('epubDl');
    dl.hidden = true; dl.removeAttribute('href');
    $('epubReset').hidden = true;
    $('epubStats').textContent = '';
    setProgress(0);
  }

  function showFileInfo(file) {
    $('epubInfo').hidden = !file;
    $('epubName').textContent = file ? file.name : '';
    $('epubSize').textContent = file ? fmtBytes(file.size) : t('epub.noFile');
  }

  const epubDoneSuffix = done => t(done.dir === 'to-tw' ? 'epub.doneSuffixTw' : 'epub.doneSuffix');
  function renderEpubDone() {
    if (!epubDone) return;
    epubMsg(t('epub.done', epubDoneSuffix(epubDone)) + (epubDone.warnKeys || []).map(k => t(k)).join(''));
    $('epubStats').textContent = t('epub.stats', epubDone.files, epubDone.terms, epubDone.chars.toLocaleString());
  }

  async function chooseEpub(file) {
    if (epubBusy) return;
    epubFile = null;
    clearEpubResult();
    showFileInfo(file);
    if (!file) { $('epubGo').disabled = true; $('epubGo').classList.add('primary'); epubSet('epub.chooseFirst'); return; }
    const okType = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
    let okZip = false;
    try { const h = new Uint8Array(await file.slice(0, 4).arrayBuffer()); okZip = h[0] === 0x50 && h[1] === 0x4b; } catch (e) {}
    if (!okType || !okZip) {
      $('epubGo').disabled = true;
      $('epubGo').classList.add('primary');
      epubSet(!okType ? 'epub.badType' : 'epub.badZip', [], true);
      return;
    }
    epubFile = file;
    $('epubGo').disabled = false;
    $('epubGo').classList.add('primary');
    epubSet('epub.selected');
  }

  function resetEpub() {
    if (epubBusy) return;
    epubFile = null;
    clearEpubResult();
    showFileInfo(null);
    $('epubGo').disabled = true;
    $('epubGo').classList.add('primary');
    epubSet('epub.chooseFirst');
    $('epubFile').value = '';
  }

  function parseXml(text) {
    try {
      const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml');
      if (doc.getElementsByTagName('parsererror').length) return null;
      const root = doc.documentElement;
      if (root && String(root.nodeName).toLowerCase() === 'parsererror') return null;
      return doc;
    } catch (e) { return null; }
  }

  function convertTextNodes(root, convert, stats) {
    const walker = (root.ownerDocument || root).createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        const n = p ? String(p.nodeName).toLowerCase() : '';
        return n === 'script' || n === 'style' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const old = node.nodeValue, next = convert(old);
      if (next !== old) { node.nodeValue = next; stats.nodes++; stats.chars += [...old].length; }
    }
  }

  function serializeXml(doc, src) {
    let out = new XMLSerializer().serializeToString(doc);
    if (/^\s*<\?xml\b/i.test(src)) {
      if (/^\s*<\?xml\b/i.test(out)) out = out.replace(/^\s*<\?xml[\s\S]*?\?>/, '<?xml version="1.0" encoding="utf-8"?>');
      else out = '<?xml version="1.0" encoding="utf-8"?>\n' + out;
    }
    return out;
  }

  function convertMarkup(src, convert, stats, opts) {
    stats.files++;
    const doc = parseXml(src);
    if (!doc) return Core.tokenizedConvert(src, convert, stats);
    convertTextNodes(doc, convert, stats);
    if (opts.meta) {
      for (const el of doc.getElementsByTagName('*')) {
        for (const a of ['lang', 'xml:lang']) {
          const v = el.getAttribute(a);
          if (v && /^zh\b/i.test(v.trim())) el.setAttribute(a, opts.lang || 'zh-CN');
        }
      }
    }
    return serializeXml(doc, src);
  }

  function makeConverter(stats) {
    const cfg = dirCfg();
    const conv = getConv(cfg.convFrom, cfg.convTo);
    const idx = $('optTerms').checked && terms.length
      ? Core.buildTermIndex(terms, cfg.toTw ? 'to-tw' : 'to-cn', { twToCn: getConv('tw', 'cn'), cnToTw: getConv('cn', 'tw') }).idx
      : null;
    return s => {
      if (!idx) return conv(s);
      const r = Core.applyTerms(s, idx, conv, cfg.toTw ? hit => hit.repl : hit => conv(hit.repl));
      stats.terms += r.count;
      return r.text;
    };
  }

  async function convertEpub() {
    if (!epubFile || epubBusy) return;
    if (!window.JSZip) { epubSet('epub.err.NO_JSZIP', [], true); return; }
    if (!window.OpenCC) { epubSet('status.dictFail', [], true); return; }
    epubBusy = true;
    clearEpubResult();
    epubNote = null;
    epubError = null;
    $('epubGo').disabled = true;
    $('epubFile').disabled = true;
    $('optTerms').disabled = true;
    $('optMeta').disabled = true;
    document.querySelectorAll('#epubDir .chip').forEach(b => b.disabled = true);
    const stats = { files: 0, nodes: 0, chars: 0, terms: 0 };
    try {
      epubMsg(t('epub.reading'));
      setProgress(1);
      const zip = await JSZip.loadAsync(await epubFile.arrayBuffer());
      const lower = new Map(Object.keys(zip.files).map(n => [n.toLowerCase(), n]));
      const opfPath = await Core.findOpfPath(zip, lower);
      if (!opfPath) throw new Error(t('epub.noOpf'));
      const opfText = Core.decodeEntry(await zip.file(opfPath).async('uint8array'));
      if ($('optTerms').checked) { epubMsg(t('epub.loadingLib')); await libReady; }
      const noTerms = $('optTerms').checked && !terms.length;
      const cfg = dirCfg();
      const convert = makeConverter(stats);
      const paths = Core.contentPathsFromOpf(opfText, opfPath, zip, lower);
      if (!paths.length) throw new Core.EpubError('NO_CONTENT');
      if (await Core.contentEncrypted(zip, lower, paths)) throw new Core.EpubError('DRM');
      const replacements = new Map();
      let n = 0;
      for (const path of paths) {
        epubMsg(t('epub.converting', ++n, paths.length));
        const text = Core.decodeEntry(await zip.file(path).async('uint8array'));
        replacements.set(path, convertMarkup(text, convert, stats, { meta: $('optMeta').checked, lang: cfg.lang }));
        setProgress(5 + (n / paths.length) * 85);
      }
      if ($('optMeta').checked) {
        epubMsg(t('epub.meta'));
        replacements.set(opfPath, Core.convertOpfMetadata(opfText, convert, stats, { lang: cfg.lang }));
      }
      const warnKeys = [];
      if (Core.zipEntry(zip, lower, 'META-INF/encryption.xml')) warnKeys.push('epub.warnFonts');
      if (noTerms) warnKeys.push(cfg.toTw ? 'epub.warnNoTermsToTw' : 'epub.warnNoTerms');
      epubMsg(t('epub.repacking'));
      setProgress(90);
      const blob = await Core.repack(zip, replacements, { JSZip, type: 'blob', onProgress: p => setProgress(90 + p * 10) });
      epubUrlObj = URL.createObjectURL(blob);
      const dl = $('epubDl');
      dl.href = epubUrlObj;
      dl.download = Core.outputFilename(epubFile.name, epubDir);
      dl.hidden = false;
      $('epubReset').hidden = false;
      $('epubGo').classList.remove('primary');
      setProgress(100);
      epubDone = { dir: epubDir, files: stats.files, terms: stats.terms, chars: stats.chars, warnKeys };
      epubNote = null;
      renderEpubDone();
    } catch (e) {
      console.error(e);
      clearEpubResult();
      $('epubGo').classList.add('primary');
      epubError = e;
      epubMsg(t('epub.fail', epubErrText(e)), true);
    } finally {
      epubBusy = false;
      $('epubFile').disabled = false;
      $('optTerms').disabled = false;
      $('optMeta').disabled = false;
      document.querySelectorAll('#epubDir .chip').forEach(b => b.disabled = false);
      $('epubGo').disabled = !epubFile;
    }
  }

  $('epubDir').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b || epubBusy) return;
    const dir = b.dataset.dir === 'to-tw' ? 'to-tw' : 'to-cn';
    if (dir === epubDir) return;
    epubDir = dir;
    store('s2t-epubdir', dir);
    clearEpubResult();
    $('epubGo').classList.add('primary');
    syncEpubDir();
    epubSet(epubFile ? 'epub.selected' : 'epub.chooseFirst');
  });
  syncEpubDir();
  showFileInfo(null);
  epubSet('epub.chooseFirst');
  $('epubFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; chooseEpub(f); });
  const drop = $('epubDrop');
  drop.addEventListener('click', () => $('epubFile').click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('epubFile').click(); } });
  drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); });
  drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); chooseEpub(e.dataTransfer.files[0]); });
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });
  $('epubGo').addEventListener('click', convertEpub);
  $('epubReset').addEventListener('click', resetEpub);

  /* ---------- 介面語言切換 ---------- */
  $('uiLang').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (b && window.I18N && b.dataset.lang !== window.I18N.lang) window.I18N.setLang(b.dataset.lang);
  });

  // i18n.js 套用新文案後呼叫：重繪所有由程式產生的動態文字
  window.onUiLangChange = function () {
    closeMenu();
    for (const id of ['toast', 'fMsg', 'sMsg']) $(id).textContent = '';
    const focused = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('pick')
      ? document.activeElement.dataset.k : null;
    output.setAttribute('aria-live', 'off');
    syncHeader();
    syncEpubDir();
    syncRepoLine();
    showFileInfo(epubFile);
    renderStatus();
    render();
    renderLib();
    if (!snippetGenerated) $('snippet').textContent = t('form.snippetInit');
    if (epubDone) renderEpubDone();
    else if (epubBusy) { /* 進行中的進度訊息由下一個事件以新語言更新 */ }
    else if (epubError) epubMsg(t('epub.fail', epubErrText(epubError)), true);
    else if (epubNote) epubMsg(t(epubNote.key, ...epubNote.args), epubNote.err);
    else epubMsg(t(epubFile ? 'epub.selected' : 'epub.chooseFirst'));
    output.setAttribute('aria-live', 'polite');
    if (focused) { const s = findSpan(focused); if (s) s.focus({ preventScroll: true }); }
  };

})();
