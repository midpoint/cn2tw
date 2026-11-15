/* 简繁通 popup：設定寫入 chrome.storage，頁面狀態由 content script 提供。 */
(() => {
  'use strict';

  // [繁體, 简体]
  const DICT = {
    appName: ['简繁通', '简繁通'],
    uiLang: ['介面語言', '界面语言'],
    langHantTitle: ['繁體介面', '繁体界面'],
    langHansTitle: ['简体界面', '简体界面'],
    enabled: ['自動轉換網頁', '自动转换网页'],
    enabledHint: ['依目標文字自動轉換', '依目标文字自动转换'],
    target: ['目標文字', '目标文字'],
    targetTw: ['繁體（台灣地區）', '繁体（台湾地区）'],
    targetCn: ['简体（中国大陆）', '简体（中国大陆）'],
    thisPage: ['本頁操作', '本页操作'],
    auto: ['自動', '自动'],
    toTw: ['簡→繁', '简→繁'],
    toCn: ['繁→簡', '繁→简'],
    pause: ['暫停並還原', '暂停并还原'],
    terms: ['套用兩岸用語詞彙庫', '应用两岸用语词汇库'],
    annotate: ['標註替換用語', '标注替换用语'],
    annotateHint: ['開啟後，替換過的詞會有虛線底線，懸停可看原文與備註。', '开启后，替换过的词会有虚线下划线，悬停可看原文与备注。'],
    shortcut: ['快捷鍵 Alt+Shift+J', '快捷键 Alt+Shift+J'],
    dataVersionUnknown: ['詞庫版本 —', '词库版本 —'],
    dataVersion: ['詞庫 v{0} · {1} 詞', '词库 v{0} · {1} 词'],
    stats: ['替換 {0} 個用語 · 變更 {1} 字', '替换 {0} 个用语 · 变更 {1} 字'],
    stateLoading: ['讀取頁面狀態…', '读取页面状态…'],
    stateApplying: ['套用設定中…', '套用设置中…'],
    stateConvertedTw: ['已轉為繁體（台灣地區）', '已转为繁体（台湾地区）'],
    stateConvertedCn: ['已轉為簡體（中國大陸）', '已转为简体（中国大陆）'],
    statePaused: ['已暫停並還原原文', '已暂停并还原原文'],
    stateAlready: ['此頁已是目標文字', '此页已是目标文字'],
    stateNotChinese: ['此頁沒有可轉換的中文', '此页没有可转换的中文'],
    stateUnknown: ['無法判斷頁面文字，未轉換', '无法判断页面文字，未转换'],
    stateDisabled: ['自動轉換已關閉', '自动转换已关闭'],
    stateExcluded: ['此頁設定為不轉換', '此页设置为不转换'],
    stateError: ['轉換資源載入失敗', '转换资源载入失败'],
    stateNoContent: ['此頁尚未啟用轉換', '此页尚未启用转换'],
    unsupported: ['此頁面不支援轉換', '此页面不支持转换'],
    hintUnsupported: ['此類頁面不允許擴充功能修改', '此类页面不允许扩展功能修改'],
    hintRefresh: ['請重新整理頁面以啟用轉換', '请重新整理页面以启用转换'],
    hintMasterOff: ['開啟上方總開關即可轉換', '开启上方总开关即可转换'],
    hintForce: ['可在下方選擇方向強制轉換', '可在下方选择方向强制转换']
  };

  const $ = id => document.getElementById(id);
  let uiLang = 'hant';
  let settings = null;
  let tab = null;
  let pageMode = 'unknown'; // unknown | supported | noReceiver | unsupported
  let lastStatus = null;
  let settingsReady = false;
  let tabReady = false;
  let statusTimer = null;
  let statusSeq = 0;

  const tx = (key, ...args) => {
    const pair = DICT[key] || [key, key];
    const text = pair[uiLang === 'hans' ? 1 : 0];
    return text.replace(/\{(\d+)\}/g, (m, i) => args[i] === undefined ? '' : String(args[i]));
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

  function applyStaticText() {
    document.documentElement.lang = uiLang === 'hans' ? 'zh-Hans' : 'zh-Hant-TW';
    document.documentElement.dataset.lang = uiLang;
    document.title = tx('appName');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tx(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = tx(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', tx(el.dataset.i18nAria));
    for (const b of document.querySelectorAll('#langs .lang')) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === uiLang));
    }
  }

  function applyLang() {
    applyStaticText();
    renderSettings();
    renderStatus();
  }

  function renderSettings() {
    if (!settings) return;
    $('enabled').checked = settings.enabled;
    $('terms').checked = settings.terms;
    $('annotate').checked = settings.annotate;
    $('targetTw').setAttribute('aria-pressed', String(settings.target === 'tw'));
    $('targetCn').setAttribute('aria-pressed', String(settings.target === 'cn'));
    updateDisabled();
  }

  function updateDisabled() {
    const master = !!(settings && settings.enabled);
    for (const b of document.querySelectorAll('#targetField button')) b.disabled = !master;
    const canAct = master && pageMode === 'supported' && !!lastStatus && lastStatus.ok === true;
    for (const b of document.querySelectorAll('#pageField [data-override]')) b.disabled = !canAct;
    $('annotate').disabled = !settings || !settings.terms;
  }

  function updateOverrideButtons() {
    const current = lastStatus && lastStatus.override ? lastStatus.override : 'auto';
    const active = pageMode === 'supported' && !!lastStatus;
    for (const b of document.querySelectorAll('#pageField [data-override]')) {
      b.classList.toggle('on', active && b.dataset.override === current);
    }
  }

  function renderStatus() {
    if (!settings) return;
    const stateEl = $('stateText');
    const statsEl = $('statsText');
    const hintEl = $('pageHint');

    if (pageMode === 'unsupported') {
      stateEl.textContent = tx('unsupported');
      stateEl.dataset.state = 'unsupported';
      statsEl.textContent = '';
      hintEl.textContent = tx('hintUnsupported');
      $('dataVer').textContent = tx('dataVersionUnknown');
      updateDisabled();
      updateOverrideButtons();
      return;
    }

    if (pageMode === 'noReceiver') {
      stateEl.textContent = tx('stateNoContent');
      stateEl.dataset.state = 'disabled';
      statsEl.textContent = '';
      hintEl.textContent = tx('hintRefresh');
      $('dataVer').textContent = tx('dataVersionUnknown');
      updateDisabled();
      updateOverrideButtons();
      return;
    }

    if (!lastStatus) {
      stateEl.textContent = tx('stateLoading');
      stateEl.dataset.state = 'loading';
      statsEl.textContent = '';
      hintEl.textContent = '';
      $('dataVer').textContent = tx('dataVersionUnknown');
      updateDisabled();
      updateOverrideButtons();
      return;
    }

    const st = lastStatus.state;
    let key = 'stateLoading';
    if (st === 'converted') key = lastStatus.direction === 'to-cn' ? 'stateConvertedCn' : 'stateConvertedTw';
    else if (st === 'paused') key = 'statePaused';
    else if (st === 'already') key = 'stateAlready';
    else if (st === 'notChinese') key = 'stateNotChinese';
    else if (st === 'unknown') key = 'stateUnknown';
    else if (st === 'disabled') key = 'stateDisabled';
    else if (st === 'excluded') key = 'stateExcluded';
    else if (st === 'error') key = 'stateError';
    stateEl.textContent = tx(key);
    stateEl.dataset.state = st;

    if (st === 'converted' && lastStatus.stats) {
      statsEl.textContent = tx('stats', lastStatus.stats.terms || 0, lastStatus.stats.chars || 0);
    } else {
      statsEl.textContent = '';
    }

    if (!settings.enabled || st === 'disabled') hintEl.textContent = tx('hintMasterOff');
    else if (st === 'already' || st === 'unknown') hintEl.textContent = tx('hintForce');
    else hintEl.textContent = '';

    const ver = lastStatus.dataVersion;
    $('dataVer').textContent = ver
      ? tx('dataVersion', ver, lastStatus.termCount || 0)
      : tx('dataVersionUnknown');

    updateDisabled();
    updateOverrideButtons();
  }

  function showApplying() {
    const stateEl = $('stateText');
    stateEl.textContent = tx('stateApplying');
    stateEl.dataset.state = 'loading';
    $('statsText').textContent = '';
    $('pageHint').textContent = '';
  }

  function sendToTab(msg, cb) {
    if (!tab || tab.id === undefined || tab.id === null) {
      cb({ ok: false, reason: 'noTab' });
      return;
    }
    try {
      chrome.tabs.sendMessage(tab.id, msg, resp => {
        const err = chrome.runtime.lastError;
        if (err) cb({ ok: false, reason: 'noReceiver' });
        else cb(resp || { ok: false, reason: 'empty' });
      });
    } catch (e) {
      cb({ ok: false, reason: 'noReceiver' });
    }
  }

  function refreshStatus() {
    if (!settingsReady || !tabReady) return;
    const seq = ++statusSeq;

    if (!tab || tab.id === undefined || tab.id === null) {
      pageMode = 'unsupported';
      lastStatus = null;
      renderStatus();
      return;
    }
    const storePage = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)\//i.test(tab.url || '');
    if (!tab.url || !/^https?:/i.test(tab.url) || storePage) {
      pageMode = 'unsupported';
      lastStatus = null;
      renderStatus();
      return;
    }

    sendToTab({ type: 'jft:getStatus' }, resp => {
      if (seq !== statusSeq) return;
      if (resp && resp.ok === true) {
        pageMode = 'supported';
        lastStatus = resp;
      } else if (resp && resp.reason === 'noReceiver') {
        pageMode = 'noReceiver';
        lastStatus = null;
      } else {
        pageMode = 'unsupported';
        lastStatus = null;
      }
      renderStatus();
    });
  }

  function scheduleStatus() {
    if (statusTimer) clearTimeout(statusTimer);
    let tries = 0;
    const tick = () => {
      statusTimer = null;
      refreshStatus();
      tries++;
      if (tries < 2) statusTimer = setTimeout(tick, 700);
    };
    statusTimer = setTimeout(tick, 200);
  }

  function saveSettings(patch) {
    if (!settings) return;
    settings = { ...settings, ...patch };
    renderSettings();
    showApplying();
    try {
      chrome.storage.sync.set({ jft: settings });
    } catch (e) { /* 擴充環境失效 */ }
    scheduleStatus();
  }

  function setOverride(value) {
    showApplying();
    sendToTab({ type: 'jft:setOverride', value }, resp => {
      if (resp && resp.ok === true && resp.status) {
        pageMode = 'supported';
        lastStatus = resp.status;
        renderStatus();
      } else {
        refreshStatus();
      }
    });
  }

  function setUiLang(value) {
    const next = value === 'hans' ? 'hans' : 'hant';
    if (next === uiLang) return;
    uiLang = next;
    applyLang();
    try { chrome.storage.local.set({ jftUiLang: uiLang }); } catch (e) { /* ignore */ }
  }

  function bind() {
    $('enabled').addEventListener('change', e => saveSettings({ enabled: e.target.checked }));
    $('terms').addEventListener('change', e => saveSettings({ terms: e.target.checked }));
    $('annotate').addEventListener('change', e => saveSettings({ annotate: e.target.checked }));
    $('targetField').addEventListener('click', e => {
      const b = e.target.closest('button[data-target]');
      if (!b || b.disabled) return;
      saveSettings({ target: b.dataset.target });
    });
    $('pageField').addEventListener('click', e => {
      const b = e.target.closest('button[data-override]');
      if (!b || b.disabled) return;
      setOverride(b.dataset.override);
    });
    $('langs').addEventListener('click', e => {
      const b = e.target.closest('button[data-lang]');
      if (b) setUiLang(b.dataset.lang);
    });
  }

  function maybeRefresh() {
    if (settingsReady && tabReady) refreshStatus();
  }

  function loadSettings() {
    const done = data => {
      settings = normalizeSettings(data && data.jft);
      settingsReady = true;
      renderSettings();
      maybeRefresh();
    };
    try {
      chrome.storage.sync.get('jft', done);
    } catch (e) {
      done(null);
    }
  }

  function loadTab() {
    const done = tabs => {
      tab = tabs && tabs[0] ? tabs[0] : null;
      tabReady = true;
      maybeRefresh();
    };
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, done);
    } catch (e) {
      done(null);
    }
  }

  function loadUiLang() {
    const detect = () => /^zh-(cn|sg|hans|my)\b/i.test(navigator.language || '') ? 'hans' : 'hant';
    const done = data => {
      uiLang = data && data.jftUiLang === 'hans' ? 'hans'
        : data && data.jftUiLang === 'hant' ? 'hant'
          : detect();
      applyLang();
    };
    try {
      chrome.storage.local.get('jftUiLang', done);
    } catch (e) {
      done(null);
    }
  }

  bind();
  loadUiLang();
  loadSettings();
  loadTab();
})();
