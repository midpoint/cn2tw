本項目是在項目 https://github.com/Zhang-RenWen/cn-tw-terms 基礎上進行的二次開發。

[简体中文](README.md) | **繁體中文**

# 簡繁轉換器＋兩岸用語詞彙庫

純 HTML＋JavaScript 的簡繁轉換工具，不需要後端或資料庫。

- 字形轉換使用 [OpenCC](https://github.com/nk2028/opencc-js)，全部在瀏覽器內完成。
- 兩岸用語詞彙庫放在 `data/` 資料夾的 JSON 檔，任何人都可以提交 Pull Request 擴充。
- 轉換時會標出三種用語：
  - **一般用語**：例如 充電寶 → 行動電源，「簡→繁＋台灣地區詞彙」模式會直接替換。
  - **評價意涵**：例如 顏值、情緒價值、下沉市場，只標示並附上意涵說明，不替換。
  - **同字異義**：例如 窩心、愛人、研究所，只標示提醒。
- 也可以上傳 **EPUB**，在瀏覽器內把正文、目錄、書名等在繁體與簡體之間轉換（雙向），重新打包後下載；檔案不會上傳。
- 介面文字提供繁體與简体兩種版本，第一次開啟會跟隨瀏覽器語言，之後可在右上角自由切換。
- 附 **Chrome／Edge 擴充「简繁通」**：用同一套詞彙庫自動轉換一般網頁，可選詞彙標註與本頁暫停／還原。

## 專案結構

```
README.md                  簡體中文說明（預設）
README.zh-Hant.md          繁體中文說明
CONTRIBUTING.md            詞彙貢獻指南
index.html                 頁面
style.css                  樣式
app.js                     轉換與詞彙比對邏輯
i18n.js                    介面繁簡文案與切換
epub-core.js               EPUB 轉換核心（瀏覽器與命令列共用）
config.js                  你的 GitHub repo 名稱（用來產生編輯連結）
data/index.json            要載入的詞彙檔清單
data/<分類>.json           每個分類一個檔案
scripts/validate.mjs       檢查詞彙檔格式
tools/epub-convert.mjs     命令列批次轉換 EPUB
tools/build-extension.mjs  產生擴充的詞彙資料與 vendor 檔（--check 檢查過期）
tools/make-extension-icons.py  繪製擴充圖示（產物已提交）
extension/                 Chrome／Edge 擴充「简繁通」
package.json               CLI 與擴充建置依賴（jszip、opencc-js）
.github/workflows/         PR 自動檢查與部署
```

## 上線（GitHub Pages）

1. 建立 repo，把整個資料夾推上去。
2. 編輯 `config.js`，把 `repo` 改成 `你的帳號/repo名稱`（本 repo 已設為 `midpoint/cn2tw`）。
3. 到 repo 的 **Settings → Pages**，Source 選 **GitHub Actions**。
4. 推送到 `main` 後，工作流程會產生詞彙頁與 `sitemap.xml` 並部署；本 repo 網址是 `https://midpoint.github.io/cn2tw/`。

之後每次推送到 `main`（包含合併 PR），網站就會自動更新。

## 本機預覽

頁面用 `fetch` 讀 JSON，直接雙擊 `index.html` 會讀不到詞彙庫，請開一個本機伺服器：

```bash
python3 -m http.server 8000
# 然後打開 http://localhost:8000
```

## 介面語言

右上角可切換**繁體**／**简体**介面。第一次開啟會跟隨瀏覽器語言（`zh-CN`／`zh-Hans` 用简体，其餘用繁體），之後記住手動選擇（存在 `localStorage` 的 `s2t-lang`）。切換只翻譯介面文案；詞條、備註、分類名稱等資料維持原樣。

## EPUB 轉換（簡繁雙向）

在網站的「EPUB 轉換」分頁選擇方向（繁 → 簡 或 簡 → 繁），上傳 EPUB、按「開始轉換」，完成後下載 `原檔名_zh-Hans.epub` 或 `原檔名_zh-Hant.epub`。

- **繁 → 簡**：OpenCC 字形轉換，可選擇同時套用台灣地區→中國大陸用語詞彙庫。
- **簡 → 繁**：勾選「同時套用 OpenCC 詞語＋台灣地區用語詞彙庫」時，使用 OpenCC 台灣地區詞語轉換（`twp`）加上本站詞彙庫；不勾選則只轉字形。
- 會轉換 XHTML／HTML 正文、EPUB2 的 `toc.ncx`、EPUB3 的導覽文件，以及書名、作者、簡介等 Dublin Core 中繼資料；可選擇是否轉換中繼資料，並把語言標為 `zh-CN`／`zh-TW`。
- 圖片、樣式、版面與檔名不變；輸出仍維持 EPUB2／EPUB3 結構。
- `mimetype` 會保持為 ZIP 的第一個且不壓縮的項目。
- 轉換使用 [JSZip](https://stuk.github.io/jszip/)（CDN 載入）與 OpenCC，全程在瀏覽器內完成，檔案不會上傳。
- 限制：受 DRM 保護的電子書會中止轉換；CSS `content` 裡的文字與圖片中的文字不會轉換；字型混淆等其他加密項目會原樣保留。
- 需要網路載入 OpenCC、JSZip 與字型；CDN 載入失敗時 EPUB 功能會顯示錯誤。

## 瀏覽器擴充：简繁通（Chrome／Edge）

`extension/` 是 Manifest V3 擴充，把同一套兩岸用語詞彙庫套用到一般網頁：依目標文字自動把簡體頁轉成繁體（台灣地區）用語（或反向），已是目標文字就不動。可選擇替換詞加虛線標註、懸停看原文與備註；彈窗能強制方向或暫停並還原本頁。

安裝（未上架，開發人員模式）：

1. `npm install && npm run build:ext` 產生 `extension/terms-data.js` 與 `extension/vendor/`（repo 若已含這些檔案可跳過）。
2. 開啟 `chrome://extensions`（Edge：`edge://extensions`），打開「開發人員模式」。
3. 「載入未封裝項目」選擇 `extension/`，重新整理已開啟的網頁。

權限與隱私：需要在所有 http/https 網頁注入 content script（Chrome 會顯示「讀取及變更所有網站資料」），另用 `storage` 存設定、`activeTab` 讀目前分頁狀態。OpenCC 與詞彙資料都打包在擴充內，不連網、不收集頁面內容。快捷鍵 `Alt+Shift+J` 可暫停／恢復本頁；徽章顯示「繁」或「简」。

`extension/` 不會部署到 GitHub Pages。完整說明、限制與開發方式見 [`extension/README.md`](extension/README.md)。

## 命令列批次轉換 EPUB

需要 Node.js 18.17 以上。先安裝依賴：

```bash
npm install
```

用法：

```bash
node tools/epub-convert.mjs --to cn|tw [選項] <檔案或資料夾...>
npm run epub -- --to tw books/
```

- `--to cn|tw`：轉換方向，`cn` 轉成簡體、`tw` 轉成繁體（必填）。
- `--out <資料夾>`：輸出資料夾（預設放在原檔旁邊）；指定目錄時會保留子資料夾結構。
- `--no-terms`：不套用兩岸用語詞彙庫。
- `--no-meta`：不轉換書名、作者、簡介等中繼資料。
- `--force`：覆蓋已存在的輸出檔（預設跳過）。
- `--quiet`：只顯示錯誤。
- `-h` / `--help`：顯示說明。

資料夾會遞迴尋找 `.epub`，略過 `.git`、`node_modules`、符號連結與輸出資料夾，並跳過檔名已是指定語言後綴的檔案。輸出檔名為 `原檔名_zh-Hans.epub` 或 `原檔名_zh-Hant.epub`。每次轉換會印出內容檔案數、詞彙替換次數與變更字數；有任何檔案失敗時結束碼為 1，用法錯誤為 2。

例：

```bash
node tools/epub-convert.mjs --to tw ~/books
node tools/epub-convert.mjs --to cn --out out/ a.epub b.epub
node tools/epub-convert.mjs --to tw --no-terms novel.epub
```

命令列與網站共用 `epub-core.js`，轉換結果與網站一致；詞彙庫讀取 repo 內的 `data/`，與目前工作目錄無關。

## 貢獻詞彙

請看 [CONTRIBUTING.md](CONTRIBUTING.md)。網站的「詞彙庫」分頁也有表單，可以產生要貼上的 JSON，並直接打開 GitHub 的編輯頁。

## 詞彙庫來源（v1.0.0）

第一版詞彙整理自〈兩岸用語差異總整理〉，起點是 Threads 上 @sharon_is_thinking 分享志祺七七訪問陽交大萬宗綸副教授的串文與留言，再補上網路資料與常見的兩岸用語對照。

### 收錄時的立場

- **不少詞原本是自嘲或諷刺**：屌絲、打工人、社畜、韭菜多半是在抱怨處境；普信男是女性諷刺男性過度自信。標為「評價意涵」是說明它帶有分級或物化的框架，不等於使用者在宣揚階級。
- **台灣地區也有類似的詞**：CP值、魯蛇／溫拿、人生勝利組、天龍人、草莓族、恐龍妹、工具人。評分與分類的語言不只來自單一方向。
- **字面推論只是個人解讀**：「小夥伴暗示對方較小」「默認暗示沒發言權」「學霸隱含反知識份子」等說法來自留言，不是語言學定論，備註裡都有註明。
- **使用者未必在乎來源**：東海大學一份學生調查發現，多數受訪者認為用詞與政治無關、屬個人自由；因身分認同刻意不用中國大陸用語的約一成。
- **影片的核心觀點**：重點不在詞從哪裡來，而是某種評價方式一旦變得「好說、常說」，人們就更習慣用那套標準看人。

### 參考資料

- [聯合新聞網：閨蜜、顏值等用語報導](https://udn.com/news/story/120912/7955289)
- [Sixth Tone：Young Chinese Buy to Feel Better](https://www.sixthtone.com/news/1017590)
- [Sixth Tone：Young Chinese Bemoan Rat Race](https://www.sixthtone.com/news/1006336/)
- [Language Log：Chinese terms of address for single ladies](https://languagelog.ldc.upenn.edu/nll/?p=4116)
- [Yoyo Chinese：Dating Scene in China](https://www.yoyochinese.com/blog/learn-chinese-love-dating-in-china-single-dog-leftover-woman-marriage)
- [港大詞彙表：高富帥](https://www.interpreting.hku.hk/glossary/?p=49990)
- [Eye Shenzhen：下沉市场](https://www.eyeshenzhen.com/content/2019-09/30/content_22511676.htm)
- [Eye Shenzhen：割韭菜](https://www.eyeshenzhen.com/content/2018-09/05/content_21075239.htm)
- [新頭殼：特殊用語報導](https://newtalk.tw/news/view/2024-12-11/948495)
- [東海大學：用語使用調查](https://nihongo.thu.edu.tw/research/wp-content/uploads/郭O瑩-說明文.pdf)
- [關鍵評論網：支語警察](https://www.thenewslens.com/article/242817)
- [國立國語院：兩岸常用詞典介紹](https://www.korean.go.kr/nkview/nklife/2018_3/28_0310.pdf)
- [ToneOZ：普通話與國語語音差異](https://toneoz.com/blog/?p=309)
