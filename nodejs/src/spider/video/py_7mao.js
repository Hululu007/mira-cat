import req from '../../util/req.js';

// 七猫短剧 https://7maoduanju.com —— Next.js 站（2026-11-26 重写）
// 旧版用 /api/toc/v1（JSON API），2026-11-26 实测该路径已 404（站方改版，
// /api/toc、/api/toc/v2、/api/drama/list 等均 404）。新版改解析站方 HTML：
//   列表：首页 HTML 的 RSC payload 内嵌 182 部剧（id/title/coverUrl/
//     episodeCount），直接解析，不走 API。
//   详情：/drama/<id>/ HTML 内嵌 m3u8（7cat-media.bedfpk.cn/7cat/<key>/
//     hls/epNN/epNN.m3u8）与 episodeId；mediaKey 从 m3u8/封面 URL 提，
//     全集按 epUrl(key, n) 合成。实测第 3 集（站方标“需解锁”）的 m3u8
//     也是 200 真播单，可直接播。
//   播放：m3u8 直链 parse:0；7mao-media Worker 中转优先（媒体 host 疑似
//     在用户网络侧被拦），Worker 不可用回落直链。
//   搜索：站方搜索页是空壳（结果由 JS 另取，HTML 只剩“无相关结果”），
//     改为首页 182 部剧按标题关键字过滤。
// 分类：静态 4 类（热门/最新/全部/愿望榜）；站方分类页 308 跳到异域
// （jw056.aws-yuanj.com），不跟跳，统一用首页数据分页。
const HOST = 'https://7maoduanju.com';
// 取数三腿：主站直连 → www 同源 → Worker 兜底（7mao-fetch /f/，b64url 编码目标 URL）。
const API_HOSTS = [HOST, 'https://www.7maoduanju.com'];
const FETCH_WORKER = 'https://7mao-fetch.li768435813.workers.dev';
const B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64url(s) {
  const bytes = [];
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(192 | (c >> 6), 128 | (c & 63)); }
    else if (c < 55296 || c >= 57344) { bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    else {
      i++;
      const c2 = str.charCodeAt(i);
      const cp = 65536 + (((c & 1023) << 10) | (c2 & 1023));
      bytes.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64T[b0 >> 2] + B64T[((b0 & 3) << 4) | (b1 >> 4)] + (i + 1 < bytes.length ? B64T[((b1 & 15) << 2) | (b2 >> 6)] : '=') + (i + 2 < bytes.length ? B64T[b2 & 63] : '=');
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function viaWorker(url) {
  return FETCH_WORKER.replace(/\/+$/, '') + '/f/' + b64url(url);
}
const MEDIA = 'https://7cat-media.bedfpk.cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE = 30;

const STATIC_CATS = [
  { type_id: 'rank', type_name: '🔥 热门榜' },
  { type_id: 'new', type_name: '🆕 最新上线' },
  { type_id: 'all', type_name: '📺 全部短剧' },
  { type_id: 'wish', type_name: '✨ 魔改愿望榜' },
];
const SORT_FILTER = [{ key: 'sort', name: '排序', value: [{ n: '最热', v: 'hot' }, { n: '最新', v: 'latest' }] }];

function hdr() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': HOST + '/',
  };
}

// 取 HTML：主站直连（8s）→ www 同源（8s）→ Worker 兜底（10s）。
async function fetchHtmlOnce(url, timeoutMs) {
  try {
    const r = await req.get(url, { headers: hdr(), timeout: timeoutMs || 8000, responseType: 'text', transformResponse: [(d) => d] });
    if (r && r.status === 200 && typeof r.data === 'string' && r.data.length > 1000) return r.data;
  } catch (e) { /* 下一腿 */ }
  return '';
}
async function fetchHtml(path) {
  for (const h of API_HOSTS) {
    const d = await fetchHtmlOnce(h + path, 8000);
    if (d) return d;
  }
  const w = await fetchHtmlOnce(viaWorker(HOST + path), 10000);
  if (w) return w;
  return '';
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

// 2026-11-16：约 9% 的封面 URL 含 %XX 编码中文文件名。App 侧图片加载器
// 疑似对 %XX 再编码一次（%→%25）致 404，造成“有的出有的不出”。
// 这里把 %XX 解回原文字符交 App 编码一次；解失败回原串。
function decodePic(u) {
  const s = String(u || '').trim();
  if (!s || s.indexOf('%') < 0) return s;
  try { return decodeURI(s); } catch (e) { return s; }
}

// 封面修法（与 REX 1.0.9 同款，已在 REX 侧实测能出图）：
//   ① 首页 RSC 的 coverUrl 是 /cover-compression/variants/v1/cover/<hash>
//     （720x960、122KB），设备侧拉不到（站方 S3 对该路径回 403）；
//      同图 /rank/ 路径（240x320、27KB）能出，改写过去；
//   ② 再走 weserv 缩到 400px、q75、转 JPG，封面变小加载快。
//   ③ /7cat/<key>/cover.jpg 直链不动，只包 weserv。
function fixCover(u) {
  let s = decodePic(u);
  if (!s) return '';
  s = s.replace(/\/cover-compression\/variants\/v1\/cover\//, '/cover-compression/variants/v1/rank/');
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(s) + '&w=400&q=75&output=jpg';
}

// 分类页映射（站方真有独立分类页，各 18 条/页、?page=N 翻页，
//   标题互不相同——此前 category 忽略分类 id、一律回首页列表，
//   致 4 个分类内容完全一样）：
//   rank 热门榜 -> /category/热播短剧/ ；new 最新上线 -> /category/最新上线/ ；
//   wish 魔改愿望榜 -> /category/魔改短剧/ ；all 全部短剧 -> 首页（182 部）。
const CAT_PATH = {
  rank: '/category/' + encodeURIComponent('热播短剧') + '/',
  new: '/category/' + encodeURIComponent('最新上线') + '/',
  wish: '/category/' + encodeURIComponent('魔改短剧') + '/',
};
async function catDramas(catId, page) {
  const path = CAT_PATH[catId];
  if (!path) return null;
  const html = await fetchHtml(path + '?page=' + page);
  if (!html) return [];
  return parseDramas(html);
}

// 解析 RSC payload 里的剧条目：两种结构——
//   精选横幅：{\"dramaId\":\"<uuid>\",\"title\":\"...\",\"coverUrl\":\"...\"}
//   列表项：{\"id\":\"<uuid>\",\"title\":\"...\",\"coverUrl\":\"...\",\"episodeCount\":N}
// 按 id/dramaId 定位，取 900 字符窗口，先反转义（\"→"）再用普通正则提
// title/coverUrl/episodeCount（直接在转义文本上匹配标题会把 \" 当转义
// 字符吞掉整个对象）。
function parseDramas(html) {
  const out = [];
  const seen = {};
  const h = String(html || '');
  const re = /\\"(?:id|dramaId)\\":\\"([0-9a-f-]{36})\\"/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    const id = m[1];
    if (seen[id]) continue;
    const win = h.slice(m.index, m.index + 900).replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
    const tm = win.match(/"title":"([^"]*)"/);
    const cm = win.match(/"coverUrl":"([^"]*)"/);
    if (!tm || !cm) continue;
    const em = win.match(/"episodeCount":(\d+)/);
    seen[id] = 1;
    out.push({ dramaId: id, title: tm[1], coverUrl: cm[1], episodeCount: em ? parseInt(em[1], 10) : 0 });
  }
  return out;
}

function vod(j) {
  if (!j) return null;
  const n = parseInt(j.episodeCount || 0, 10) || 0;
  return {
    vod_id: j.dramaId || j.id || '',
    vod_name: j.title || '',
    vod_pic: fixCover(j.coverUrl || ''),
    vod_remarks: n > 0 ? ('共' + n + '集') : '',
    type_name: (Array.isArray(j.tags) && j.tags.length) ? j.tags.join(' · ') : '短剧',
  };
}

function vodList(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (const j of arr) {
    if (!j || !(j.id || j.dramaId)) continue;
    const v = vod(j);
    if (v && v.vod_id) out.push(v);
  }
  return out;
}

function pageOf(arr, page) {
  const list = Array.isArray(arr) ? arr : [];
  const start = (page - 1) * PAGE;
  const slice = list.slice(start, start + PAGE);
  const pagecount = Math.max(1, Math.ceil(list.length / PAGE));
  return { page, pagecount, limit: PAGE, total: list.length, list: vodList(slice) };
}

let homeCache = null;
let homeCacheAt = 0;
async function homeDramas() {
  const now = Date.now();
  if (homeCache && now - homeCacheAt < 10 * 60 * 1000) return homeCache;
  const html = await fetchHtml('/');
  const arr = parseDramas(html);
  if (arr.length) { homeCache = arr; homeCacheAt = now; }
  return arr;
}

async function home() {
  const classes = STATIC_CATS.slice();
  const filters = { all: SORT_FILTER, new: SORT_FILTER, rank: SORT_FILTER };
  const list = vodList(await homeDramas());
  return { class: classes, filters, list: list.slice(0, 20) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const catId = String(body.id || body.type_id || '').trim();
  // rank/new/wish 走各自的站方分类页（?page=N），不再回首页列表；
  // all（或未指明）仍回首页 182 部。
  if (CAT_PATH[catId]) {
    const arr = await catDramas(catId, page);
    if (!arr || !arr.length) return { page, pagecount: page, limit: PAGE, total: 0, list: [] };
    // 分类页每页 18 条；满 18 条即假定还有下一页，否则本页就是末页。
    const pagecount = arr.length >= 18 ? page + 1 : page;
    return { page, pagecount, limit: PAGE, total: arr.length, list: vodList(arr) };
  }
  const arr = await homeDramas();
  return pageOf(arr, page);
}

// 从详情页提 mediaKey：优先 m3u8 URL（/7cat/<key>/hls/），其次封面
// （/7cat/<key>/cover.jpg）；哈希封面（cover-compression/...）里没有 key。
function mediaKeyFromHtml(html) {
  const h = String(html || '');
  let m = h.match(/\/7cat\/([0-9a-f]{20,})\/hls\//);
  if (m) return m[1];
  m = h.match(/\/7cat\/([0-9a-f]{20,})\/cover\.jpg/);
  if (m) return m[1];
  return '';
}

function epUrl(key, n) {
  if (!key || n <= 0) return '';
  const nn = n < 10 ? '0' + n : '' + n;
  return MEDIA + '/7cat/' + key + '/hls/ep' + nn + '/ep' + nn + '.m3u8';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const vid = String(Array.isArray(body.id) ? body.id[0] : body.id || '').replace('qmdj:', '').trim();
  if (!vid) return { list: [] };
  const html = await fetchHtml('/drama/' + encodeURIComponent(vid) + '/');
  if (!html) return { list: [] };
  // 标题：优先 RSC 里的干净标题（<title> 带“短剧剧情介绍与剧集观看”后缀）
  let name = '';
  const dm0 = parseDramas(html);
  const hit0 = dm0.find((x) => x.dramaId === vid);
  if (hit0 && hit0.title) name = hit0.title;
  if (!name) {
    const tm = html.match(/<title>([^<]*)<\/title>/);
    if (tm) name = t(tm[1]).replace(/《/g, '').replace(/》/g, '').replace(/短剧剧情介绍与剧集观看.*$/i, '').replace(/ - 七猫短剧.*$/i, '').replace(/\s*\|.*$/, '').trim();
  }
  // 封面：优先 m3u8 旁的 cover，其次 RSC coverUrl
  let cover = '';
  const cm = html.match(/https:\/\/7cat-pic\.bedfpk\.cn\/7cat\/[0-9a-f]+\/cover\.jpg/);
  if (cm) cover = cm[0];
  if (!cover) {
    const dm = parseDramas(html);
    const hit = dm.find((x) => x.dramaId === vid) || dm[0];
    if (hit) cover = hit.coverUrl || '';
  }
  // 集数：详情页 episodeId 去重个数；无则 episodeCount；再无则 m3u8 个数
  const epIds = {};
  const epRe = /episodeId=([0-9a-f-]{36})/g;
  let em;
  while ((em = epRe.exec(html)) !== null) epIds[em[1]] = 1;
  let count = Object.keys(epIds).length;
  if (!count) {
    const ecm = html.match(/\\"episodeCount\\":(\d+)/);
    if (ecm) count = parseInt(ecm[1], 10) || 0;
  }
  const key = mediaKeyFromHtml(html);
  const parts = [];
  // 详情页直接给出的 m3u8（免费集）优先用原地址
  const directM3u8 = {};
  const mmRe = /https:\/\/7cat-media\.bedfpk\.cn\/7cat\/[0-9a-f]+\/hls\/ep(\d+)\/ep\d+\.m3u8/g;
  let mm;
  while ((mm = mmRe.exec(html)) !== null) {
    const n = parseInt(mm[1], 10);
    if (n > 0 && !directM3u8[n]) directM3u8[n] = mm[0];
  }
  if (!count && Object.keys(directM3u8).length) count = Math.max.apply(null, Object.keys(directM3u8).map((x) => parseInt(x, 10)));
  for (let n = 1; n <= count; n++) {
    const url = directM3u8[n] || epUrl(key, n);
    if (!url) continue;
    parts.push('第' + n + '集$' + url);
  }
  if (!parts.length) return { list: [] };
  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: fixCover(cover),
      vod_remarks: count > 0 ? ('共' + count + '集') : '',
      type_name: '短剧',
      vod_content: name || '',
      vod_play_from: '七猫短剧',
      vod_play_url: parts.join('#'),
    }],
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw || page > 1) return { list: [] };
  const arr = await homeDramas();
  const hit = arr.filter((j) => (j.title || '').indexOf(kw) >= 0);
  return { list: vodList(hit) };
}

// 2026-11-16：媒体 host 7cat-media.bedfpk.cn 疑似在用户网络侧被拦。
// 播放走 7mao-media Worker（duanju91-fetch 同款清单改写+分片代理）中转，
// 验 #EXTM3U 后才用；Worker 未部署或不可用回落直连。
const M7_MEDIA = 'https://7mao-media.li768435813.workers.dev/';
async function relayM3u8(m3u8Url) {
  if (!/\.m3u8/i.test(m3u8Url)) return '';
  try {
    const relayUrl = M7_MEDIA + 'playlist.m3u8?u=' + encodeURIComponent(m3u8Url);
    const res = await req.get(relayUrl, { headers: { 'User-Agent': UA }, timeout: 15000 });
    const d = res && res.data;
    const text = typeof d === 'string' ? d : (d == null ? '' : String(d));
    if (text.indexOf('#EXTM3U') >= 0) return relayUrl;
  } catch (e) {}
  return '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  const relay = await relayM3u8(id);
  return { parse: 0, url: relay || id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}

export default function createSpider() {
  return {
    meta: { key: 'py_7mao', name: '七猫短剧', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
