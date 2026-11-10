// AV01 (https://www.av01.media/cn) -> CatPawOpen spider
// React SPA + JSON API。分类：最新/热门 + 标签（子分类）。
// 播放：master.m3u8 解析多档（360p/720p/1080p），按档位出线，有几档出几档。
// 封面：须带 geo token（30 分钟有效、绑 IP），列表/详情时先取新鲜 token 拼进 URL；
// 播放（master.m3u8）不需要 token。
import req from '../../util/req.js';

const KEY = 'py_av01';
const NAME = 'AV01';
const HOST = 'https://www.av01.media';
const API = 'https://www.av01.media/api/v1';
const GEO_URL = 'https://files.iw01.xyz/edge/geo.js?json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
].concat(HOT_TAGS);

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

// ---- geo token（封面用，30 分钟有效、绑 IP）----
let _token = '';
let _tokenAt = 0;

async function getToken() {
  const now = Date.now();
  if (_token && now - _tokenAt < 20 * 60 * 1000) return _token;
  const d = await getJson(GEO_URL);
  const tk = d && d.access_token ? String(d.access_token) : '';
  if (tk) { _token = tk; _tokenAt = now; }
  return _token;
}

function coverUrl(id) {
  const base = 'https://static.av01.tv/media/videos/tmb/' + id + '/1.jpg/format=webp/wlv=800';
  return _token ? base + '?access_token=' + encodeURIComponent(_token) : base;
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

/** 解析 master.m3u8 的 #EXT-X-STREAM-INF，按 RESOLUTION 分档 */
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
    out.push({ h: h, label: h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h + 'p', url: resolveUrl(u, baseUrl) });
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

async function init() {
  return {};
}

async function home() {
  const dyn = await fetchTagClasses();
  const cls = [{ type_id: 'latest', type_name: '最新' }, { type_id: 'hottest', type_name: '热门' }]
    .concat(dyn || HOT_TAGS);
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
  await getToken();
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
  await getToken();
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
    vars.sort(function (a, b) { return b.h - a.h; });
    for (const x of vars) eps.push(x.label + '$' + x.url);
  } else {
    // master 取不到或无档位：仍给一条自动线（设备侧可能通）
    eps.push('自动$' + masterUrl);
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
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/cn' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  await getToken();
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
