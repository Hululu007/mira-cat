// AV01 (https://www.av01.media/cn) -> CatPawOpen spider
// React SPA + JSON API。分类：最新/热门 + 标签（子分类）。
// 播放：master.m3u8 解析多档（360p/720p/1080p），按档位出线，有几档出几档。
// 封面：须带 geo token（30 分钟有效、绑 IP），列表/详情时先取新鲜 token 拼进 URL；
// 播放关键（2026-11-11 修，旧版全线播不了的根因）：
//   分片在 customers.iw01.xyz 上，裸 URL 直接 403 "RBAC: access denied"，
//   必须先调 GET /api/v1/videos/{id}/cdn-access?token_v2&expires&ip（geo.js 给的参数，
//   注意：不要加 comp=true，加了会 403 "This video is not available"）换 CDN access_token（JWT，
//   1 小时有效、绑 IP、is_hot 决定 1080p 上限），再把每个变体 URL 改写成
//   /api/v1/videos/{id}/manifest/{变体}?access_token=<token>，
//   这样变体清单里每条分片才带签名、播放器才能拉到片。这是官网原生 HLS（iOS/Safari）
//   走的同一条路（官网 JS 的 W5 函数），不是编出来的。
//   token 绑 IP：蜘蛛（req）和播放器同机同 IP，所以设备上能过；
//   VM 侧出口 IP 随目标站变，签名的分片在 VM 侧会报 IP Validation Failed，属环境假象。
//   1080p 只在 is_hot=true 时给，否则上限 720p（与官网 W5 一致）；全被滤掉时补回最低档。
import req from '../../util/req.js';

const KEY = 'py_av01';
const NAME = 'AV01';
const HOST = 'https://www.av01.media';
const API = 'https://www.av01.media/api/v1';
const GEO_URL = 'https://files.iw01.xyz/edge/geo.js?json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 热门后新增的固定分类（站内无“无码流出/无码破解/大屁股”原名，以下是实测有内容的最近似真分类）：
//   流出（tag:1453929，976 部）≈ 无码流出；LADA破解无码（tag:3583787，2621 部）≈ 无码破解；
//   無修正（tag:3583805，1292 部）；巨尻（tag:107，6189 部）≈ 大屁股。
const NEW_TAGS = [
  { type_id: 'tag:1453929', type_name: '流出' },
  { type_id: 'tag:3583787', type_name: 'LADA破解无码' },
  { type_id: 'tag:3583805', type_name: '無修正' },
  { type_id: 'tag:107', type_name: '巨尻' },
];

// 热门标签（前 15，实测含中文名与 id）
const HOT_TAGS = [
  { type_id: 'tag:314590', type_name: 'HD高画质' },
  { type_id: 'tag:1', type_name: '中出内射' },
  { type_id: 'tag:314849', type_name: '独占配信' },
  { type_id: 'tag:5', type_name: '专属女优作品' },
  { type_id: 'tag:2', type_name: '巨乳' },
  { type_id: 'tag:424', type_name: '素人' },
  { type_id: 'tag:3', type_name: '人妻主妇' },
  { type_id: 'tag:527309', type_name: '4K' },
  { type_id: 'tag:314685', type_name: '情色自拍' },
  { type_id: 'tag:166', type_name: '口交吹萧' },
  { type_id: 'tag:94', type_name: '美少女' },
  { type_id: 'tag:599', type_name: '熟女' },
  { type_id: 'tag:59', type_name: '苗条' },
  { type_id: 'tag:60', type_name: '美乳' },
  { type_id: 'tag:26', type_name: '痴女' },
];

const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'hottest', type_name: '热门' },
  // LTX超清解码（2026-11-14，用户点名加在热门后）：站内真标签
  // LTXモザイク破壊（id 3585301，中文名 LTX超清解码），13 部，番号带 -ltx
  // 后缀（decensor_family ltx，去码版），走现成的 tag: 列表路。
  { type_id: 'tag:3585301', type_name: 'LTX超清解码' },
].concat(NEW_TAGS).concat(HOT_TAGS);

function t(v) {
  return String(v == null ? '' : v).trim();
}

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/cn',
  };
}

function pad2(n) {
  n = parseInt(n, 10) || 0;
  return n < 10 ? '0' + n : '' + n;
}

/** 秒 -> H:MM:SS 或 M:SS */
function fmtDur(sec) {
  sec = parseInt(sec, 10) || 0;
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return h + ':' + pad2(m) + ':' + pad2(s);
  return m + ':' + pad2(s);
}

function parseJson(data) {
  if (!data) return null;
  if (typeof data === 'object') return data;
  try { return JSON.parse(String(data)); } catch (e) { return null; }
}

async function getJson(url) {
  const h = headers();
  try {
    const { data } = await req.get(url, { headers: h, timeout: 20000 });
    const d = parseJson(data);
    if (d) return d;
  } catch (e) {}
  try {
    if (typeof fetch === 'undefined') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { headers: h, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function postJson(url, body) {
  const h = headers();
  h['Content-Type'] = 'application/json';
  const payload = JSON.stringify(body);
  try {
    const { data } = await req.post(url, payload, { headers: h, timeout: 20000 });
    const d = parseJson(data);
    if (d) return d;
  } catch (e) {}
  try {
    if (typeof fetch === 'undefined') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { method: 'POST', headers: h, body: payload, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function getText(url) {
  const h = headers();
  try {
    const { data } = await req.get(url, { headers: h, timeout: 20000 });
    return String(data || '');
  } catch (e) {}
  try {
    if (typeof fetch === 'undefined') return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { headers: h, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return '';
    return await r.text();
  } catch (e) { return ''; }
}

// ---- geo 数据（封面 token + cdn-access 参数，ttl 600 秒，缓存 9 分钟）----
let _geo = null;
let _geoAt = 0;

async function getGeo(force) {
  const now = Date.now();
  if (!force && _geo && now - _geoAt < 9 * 60 * 1000) return _geo;
  const d = await getJson(GEO_URL);
  if (d && d.token_v2 && d.expires && d.ip) {
    _geo = d;
    _geoAt = now;
    return _geo;
  }
  return _geo;
}

function coverUrl(id) {
  const base = 'https://static.av01.tv/media/videos/tmb/' + id + '/1.jpg/format=webp/wlv=800';
  const tk = _geo && _geo.access_token ? String(_geo.access_token) : '';
  return tk ? base + '?access_token=' + encodeURIComponent(tk) : base;
}

// ---- CDN access token（播放用，JWT，1 小时有效、绑 IP）----
let _cdnCache = {};

function b64urlDecode(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  if (typeof Buffer !== 'undefined') {
    try { return Buffer.from(s, 'base64').toString('utf8'); } catch (e) {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  s = s.replace(/=+$/, '');
  while (i < s.length) {
    const a = chars.indexOf(s.charAt(i++));
    const b = chars.indexOf(s.charAt(i++));
    const c = chars.indexOf(s.charAt(i++));
    const d = chars.indexOf(s.charAt(i++));
    if (a < 0 || b < 0) break;
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

/** 读 CDN token 的 is_hot（决定 1080p 上限），读不出默认 false（上限 720p） */
function jwtIsHot(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return false;
    const obj = JSON.parse(b64urlDecode(parts[1]));
    return !!(obj && obj.is_hot);
  } catch (e) { return false; }
}

function jwtExp(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return 0;
    const obj = JSON.parse(b64urlDecode(parts[1]));
    return (obj && parseInt(obj.exp, 10)) || 0;
  } catch (e) { return 0; }
}

async function getCdnToken(vid) {
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = _cdnCache[vid];
  if (cached && cached.expiresAt && nowSec < cached.expiresAt - 60) return cached;
  for (let attempt = 0; attempt < 2; attempt++) {
    const geo = await getGeo(attempt > 0);
    if (!geo) break;
    const q = 'token_v2=' + encodeURIComponent(String(geo.token_v2))
      + '&expires=' + encodeURIComponent(String(geo.expires))
      + '&ip=' + encodeURIComponent(String(geo.ip));
    // 注意：不要加 comp=true，实测加了会 403 "This video is not available"
    const d = await getJson(API + '/videos/' + vid + '/cdn-access?' + q);
    const tk = d && d.access_token ? String(d.access_token) : '';
    if (tk) {
      const ent = {
        token: tk,
        isHot: jwtIsHot(tk),
        expiresAt: (d.expires_at ? parseInt(d.expires_at, 10) : 0) || jwtExp(tk) || (nowSec + 3600),
      };
      _cdnCache[vid] = ent;
      return ent;
    }
  }
  return null;
}

// ---- 动态标签（home 时拉标签榜补到 30 个分类，失败用静态）----
let _tagsCache = null;

async function fetchTagClasses() {
  if (_tagsCache) return _tagsCache;
  try {
    const d = await getJson(API + '/tags/by-video-count?page=1&limit=30');
    const tags = (d && d.tags) || [];
    if (tags.length > HOT_TAGS.length) {
      const seen = new Set();
      const dyn = [];
      for (const tg of tags) {
        const id = String(tg.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const nm = t((tg.name_translations && tg.name_translations.cn) || tg.name || '');
        if (!nm) continue;
        dyn.push({ type_id: 'tag:' + id, type_name: nm });
        if (dyn.length >= 28) break;
      }
      if (dyn.length > HOT_TAGS.length) _tagsCache = dyn;
    }
  } catch (e) {}
  return _tagsCache;
}

function toCard(v) {
  const id = String(v && v.id != null ? v.id : '');
  if (!id) return null;
  const title = t((v.title_translations && v.title_translations.cn) || v.title || v.dvd_id || id);
  const dur = fmtDur(v.duration);
  return {
    vod_id: id,
    vod_name: title,
    vod_pic: coverUrl(id),
    vod_remarks: dur || (v.dvd_id ? String(v.dvd_id) : ''),
  };
}

/** 解析 master.m3u8 的 #EXT-X-STREAM-INF，按 RESOLUTION 分档；同时保留变体原始 URI（供签名改写） */
function parseMaster(text, baseUrl) {
  const out = [];
  if (!text) return out;
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
    if (!rm) continue;
    const h = parseInt(rm[2], 10) || 0;
    let u = '';
    for (let j = i + 1; j < lines.length; j++) {
      const s = t(lines[j]);
      if (!s) continue;
      if (s.charAt(0) === '#') continue;
      u = s;
      break;
    }
    if (!u) continue;
    out.push({
      h: h,
      label: h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h + 'p',
      raw: u,
      url: resolveUrl(u, baseUrl),
    });
  }
  const seen = new Set();
  return out.filter(function (x) {
    if (seen.has(x.label)) return false;
    seen.add(x.label);
    return true;
  });
}

function resolveUrl(u, base) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  const b = String(base || '');
  if (u.charAt(0) === '/') {
    const m = b.match(/^(https?:\/\/[^\/]+)/i);
    return (m ? m[1] : '') + u;
  }
  const idx = b.lastIndexOf('/');
  const dir = idx >= 0 ? b.slice(0, idx + 1) : b + '/';
  return dir + u;
}

/** 官网 W5 同款改写：变体 URL 走 API 并带 CDN token（保留原有 ?ro=0 这类参数，用 & 拼接） */
function signVariantUrl(vid, rawUri, cdnToken) {
  const file = String(rawUri || '').split('/').pop();
  const sep = file.indexOf('?') >= 0 ? '&' : '?';
  return API + '/videos/' + vid + '/manifest/' + file + sep + 'access_token=' + encodeURIComponent(cdnToken);
}

async function init() {
  return {};
}

async function home() {
  const dyn = await fetchTagClasses();
  const tags = dyn || HOT_TAGS;
  const fixedIds = {};
  for (const x of NEW_TAGS) fixedIds[x.type_id] = 1;
  const rest = [];
  for (const x of tags) {
    if (!fixedIds[x.type_id]) rest.push(x);
  }
  const cls = [{ type_id: 'latest', type_name: '最新' }, { type_id: 'hottest', type_name: '热门' }]
    .concat(NEW_TAGS).concat(rest);
  return { class: cls, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const limit = 20;
  let url = '';
  if (id === 'latest') url = API + '/videos/types/latest?page=' + page + '&limit=' + limit;
  else if (id === 'hottest') url = API + '/videos/types/hottest?page=' + page + '&limit=' + limit;
  else if (id.indexOf('tag:') === 0) url = API + '/videos/tag/' + encodeURIComponent(id.slice(4)) + '?page=' + page + '&limit=' + limit;
  else url = API + '/videos/types/latest?page=' + page + '&limit=' + limit;
  await getGeo(false);
  const d = await getJson(url);
  const videos = (d && d.videos) || [];
  const list = [];
  for (const v of videos) {
    const c = toCard(v);
    if (c) list.push(c);
  }
  const pg = (d && d.pagination) || {};
  const totalPages = parseInt(pg.totalPages, 10) || 999;
  const total = parseInt(pg.total, 10) || totalPages * limit;
  return {
    page,
    pagecount: totalPages,
    limit: list.length || limit,
    total,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let vid = String(raw || '');
  const m = vid.match(/(\d{4,})/);
  if (m) vid = m[1];
  vid = vid.replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };
  await getGeo(false);
  const v = await getJson(API + '/videos/' + vid);
  const name = v ? t((v.title_translations && v.title_translations.cn) || v.title || v.dvd_id || vid) : vid;
  const dur = v ? fmtDur(v.duration) : '';
  let content = '';
  if (v) {
    content = t((v.description_translations && v.description_translations.cn) || v.description || '');
  }
  const masterUrl = API + '/videos/' + vid + '/manifest/master.m3u8';
  const masterText = await getText(masterUrl);
  const vars = parseMaster(masterText, masterUrl);
  const eps = [];
  if (vars.length) {
    // 取 CDN token（失败则回落裸地址，保证详情仍出线）
    const cdn = await getCdnToken(vid);
    const maxH = (cdn && cdn.isHot) ? 1080 : 720;
    let kept = [];
    for (const x of vars) {
      if (x.h <= maxH) kept.push(x);
    }
    if (!kept.length) {
      // 全被上限滤掉时补回最低档（与官网 W5 一致）
      const sorted = vars.slice().sort(function (a, b) { return a.h - b.h; });
      kept = [sorted[0]];
    }
    kept.sort(function (a, b) { return b.h - a.h; });
    for (const x of kept) {
      const u = (cdn && cdn.token) ? signVariantUrl(vid, x.raw, cdn.token) : x.url;
      eps.push(x.label + '$' + u);
    }
  } else {
    // master 取不到或无档位：仍给一条自动线（设备侧可能通）
    eps.push('自动$' + masterUrl);
  }
  // 字幕：按每条播放地址登记“中文名 + 番号”，后台串行预热（不 await）
  // 注意：只有片名含可抽番号才预热——播放地址含 av01.media 域名，core 的 URL 兜底
  // 会从域名抽出 "AV01" 当番号，误挂无关字幕（实测无番号片挂上 MTES-069 字幕）
  const subTitle = (name + ' ' + (v && v.dvd_id ? String(v.dvd_id) : '')).trim();
  const subUrls = eps.map(function (e) { return e.split('$').pop(); }).filter(Boolean);
  for (const u of subUrls) subCacheName(u, subTitle);
  if (subUrls.length && subExtractCode(subTitle)) {
    (async () => {
      for (const u of subUrls) {
        try { await subSearchAll(u); } catch (e) {}
      }
    })().catch(() => {});
  }
  return {
    list: [{
      vod_id: vid,
      vod_name: name,
      vod_pic: coverUrl(vid),
      vod_remarks: dur,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  // 字幕：detail 预热过则命中缓存/在途；无命中不带 subs 键
  // 只有登记片名含可抽番号才查字幕（见 detail 处注释：播放地址的 av01.media
  // 域名会被 core 的 URL 兜底抽成 "AV01" 假番号，误挂无关字幕）
  const regTitle = subNameCache.get(url) || '';
  const subs = subExtractCode(regTitle) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/cn' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  await getGeo(false);
  const d = await postJson(API + '/videos/search?lang=cn', { query: wd, page: page, limit: 20 });
  const videos = (d && d.videos) || [];
  const list = [];
  for (const v of videos) {
    const c = toCard(v);
    if (c) list.push(c);
  }
  const pg = (d && d.pagination) || {};
  const totalPages = parseInt(pg.totalPages, 10) || 999;
  const total = parseInt(pg.total, 10) || totalPages * 20;
  return {
    page,
    pagecount: totalPages,
    limit: list.length || 20,
    total,
    list,
  };
}

// ---------- 字幕聚合 companion helpers（core 本身不含，见 /tmp/sp_py_javtiful.js） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
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
