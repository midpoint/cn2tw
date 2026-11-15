/* 介面語言（繁體／简体）：文案字典與套用邏輯。
   網頁其餘程式用 window.I18N.t(key, ...args) 取得目前語言的文字。 */
(function () {
  'use strict';

  const DICT = {
    'doc.title': ['兩岸用語對照・簡繁轉換器｜中國大陸用語轉台灣地區用語', '两岸用语对照・简繁转换器｜中国大陆用语转台湾地区用语'],
    'doc.desc': [
      '免費線上簡繁轉換器，把簡體轉成台灣地區正體，同時把中國大陸用語換成台灣地區用語（視頻→影片、軟件→軟體），並標出評價意涵與同字異義。附兩岸用語對照表，也能上傳 EPUB 在簡體與繁體之間轉換。',
      '免费在线简繁转换器，把简体转成台湾地区繁体，同时把中国大陆用语换成台湾地区用语（视频→影片、软件→软体），并标出评价意涵与同字异义。附两岸用语对照表，也能上传 EPUB 在简体与繁体之间转换。'
    ],
    'app.suffix': ['轉換器', '转换器'],
    'app.name': ['簡繁轉換', '简繁转换'],

    'uiLang.label': ['介面語言', '界面语言'],
    'modes.label': ['轉換模式', '转换模式'],

    'mode.cn-twp.name': ['簡→繁＋台灣地區詞彙', '简→繁＋台湾地区词汇'],
    'mode.cn-tw.name': ['簡→繁', '简→繁'],
    'mode.cn-hk.name': ['香港字形', '香港字形'],
    'mode.tw-cn.name': ['繁→簡', '繁→简'],
    'mode.cn-twp.in': ['原文 · 简体', '原文 · 简体'],
    'mode.cn-twp.out': ['結果 · 繁體', '结果 · 繁体'],
    'mode.cn-twp.desc': ['簡體轉台灣地區正體，並套用兩岸用語詞彙庫', '简体转台湾地区繁体，并套用两岸用语词汇库'],
    'mode.cn-tw.in': ['原文 · 简体', '原文 · 简体'],
    'mode.cn-tw.out': ['結果 · 繁體', '结果 · 繁体'],
    'mode.cn-tw.desc': ['只轉台灣地區正體字形，用語只標示建議', '只转台湾地区繁体字形，用语只标注建议'],
    'mode.cn-hk.in': ['原文 · 简体', '原文 · 简体'],
    'mode.cn-hk.out': ['結果 · 香港繁體', '结果 · 香港繁体'],
    'mode.cn-hk.desc': ['簡體轉香港繁體字形', '简体转香港繁体字形'],
    'mode.tw-cn.in': ['原文 · 繁體', '原文 · 繁体'],
    'mode.tw-cn.out': ['結果 · 简体', '结果 · 简体'],
    'mode.tw-cn.desc': ['台灣地區繁體轉簡體，並把台灣地區用語換回中國大陸用語', '台湾地区繁体转简体，并把台湾地区用语换回中国大陆用语'],

    'tab.conv': ['轉換器', '转换器'],
    'tab.lib': ['詞彙庫', '词汇库'],
    'tab.epub': ['EPUB 轉換', 'EPUB 转换'],

    'conv.inputAria': ['輸入原文', '输入原文'],
    'conv.paste': ['貼上範例', '粘贴示例'],
    'conv.clear': ['清除', '清除'],
    'conv.swapTitle': ['把結果放回輸入並反向轉換', '把结果放回输入并反向转换'],
    'conv.swapAria': ['反向轉換', '反向转换'],
    'conv.copy': ['複製結果', '复制结果'],
    'conv.hl': ['標示變更', '标出变更'],
    'conv.empty': ['轉換結果會出現在這裡', '转换结果会出现在这里'],
    'legend.glyph': ['字形轉換', '字形转换'],
    'legend.vocab': ['用語替換', '用语替换'],
    'legend.loaded': ['帶評價意涵', '带评价意涵'],
    'legend.false': ['同字異義', '同字异义'],
    'legend.pick': ['可點選換說法', '可点选换说法'],
    'found.title': ['這段文字裡的兩岸用語', '这段文字里的两岸用语'],

    'lib.search': ['搜尋中國大陸或台灣地區用語、備註', '搜索中国大陆或台湾地区用语、备注'],
    'lib.searchAria': ['搜尋詞彙', '搜索词汇'],
    'lib.catAria': ['分類', '分类'],
    'lib.allCats': ['全部分類', '全部分类'],
    'lib.kindAria': ['類型', '类型'],
    'lib.kindAll': ['全部', '全部'],
    'kind.vocab': ['一般用語', '一般用语'],
    'kind.loaded': ['評價意涵', '评价意涵'],
    'kind.false': ['同字異義', '同字异义'],
    'lib.thCn': ['中國大陸用語', '中国大陆用语'],
    'lib.thTw': ['台灣地區用語', '台湾地区用语'],
    'lib.thKind': ['類型', '类型'],
    'lib.thCat': ['分類', '分类'],
    'lib.thNote': ['備註', '备注'],
    'lib.empty': ['沒有符合條件的詞。', '没有符合条件的词。'],
    'lib.loading': ['詞彙庫載入中…', '词汇库加载中…'],
    'lib.versionTitle': ['詞彙庫 v{0}', '词汇库 v{0}'],

    'form.title': ['提議新增詞彙', '提议新增词汇'],
    'form.cn': ['中國大陸用語', '中国大陆用语'],
    'form.cnPh': ['充電寶', '充电宝'],
    'form.tw': ['台灣地區用語', '台湾地区用语'],
    'form.twPh': ['行動電源（多個用、分隔）', '行动电源（多个用、分隔）'],
    'form.kind': ['類型', '类型'],
    'form.kindVocab': ['一般用語（轉換時直接替換）', '一般用语（转换时直接替换）'],
    'form.kindLoaded': ['評價意涵（只標示、不替換）', '评价意涵（只标注、不替换）'],
    'form.kindFalse': ['同字異義（只標示、不替換）', '同字异义（只标注、不替换）'],
    'form.cat': ['分類', '分类'],
    'form.note': ['備註', '备注'],
    'form.notePh': ['意涵、出處或使用提醒', '意涵、出处或使用提醒'],
    'form.generate': ['產生 JSON', '生成 JSON'],
    'form.prTitle': ['送出 Pull Request', '提交 Pull Request'],
    'form.step1': ['在左邊填好詞彙，按「產生 JSON」並複製。', '在左侧填好词汇，按「生成 JSON」并复制。'],
    'form.step2': ['按「在 GitHub 編輯」打開對應分類的檔案，GitHub 會自動幫你 fork。', '按「在 GitHub 编辑」打开对应分类的文件，GitHub 会自动帮你 fork。'],
    'form.step3a': ['把這段貼進', '把这段粘贴进'],
    'form.step3b': ['陣列，送出 Pull Request。', '数组，提交 Pull Request。'],
    'form.snippetInit': ['填好左邊表單後，這裡會出現要貼上的內容。', '填好左侧表单后，这里会出现要粘贴的内容。'],
    'form.copyJson': ['複製 JSON', '复制 JSON'],
    'form.editGithub': ['在 GitHub 編輯', '在 GitHub 编辑'],
    'form.issue': ['改用 Issue 提議', '改用 Issue 提议'],

    'epub.title': ['繁體 EPUB → 簡體 EPUB', '繁体 EPUB → 简体 EPUB'],
    'epub.title.toTw': ['簡體 EPUB → 繁體 EPUB', '简体 EPUB → 繁体 EPUB'],
    'epub.head.toCn': ['上傳繁體 EPUB，在瀏覽器內轉成簡體並下載', '上传繁体 EPUB，在浏览器内转成简体并下载'],
    'epub.head.toTw': ['上傳簡體 EPUB，在瀏覽器內轉成繁體並下載', '上传简体 EPUB，在浏览器内转成繁体并下载'],
    'epub.dirAria': ['轉換方向', '转换方向'],
    'epub.dirToCn': ['繁 → 簡', '繁 → 简'],
    'epub.dirToTw': ['簡 → 繁', '简 → 繁'],
    'epub.dropAria': ['選擇或拖放 EPUB 檔案', '选择或拖放 EPUB 文件'],
    'epub.drop': ['把繁體 EPUB 拖到這裡', '把繁体 EPUB 拖到这里'],
    'epub.drop.toTw': ['把簡體 EPUB 拖到這裡', '把简体 EPUB 拖到这里'],
    'epub.choose': ['選擇檔案', '选择文件'],
    'epub.hint': ['支援 EPUB2／EPUB3。檔案只在瀏覽器內處理，不會上傳。', '支持 EPUB2／EPUB3。文件只在浏览器内处理，不会上传。'],
    'epub.optTerms': ['同時套用台灣地區→中國大陸用語詞彙庫', '同时套用台湾地区→中国大陆用语词汇库'],
    'epub.optTerms.toTw': ['同時套用 OpenCC 詞語＋台灣地區用語詞彙庫', '同时套用 OpenCC 词语＋台湾地区用语词汇库'],
    'epub.optMeta': ['轉換書名、作者、簡介，語言標為 zh-CN', '转换书名、作者、简介，语言标为 zh-CN'],
    'epub.optMeta.toTw': ['轉換書名、作者、簡介，語言標為 zh-TW', '转换书名、作者、简介，语言标为 zh-TW'],
    'epub.progressAria': ['轉換進度', '转换进度'],
    'epub.chooseFirst': ['選擇檔案後開始。', '选择文件后开始。'],
    'epub.go': ['開始轉換', '开始转换'],
    'epub.dl': ['下載簡體 EPUB', '下载简体 EPUB'],
    'epub.dl.toTw': ['下載繁體 EPUB', '下载繁体 EPUB'],
    'epub.reset': ['再轉一本', '再转一本'],
    'epub.noteLead': ['說明：', '说明：'],
    'epub.note': [
      '轉換只在你的瀏覽器內完成，檔案不會上傳。支援繁體轉簡體與簡體轉繁體，會轉換 XHTML／HTML 正文、目錄與書名等中繼資料；圖片、樣式與版面不動。受 DRM 保護的電子書會中止轉換；字型混淆等其他加密項目會原樣保留。',
      '转换只在你的浏览器内完成，文件不会上传。支持繁体转简体与简体转繁体，会转换 XHTML／HTML 正文、目录与书名等元数据；图片、样式与版面不动。受 DRM 保护的电子书会中止转换；字体混淆等其他加密项目会原样保留。'
    ],

    'intro.a': [
      '這是一個免費的線上簡繁轉換工具：貼上簡體中文，會轉成台灣地區正體字，並把中國大陸用語換成台灣地區習慣的說法，例如視頻→影片、軟件→軟體、充電寶→行動電源。帶有評價意涵的詞（如顏值、下沉市場）和兩岸意思不同的詞（如窩心、愛人）會另外標示說明。想查單一詞彙，可以看',
      '这是一个免费的在线简繁转换工具：粘贴简体中文，会转成台湾地区繁体字，并把中国大陆用语换成台湾地区习惯的说法，例如视频→影片、软件→软体、充电宝→行动电源。带有评价意涵的词（如颜值、下沉市场）和两岸意思不同的词（如窝心、爱人）会另外标注说明。想查单个词汇，可以看'
    ],
    'intro.link': ['兩岸用語對照表', '两岸用语对照表'],
    'intro.b': ['。也可以上傳 EPUB，在瀏覽器內於簡體與繁體之間轉換後下載。', '。也可以上传 EPUB，在浏览器内于简体与繁体之间转换后下载。'],
    'foot.a': ['字形轉換使用開源字典', '字形转换使用开源字典'],
    'foot.b': ['在瀏覽器內完成，文字不會上傳。詞彙庫是', '在浏览器内完成，文字不会上传。词汇库是'],
    'foot.c': [
      '資料夾裡的 JSON 檔，歡迎提交 Pull Request 擴充。「一般用語」在「簡→繁＋台灣地區詞彙」模式會直接替換，其他模式只標示；「評價意涵」與「同字異義」永遠只標示，滑過可看備註；有多種說法的詞可以點一下，選擇其他說法或保留原文。台灣地區的文字也可以貼進來檢查有沒有中國大陸用語；EPUB 轉換同樣在瀏覽器內完成，支援 EPUB2／EPUB3、簡繁雙向。',
      '文件夹里的 JSON 文件，欢迎提交 Pull Request 扩充。「一般用语」在「简→繁＋台湾地区词汇」模式会直接替换，其他模式只标注；「评价意涵」与「同字异义」永远只标注，悬停可看备注；有多种说法的词可以点一下，选择其他说法或保留原文。台湾地区文字也可以粘贴进来检查有没有中国大陆用语；EPUB 转换同样在浏览器内完成，支持 EPUB2／EPUB3、简繁双向。'
    ],
    'foot.repo': ['原始碼與詞彙：', '源代码与词汇：'],

    'status.loadingDict': ['載入轉換字典中…', '加载转换字典中…'],
    'status.dictFail': ['字典載入失敗，請檢查網路後重新整理', '字典加载失败，请检查网络后刷新'],
    'status.libLoaded': ['已載入詞彙庫 v{0}，共 {1} 個詞', '已加载词汇库 v{0}，共 {1} 个词'],
    'status.libFileFail': ['直接開檔讀不到詞彙庫，請用本機伺服器開啟（見 README）', '直接打开文件读不到词汇库，请用本地服务器打开（见 README）'],
    'status.libFail': ['詞彙庫載入失敗，只做字形轉換', '词汇库加载失败，只做字形转换'],

    'count.chars': ['{0} 字', '{0} 字'],
    'count.changed': ['{0} 字變更 · {1} 個用語', '{0} 字变更 · {1} 个用语'],
    'tip.rev': ['台灣地區「{0}」→ 中國大陸「{1}」', '台湾地区「{0}」→ 中国大陆「{1}」'],
    'tip.fwd': ['中國大陸用語「{0}」', '中国大陆用语「{0}」'],
    'tip.tw': ['，台灣地區：{0}', '，台湾地区：{0}'],
    'tip.pick': ['（點一下選擇其他說法）', '（点一下选择其他说法）'],
    'term.noTw': ['無固定對應', '无固定对应'],
    'menu.title': ['選擇說法', '选择说法'],
    'menu.keep': ['保留「{0}」', '保留「{0}」'],
    'msg.copied': ['已複製', '已复制'],
    'msg.selectCopy': ['已選取，請按 Ctrl+C', '已选中，请按 Ctrl+C'],
    'msg.copyManual': ['請手動選取複製', '请手动选中复制'],
    'form.needCn': ['請填中國大陸用語', '请填中国大陆用语'],
    'form.issueCat': ['分類：', '分类：'],
    'form.issueTitle': ['新增詞彙：', '新增词汇：'],
    'form.dup': ['「{0}」已在「{1}」，PR 請改成修改原條目', '「{0}」已在「{1}」，PR 请改成修改原条目'],
    'form.generated': ['已產生，貼到 {0}', '已生成，粘贴到 {0}'],

    'epub.noFile': ['未選擇檔案', '未选择文件'],
    'epub.selected': ['已選擇檔案，按「開始轉換」。', '已选择文件，按「开始转换」。'],
    'epub.badType': ['請選擇 .epub 檔案。', '请选择 .epub 文件。'],
    'epub.badZip': ['這不是有效的 EPUB／ZIP 檔案。', '这不是有效的 EPUB／ZIP 文件。'],
    'epub.loadingLib': ['載入詞彙庫…', '加载词汇库…'],
    'epub.reading': ['讀取 EPUB…', '读取 EPUB…'],
    'epub.converting': ['轉換內容 {0}／{1}…', '转换内容 {0}／{1}…'],
    'epub.meta': ['轉換書名與中繼資料…', '转换书名与元数据…'],
    'epub.repacking': ['重新打包 EPUB…', '重新打包 EPUB…'],
    'epub.done': ['轉換完成，按「下載{0} EPUB」儲存。', '转换完成，按「下载{0} EPUB」保存。'],
    'epub.doneSuffix': ['簡體', '简体'],
    'epub.doneSuffixTw': ['繁體', '繁体'],
    'epub.stats': ['內容檔案 {0} 個 · 詞彙替換 {1} 次 · 變更 {2} 字', '内容文件 {0} 个 · 词汇替换 {1} 次 · 变更 {2} 字'],
    'epub.fail': ['轉換失敗：{0}', '转换失败：{0}'],
    'epub.warnFonts': [' EPUB 內含加密項目（多為字型混淆），已原樣保留。', ' EPUB 内含加密项目（多为字体混淆），已原样保留。'],
    'epub.warnNoTerms': [' 詞彙庫未載入，僅做字形轉換。', ' 词汇库未加载，仅做字形转换。'],
    'epub.warnNoTermsToTw': [' 詞彙庫未載入，僅做 OpenCC 詞語轉換。', ' 词汇库未加载，仅做 OpenCC 词语转换。'],
    'epub.noOpf': ['找不到 OPF 套件檔', '找不到 OPF 包文件'],
    'epub.err.NO_CONTAINER': ['EPUB 缺少 META-INF/container.xml', 'EPUB 缺少 META-INF/container.xml'],
    'epub.err.BAD_CONTAINER': ['container.xml 格式錯誤', 'container.xml 格式错误'],
    'epub.err.NO_JSZIP': ['JSZip 載入失敗，請檢查網路後重新整理。', 'JSZip 加载失败，请检查网络后刷新。'],
    'epub.err.NO_CONTENT': ['找不到可轉換的 XHTML／HTML 內容', '找不到可转换的 XHTML／HTML 内容'],
    'epub.err.DRM': ['此 EPUB 的正文受 DRM 保護，無法轉換', '此 EPUB 的正文受 DRM 保护，无法转换']
  };

  const STORE_KEY = 's2t-lang';
  const browserLang = () => (navigator.languages && navigator.languages[0]) || navigator.language || '';
  const isHans = s => /^zh-(cn|hans|sg|my)$/i.test(String(s).trim()) || /^zh-hans\b/i.test(String(s).trim());

  function detect() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v === 'hant' || v === 'hans') return v;
    } catch (e) {}
    return isHans(browserLang()) ? 'hans' : 'hant';
  }

  let lang = window.__UI_LANG__ || detect();
  if (lang !== 'hant' && lang !== 'hans') lang = 'hant';

  function t(key, ...args) {
    const row = DICT[key];
    let s = row ? row[lang === 'hans' ? 1 : 0] : key;
    if (args.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] !== undefined ? String(args[+i]) : m));
    return s;
  }

  function apply() {
    const root = document.documentElement;
    root.lang = lang === 'hans' ? 'zh-Hans' : 'zh-Hant-TW';
    root.setAttribute('data-lang', lang);
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    for (const el of document.querySelectorAll('[data-i18n-empty]')) el.setAttribute('data-empty', t(el.getAttribute('data-i18n-empty')));
    document.title = t('doc.title');
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', t('doc.desc'));
    for (const m of document.querySelectorAll('meta[name="application-name"], meta[name="apple-mobile-web-app-title"]')) m.setAttribute('content', t('app.name'));
    const og = document.querySelector('meta[property="og:locale"]');
    if (og) og.setAttribute('content', lang === 'hans' ? 'zh_CN' : 'zh_TW');
  }

  function syncButtons() {
    for (const b of document.querySelectorAll('#uiLang .chip')) b.setAttribute('aria-pressed', b.dataset.lang === lang);
  }

  function setLang(next) {
    if (next !== 'hant' && next !== 'hans') return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) {}
    apply();
    if (typeof window.onUiLangChange === 'function') window.onUiLangChange();
    syncButtons();
  }

  window.I18N = { get lang() { return lang; }, t, apply, setLang, syncButtons };
  apply();
  syncButtons();
})();
