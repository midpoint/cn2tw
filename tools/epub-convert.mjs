#!/usr/bin/env node
// 命令列批量轉換 EPUB：繁體 → 簡體，或簡體 → 繁體。
// 用法：node tools/epub-convert.mjs --to cn|tw [選項] <檔案或目錄...>
// 需要先執行 npm install（安裝 JSZip 與 OpenCC）。

import { readFile, writeFile, readdir, mkdir, rename, stat, realpath, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import * as OpenCC from 'opencc-js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Core = require(path.join(ROOT, 'epub-core.js'));

const CLI_ERR = {
  NO_CONTAINER: 'EPUB 缺少 META-INF/container.xml',
  BAD_CONTAINER: 'container.xml 格式錯誤',
  BAD_ZIP: '這不是有效的 EPUB／ZIP 檔案。',
  NO_CONTENT: '找不到可轉換的 XHTML／HTML 內容',
  DRM: '此 EPUB 的正文受 DRM 保護，無法轉換'
};
const errText = e => (e && e.code && CLI_ERR[e.code]) || (e && e.message ? e.message : String(e));

function usage(code) {
  const text = `用法：node tools/epub-convert.mjs --to <cn|tw> [選項] <檔案或目錄...>

把 EPUB 在繁體與簡體之間轉換；可一次處理多個檔案或整個資料夾。

  --to cn|tw  轉換方向：cn = 轉成簡體，tw = 轉成繁體（必填）
  --out <dir> 輸出資料夾（預設放在原檔旁邊）
  --no-terms  不套用兩岸用語詞彙庫
  --no-meta   不轉換書名、作者、簡介等中繼資料
  --force     覆蓋已存在的輸出檔
  --quiet     只顯示錯誤
  -h, --help  顯示這個說明

例：
  npm install
  node tools/epub-convert.mjs --to tw books/
  node tools/epub-convert.mjs --to cn --out out/ a.epub b.epub`;
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
}

const argv = process.argv.slice(2);
const opts = { to: '', out: '', terms: true, meta: true, force: false, quiet: false };
const inputs = [];
let endOfOptions = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!endOfOptions && a === '--') { endOfOptions = true; continue; }
  if (!endOfOptions && a.startsWith('-') && a !== '-') {
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const val = eq > 0 ? a.slice(eq + 1) : null;
    const next = () => (val !== null ? val : argv[++i]);
    switch (flag) {
      case '--to': opts.to = next() || ''; break;
      case '--out': opts.out = next() || ''; break;
      case '--no-terms': opts.terms = false; break;
      case '--no-meta': opts.meta = false; break;
      case '--force': opts.force = true; break;
      case '--quiet': opts.quiet = true; break;
      case '-h': case '--help': usage(0); break;
      default:
        console.error(`未知的選項：${a}\n`);
        usage(2);
    }
    continue;
  }
  inputs.push(a);
}

if (opts.to !== 'cn' && opts.to !== 'tw') {
  console.error('請用 --to cn 或 --to tw 指定轉換方向。\n');
  usage(2);
}
if (!inputs.length) {
  console.error('請至少指定一個 EPUB 檔案或資料夾。\n');
  usage(2);
}

const toTw = opts.to === 'tw';
const dir = toTw ? 'to-tw' : 'to-cn';
const targetLang = toTw ? 'zh-TW' : 'zh-CN';
const targetSuffix = toTw ? '_zh-Hant.epub' : '_zh-Hans.epub';
const log = (...args) => { if (!opts.quiet) console.log(...args); };
const rel = p => { const r = path.relative(process.cwd(), p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p; };

/* 詞彙庫（載入失敗時只警告，仍可做字形／OpenCC 詞語轉換） */
let terms = [];
if (opts.terms) {
  try {
    const index = JSON.parse(await readFile(path.join(ROOT, 'data', 'index.json'), 'utf8'));
    const loaded = await Promise.all(index.files.map(async file => {
      const d = JSON.parse(await readFile(path.join(ROOT, 'data', file), 'utf8'));
      return { file, category: d.category, terms: d.terms || [] };
    }));
    terms = Core.normalizeTerms(loaded);
    log(`詞彙庫 v${index.version || ''}：${terms.length} 個詞`);
  } catch (e) {
    console.warn(`詞彙庫載入失敗，${toTw ? '只用 OpenCC 詞語轉換。' : '只做字形轉換。'}`);
  }
}

const twToCn = Core.makeGlyphConverter(OpenCC, 'tw', 'cn');
const cnToTw = Core.makeGlyphConverter(OpenCC, 'cn', 'tw');
const conv = Core.makeGlyphConverter(OpenCC, toTw ? 'cn' : 'tw', toTw ? (opts.terms ? 'twp' : 'tw') : 'cn');
const idx = opts.terms && terms.length ? Core.buildTermIndex(terms, dir, { twToCn, cnToTw }).idx : null;

async function convertBuffer(buf) {
  const stats = { files: 0, nodes: 0, chars: 0, terms: 0 };
  const convertText = s => {
    if (!idx) return conv(s);
    const r = Core.applyTerms(s, idx, conv, toTw ? hit => hit.repl : hit => conv(hit.repl));
    stats.terms += r.count;
    return r.text;
  };
  const convertMarkup = src => {
    stats.files++;
    let out = Core.tokenizedConvert(src, convertText, stats);
    if (opts.meta) out = Core.rewriteLangAttributes(out, targetLang);
    return Core.normalizeXmlDeclaration(out);
  };

  let zip;
  try { zip = await JSZip.loadAsync(buf); }
  catch (e) { throw new Core.EpubError('BAD_ZIP', 'not a valid ZIP'); }

  const lower = new Map(Object.keys(zip.files).map(n => [n.toLowerCase(), n]));
  const opfPath = await Core.findOpfPath(zip, lower);
  if (!opfPath) throw new Core.EpubError('BAD_CONTAINER', 'no OPF package file');
  const opfText = Core.decodeEntry(await zip.file(opfPath).async('uint8array'));
  const paths = Core.contentPathsFromOpf(opfText, opfPath, zip, lower);
  if (!paths.length) throw new Core.EpubError('NO_CONTENT', 'no convertible XHTML/HTML');
  if (await Core.contentEncrypted(zip, lower, paths)) throw new Core.EpubError('DRM', 'encrypted content');

  const replacements = new Map();
  for (const p of paths) {
    const text = Core.decodeEntry(await zip.file(p).async('uint8array'));
    replacements.set(p, convertMarkup(text));
  }
  if (opts.meta) replacements.set(opfPath, Core.convertOpfMetadata(opfText, convertText, stats, { lang: targetLang }));
  const data = await Core.repack(zip, replacements, { JSZip, type: 'nodebuffer' });
  return { data, stats };
}

/* 收集輸入：目錄遞迴找 .epub，略過 .git／node_modules／符號連結與 --out 目錄 */
const tasks = [];
const seen = new Set();
async function addFile(file, relDir) {
  let real;
  try { real = await realpath(file); } catch (e) { console.error(`✘ ${rel(file)}：找不到檔案`); return; }
  if (seen.has(real)) return;
  seen.add(real);
  tasks.push({ input: path.resolve(file), relDir });
}
async function scanDir(dirPath, relDir, outAbs) {
  let ents;
  try { ents = await readdir(dirPath, { withFileTypes: true }); }
  catch (e) { console.error(`✘ ${rel(dirPath)}：無法讀取資料夾（${e.message}）`); return; }
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of ents) {
    const p = path.join(dirPath, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      if (outAbs && path.resolve(p) === outAbs) continue;
      await scanDir(p, path.join(relDir, ent.name), outAbs);
    } else if (ent.isFile() && /\.epub$/i.test(ent.name)) {
      if (ent.name.toLowerCase().endsWith(targetSuffix.toLowerCase())) continue;
      await addFile(p, relDir);
    }
  }
}

const outAbs = opts.out ? path.resolve(opts.out) : '';
for (const input of inputs) {
  let st;
  try { st = await stat(input); }
  catch (e) { console.error(`✘ ${input}：找不到檔案或資料夾`); continue; }
  if (st.isDirectory()) await scanDir(path.resolve(input), '', outAbs);
  else if (st.isFile()) await addFile(input, '');
  else console.error(`✘ ${input}：不是檔案或資料夾`);
}

if (!tasks.length) {
  console.error('沒有找到可轉換的 EPUB 檔案。');
  process.exit(1);
}

/* 規劃輸出，檢查同名衝突 */
const planned = new Map();
const usable = [];
for (const task of tasks) {
  const base = Core.outputFilename(path.basename(task.input), dir);
  const outDir = outAbs || path.dirname(task.input);
  const output = path.join(outDir, task.relDir, base);
  if (path.resolve(output) === task.input) {
    console.error(`✘ ${rel(task.input)}：輸出檔名與輸入相同，已跳過。`);
    continue;
  }
  const key = path.resolve(output);
  if (planned.has(key)) {
    console.error(`✘ ${rel(task.input)}：與 ${rel(planned.get(key))} 輸出到同一個檔名（${rel(output)}），已跳過。`);
    continue;
  }
  planned.set(key, task.input);
  usable.push({ ...task, output });
}

log(`轉換 ${usable.length} 個檔案（${toTw ? '簡體 → 繁體' : '繁體 → 簡體'}）`);
let ok = 0, skipped = 0, failed = 0;
let total = { files: 0, terms: 0, chars: 0 };

for (const task of usable) {
  if (existsSync(task.output) && !opts.force) {
    log(`－ ${rel(task.input)}：輸出已存在（用 --force 覆蓋）`);
    skipped++;
    continue;
  }
  try {
    const buf = await readFile(task.input);
    if (buf.length > 200 * 1024 * 1024) console.warn(`！ ${rel(task.input)}：檔案超過 200 MB，轉換時記憶體用量會明顯增加。`);
    const { data, stats } = await convertBuffer(buf);
    await mkdir(path.dirname(task.output), { recursive: true });
    const tmp = task.output + '.tmp-' + process.pid;
    try {
      await writeFile(tmp, data);
      await rename(tmp, task.output);
    } catch (e) {
      try { await unlink(tmp); } catch (e2) {}
      throw e;
    }
    total.files += stats.files;
    total.terms += stats.terms;
    total.chars += stats.chars;
    ok++;
    log(`✔ ${rel(task.input)} → ${rel(task.output)}（內容檔案 ${stats.files} · 詞彙替換 ${stats.terms} · 變更 ${stats.chars.toLocaleString()} 字）`);
  } catch (e) {
    failed++;
    console.error(`✘ ${rel(task.input)}：${errText(e)}`);
  }
}

log(`完成 ${ok} 個、跳過 ${skipped} 個、失敗 ${failed} 個。` + (ok ? ` 共 ${total.files} 個內容檔案、${total.terms} 次詞彙替換、${total.chars.toLocaleString()} 字變更。` : ''));
process.exit(failed ? 1 : 0);
