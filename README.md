本项目是在项目 https://github.com/Zhang-RenWen/cn-tw-terms 基础上进行的二次开发。

**简体中文** | [繁體中文](README.zh-Hant.md)

# 简繁转换器＋两岸用语词汇库

纯 HTML＋JavaScript 的简繁转换工具，不需要后端或数据库。

- 字形转换使用 [OpenCC](https://github.com/nk2028/opencc-js)，全部在浏览器内完成。
- 两岸用语词汇库放在 `data/` 文件夹的 JSON 文件里，任何人都可以提交 Pull Request 扩充。
- 转换时会标出三种用语：
  - **一般用语**：例如 充电宝 → 移动电源，「简→繁＋台湾地区词汇」模式会直接替换。
  - **评价意涵**：例如 颜值、情绪价值、下沉市场，只标注并附上意涵说明，不替换。
  - **同字异义**：例如 窝心、爱人、研究所，只标注提醒。
- 也可以上传 **EPUB**，在浏览器内把正文、目录、书名等在繁体与简体之间转换（双向），重新打包后下载；文件不会上传。
- 界面文字提供繁体与简体两种版本，第一次打开会跟随浏览器语言，之后可在右上角自由切换。
- 附 **Chrome／Edge 扩展「简繁通」**：用同一套词汇库自动转换一般网页，可选词汇标注与本页暂停／还原。

## 项目结构

```
README.md                  简体中文说明（默认）
README.zh-Hant.md          繁体中文说明
CONTRIBUTING.md            词汇贡献指南
index.html                 页面
style.css                  样式
app.js                     转换与词汇匹配逻辑
i18n.js                    界面繁简文案与切换
epub-core.js               EPUB 转换核心（浏览器与命令行共用）
config.js                  你的 GitHub repo 名称（用来生成编辑链接）
data/index.json            要加载的词汇文件清单
data/<分类>.json           每个分类一个文件
scripts/validate.mjs       检查词汇文件格式
tools/epub-convert.mjs     命令行批量转换 EPUB
tools/build-extension.mjs  生成扩展的词汇数据与 vendor 文件（--check 检查过期）
tools/make-extension-icons.py  绘制扩展图标（产物已提交）
extension/                 Chrome／Edge 扩展「简繁通」
package.json               CLI 与扩展构建依赖（jszip、opencc-js）
.github/workflows/         PR 自动检查与部署
```

## 上线（GitHub Pages）

1. 建立 repo，把整个文件夹推上去。
2. 编辑 `config.js`，把 `repo` 改成 `你的账号/repo名称`（本仓库已设为 `midpoint/cn2tw`）。
3. 到 repo 的 **Settings → Pages**，Source 选 **GitHub Actions**。
4. 推送到 `main` 后，工作流会生成词汇页与 `sitemap.xml` 并部署；本仓库网址是 `https://midpoint.github.io/cn2tw/`。

之后每次推送到 `main`（包含合并 PR），网站就会自动更新。

## 本地预览

页面用 `fetch` 读取 JSON，直接双击 `index.html` 会读不到词汇库，请开一个本地服务器：

```bash
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

## 界面语言

右上角可切换**繁体**／**简体**界面。第一次打开会跟随浏览器语言（`zh-CN`／`zh-Hans` 用简体，其余用繁体），之后记住手动选择（存在 `localStorage` 的 `s2t-lang`）。切换只翻译界面文案；词条、备注、分类名称等数据维持原样。

## EPUB 转换（简繁双向）

在网站的「EPUB 转换」标签页选择方向（繁 → 简 或 简 → 繁），上传 EPUB、按「开始转换」，完成后下载 `原文件名_zh-Hans.epub` 或 `原文件名_zh-Hant.epub`。

- **繁 → 简**：OpenCC 字形转换，可选择同时套用台湾地区→中国大陆用语词汇库。
- **简 → 繁**：勾选「同时套用 OpenCC 词语＋台湾地区用语词汇库」时，使用 OpenCC 台湾地区词语转换（`twp`）加上本站词汇库；不勾选则只转字形。
- 会转换 XHTML／HTML 正文、EPUB2 的 `toc.ncx`、EPUB3 的导航文件，以及书名、作者、简介等 Dublin Core 元数据；可选择是否转换元数据，并把语言标为 `zh-CN`／`zh-TW`。
- 图片、样式、版面和文件名不变；输出仍维持 EPUB2／EPUB3 结构。
- `mimetype` 会保持为 ZIP 的第一个且不压缩的项目。
- 转换使用 [JSZip](https://stuk.github.io/jszip/)（CDN 加载）与 OpenCC，全程在浏览器内完成，文件不会上传。
- 限制：受 DRM 保护的电子书会中止转换；CSS `content` 里的文字与图片中的文字不会转换；字体混淆等其他加密项目会原样保留。
- 需要网络加载 OpenCC、JSZip 与字体；CDN 加载失败时 EPUB 功能会显示错误。

## 浏览器扩展：简繁通（Chrome／Edge）

`extension/` 是 Manifest V3 扩展，把同一套两岸用语词汇库套用到一般网页：依目标文字自动把简体页转成繁体（台湾地区）用语（或反向），已是目标文字就不动。可选择替换词加虚线标注、悬停看原文与备注；弹窗能强制方向或暂停并还原本页。

安装（未上架，开发者模式）：

1. `npm install && npm run build:ext` 生成 `extension/terms-data.js` 与 `extension/vendor/`（repo 若已含这些文件可跳过）。
2. 打开 `chrome://extensions`（Edge：`edge://extensions`），打开「开发者模式」。
3. 「加载已解压的扩展程序」选择 `extension/`，重新加载已打开的网页。

权限与隐私：需要在所有 http/https 网页注入 content script（Chrome 会显示「读取和更改所有网站上的数据」），另用 `storage` 存设置、`activeTab` 读取当前标签页状态。OpenCC 与词汇数据都打包在扩展内，不联网、不收集页面内容。快捷键 `Alt+Shift+J` 可暂停／恢复本页；徽章显示「繁」或「简」。

`extension/` 不会部署到 GitHub Pages。完整说明、限制与开发方式见 [`extension/README.md`](extension/README.md)（繁体中文）。

## 命令行批量转换 EPUB

需要 Node.js 18.17 以上。先安装依赖：

```bash
npm install
```

用法：

```bash
node tools/epub-convert.mjs --to cn|tw [选项] <文件或文件夹...>
npm run epub -- --to tw books/
```

- `--to cn|tw`：转换方向，`cn` 转成简体、`tw` 转成繁体（必填）。
- `--out <文件夹>`：输出文件夹（默认放在原文件旁边）；指定目录时会保留子文件夹结构。
- `--no-terms`：不套用两岸用语词汇库。
- `--no-meta`：不转换书名、作者、简介等元数据。
- `--force`：覆盖已存在的输出文件（默认跳过）。
- `--quiet`：只显示错误。
- `-h` / `--help`：显示说明。

文件夹会递归查找 `.epub`，跳过 `.git`、`node_modules`、符号链接与输出文件夹，并跳过文件名已是指定语言后缀的文件。输出文件名为 `原文件名_zh-Hans.epub` 或 `原文件名_zh-Hant.epub`。每次转换会打印内容文件数、词汇替换次数与变更字数；有任何文件失败时退出码为 1，用法错误为 2。

例：

```bash
node tools/epub-convert.mjs --to tw ~/books
node tools/epub-convert.mjs --to cn --out out/ a.epub b.epub
node tools/epub-convert.mjs --to tw --no-terms novel.epub
```

命令行与网站共用 `epub-core.js`，转换结果与网站一致；词汇库读取 repo 内的 `data/`，与当前工作目录无关。

## 贡献词汇

请看 [CONTRIBUTING.md](CONTRIBUTING.md)（繁体中文）。网站的「词汇库」标签页也有表单，可以生成要粘贴的 JSON，并直接打开 GitHub 的编辑页。

## 词汇库来源（v1.0.0）

第一版词汇整理自〈两岸用语差异总整理〉，起点是 Threads 上 @sharon_is_thinking 分享志祺七七采访阳明交大万宗纶副教授的帖子与留言，再补上网络资料与常见的两岸用语对照。

### 收录时的立场

- **不少词原本是自嘲或讽刺**：屌丝、打工人、社畜、韭菜多半是在抱怨处境；普信男是女性讽刺男性过度自信。标为「评价意涵」是说明它带有分级或物化的框架，不等于用户在宣扬阶级。
- **台湾地区也有类似的词**：CP值、鲁蛇／温拿、人生胜利组、天龙人、草莓族、恐龙妹、工具人。评分与分类的语言不只来自单一方向。
- **字面推论只是个人解读**：「小伙伴暗示对方较小」「默认暗示没发言权」「学霸隐含反知识分子」等说法来自留言，不是语言学定论，备注里都有注明。
- **用户未必在乎来源**：东海大学一份学生调查发现，多数受访者认为用词与政治无关、属个人自由；因身份认同刻意不用中国大陆用语的约一成。
- **视频的核心观点**：重点不在词从哪里来，而是某种评价方式一旦变得「好说、常说」，人们就更习惯用那套标准看人。

### 参考资料

- [联合新闻网：闺蜜、颜值等用语报道](https://udn.com/news/story/120912/7955289)
- [Sixth Tone：Young Chinese Buy to Feel Better](https://www.sixthtone.com/news/1017590)
- [Sixth Tone：Young Chinese Bemoan Rat Race](https://www.sixthtone.com/news/1006336/)
- [Language Log：Chinese terms of address for single ladies](https://languagelog.ldc.upenn.edu/nll/?p=4116)
- [Yoyo Chinese：Dating Scene in China](https://www.yoyochinese.com/blog/learn-chinese-love-dating-in-china-single-dog-leftover-woman-marriage)
- [港大词汇表：高富帅](https://www.interpreting.hku.hk/glossary/?p=49990)
- [Eye Shenzhen：下沉市场](https://www.eyeshenzhen.com/content/2019-09/30/content_22511676.htm)
- [Eye Shenzhen：割韭菜](https://www.eyeshenzhen.com/content/2018-09/05/content_21075239.htm)
- [新头壳：特殊用语报道](https://newtalk.tw/news/view/2024-12-11/948495)
- [东海大学：用语使用调查](https://nihongo.thu.edu.tw/research/wp-content/uploads/郭O瑩-說明文.pdf)
- [关键评论网：支语警察](https://www.thenewslens.com/article/242817)
- [国立国语院：两岸常用词典介绍](https://www.korean.go.kr/nkview/nklife/2018_3/28_0310.pdf)
- [ToneOZ：普通话与国语语音差异](https://toneoz.com/blog/?p=309)
