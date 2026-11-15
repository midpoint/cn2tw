# 简繁通：瀏覽器擴充

把網頁的中國大陸用語換成台灣地區用語（或反向），不是只換字形。擴充內建與網站相同的 OpenCC 字形轉換與 867 個詞的兩岸用語詞彙庫，全部在本機執行。

## 功能

- **自動轉換**：依「目標文字」偏好，自動把簡體中文網頁轉成繁體（台灣地區）用語，或把繁體網頁轉成簡體中國大陸用語。已是目標文字就不動。
- **兩岸用語詞彙庫**：例如 軟件 → 軟體、視頻 → 影片、充電寶 → 行動電源；沒命中詞彙的文字才交給 OpenCC 轉字形，避免重複轉換。
- **可開關的詞彙標註**（預設關閉）：替換過的詞加上虛線底線，滑鼠懸停顯示原文、轉換結果與詞條備註。
- **本頁控制**：可強制簡→繁／繁→簡、暫停並還原原文；重新整理頁面後回到自動模式。
- **介面繁簡切換**：彈窗右上角可切換繁體／简体介面，選擇會記住。
- **快捷鍵**：`Alt+Shift+J` 暫停／恢復本頁轉換；可在 `chrome://extensions/shortcuts`（Edge：`edge://extensions/shortcuts`）更改。
- **徽章**：轉成繁體顯示「繁」，轉成簡體顯示「简」，未轉換時不顯示。
- 不連網、沒有分析或遙測；OpenCC、詞彙資料與程式都打包在擴充內。

## 安裝（Chrome／Edge，未上架）

1. 先確認已建置產物（見下方「建置」；repo 若已包含 `terms-data.js` 與 `vendor/` 可跳過）。
2. 開啟 `chrome://extensions`（Edge：`edge://extensions`）。
3. 打開「開發人員模式」。
4. 按「載入未封裝項目」，選擇本 repo 的 `extension/` 資料夾。
5. 重新整理已開啟的網頁，讓 content script 生效。

> 擴充只支援 Chromium 系瀏覽器（Manifest V3）。Firefox 的 manifest 與背景頁寫法不同，尚未支援。

## 使用

- 彈窗上方是總開關與目標文字：選「繁體（台灣地區）」會把簡體頁轉成繁體；選「简体（中国大陆）」會把繁體頁轉成簡體。首次安裝的預設目標跟隨瀏覽器語言（`zh-CN` 類預設简体，其餘預設繁體），之後以彈窗選擇為準。
- 頁面語言會先看 `<html lang>`；沒有標記時，用 OpenCC 字形轉換比例判斷簡繁。已是目標文字、沒有中文、或頁面標了 `translate="no"` 時不會轉換。
- 下方「本頁操作」可覆寫這一頁的方向：
  - **自動**：回到依目標文字自動判斷。
  - **簡→繁／繁→簡**：即使頁面語言判斷結果不同，也強制轉換。
  - **暫停並還原**：移除本頁所有轉換、恢復原文，並停止觀察動態內容。
- 「標註替換用語」只在開啟詞彙庫時有效；關閉詞彙庫就只做字形轉換。
- 設定存在 `chrome.storage.sync`，會跟著瀏覽器帳號同步；頁面內容不會離開瀏覽器。

## 轉換規則（與網站、命令列工具一致）

方向與 `epub-core.js` 相同：

| 方向 | OpenCC | 詞彙索引 | 命中詞彙的輸出 |
| --- | --- | --- | --- |
| 簡→繁 | 開詞彙庫時 `cn→twp`，否則 `cn→tw` | 所有詞條參與阻擋，只有一般用語有替換值 | 直接輸出替換值，不再過 OpenCC |
| 繁→簡 | `tw→cn` | 只收一般用語、排除單向詞 | 替換值再過 `tw→cn` |

未命中的片段才做字形轉換。因此「演算法」不會變成「演演算法」，「文檔」換成「文件」後也不會再被 `twp` 改成「檔案」。

## 權限與隱私

- `storage`：儲存開關、目標文字、詞彙與標註偏好。
- `activeTab`：彈窗讀取目前分頁狀態、送出本頁操作。
- `host_permissions`（`http://*/*`、`https://*/*`）：content script 需要在所有一般網頁上讀寫文字才能轉換。安裝時 Chrome 會顯示「讀取及變更所有網站資料」，這是為此功能所需。
- 擴充不執行 `fetch`、XHR、`sendBeacon` 或遠端程式碼；沒有帳號、伺服器或追蹤。詞彙庫與 OpenCC 都是 repo 內的檔案。
- `chrome.storage.sync` 只存放上述設定，由瀏覽器自身的同步機制處理。

## 限制

- 只處理最上層頁面；iframe、Shadow DOM、`<canvas>`、圖片與 CSS `content` 內的文字不轉換。
- 會跳過 `script`、`style`、`textarea`、`input`、`select`、`code`、`pre`、可編輯區域（`contenteditable`）、`translate="no"`、`.notranslate` 與 `[data-jft-skip]`；表單的 `placeholder`、`title`、`aria-label` 仍會轉換，但不會改 `value`。
- 詞彙必須落在同一個文字節點；像「軟<b>件</b>」這樣被行內標籤拆開的詞不會替換。
- 動態插入的文字會透過 MutationObserver 補轉換；但頁面若持續用 JavaScript 覆寫同一段文字，可能與擴充互相拉鋸。
- 標註會把文字節點拆成多個片段與 `<span>`（可選功能）。若網站同時改寫這些節點，可能只轉換新寫入的片段，或使還原只能盡力而為；需要完整還原時請關閉標註。
- 不支援 `chrome://`、擴充商店、PDF 檢視器等瀏覽器保留頁面；`file://` 也不在預設注入範圍。
- 一次轉換整頁文字；非常大的頁面可能短暫增加 CPU／記憶體用量。OpenCC 約 1.1 MB，只在中文頁面建立轉換器。

## 檔案與建置

```
extension/
  manifest.json         Manifest V3 設定
  content.js            偵測、轉換、還原、MutationObserver、標註、訊息
  content.css           詞彙標註樣式
  background.js         Service worker：預設設定、快捷鍵、徽章
  popup.html/css/js     彈窗（繁／简介面、控制項、狀態）
  terms-data.js         由 data/*.json 產生，勿手改
  vendor/opencc.js      opencc-js 1.0.5 UMD，勿手改
  vendor/epub-core.js   根目錄 epub-core.js 的複本，勿手改
  vendor/OPENCC-LICENSE opencc-js MIT 授權
  icons/                16／32／48／128 PNG
```

建立或更新產物：

```bash
npm install
npm run build:ext        # 重新產生 terms-data.js 並複製 vendor 檔
npm run build:ext -- --check   # 只檢查是否過期（CI 用）
```

修改 `data/*.json` 或根目錄 `epub-core.js` 後要重新執行 `npm run build:ext`，否則擴充會用到舊資料；`--check` 會列出過期檔案並以結束碼 1 失敗。圖示由 `tools/make-extension-icons.py` 以 Pillow 繪製，已提交 PNG，平常不必重跑。

`extension/` **不會**部署到 GitHub Pages；網站部署清單不含這個資料夾。

## 授權

`vendor/opencc.js` 來自 [opencc-js](https://github.com/nk2028/opencc-js)，MIT 授權全文見 `vendor/OPENCC-LICENSE`。本 repo 目前沒有整體 LICENSE；若要上架 Chrome Web Store／Edge Add-ons，請先確認詞彙資料的授權與再散布條件。
