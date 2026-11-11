// Px8x (https://8xx6.lol) -> CatPawOpen spider
// 全站文字 base64 混淆: document.write(d('...')), d() 即 atob; 解码后去掉 display:none 噪音 span
// 列表 /list/{id}-N.html, 详情 /video/{id}.html, 播放走详情页 hls.loadSource 里的
// https://m.892539.xyz/play.php?site_id={n}&source_id={id} (site_id 不固定, 12/13 都见过, 必须从详情页现取, 不能写死)
// 封面明文直链, 无 Referer 门禁; 清单 METHOD=NONE (本批唯一不加密), 单档不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_px8x';
const NAME = 'Px8x';
const HOST = 'https://8xx6.lol';
const PLAY_HOST = 'https://m.892539.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 首页最新 + 顶级 8 个 + 额外 7 个 distinct 视频列表
// 注意: 891200/901200/911200/921200 四个 "*200" 列表实测是种子(/torrent/)页、不是视频, 已排除, 不进蜘蛛
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '901179', type_name: '国产' },
  { type_id: '911179', type_name: '有码' },
  { type_id: '921179', type_name: '无码' },
  { type_id: '931179', type_name: '欧美' },
  { type_id: '941179', type_name: '传媒' },
  { type_id: '951179', type_name: '探花' },
  { type_id: '961179', type_name: '中文' },
  { type_id: '971179', type_name: '动漫' },
  { type_id: '891319', type_name: '日韩无码' },
  { type_id: '901339', type_name: '日本无码' },
  { type_id: '901309', type_name: '欧美极品' },
  { type_id: '901169', type_name: '国产专区' },
  { type_id: '911169', type_name: '日本有码' },
  { type_id: '921169', type_name: '日本无码2' },
  { type_id: '931169', type_name: '欧美情色' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    const s = String(data || '');
    if (s) return s;
  } catch (e) {
    // fall through to fetch fallback
  }
  try {
    if (typeof fetch !== 'undefined') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
      return await r.text();
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

/** base64 解码 (站方 d() = atob + escape/decodeURIComponent, 等价于按 UTF-8 解码) */
function b64decode(s) {
  try {
    return Buffer.from(String(s || ''), 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

/**
 * 还原混淆页面: 把 document.write(d('...')) 替换成解码后的 HTML,
 * 再去掉解码后插在文字中间的 display:none 噪音 span
 */
function decodePage(html) {
  if (!html) return '';
  let out = html.replace(/document\.write\(d\((['"])([A-Za-z0-9+/=]+)\1\)\)/g, (m, q, b) => b64decode(b));
  out = out.replace(/<span[^>]*display\s*:\s*none[^>]*>.*?<\/span>/gi, '');
  return out;
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    return HOST + '/';
  }
  return HOST + '/list/' + cat + '-' + page + '.html';
}

/** 解析列表/搜索页: 封面取缩略图锚点里的 img, 标题取标题锚点里的 <script> 文本, 按 id 合并去重 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const decoded = decodePage(html);

  // 封面: <a href="/video/{id}.html"><img ... src="封面">
  const covers = {};
  const order = [];
  const coverRe = /<a href="\/video\/(\d+)\.html">\s*<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = coverRe.exec(decoded)) !== null) {
    const id = m[1];
    if (!covers[id]) {
      covers[id] = absUrl(m[2]);
      order.push(id);
    }
  }

  // 标题: <a ... href="/video/{id}.html"><script>标题;</script></a>
  const titles = {};
  const titleRe = /<a[^>]*href="\/video\/(\d+)\.html"[^>]*>\s*<script[^>]*>([^<]+?);?\s*<\/script>/gi;
  while ((m = titleRe.exec(decoded)) !== null) {
    const id = m[1];
    if (!titles[id]) titles[id] = decodeHtml(m[2]);
  }

  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const title = titles[id] || '';
    out.push({
      vod_id: id,
      vod_name: title || ('视频 ' + id),
      vod_pic: covers[id] || '',
      vod_remarks: '',
    });
  }
  return out;
}

/** 详情页标题: 优先取 document.title = d('...') 解码; 兜底取 h1 文本 */
function extractTitle(rawHtml, decodedHtml, fallback) {
  let m = rawHtml.match(/document\.title\s*=\s*d\((['"])([A-Za-z0-9+/=]+)\1\)/);
  if (m) {
    const s = t(b64decode(m[2]));
    if (s) return decodeHtml(s);
  }
  m = decodedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) {
    const s = t(m[1].replace(/<[^>]+>/g, '').replace(/;\s*$/, ''));
    if (s) return decodeHtml(s);
  }
  m = decodedHtml.match(/<title>([^<]*)<\/title>/i);
  if (m && t(m[1])) return decodeHtml(m[1]);
  return fallback || '';
}

/** 详情页播放地址: 优先取 hls.loadSource 里的完整地址, 兜底按 site_id/source_id 拼 */
function extractPlayUrl(decodedHtml) {
  let m = decodedHtml.match(/hls\.loadSource\(['"]([^'"]+play\.php[^'"]*)['"]\)/i);
  if (m) return t(m[1]);
  m = decodedHtml.match(/play\.php\?site_id=(\d+)&(?:amp;)?source_id=(\d+)/i);
  if (m) return PLAY_HOST + '/play.php?site_id=' + m[1] + '&source_id=' + m[2];
  return '';
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'home');
  // 首页只有一页
  if ((id === 'home' || id === '') && page > 1) {
    return { page, pagecount: 1, limit: 0, total: 0, list: [] };
  }
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: id === 'home' || id === '' ? 1 : 999,
    limit: list.length || 20,
    total: (id === 'home' || id === '') ? list.length : 999 * 20,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/video\/(\d+)/)?.[1] || String(raw || '').replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };

  const pageUrl = HOST + '/video/' + vid + '.html';
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };
  const decoded = decodePage(html);

  const name = extractTitle(html, decoded, vid);
  const playUrl = extractPlayUrl(decoded);
  // 详情页无本片封面 (只有相关视频缩略图), vod_pic 留空, App 沿用列表封面
  const eps = playUrl ? ['播放$' + playUrl] : [];
  if (playUrl) {
    // 字幕：按播放地址 + vid 登记片名，后台预热（不 await）
    subCacheName(playUrl, name || vid);
    subCacheName(vid, name || vid);
    subWarm(playUrl);
  }

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: '',
      vod_content: '',
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  // 字幕：detail 预热过则命中缓存/在途；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search.php?content=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
    list,
  };
}

// ---------- 字幕聚合 companion helpers（core 本身不含，抄自 javtiful 接线） ----------
// clean：去标签/空白（core 的 subSlugTitle 要用）；
// reqRaw：框架 req，2xx 才给正文，永不抛错（core 的 oracle / SubtitleCat 要用）。
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

// ===== BEGIN subcore.js（2026-11-02 定版，逐字粘贴，勿改） =====
// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

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

function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

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

function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

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

function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

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

const subInflight = new Map();

async function subSearchAll(durl) {
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

function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}
// ===== END subcore.js =====
export default function spider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
