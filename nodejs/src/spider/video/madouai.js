// 麻豆AI (https://madouai.xyz / https://2048ai.xyz) -> CatPawOpen spider
// Vue SPA + JSON API: 列表 /api/v1/videos, 搜索 /api/v1/videos/search, 详情 /api/v1/videos/{id}
// 播放走站方 m3u8 代理 /api/v1/m3u8/proxy?path= ; 封面走 /api/v1/image/proxy?path=
// 单档 (清单无多码率变体), 不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_madouai';
const NAME = '麻豆AI';
const HOST = 'https://madouai.xyz';
const HOST2 = 'https://2048ai.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 最近更新(无 categoryId, 默认最新在前) + 23 个视频子分类 (GET /api/v1/categories?type=video 实测)
// 注意: 前端 3 个菜单组 (原创精选/国产视频/中文AV) 只是导航分组, API 不认 menuId 参数,
// 无法按菜单组取列表, 故不单列菜单组分类, 子分类本身已按 menuId 归属, 浏览子分类即可覆盖
const CLASSES = [
  { type_id: 'latest', type_name: '最近更新' },
  { type_id: 'cat:1', type_name: '国产自拍' },
  { type_id: 'cat:2', type_name: 'AV - 中文字幕' },
  { type_id: 'cat:8', type_name: 'AV - 无码流出' },
  { type_id: 'cat:21', type_name: '反差母狗' },
  { type_id: 'cat:27', type_name: '每日更新' },
  { type_id: 'cat:4', type_name: '探花大神' },
  { type_id: 'cat:7', type_name: '91大神' },
  { type_id: 'cat:10', type_name: '麻豆x性吧联合原创' },
  { type_id: 'cat:13', type_name: '清纯少女' },
  { type_id: 'cat:6', type_name: '麻豆原创AI' },
  { type_id: 'cat:20', type_name: '破解偷拍' },
  { type_id: 'cat:14', type_name: '重口调教' },
  { type_id: 'cat:19', type_name: '黑料吃瓜' },
  { type_id: 'cat:28', type_name: '世界杯专栏' },
  { type_id: 'cat:15', type_name: '直播大秀' },
  { type_id: 'cat:22', type_name: '白虎嫩妹' },
  { type_id: 'cat:9', type_name: '麻豆传媒' },
  { type_id: 'cat:16', type_name: '网红主播' },
  { type_id: 'cat:23', type_name: '家庭乱伦' },
  { type_id: 'cat:17', type_name: '媚黑母狗' },
  { type_id: 'cat:24', type_name: '熟女偷情' },
  { type_id: 'cat:18', type_name: '白虎少女' },
  { type_id: 'cat:25', type_name: '网黄原创' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/media/',
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

/** JSON 取数: 先 req, 失败换备用域, 再失败走 fetch 兜底 (App 内无全局 fetch, 用 typeof 守卫) */
async function apiGet(path) {
  const hosts = [HOST, HOST2];
  for (const h of hosts) {
    try {
      const { data } = await req.get(h + path, { headers: headers(), timeout: 20000 });
      if (data == null) continue;
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { continue; }
      }
      return data;
    } catch (e) { /* try next host */ }
  }
  if (typeof fetch !== 'undefined') {
    for (const h of hosts) {
      try {
        const r = await fetch(h + path, { headers: headers() });
        if (!r || !r.ok) continue;
        return await r.json();
      } catch (e) { /* try next host */ }
    }
  }
  return null;
}

/** 封面地址: 列表 API 已给 /api/v1/image/proxy?path=... 直接拼主域;
    搜索 API 给裸路径 image/... 直接取会 404, 须包一层图片代理 */
function coverUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('/api/v1/image/proxy') === 0) return HOST + u;
  if (u.charAt(0) === '/') return HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u.slice(1));
  return HOST + '/api/v1/image/proxy?path=' + encodeURIComponent(u);
}

/** 播放地址: .m3u8 相对路径走站方 m3u8 代理 (直接拼主域取回的是 SPA 空壳);
    .mp4 直接用原地址 */
function playUrl(videoUrl) {
  videoUrl = t(videoUrl);
  if (!videoUrl) return '';
  if (/^https?:\/\//i.test(videoUrl)) return videoUrl;
  if (/\.m3u8(\?|$)/i.test(videoUrl)) {
    return HOST + '/api/v1/m3u8/proxy?path=' + encodeURIComponent(videoUrl);
  }
  if (videoUrl.charAt(0) === '/') return HOST + videoUrl;
  return HOST + '/' + videoUrl;
}

function fmtDur(sec) {
  sec = parseInt(sec, 10);
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (h > 0 ? String(m) : String(m));
  const ss = s < 10 ? '0' + s : String(s);
  if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + ss;
  return mm + ':' + ss;
}

function toVod(it) {
  if (!it || it.id == null) return null;
  const dur = fmtDur(it.durationSec);
  const remarks = [dur, it.categoryName].filter(Boolean).join(' · ');
  return {
    vod_id: String(it.id),
    vod_name: t(it.title) || ('视频 ' + it.id),
    vod_pic: coverUrl(it.coverUrl),
    vod_remarks: remarks,
  };
}

function parseListData(json) {
  if (!json) return { items: [], total: 0, totalPages: 1 };
  const data = json.data || json;
  const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
  const total = parseInt(data.total, 10) || items.length;
  const totalPages = parseInt(data.totalPages, 10) || 1;
  return { items, total, totalPages };
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
  const id = String(body.id || 'latest');
  const size = 30;
  let path;
  if (id === 'latest' || id === '' || id === 'home') {
    path = '/api/v1/videos?page=' + page + '&size=' + size;
  } else if (id.indexOf('cat:') === 0) {
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id.slice(4)) + '&page=' + page + '&size=' + size;
  } else {
    // 兼容直接传数字分类 id
    path = '/api/v1/videos?categoryId=' + encodeURIComponent(id) + '&page=' + page + '&size=' + size;
  }
  const json = await apiGet(path);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
    total,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/(\d+)/)?.[1] || '';
  if (!vid) return { list: [] };

  const json = await apiGet('/api/v1/videos/' + vid);
  const it = json ? (json.data || json) : null;
  if (!it || it.id == null) return { list: [] };

  const url = playUrl(it.videoUrl);
  const eps = url ? ['播放$' + url] : [];
  return {
    list: [{
      vod_id: String(it.id),
      vod_name: t(it.title) || ('视频 ' + it.id),
      vod_pic: coverUrl(it.coverUrl),
      vod_content: t(it.description),
      vod_remarks: [fmtDur(it.durationSec), it.categoryName].filter(Boolean).join(' · '),
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
    header: { 'User-Agent': UA, 'Referer': HOST + '/media/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const size = 30;
  const json = await apiGet('/api/v1/videos/search?q=' + encodeURIComponent(wd) + '&page=' + page + '&size=' + size);
  const { items, total, totalPages } = parseListData(json);
  const list = [];
  for (const it of items) {
    const v = toVod(it);
    if (v) list.push(v);
  }
  return {
    page,
    pagecount: totalPages,
    limit: list.length || size,
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
