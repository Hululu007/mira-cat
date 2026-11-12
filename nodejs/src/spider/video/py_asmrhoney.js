// ASMRHoney (https://asmrhoney.com) -> CatPawOpen spider
// 站点：ASMR 视频精选站，全站静态 JSON 数据文件，无登录墙、无墙。
// 数据层（2026-11-13 VM 实测通）：
//   列表：/data/clips-page-<N>.json（每页 48 条，共 42 页，total 1980，
//     p1/p2 无重叠）；单条含 slug/title/creator/tags/language/mode/
//     duration/coverUrl；不含 videoUrl（详情才有）。
//   详情：/data/clips/<slug>.json -> {clip:{videoUrl, coverUrl, ...}}，
//     videoUrl 为 https://cdn.asmrhoney.com/clips/<slug>/video.mp4 直链 MP4，
//     Range 206 实测通（首 10000 字节 206），可快进；下载只有 original
//     一档，无多清晰度 —— 详情只出单线“原画”，绝不硬编档位。
//   触发音/语言筛选：站内无服务端筛选接口，站方前端是拉
//     /data/clips-search.json（2.7MB 全量索引，2996 条）本地过滤；
//     蜘蛛同款：取索引后按 tags/language 本地过滤、每页 24 条，
//     索引模块级缓存 10 分钟（同会话内多次翻分类只取一次）。
//   触发音：triggers.json 37 个，索引里有内容的 32 个（brushing/
//     paper/keyboard/rain/fire 为 0 条，不列）；语言：mixed 1826、
//     en 537、zh 332、ja 151、ko 150；mode 全为 comfort，无筛选价值。
//   搜索：同走索引，按标题（中/英/日/韩）+ 创作者子串匹配。
//   audioOnly 的条目索引里为 0 条，无需特殊处理。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：最新 / 触发音（卡片）/ 语言（卡片）。
// 字幕：无番号，不接字幕芯。
import req from '../../util/req.js';

const KEY = 'py_asmrhoney';
const NAME = 'ASMRHoney';
const HOST = 'https://asmrhoney.com';
const DATA = HOST + '/data';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 48; // clips-page-*.json 每页条数（站方 clips-meta pageSize）
const FILTER_SIZE = 24; // 索引过滤/搜索每页条数
const INDEX_TTL = 10 * 60 * 1000;

// 触发音卡片：triggers.json 的 37 个里索引有内容的 32 个（数量为索引实测；
// brushing/paper/keyboard/rain/fire 各 0 条，不列）。
const TRIGGER_CARDS = [
  { n: '助眠向', v: 'sfw' },
  { n: '18+', v: 'nsfw' },
  { n: '口腔音', v: 'mouth_sounds' },
  { n: '舔耳', v: 'ear_licking' },
  { n: '触发音', v: 'trigger_sounds' },
  { n: '角色扮演', v: 'roleplay' },
  { n: '丝袜', v: 'pantyhose' },
  { n: '情趣', v: 'sexy' },
  { n: '摩擦', v: 'scratching' },
  { n: '耳语', v: 'whisper' },
  { n: '湿润', v: 'wet' },
  { n: '视觉触发', v: 'vision' },
  { n: '吃耳朵', v: 'eareating' },
  { n: '舌头', v: 'tongue' },
  { n: '足', v: 'feet' },
  { n: '弹舌', v: 'tonguevibrating' },
  { n: '亲吻', v: 'kiss' },
  { n: '轻敲', v: 'tapping' },
  { n: 'vtuber', v: 'vtuber' },
  { n: '呼吸', v: 'breathing' },
  { n: '芦荟胶', v: 'aloevera' },
  { n: '助眠', v: 'sleep_aid' },
  { n: '掏耳', v: 'ear_cleaning' },
  { n: '陪伴', v: 'comfort' },
  { n: '吃播', v: 'eating' },
  { n: '心跳', v: 'heart' },
  { n: '软声', v: 'soft_spoken' },
  { n: '专注', v: 'focus' },
  { n: '水声', v: 'water' },
  { n: '接吻', v: 'kissing' },
  { n: '视觉刺激', v: 'visual_triggers' },
  { n: '经典咏流传', v: 'oldbutgole' },
];

const LANG_CARDS = [
  { n: '混合', v: 'mixed' },
  { n: '英文', v: 'en' },
  { n: '中文', v: 'zh' },
  { n: '日文', v: 'ja' },
  { n: '韩文', v: 'ko' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function durStr(sec) {
  sec = Math.floor(Number(sec) || 0);
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

async function getJson(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'application/json,*/*' },
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  } catch (e) {
    return null;
  }
}

// 全量索引（站方前端同款本地过滤源），模块级缓存 10 分钟。
let indexCache = null;
let indexCacheTs = 0;
async function getIndex() {
  if (indexCache && Date.now() - indexCacheTs < INDEX_TTL) return indexCache;
  const j = await getJson(DATA + '/clips-search.json', 30000);
  const clips = j && Array.isArray(j.clips) ? j.clips : [];
  if (clips.length) {
    indexCache = clips;
    indexCacheTs = Date.now();
  }
  return clips;
}

function clipToVod(c) {
  if (!c || !c.slug) return null;
  const title = t(c.title) || t(c.title_en) || c.slug;
  const remarks = durStr(c.duration);
  return {
    vod_id: String(c.slug),
    vod_name: title,
    vod_pic: t(c.coverUrl) || t(c.coverWebpUrl) || '',
    vod_remarks: remarks,
  };
}

function paginate(arr, page, size) {
  const total = arr.length;
  const pagecount = Math.max(1, Math.ceil(total / size));
  const start = (page - 1) * size;
  const slice = arr.slice(start, start + size);
  return { page, pagecount, limit: slice.length || size, total, list: slice.map(clipToVod).filter(Boolean) };
}

async function init() {
  return {};
}

async function home() {
  return {
    class: [
      { type_id: 'latest', type_name: '最新' },
      { type_id: 'trigger', type_name: '触发音' },
      { type_id: 'lang', type_name: '语言' },
    ],
    filters: {
      trigger: [{ key: 'sub', name: '触发音', value: TRIGGER_CARDS }],
      lang: [{ key: 'sub', name: '语言', value: LANG_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');

  if (id === 'latest') {
    const j = await getJson(DATA + '/clips-page-' + page + '.json');
    const clips = j && Array.isArray(j.clips) ? j.clips : [];
    const list = clips.map(clipToVod).filter(Boolean);
    return {
      page,
      pagecount: list.length < PAGE_SIZE ? page : page + 1,
      limit: list.length || PAGE_SIZE,
      total: 0,
      list,
    };
  }
  if (id === 'trigger') {
    const tag = sub || TRIGGER_CARDS[0].v;
    const clips = (await getIndex()).filter((c) => Array.isArray(c.tags) && c.tags.indexOf(tag) >= 0);
    return paginate(clips, page, FILTER_SIZE);
  }
  if (id === 'lang') {
    const lang = sub || LANG_CARDS[0].v;
    const clips = (await getIndex()).filter((c) => c.language === lang);
    return paginate(clips, page, FILTER_SIZE);
  }
  return { page, pagecount: page, limit: 0, total: 0, list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const slug = t(raw);
  if (!slug) return { list: [] };
  const j = await getJson(DATA + '/clips/' + encodeURIComponent(slug) + '.json');
  const c = j && j.clip ? j.clip : null;
  if (!c) return { list: [] };
  const title = t(c.title) || t(c.title_en) || slug;
  const pic = t(c.coverUrl) || t(c.coverWebpUrl) || '';
  const videoUrl = t(c.videoUrl);
  return {
    list: [{
      vod_id: String(c.slug || slug),
      vod_name: title,
      vod_pic: pic,
      vod_content: t(c.description),
      vod_remarks: durStr(c.duration),
      vod_play_from: NAME,
      vod_play_url: videoUrl ? '原画$' + videoUrl : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  if (/^https?:\/\//i.test(id) && /\.mp4(\?|#|$)/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  // 裸 slug：现取详情拿 videoUrl。
  const j = await getJson(DATA + '/clips/' + encodeURIComponent(id) + '.json');
  const videoUrl = j && j.clip ? t(j.clip.videoUrl) : '';
  if (!videoUrl) return { parse: 0, url: '' };
  return { parse: 0, url: videoUrl, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const clips = (await getIndex()).filter((c) => {
    const hay = [c.title, c.title_en, c.title_ja, c.title_ko, c.creator]
      .map((x) => String(x || '').toLowerCase()).join(' ');
    return hay.indexOf(wd) >= 0;
  });
  return paginate(clips, page, FILTER_SIZE);
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
    },
  };
}
