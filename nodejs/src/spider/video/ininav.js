// 硬硬AV (ininAV) — https://ininav.com
// Drupal 站：列表 .video-thumbnail-container 卡片，视频 /video/{slug|id}，
// 详情页 window.m3u8List（多集）或 JSON-LD contentUrl（单集）给直链 m3u8。
// m3u8 为单档位媒体播单（无多清晰度，不编造档位）；ininav 的播单为 AES-128
// 加密（KEY URI 在播单内，播放器按 HLS 规范自行取 key 解密）。
// 分类：8 大内容类 + 中文字幕；每类以“排序”筛选卡片呈现（不平铺）。
// 無碼流出（uncensored-leak）为 LTX 九档中的一档，已列为顶级分类。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_ininav';
const NAME = '硬硬AV';
const HOST = 'https://ininav.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 顶级分类（站方导航实测，2026-11-28）
const CLASSES = [
  { type_id: 'ai', type_name: 'AI短劇' },
  { type_id: 'asian', type_name: '亞洲國產' },
  { type_id: 'japanese', type_name: '日本' },
  { type_id: 'uncensored-leak', type_name: '無碼流出' },
  { type_id: 'fc2', type_name: 'FC2素人' },
  { type_id: 'hentai', type_name: '動漫裡番' },
  { type_id: 'korean', type_name: '韓國' },
  { type_id: 'western', type_name: '歐美' },
  { type_id: 'chinese-subtitles', type_name: '中文字幕' },
];

// 每类 7 档排序（站方每类皆有 hot/monthly-hot/new/release/today-hot/weekly-hot/yearly-hot）
const SORTS = [
  { n: '最近更新', v: 'new' },
  { n: '最新發行', v: 'release' },
  { n: '今日熱門', v: 'today-hot' },
  { n: '本週熱門', v: 'weekly-hot' },
  { n: '本月熱門', v: 'monthly-hot' },
  { n: '年度熱門', v: 'yearly-hot' },
  { n: '總觀看數', v: 'hot' },
];

function buildFilters() {
  const f = {};
  for (const c of CLASSES) {
    if (c.type_id === 'chinese-subtitles') continue;
    f[c.type_id] = [{
      key: 'sort', name: '排序',
      value: SORTS.map((s) => ({ n: s.n, v: c.type_id + '/' + s.v })),
    }];
  }
  return f;
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const b = base || HOST;
  return b + (u.startsWith('/') ? u : '/' + u);
}

async function fetchHtml(path) {
  const url = /^https?:\/\//i.test(path) ? path : HOST + (String(path || '').startsWith('/') ? String(path || '') : '/' + String(path || ''));
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'zh-Hant,zh;q=0.9' },
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    if (r.status !== 200) return '';
    const t = typeof r.data === 'string' ? r.data : '';
    if (!t || t.length < 1000) return '';
    return t;
  } catch (e) {
    return '';
  }
}

// 列表解析：.video-thumbnail-container 卡片。封面取 img src（.webp），
// 标题取 .videotitle a 文本（无则取 img alt），备注取观看数。
function parseCards(html) {
  const cards = [];
  if (!html) return cards;
  const $ = cheerio.load(html);
  const seen = new Set();
  $('.video-thumbnail-container').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a[href^="/video/"]').first();
    const href = (a.attr('href') || '').trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    const img = $el.find('img').first();
    const cover = absUrl(img.attr('src') || img.attr('data-src') || '');
    const cell = $el.parent();
    const title = cleanText(cell.find('.videotitle a').first().text()) || cleanText(img.attr('alt'));
    if (!title) return;
    const views = cleanText($el.find('.video-badge').text());
    cards.push({
      vod_id: absUrl(href),
      vod_name: title,
      vod_pic: cover,
      vod_remarks: views,
    });
  });
  return cards;
}

// Drupal ?page 为 0 起：?page=0 第一页，?page=1 第二页。
// 取页内最大 ?page=N，页数 = N+1。
function parsePagecount(html, curPage) {
  let max = curPage - 1;
  if (html) {
    const re = /[?&]page=(\d+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function pageSuffix(page) {
  return page > 1 ? ('?page=' + (page - 1)) : '';
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: buildFilters() };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.id || 'japanese').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  // 筛选卡片值即完整路径（如 japanese/hot）；未选默认该类 new。
  let eff = tid;
  const sort = String(extend.sort || '').trim();
  if (sort && /^[a-z0-9-]+\/(new|release|today-hot|weekly-hot|monthly-hot|yearly-hot|hot)$/.test(sort)) {
    eff = sort;
  } else if (tid !== 'chinese-subtitles') {
    eff = tid + '/new';
  }
  const path = '/' + eff.replace(/^\/+/, '') + pageSuffix(page);
  const html = await fetchHtml(path);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 12, total: pagecount * 12, list };
}

// 从详情页取 m3u8：优先 window.m3u8List（多集全量），回落 JSON-LD contentUrl。
function extractM3u8(html) {
  const out = [];
  if (!html) return out;
  const m = html.match(/window\.m3u8List\s*=\s*\[([\s\S]{0,4000}?)\]/);
  if (m) {
    for (const u of m[1].matchAll(/"([^"]+\.m3u8[^"]*)"/g)) {
      const url = u[1].trim();
      if (url && !out.includes(url)) out.push(url);
    }
  }
  if (!out.length) {
    const j = html.match(/"contentUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
    if (j) out.push(j[1].trim());
  }
  if (!out.length) {
    for (const u of html.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g)) {
      const url = u[0].trim();
      if (url && !out.includes(url)) out.push(url);
    }
  }
  return out;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (!id) return { list: [] };
  const durl = absUrl(id);
  const html = await fetchHtml(durl);
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  const name = cleanText($('h1.vdtitle').first().text()) || cleanText($('title').text()) || durl;
  let cover = '';
  const jm = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
  if (jm) cover = jm[1];
  if (!cover) cover = absUrl($('meta[property="og:image"]').attr('content') || '');
  let content = '';
  const dm = html.match(/"description"\s*:\s*"([^"]{0,500})"/);
  if (dm) content = dm[1];
  if (!content) content = cleanText($('meta[property="og:description"]').attr('content'));
  const urls = extractM3u8(html);
  const eps = [];
  urls.forEach((u, i) => {
    const label = urls.length > 1 ? ('第' + (i + 1) + '集') : '正片';
    eps.push(label + '$' + durl + '@@' + u);
  });
  const vod = {
    vod_id: durl,
    vod_name: name,
    vod_pic: cover,
    vod_content: content,
    vod_play_from: NAME,
    vod_play_url: eps.join('#'),
  };
  const subUrls = urls.slice();
  for (const u of subUrls) subCacheName(u, name);
  if (subUrls.length && subExtractCode(name)) {
    (async () => {
      for (const u of subUrls) {
        try { await subSearchAll(u); } catch (e) {}
      }
    })().catch(() => {});
  }
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let url = id;
  const at = id.indexOf('@@');
  if (at >= 0) {
    durl = id.slice(0, at);
    url = id.slice(at + 2);
  }
  if (!url) return { parse: 0, url: '' };
  const regTitle = subNameCache.get(url) || '';
  const subs = subExtractCode(regTitle) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: {
      'User-Agent': UA,
      'Referer': durl || HOST + '/',
    },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 12, total: 0, list: [] };
  let path = '/search?fulltext=' + encodeURIComponent(wd);
  if (page > 1) path += '&page=' + (page - 1);
  const html = await fetchHtml(path);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 12, total: pagecount * 12, list };
}

// ---------- 共享字幕芯（与 av01/av123 等蜘蛛同款自包含块：
//   迅雷 > 迅雷看看 > SubtitleCat；只挂有番号条目；全局上限 10、单槽 8；
//   总预算 6s、失败静默；无结果不带 subs 键）----------
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
