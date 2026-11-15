/* 简繁通 service worker：預設設定、快捷鍵、分頁徽章。轉換狀態由 content script 持有。 */
'use strict';

const browserTarget = () => /^zh-(cn|sg|hans|my)\b/i.test(navigator.language || '') ? 'cn' : 'tw';
const DEFAULTS = () => ({ enabled: true, target: browserTarget(), terms: true, annotate: false });

function normalizeSettings(raw) {
  const d = DEFAULTS();
  if (!raw || typeof raw !== 'object') return d;
  return {
    enabled: raw.enabled !== false,
    target: raw.target === 'cn' ? 'cn' : raw.target === 'tw' ? 'tw' : d.target,
    terms: raw.terms !== false,
    annotate: raw.annotate === true
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('jft', data => {
    chrome.storage.sync.set({ jft: normalizeSettings(data && data.jft) });
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-conversion') return;
  const tabId = tab && tab.id;
  if (tabId === undefined || tabId === null) return;
  chrome.tabs.sendMessage(tabId, { type: 'jft:toggle' }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'jft:badge') return false;
  const tabId = sender.tab && sender.tab.id;
  if (tabId !== undefined && tabId !== null) {
    const text = String(msg.text || '').slice(0, 2);
    chrome.action.setBadgeText({ tabId, text });
    if (text) {
      const color = typeof msg.color === 'string' && msg.color ? msg.color : '#1f7a63';
      chrome.action.setBadgeBackgroundColor({ tabId, color });
    }
    chrome.action.setTitle({ tabId, title: typeof msg.title === 'string' && msg.title ? msg.title : '简繁通' });
  }
  sendResponse({ ok: true });
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  chrome.action.setBadgeText({ tabId, text: '' });
  chrome.action.setTitle({ tabId, title: '简繁通' });
});
