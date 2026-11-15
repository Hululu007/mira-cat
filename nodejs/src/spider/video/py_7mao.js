import req from '../../util/req.js';

// 七猫短剧 https://7maoduanju.com —— JSON API 短剧站（由用户提供的 VIP.py 移植）
// 2026-11-05 修复：代码与站方 API 在 VM 侧全通（列表/线路/专题/搜索/详情/播单均 200），
// 手机侧内容仍空，属手机网络到站方 API 不通（非代码回归：本文件自 11-02 后未改动，
// API 同期未变）。改动：取数改三腿（直连 → www 同源 → 7mao Worker /f/ 兜底），
// 直连失败/超时即换腿；Worker 待用户部署，未部署前行为与现在一致。
// 分类：4 个静态 + /categories 动态线路 + /topics 专题（2026-11-03 实测：线路 11 条、专题 4 个）
// 详情 episodes 优先 seoContentUrl，否则由 mediaKey 组装 7cat-media 直链；播放直链 parse:0
const HOST = 'https://7maoduanju.com';
const API = HOST + '/api/toc/v1';
// 取数三腿：主站直连 → www 同源（实测同后端、同数据）→ Worker 兜底。
// Worker 待用户部署：https://7mao-fetch.li768435813.workers.dev（根回 7mao fetch ok），未部署前该腿失败即跳过。
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
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': HOST + '/',
  };
}

// 拒收 CF/Worker 的 JSON 错误信封（如未部署 Worker 时的 404 {"type":"https://developers.cloudflare.com/...",
// "title":"Error 1042: Cloudflare Error"}——它能 JSON.parse 成功，须按失败处理，否则详情会把错误标题当剧名。
function apiJsonOk(d, status) {
  if (typeof status === 'number' && (status < 200 || status >= 300)) return false;
  if (d && typeof d === 'object' && typeof d.type === 'string' && d.type.indexOf('http') === 0) return false;
  return true;
}

async function apiOnce(url, timeoutMs) {
  try {
    const r = await req.get(url, { headers: hdr(), timeout: timeoutMs || 8000 });
    const d = r.data;
    let out = null;
    if (typeof d === 'string') {
      try { out = JSON.parse(d); } catch (e) { return null; }
    } else {
      out = d;
    }
    if (!apiJsonOk(out, r.status)) return null;
    return out;
  } catch (e) { return null; }
}

// 三腿取数：主站直连（8s）→ www 同源（8s）→ Worker 兜底（10s）；
// 任一腿返回合法 JSON 即停；全失败返回 null（上层按空列表处理，与现在一致）。
async function api(path) {
  for (const h of API_HOSTS) {
    const d = await apiOnce(h + '/api/toc/v1' + path, 8000);
    if (d !== null && d !== undefined) return d;
  }
  const w = await apiOnce(viaWorker(API + path), 10000);
  if (w !== null && w !== undefined) return w;
  return null;
}

// 2026-11-16：约 9% 的封面 URL 含 %XX 编码中文文件名（covers/<id>/<id>-<中文名>.jpg|png）。
// App 侧图片加载器疑似对 %XX 再编码一次（%→%25）致 404，造成“有的出有的不出”。
// 这里把 %XX 解回原文字符交 App 编码一次；decodeURI 不动 %2F/%3F 等保留字符，
// 解失败回原串。非编码封面不受影响。
function decodePic(u) {
  const s = String(u || '').trim();
  if (!s || s.indexOf('%') < 0) return s;
  try { return decodeURI(s); } catch (e) { return s; }
}

function vod(j) {
  if (!j) return null;
  const n = parseInt(j.episodeCount || 0, 10) || 0;
  return {
    vod_id: j.dramaId || j.id || '',
    vod_name: j.title || '',
    vod_pic: decodePic(j.coverUrl || ''),
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

async function home() {
  const classes = STATIC_CATS.slice();
  const filters = { all: SORT_FILTER, new: SORT_FILTER, rank: SORT_FILTER };
  try {
    const cats = await api('/categories');
    const kept = (Array.isArray(cats) ? cats : [])
      .filter((j) => j && j.status === 'active' && j.name)
      .sort((a, b) => (parseInt(a.sortOrder || 99, 10) - parseInt(b.sortOrder || 99, 10)));
    for (const ln of kept) {
      classes.push({ type_id: 'line|' + ln.id, type_name: ln.name });
      filters['line|' + ln.id] = SORT_FILTER;
    }
    const tp = await api('/topics');
    const tarr = Array.isArray(tp) ? tp : [];
    for (const t of tarr) {
      if (t && t.id) classes.push({ type_id: 'topic|' + t.id, type_name: t.name || t.title || '专题' });
    }
  } catch (e) { /* 静态分类兜底 */ }
  let list = [];
  try {
    const h = await api('/home');
    const blocks = h && Array.isArray(h.blocks) ? h.blocks : [];
    const seen = new Set();
    for (const blk of blocks) {
      if (!blk || !Array.isArray(blk.items)) continue;
      for (const it of blk.items) {
        if (list.length >= 20) break;
        const id = it.id || it.dramaId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const v = vod(it);
        if (v) list.push(v);
      }
      if (list.length >= 20) break;
    }
  } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'all');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  const sort = extend.sort || 'hot';
  try {
    if (tid === 'wish') {
      const arr = await api('/ranks/wish');
      return pageOf(arr, page);
    }
    if (tid.startsWith('topic|')) {
      const tp = await api('/topics');
      const tarr = Array.isArray(tp) ? tp : [];
      const t = tarr.find((x) => x && x.id === tid.slice(6));
      return pageOf(t && Array.isArray(t.dramas) ? t.dramas : [], page);
    }
    const sv = (sort === 'latest') ? 'latest' : 'hot';
    let path = '/browse?offset=' + ((page - 1) * PAGE) + '&limit=' + PAGE;
    if (tid === 'new') path += '&sort=latest';
    else if (tid.startsWith('line|')) path += '&line=' + encodeURIComponent(tid.slice(5)) + '&sort=' + sv;
    else path += '&sort=' + sv;
    const obj = await api(path);
    if (!obj) return { page, pagecount: page, limit: PAGE, total: 0, list: [] };
    const items = Array.isArray(obj.items) ? obj.items : [];
    const total = parseInt(obj.total || 0, 10) || 0;
    const hasMore = !!obj.hasMore;
    let pagecount = total > 0 ? Math.ceil(total / PAGE) : (hasMore ? page + 1 : page);
    if (pagecount < page) pagecount = page;
    return { page, pagecount, limit: PAGE, total: total > 0 ? total : page * PAGE, list: vodList(items) };
  } catch (e) {
    return { page, pagecount: page, limit: PAGE, total: 0, list: [] };
  }
}

function mediaKey(eps) {
  for (const ep of eps || []) {
    const u = ep.seoContentUrl || '';
    const m = u.match(/\/7cat\/([^/]+)\/hls\//);
    if (m) return m[1];
  }
  // 2026-11-16：封面已换成哈希路径（7cat-pic.bedfpk.cn/cover-compression/
  // variants/v1/cover/<sha256>.jpg），里面没有 key，旧 cover 兜底已死，删掉。
  // 无 seo URL 的剧（抽查 2/10，多为单集锁定剧）没有公开的 key 来源：
  // /dramas/{id}/episodes/{epId}/play 需登录（401），封面/列表均无 key。
  // 这类剧暂时播不了，见报告；有 key 的剧按 key 合成全集地址（已实测 m3u8 200）。
  return '';
}

// 2026-11-16：媒体 host 7cat-media.bedfpk.cn 疑似在用户网络侧被拦（与橙果/
// 黄果同类；javsb-relay 白名单不含该 host，回 403 Host not allowed）。
// 播放走 7mao-media Worker（duanju91-fetch 同款清单改写+分片代理）中转，
// 验 #EXTM3U 后才用；Worker 未部署或不可用回落直连。
// Worker 代码见 7mao-media-worker.js（用户部署）。
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

function epUrl(key, n) {
  if (!key || n <= 0) return '';
  const nn = n < 10 ? '0' + n : '' + n;
  return MEDIA + '/7cat/' + key + '/hls/ep' + nn + '/ep' + nn + '.m3u8';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const vid = String(Array.isArray(body.id) ? body.id[0] : body.id || '').replace('qmdj:', '').trim();
  if (!vid) return { list: [] };
  const obj = await api('/dramas/' + encodeURIComponent(vid));
  if (!obj) return { list: [] };
  const cover = decodePic(obj.coverUrl || '');
  const eps = Array.isArray(obj.episodes) ? obj.episodes : [];
  const key = mediaKey(eps);
  const parts = [];
  eps.forEach((ep, i) => {
    const n = parseInt(ep.indexNo || (i + 1), 10) || (i + 1);
    let url = ep.seoContentUrl || '';
    if (!url) url = epUrl(key, n);
    if (!url) return;
    parts.push(((ep.title || ('第' + n + '集')) + '$' + url));
  });
  const tags = (Array.isArray(obj.tags) ? obj.tags : []).filter(Boolean);
  const n2 = parseInt(obj.episodeCount || 0, 10) || 0;
  return {
    list: [{
      vod_id: vid,
      vod_name: obj.title || '',
      vod_pic: cover,
      vod_remarks: n2 > 0 ? ('共' + n2 + '集') : '',
      type_name: tags.length ? tags.join(' · ') : '短剧',
      vod_content: (tags.length ? ('分类：' + tags.join(' · ') + '\n') : '') + (obj.description || ''),
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
  const arr = await api('/search?q=' + encodeURIComponent(kw) + '&limit=50');
  return { list: vodList(arr) };
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
