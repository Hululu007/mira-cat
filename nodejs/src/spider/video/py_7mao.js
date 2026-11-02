import req from '../../util/req.js';

// 七猫短剧 https://7maoduanju.com —— JSON API 短剧站（由用户提供的 VIP.py 移植）
// 分类：4 个静态 + /categories 动态线路 + /topics 专题（2026-11-03 实测：线路 11 条、专题 4 个）
// 详情 episodes 优先 seoContentUrl，否则由 mediaKey 组装 7cat-media 直链；播放直链 parse:0
const HOST = 'https://7maoduanju.com';
const API = HOST + '/api/toc/v1';
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

async function api(path) {
  try {
    const r = await req.get(API + path, { headers: hdr(), timeout: 20000 });
    const d = r.data;
    if (typeof d === 'string') {
      try { return JSON.parse(d); } catch (e) { return null; }
    }
    return d;
  } catch (e) { return null; }
}

function vod(j) {
  if (!j) return null;
  const n = parseInt(j.episodeCount || 0, 10) || 0;
  return {
    vod_id: j.dramaId || j.id || '',
    vod_name: j.title || '',
    vod_pic: j.coverUrl || '',
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

function mediaKey(eps, cover) {
  for (const ep of eps || []) {
    const u = ep.seoContentUrl || '';
    const m = u.match(/\/7cat\/([^/]+)\/hls\//);
    if (m) return m[1];
  }
  if (cover) {
    const m = cover.match(/\/7cat\/([^/]+)\/cover/);
    if (m) return m[1];
  }
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
  const cover = obj.coverUrl || '';
  const eps = Array.isArray(obj.episodes) ? obj.episodes : [];
  const key = mediaKey(eps, cover);
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
  return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
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
