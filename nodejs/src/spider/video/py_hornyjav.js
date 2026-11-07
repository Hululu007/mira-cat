// HornyJav - CatPawOpen JS Spider（2026-10-30 新源）
// 站点：https://hornyjav.com/（WordPress retrotube 1.5.8；wp-json 401，解析 HTML）
// 结构（2026-10-30 VM 实测）：
//  - 列表：<article class="loop-video thumb-block" data-post-id>，链接 /{slug}/，
//    封面 <img data-src="https://image.hornyjav.com/image/{slug}.jpg">，
//    时长 + 播放量 span；分页 /page/N/，分类 /category/{slug}/page/N/。
//  - 分类（导航实测，仅 3 个视频分类）：Censored /category/censored/，
//    English Subtitle /category/english-subtitle/，Reducing Mosaic
//    /category/reducing-mosaic/（/actors/、/studios/ 是人物索引，不作分类）。
//  - 播放（2026-10-30 破解，2026-11-07 上游已变）：详情 <div class="box-server"
//    data-server-urls="[&quot;token&quot;,…]">（每帖 4 个 token）；
//    token 解码：反转字符串 → base64url 转 base64 补 '=' → 解码 →
//    按字节与密钥 "KmzWa8awaallakclnu" 循环异或 → videplay 嵌页 URL
//    （如 https://x.videplay.us/x/… 或 https://xx.streamhx.win/v/…）；
//    解出非 https:// 开头的视为密钥已换，该条作废。嵌页是 jwplayer8 页，
//    内含 Dean Edwards 打包块，解包后取 master 清单——上游已迁到
//    streamhx（dual/api.streamhx.win，另有 /ved/ 与 f4-master 变体），
//    master 形如 https://<host>/…/v-master.m3u8/<TOKEN>，TOKEN 段不可丢
//    （旧正则只认 api.videplay.us/o/ 且回退在 .m3u8 后截断，返回的裸
//    master 一律 404，就是“解析出来播不了”的主因）。本站给的是服务器
//    选择（4 条线），不是分辨率档（master 内单 720p 码率），故线名是
//    服务器。分片是真 TS 却伪装成图片下发：70 字节 1×1 PNG 头 +
//    TS 体（100% 188 字节同步）、tiktokcdn .image 地址 + image/png
//    类型；严格 HLS 内核按扩展名拒收，故播放地址改走本地 /proxy/m3u8
//    改写清单（分片行尾加 &x=.ts，实测签名有效、字节不变；分片仍直连
//    CDN），同 MissAV SQTE-727 / missav_xptv.js 先例。4 条嵌页并行解
//    （串行实测 15–30 秒），字幕预热随详情取回即起、播放地址作别名。
import req from '../../util/req.js';

const KEY = 'py_hornyjav';
const NAME = 'HornyJav';
const HOST = 'https://hornyjav.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const XOR_KEY = 'KmzWa8awaallakclnu';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

async function getText(url, referer, timeoutMs) {
  try {
    const { data } = await req.get(url, { headers: H(referer), timeout: timeoutMs || 15000 });
    return String(data || '');
  } catch { return ''; }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function b64Decode(b64url) {
  let s = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return Buffer.from(s, 'base64').toString('latin1'); } catch { return ''; }
}

function decodeToken(tok) {
  try {
    const rev = String(tok || '').split('').reverse().join('');
    const raw = b64Decode(rev);
    if (!raw) return '';
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return out;
  } catch { return ''; }
}

function jsUnescapeSingle(s) {
  return s.replace(/\\(.)/g, (m, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return c;
  });
}

// Dean Edwards 打包解包（纯字符串操作，与 njavtv/videplay 同款）
function unpackDeanEdwards(html) {
  const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
  if (!m) return '';
  let p = jsUnescapeSingle(m[1]);
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = jsUnescapeSingle(m[4]).split('|');
  const enc = (n) => (n < a ? '' : enc(Math.floor(n / a))) + ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36));
  let i = c;
  while (i--) {
    if (k[i]) {
      const word = k[i];
      p = p.replace(new RegExp('\\b' + enc(i) + '\\b', 'g'), () => word);
    }
  }
  return p;
}

function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<article[^>]*class="[^"]*loop-video[^"]*"[^>]*>([\s\S]{0,6000}?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const blk = m[1];
    const lm = blk.match(/<a[^>]*href="(https:\/\/hornyjav\.com\/[^"]+\/)"[^>]*>/i);
    if (!lm) continue;
    const href = lm[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const clean = blk.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let pic = '';
    const im = clean.match(/<img[^>]*>/i);
    if (im) {
      const sm = im[0].match(/(?:data-src|data-original|src)\s*=\s*"([^"]+)"/i);
      if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) pic = sm[1];
    }
    let title = '';
    const tm = clean.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/i)
      || clean.match(/title="([^"]+)"/i);
    if (tm) title = stripTags(tm[1]);
    if (!title) {
      const hm = clean.match(/<h[23][^>]*>([\s\S]{0,300}?)<\/h[23]>/i);
      if (hm) title = stripTags(hm[1]);
    }
    if (!title || title.length < 2) continue;
    let remarks = '';
    const dm = clean.match(/(\d+:\d+(?::\d+)?)/);
    if (dm) remarks = dm[1];
    items.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: remarks });
    if (items.length >= 60) break;
  }
  return items;
}

// 2026-10-30 晚：站内导航只有 3 个视频分类；其余用 WP 标签页（/tag/{slug}/，
// 首页卡片 tag-* 类实测 55 个，标签页与翻页 /page/N/ 均已验出内容）。
// 标签分类沿用 category() 的通用路径拼接，无需改逻辑。
const CATS = [
  { type_id: '/category/censored/', type_name: '有码' },
  { type_id: '/category/english-subtitle/', type_name: '英字' },
  { type_id: '/category/reducing-mosaic/', type_name: '减码' },
  { type_id: '/tag/big-tits/', type_name: '巨乳' },
  { type_id: '/tag/huge-butt/', type_name: '巨臀' },
  { type_id: '/tag/beautiful-butt/', type_name: '美臀' },
  { type_id: '/tag/amateur/', type_name: '素人' },
  { type_id: '/tag/beautiful-girl/', type_name: '美少女' },
  { type_id: '/tag/married-woman/', type_name: '人妻' },
  { type_id: '/tag/mature-woman/', type_name: '熟女' },
  { type_id: '/tag/milf/', type_name: '熟妇' },
  { type_id: '/tag/school-girls/', type_name: '校园' },
  { type_id: '/tag/cheating-wife/', type_name: '出轨妻' },
  { type_id: '/tag/young-wife/', type_name: '年轻妻' },
  { type_id: '/tag/creampie/', type_name: '中出' },
  { type_id: '/tag/blowjob/', type_name: '口交' },
  { type_id: '/tag/drama/', type_name: '剧情' },
  { type_id: '/tag/lesbian/', type_name: '女同' },
  { type_id: '/tag/hardcore/', type_name: '硬核' },
  { type_id: '/tag/pov/', type_name: '第一视角' },
  { type_id: '/tag/squirting/', type_name: '潮吹' },
  { type_id: '/tag/threesome-foursome/', type_name: '多人' },
  { type_id: '/tag/slender/', type_name: '苗条' },
];

async function init() { return {}; }

async function home() {
  const html = await getText(HOST + '/', HOST + '/');
  return { class: CATS, filters: {}, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(body.id || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid) tid = '/category/censored/';
  const base = (HOST + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
  const url = page === 1 ? (base + '/') : (base + '/page/' + page + '/');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length ? 999999 : 0, list };
}

async function resolveVideplay(embedUrl, durl) {
  const html = await getText(embedUrl, durl);
  if (!html) return '';
  const unpacked = unpackDeanEdwards(html);
  // 解包后的 JS 源码里 URL 写在转义引号里、token 内有 \/ 转义：先把 \/ 还原
  // 成 /；token 段的字符类排除反斜杠，避免把尾部 \" 的反斜杠吞进 URL
  const hay = (unpacked || html).replace(/\\\//g, '/');
  // 2026-11-07：取“*.m3u8/<token>”全段（任意域名/路径，含 /ved/ 与
  // f4-master 变体）；token 段不可丢，丢了就是 404。无 token 段的裸
  // 清单只作次选。
  const m = hay.match(/https?:\/\/[^\s"'<>\\]*\.m3u8\/[^\s"'<>\\]+/i);
  if (m) return m[0];
  const m2 = hay.match(/https?:\/\/[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?/i);
  return m2 ? m2[0] : '';
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    const durl = /^https?:\/\//i.test(raw) ? raw : HOST + '/' + String(raw).replace(/^\/+/, '');
    const html = await getText(durl, HOST + '/');
    const hm = html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i)
      || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = hm ? stripTags(hm[1]) : 'HornyJav';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const pic = ogm ? ogm[1] : '';
    // 字幕预热提前（2026-11-07）：详情取回后立刻按详情 URL 起一趟搜索，
    // 与下面 4 条嵌页解析并行；播放地址解出后登记别名，点播时复用同一趟，
    // 不再另起一趟等 6 秒预算
    subCacheName(durl, title);
    subWarm(durl);
    const lines = [];
    const bm = html.replace(/&quot;/g, '"').match(/data-server-urls="\[([^\]]*)\]"/i);
    if (bm) {
      let tokens = [];
      try { tokens = JSON.parse('[' + bm[1] + ']'); } catch { tokens = []; }
      const embeds = [];
      tokens.forEach((tok, t) => {
        const embed = decodeToken(tok);
        if (embed && /^https:\/\//i.test(embed)) embeds.push({ idx: t + 1, embed });
      });
      // 4 条嵌页并行解（2026-11-07）：串行实测每条 2–10 秒、合计 15–30 秒，
      // 并行后只剩最慢一条；线名仍按 token 原序（服务器 N），顺序不变
      const masters = await Promise.all(embeds.map((e) =>
        resolveVideplay(e.embed, durl).catch(() => '')));
      // master 逐条验活（2026-11-07 probe15）：上游 token 按 (视频, 服务器)
      // 固化，个别线 token 已死——源站回 502（dvdes-674 服务器1）或 200
      // 空体（服务器4）；只把取到有效清单的线交给用户，死线不列出。
      // 验活并行、10 秒上限，清单须以 #EXTM3U 开头才算活。
      const live = await Promise.all(masters.map((master, k) =>
        master
          ? getText(master, embeds[k].embed, 10000).then((txt) => (txt && txt.indexOf('#EXTM3U') === 0 ? k : -1)).catch(() => -1)
          : Promise.resolve(-1)));
      live.forEach((k) => {
        if (k < 0) return;
        const master = masters[k];
        // 播放地址改走本地 /proxy/m3u8（改写分片后缀，见文件尾代理段注释）；
        // 代理地址构造失败时降级回原始直链（旧行为）
        const playUrl = proxyUrl(reqIn, '/proxy/m3u8', master, embeds[k].embed) || master;
        lines.push('服务器' + embeds[k].idx + '$' + playUrl);
        // 字幕别名：播放地址 -> 详情 URL（subSearchAll 命中别名即复用预热）
        subAlias.set(playUrl, durl);
        if (subAlias.size > 200) subAlias.delete(subAlias.keys().next().value);
      });
    }
    if (!lines.length) lines.push('网页播放$' + durl);
    list.push({ vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: lines.join('#') });
  }
  return { list };
}

async function play(reqIn) {
  let id = String(reqIn?.body?.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  const isVideo = /\.(m3u8|mp4)/i.test(id) || id.includes('/proxy/m3u8');
  const result = {
    parse: isVideo ? 0 : 1,
    url: id,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(id).catch(() => []);
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const url = HOST + '/?s=' + encodeURIComponent(wd) + (page > 1 ? '&paged=' + page : '');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length, list };
}


// ---------- 字幕聚合（与猫源同款芯一致，见 subdur-1102/cat-subtitle-core-1102.js） ----------
// 三槽：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 两迅雷槽同走同一 oracle 接口、合并按 URL 去重、同条归高档位；合并序 =
// 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；全局上限 10、
// 单槽软上限 8。严过滤（条目须含番号或片名全文，无回退，宁缺毋滥）；
// 全程 req 主栈、逐请求超时 3s、总预算 6s、失败全静默、无命中不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 视为毫秒除 1000），秒级原值直接用；
// 无时长不显示、不编造。去重 key = 语言 + 小写去后缀文件名 + 归一化时长秒
// （无时长记 nodur）；同名同时长并一条；同名时长不同都留；同链接只留一条。
function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}
const subAlias = new Map(); // 播放地址 -> 详情 URL（字幕预热别名，2026-11-07）

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
    /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  return '';
}

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
function subCtx(durl) {
  const title = (subNameCache.get(durl) || subSlugTitle(durl) || '').trim();
  const code = subExtractCode(title) || subExtractCode(String(durl || ''));
  const compact = code ? code.replace(/[-_ ]/g, '') : '';
  let titlePart = '';
  if (code && title) {
    titlePart = title
      .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), ' ')
      .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, ' ')
      .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, ' ')
      .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (titlePart === code || titlePart === compact) titlePart = '';
  }
  return { title, code, compact, titlePart };
}

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
function subMatchOf(durl, ctx) {
  const text = ((ctx.title || '') + ' ' + String(durl || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return {
    text,
    loose: text.replace(/[-_\s.]/g, ''),
    title,
    titleLoose: title.replace(/[-_\s.]/g, ''),
  };
}

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
function subFmtOf(name, ext, url) {
  const hay = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  if (/\.(zip|rar|7z)(\?|#|$)/.test(hay)) return '';
  const fromName = String(name || '').toLowerCase().match(/\.(srt|vtt|ass|ssa)$/);
  if (fromName) return fromName[1];
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (/^(srt|vtt|ass|ssa)$/.test(e)) return e;
  const fromUrl = String(url || '').match(SUB_TEXT_RE);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return '';
}

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await reqRaw('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
      { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 3000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    return j.data;
  })();
  ocache.set(key, p);
  return p;
}

// oracle 条目归一 (组件 normalizeResult 的字段口径)
function subNormItem(it) {
  const name = String(it.name || it.Name || it.title || it.Title || it.filename || it.FileName || '字幕');
  const langs = Array.isArray(it.languages) ? it.languages.join(',')
    : (Array.isArray(it.Languages) ? it.Languages.join(',') : String(it.langs || it.Langs || it.language || ''));
  return {
    name,
    langs,
    ext: String(it.ext || it.Ext || it.format || it.Format || ''),
    url: String(it.url || it.Url || ''),
    cid: Boolean(it.cid_match ?? it.CidMatch),
    down: Number(it.down_count || it.DownCount || it.downloads || it.Downloads || 0) || 0,
    score: Number(it.score || it.Score || 0) || 0,
    fp: Number(it.fingerprintf_score || it.fingerprint_score || it.FingerprintScore || it.fingerprintfScore || 0) || 0,
    duration: Number(it.duration || it.Duration || 0) || 0,
    size: Number(it.file_size || it.FileSize || it.size || it.Size || 0) || 0,
  };
}

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
function subRelevant(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  if (ctx.code) {
    if (text.includes(ctx.code.toLowerCase())) return true;
    if (ctx.compact && loose.includes(ctx.compact.toLowerCase())) return true;
  }
  if (!match.text) return false;
  return text.includes(match.text) || loose.includes(match.loose)
    || (match.title ? (text.includes(match.title) || loose.includes(match.titleLoose)) : false)
    || match.text.includes(text);
}

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
function subScoreItem(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  let s = (it.cid ? 100000 : 0) + it.down / 10000;
  if (ctx.code && (text.includes(ctx.code.toLowerCase()) || (ctx.compact && loose.includes(ctx.compact.toLowerCase())))) s += 25000;
  s += Math.max(0, it.score) + Math.max(0, it.fp);
  if (it.duration > 0) s += 50;
  if (it.size > 0) s += Math.min(it.size / 1024 / 1024, 20);
  if (match.title && (text.includes(match.title) || loose.includes(match.titleLoose))) s += 1000;
  if (ctx.code) s += 500;
  if (text.includes('sub') || text.includes('subtitle') || text.includes('字幕')) s += 300;
  return s;
}

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
async function subSlotOracle(keys, src, tier, ctx, match, ocache, bag) {
  let pool = null;
  for (const k of keys) {
    const list = await subOracle(k, ocache);
    if (list && list.length) { pool = list; break; }
  }
  if (!pool) return;
  const items = [];
  for (const raw of pool) {
    if (!raw) continue;
    const it = subNormItem(raw);
    if (!it.url) continue;
    const fmt = subFmtOf(it.name, it.ext, it.url);
    if (!fmt) continue;
    items.push({ name: it.name, langs: it.langs, ext: it.ext, url: it.url, fmt, norm: it });
  }
  if (!items.length) return;
  const finalItems = items.filter((it) => subRelevant(it, ctx, match));
  for (const it of finalItems) {
    const lang = subLangOf(it.name, it.langs);
    bag.push({ src, tier, name: subDispName(it.name, ctx.code), url: it.url, fmt: it.fmt, lang: lang.tag, langRank: lang.rank, score: subScoreItem(it.norm, ctx, match), dur: it.norm.duration });
  }
}

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await reqRaw('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 5000);
  if (r.status !== 200 || !r.body) return;
  const pages = [];
  const seen = new Set();
  for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pages.push(m[1]);
    if (pages.length >= 3) break;
  }
  await Promise.all(pages.map(async (p) => {
    const pr = await reqRaw('https://subtitlecat.com/' + p, { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 4000);
    if (pr.status !== 200 || !pr.body) return;
    for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
      let nm = m[1].split('/').pop() || '字幕';
      try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
      if (!subRelevant({ name: nm, langs: '', ext: '' }, ctx, match)) continue;
      const lang = subLangOf(nm, '');
      const fmt = (nm.match(/\.(srt|vtt|ass)$/i) || [])[1].toLowerCase();
      bag.push({ src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], fmt, lang: lang.tag, langRank: lang.rank, score: 0 });
    }
  }));
}

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
function subDurSec(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  return s > 0 ? s : 0;
}
function subDurStr(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
function subMerge(items) {
  const sorted = items.slice().sort((a, b) =>
    (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  const seenUrl = new Set();
  const seenName = new Set();
  const perTier = {};
  const out = [];
  for (const it of sorted) {
    if (out.length >= 10) break;
    if (seenUrl.has(it.url)) continue;
    const nameKey = (it.lang || '') + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '') + '|' + (subDurSec(it.dur) || 'nodur');
    if (seenName.has(nameKey)) continue;
    if ((perTier[it.tier] || 0) >= 8) continue;
    seenUrl.add(it.url);
    seenName.add(nameKey);
    perTier[it.tier] = (perTier[it.tier] || 0) + 1;
    const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
    const dur = subDurStr(it.dur);
    out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName + (dur ? '·' + dur : ''), url: it.url, format: it.fmt });
  }
  return out;
}

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

async function subSearchAll(durl) {
  // 别名（2026-11-07）：detail 预热以详情 URL 为 key，play 以播放地址
  // 来查时复用同一趟搜索（不另起一趟）；结果同时记到播放地址名下
  const alias = subAlias.get(durl);
  if (alias && alias !== durl) {
    const subs = await subSearchAll(alias).catch(() => []);
    if (subs && subs.length) {
      subResultCache.set(durl, { ts: Date.now(), subs });
      if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
    }
    return subs || [];
  }
  const hit = subResultCache.get(durl);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(durl)) return subInflight.get(durl);
  const p = (async () => {
    const ctx = subCtx(durl);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(durl, ctx);
      const bag = [];
      const ocache = new Map();
      const jobs = [
        subSlotOracle(subKeysX(ctx), '迅雷', 0, ctx, match, ocache, bag),
        subSlotOracle(subKeysXL(ctx), '迅雷看看', 1, ctx, match, ocache, bag),
        subFromSubtitleCat(ctx, match, bag),
      ].map((jp) => Promise.resolve(jp).catch(() => {}));
      const all = Promise.allSettled(jobs);
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
      await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
      subs = subMerge(bag);
      if (subs.length) {
        subResultCache.set(durl, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(durl, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(durl, p);
  try { return await p; } finally { subInflight.delete(durl); }
}

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}


// ---------- m3u8 本地代理（修复分片伪装成图片导致的“视频加载失败”） ----------
// 病因（2026-11-07 实证，huntb-277-rm）：master/variant 清单本身 200 正常，
// 但 1440 个分片全是 tiktokcdn 的 .image 地址 + image/png 类型，且每片
// 前 70 字节是 1×1 PNG 头、之后才是 100% 同步的真 TS 体。严格 HLS 内核
// 按分片扩展名白名单拒收，播放器转圈后报“视频加载失败”（与 MissAV
// SQTE-727 的 .jpeg 伪装同类病因）。实测分片 URL 尾加 &x=.ts 后 CDN 仍
// 回 200 且字节完全相同（签名不校验多余参数），故沿用 missav_xptv.js
// 的 /proxy/m3u8 先例：detail 的播放地址改为本地代理地址，代理实时拉
// 清单并改写——主清单的 variant 行改指回代理，媒体清单的分片行改成 CDN
// 绝对地址 + &x=.ts 后缀（分片仍直连 CDN，不经代理）；代理拉取失败时
// 302 回源清单，不比旧行为更差。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) { return ''; }
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 missav_xptv 先例）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

async function fetchPlaylistText(url, referer) {
  try {
    const { data, status } = await req.get(url, {
      headers: H(referer),
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    if (status >= 200 && status < 300 && data) return String(data);
  } catch (e) { /* 落空走 302 降级 */ }
  return '';
}

// 改写清单正文：selfBase 为代理自身地址（由进来的请求 Host 拼出，
// 清单正文里必须是真实 http 地址，不能嵌 js2p）。
// - 主清单（含 EXT-X-STREAM-INF）：variant 行 -> 指回代理；
// - 媒体清单：分片行 -> CDN 绝对地址 + &x=.ts 后缀（已有查询串用 &，
//   否则用 ?；tiktokcdn 签名不校验多余参数，实测字节不变）；
// - # 行 URI="..." 属性 absolutize（本站无密钥，仅兜底）。
function rewriteHornyjavM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = raw.includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try { return `URI="${new URL(uri, playlistUrl).toString()}"`; } catch (e) { return all; }
        });
      }
      return line;
    }
    let abs;
    try { abs = new URL(s, playlistUrl).toString(); } catch (e) { return line; }
    if (isMaster) {
      return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
    }
    return abs + (abs.includes('?') ? '&' : '?') + 'x=.ts';
  });
  return out.join('\n');
}

// GET /proxy/m3u8?u={b64url 清单地址}&r={b64url referer}
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  if (!q.u) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(q.u);
    if (q.r) referer = unb64url(q.r) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  const raw = await fetchPlaylistText(target, referer);
  if (!raw || !raw.includes('#EXTM3U')) { reply.redirect(target); return; }
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  reply.header('Content-Type', 'application/vnd.apple.mpegurl');
  reply.header('Cache-Control', 'no-cache');
  reply.send(rewriteHornyjavM3u8(raw, target, selfBase, referer));
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
      // m3u8 代理 (GET)：播放时实时改写清单的分片后缀（见文件尾代理段注释）
      fastify.get('/proxy/m3u8', m3u8Proxy);
    },
  };
}
