/* 共享 EPUB 轉換核心：瀏覽器（window.EpubCore）與命令列工具（require）共用。
   這個檔案不直接碰 DOM、localStorage、Blob 或 URL；OpenCC、JSZip 與輸出型別都由呼叫端注入。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EpubCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPUB_TEXT = /\.(x?html?|ncx)$/i;
  const EPUB_COMPRESSED = /\.(jpe?g|png|gif|webp|avif|bmp|mp3|m4a|aac|ogg|oga|opus|mp4|m4v|mov|woff2?|zip)$/i;
  const KINDS = new Set(['vocab', 'loaded', 'false']);
  const DC_FIELDS = ['title', 'creator', 'subject', 'description', 'publisher', 'contributor', 'rights'];

  class EpubError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'EpubError';
      this.code = code;
    }
  }

  /* ---------- 詞條字串工具（與轉換器頁面一致） ---------- */
  const firstAlt = s => (s || '').split(/[、，,／/]/)[0].replace(/[（(].*$/, '').trim();
  const usable = s => !!s && !/^(無|—|-$)/.test(s);
  const alts = s => [...new Set((s || '').split(/[、，,／/；;]/).map(x => x.replace(/[（(][^）)]*[）)]/g, '').trim()).filter(usable))];

  /* ---------- 位元組與路徑 ---------- */
  function decodeEntry(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    return new TextDecoder('utf-8').decode(bytes);
  }

  const decodeUri = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

  function resolveZipPath(baseFile, href) {
    let clean = decodeUri(String(href || '').split('#')[0]);
    clean = clean.replace(/\\/g, '/');
    if (!clean) return '';
    const out = clean.charAt(0) === '/' ? [] : baseFile.split('/').slice(0, -1);
    for (const part of clean.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (out.length) out.pop(); } else out.push(part);
    }
    return out.join('/');
  }

  const zipEntry = (zip, lower, path) => !path ? '' : zip.file(path) ? path : (lower.get(path.toLowerCase()) || '');

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decodeEntities = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e.charAt(0) === '#') {
      const cp = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch (err) { return m; }
    }
    return ENTITIES[e.toLowerCase()] || m;
  });

  /* 從標籤文字取出屬性值（屬性名前面必須是空白或標籤開頭，避免誤中 data-href 之類） */
  function attr(tag, name) {
    const re = new RegExp('(?:^|\\s)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i');
    const m = re.exec(tag);
    if (!m) return '';
    return m[1] !== undefined ? m[1] : m[2];
  }

  const tagRe = name => new RegExp('<(?:[\\w.-]+:)?' + name + '\\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', 'gi');

  /* ---------- 套件結構 ---------- */
  async function findOpfPath(zip, lower) {
    const anyOpf = () => Object.keys(zip.files).find(n => !zip.files[n].dir && /\.opf$/i.test(n)) || '';
    const name = zipEntry(zip, lower, 'META-INF/container.xml');
    if (!name) {
      const opf = anyOpf();
      if (opf) return opf;
      throw new EpubError('NO_CONTAINER', 'EPUB is missing META-INF/container.xml');
    }
    const text = decodeEntry(await zip.file(name).async('uint8array'));
    const tags = text.match(tagRe('rootfile')) || [];
    for (const tag of tags) {
      const mt = (attr(tag, 'media-type') || '').toLowerCase();
      if (mt && mt !== 'application/oebps-package+xml') continue;
      const fp = decodeEntities(attr(tag, 'full-path'));
      if (!fp) continue;
      const p = decodeUri(fp.replace(/^\.?\//, ''));
      return zipEntry(zip, lower, p) || anyOpf();
    }
    if (tags.length) return anyOpf();
    const opf = anyOpf();
    if (opf) return opf;
    throw new EpubError('BAD_CONTAINER', 'container.xml is malformed');
  }

  function contentPathsFromOpf(opfText, opfPath, zip, lower) {
    const paths = new Set();
    const add = p => { const hit = zipEntry(zip, lower, p); if (hit) paths.add(hit); };
    const byId = new Map();
    for (const tag of opfText.match(tagRe('item')) || []) {
      const href = decodeEntities(attr(tag, 'href'));
      if (!href) continue;
      const id = attr(tag, 'id');
      const mt = (attr(tag, 'media-type') || '').split(';')[0].trim().toLowerCase();
      const p = resolveZipPath(opfPath, href);
      if (id) byId.set(id, p);
      if (mt === 'application/xhtml+xml' || mt === 'text/html' || mt === 'application/x-dtbncx+xml' || EPUB_TEXT.test(href)) add(p);
    }
    for (const tag of opfText.match(tagRe('spine')) || []) {
      const toc = attr(tag, 'toc');
      if (toc && byId.has(toc)) add(byId.get(toc));
    }
    if (!paths.size) {
      for (const name of Object.keys(zip.files)) if (!zip.files[name].dir && EPUB_TEXT.test(name) && !/^META-INF\//i.test(name)) paths.add(name);
    }
    return [...paths];
  }

  async function contentEncrypted(zip, lower, paths) {
    const name = zipEntry(zip, lower, 'META-INF/encryption.xml');
    if (!name) return false;
    const text = decodeEntry(await zip.file(name).async('uint8array'));
    const set = new Set(paths.map(p => p.toLowerCase()));
    for (const tag of text.match(tagRe('CipherReference')) || []) {
      const uri = resolveZipPath('', decodeEntities(attr(tag, 'URI'))).toLowerCase();
      if (uri && set.has(uri)) return true;
    }
    return false;
  }

  /* ---------- 標記轉換 ---------- */
  function tokenizedConvert(src, convert, stats) {
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/gi;
    return src.replace(re, tok => {
      if (tok.charAt(0) === '<') return tok;
      const next = convert(tok);
      if (next !== tok) { stats.nodes++; stats.chars += [...tok].length; }
      return next;
    });
  }

  /* 把 zh* 的 lang / xml:lang 改寫成目標語言（CLI 的 tokenizer 路徑用） */
  function rewriteLangAttributes(src, targetLang) {
    return src.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, tag => {
      if (!/(?:^|\s)(?:xml:)?lang\s*=/i.test(tag)) return tag;
      return tag.replace(/((?:^|\s)(?:xml:)?lang\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, val) =>
        /^zh\b/i.test(val.trim()) ? pre + q + targetLang + q : m);
    });
  }

  function normalizeXmlDeclaration(src) {
    if (!/^\s*<\?xml\b/i.test(src)) return src;
    return src.replace(/^\s*<\?xml[\s\S]*?\?>/, '<?xml version="1.0" encoding="utf-8"?>');
  }

  function convertOpfMetadata(src, convert, stats, opts) {
    const target = (opts && opts.lang) || 'zh-CN';
    const fieldRe = new RegExp('<(?:[\\w.-]+:)?(' + DC_FIELDS.join('|') + ')\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?\\1\\s*>', 'gi');
    let out = src.replace(fieldRe, (whole, name, inner) => {
      const head = whole.slice(0, whole.indexOf('>') + 1);
      const tail = whole.slice(whole.lastIndexOf('<'));
      return head + tokenizedConvert(inner, convert, stats) + tail;
    });
    out = out.replace(/<(?:[\w.-]+:)?language\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?language\s*>/gi, (whole, inner) => {
      const text = inner.replace(/<[^>]*>/g, '').trim();
      if (!/^zh\b/i.test(text)) return whole;
      return whole.slice(0, whole.indexOf('>') + 1) + target + whole.slice(whole.lastIndexOf('<'));
    });
    out = out.replace(tagRe('package'), tag => {
      if (!/(?:^|\s)(?:xml:)?lang\s*=/i.test(tag)) return tag;
      return tag.replace(/((?:^|\s)(?:xml:)?lang\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, val) =>
        /^zh\b/i.test(val.trim()) ? pre + q + target + q : m);
    });
    return out;
  }

  /* ---------- 詞彙引擎 ---------- */
  function normalizeTerms(loadedFiles) {
    return loadedFiles.flatMap(f => (f.terms || []).filter(t => t && t.cn).map(t => ({
      cn: String(t.cn),
      tw: String(t.tw || ''),
      kind: KINDS.has(t.kind) ? t.kind : 'vocab',
      note: String(t.note || ''),
      oneway: t.oneway === true,
      cat: f.category,
      file: f.file
    })));
  }

  /* dir = 'to-cn'（台灣地區→中國大陸，反向索引）或 'to-tw'（中國大陸→台灣地區，正向索引）。
     convs = { twToCn, cnToTw }，供正向索引收斂簡繁寫法。 */
  function buildTermIndex(terms, dir, convs) {
    convs = convs || {};
    const idx = new Map();
    const add = (pat, t, repl) => {
      if (!pat) return;
      if (!idx.has(pat.charAt(0))) idx.set(pat.charAt(0), []);
      idx.get(pat.charAt(0)).push({ pat, t, repl });
    };
    for (const t of terms) {
      if (dir === 'to-cn') {
        if (t.kind !== 'vocab' || t.oneway) continue;
        const tw = firstAlt(t.tw);
        if (usable(tw)) add(tw, t, t.cn);
      } else {
        const forms = new Set([t.cn]);
        if (convs.twToCn) forms.add(convs.twToCn(t.cn));
        if (convs.cnToTw) forms.add(convs.cnToTw(t.cn));
        const alt = firstAlt(t.tw);
        const repl = t.kind === 'vocab' && usable(alt) ? alt : null;
        forms.forEach(f => add(f, t, repl));
      }
    }
    idx.forEach(list => list.sort((a, b) => b.pat.length - a.pat.length));
    return { idx, key: dir + ':' + terms.length };
  }

  /* 最長匹配替換：未命中的片段交給 conv（字形轉換），命中的片段直接輸出 hitConv，
     不讓已替換的詞再被 OpenCC 跑一次。repl 為 null 的命中只阻擋較短詞，輸出仍過 conv。 */
  function applyTerms(src, idx, conv, hitConv) {
    let out = '', plain = '', i = 0, count = 0;
    const flush = () => { if (plain) { out += conv ? conv(plain) : plain; plain = ''; } };
    while (i < src.length) {
      const cand = idx && idx.get(src.charAt(i));
      let hit = null;
      if (cand) for (const c of cand) { if (src.startsWith(c.pat, i)) { hit = c; break; } }
      if (!hit) { plain += src.charAt(i++); continue; }
      if (hit.repl === null) { plain += src.substr(i, hit.pat.length); i += hit.pat.length; continue; }
      flush();
      out += hitConv ? hitConv(hit) : hit.repl;
      count++;
      i += hit.pat.length;
    }
    flush();
    return { text: out, count };
  }

  /* ---------- 字形與打包 ---------- */
  function makeGlyphConverter(OpenCC, from, to) {
    const c = OpenCC.Converter({ from, to });
    // 台灣地區繁體統一用「台」：OpenCC 轉出來的「臺」改成「台」，原文本來就寫的「臺」先用佔位字保護、保留不動
    return to === 'tw' || to === 'twp'
      ? s => c(s.replace(/臺/g, '\uE000')).replace(/臺/g, '台').replace(/\uE000/g, '臺')
      : c;
  }

  async function repack(zip, replacements, opts) {
    opts = opts || {};
    const onProgress = opts.onProgress || (() => {});
    const JSZip = opts.JSZip || (typeof globalThis !== 'undefined' ? globalThis.JSZip : null);
    if (!JSZip) throw new EpubError('NO_JSZIP', 'JSZip is not available');
    const out = new JSZip();
    out.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    const names = Object.keys(zip.files);
    let i = 0;
    for (const name of names) {
      if (name === 'mimetype') continue;
      const entry = zip.files[name];
      if (entry.dir) out.folder(name);
      else if (replacements.has(name)) out.file(name, replacements.get(name), { compression: 'DEFLATE' });
      else {
        const data = await entry.async('uint8array');
        out.file(name, data, { compression: EPUB_COMPRESSED.test(name) ? 'STORE' : 'DEFLATE' });
      }
      onProgress((++i / names.length) * 0.5);
    }
    return out.generateAsync(
      { type: opts.type || 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      meta => onProgress(0.5 + meta.percent / 200)
    );
  }

  function outputFilename(name, dir) {
    const suffix = dir === 'to-tw' ? '_zh-Hant.epub' : '_zh-Hans.epub';
    const base = String(name).replace(/\.epub$/i, '').replace(/_(?:zh-Hans|zh-Hant)$/i, '');
    return base + suffix;
  }

  return {
    EpubError, KINDS, firstAlt, usable, alts,
    decodeEntry, decodeUri, resolveZipPath, zipEntry,
    findOpfPath, contentPathsFromOpf, contentEncrypted,
    tokenizedConvert, rewriteLangAttributes, normalizeXmlDeclaration, convertOpfMetadata,
    normalizeTerms, buildTermIndex, applyTerms,
    makeGlyphConverter, repack, outputFilename,
    EPUB_TEXT, EPUB_COMPRESSED
  };
});
