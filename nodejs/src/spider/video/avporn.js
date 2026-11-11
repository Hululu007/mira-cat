// AVPorn (https://11.bkskfhqdfas.icu) -> CatPawOpen spider
// Nuxt 3 站, 主域 avporn.co, 给定域为入口镜像, 内容相同
// 列表走 JSON API: GET /api/v1/video/list?categoryIds|tagIds&sort=latest|popular&page&size
// 详情页 JSON-LD 的 contentUrl 就是带签名的 manifest (/api/v1/cdn/video/{uuid}/manifest.m3u8?t=&sign=), detail 现取
// 封面是 AES 加密存储, 必须走站方 /_img?u= 图片代理 (直链返回 application/octet-stream)
// 短剧走 /api/v1/drama/{id} + /api/v1/drama/{id}/episodes/{n}/play (签名现取)
// 单档, 不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_avporn';
const NAME = 'AVPorn';
const HOST = 'https://11.bkskfhqdfas.icu';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 首页最新 + 热门 + 日本AV(14子) + 国产精选(16子) + AV解说 + 短剧 + 70标签
// 子分类 id 取自 /api/v1/category/tree (2026-11-11 实测); 标签 id 取自 /tag/ 页 (70 个)
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'hot', type_name: '热门' },
  { type_id: 'cat:1', type_name: '日本AV' },
  { type_id: 'cat:3', type_name: '无码影片' },
  { type_id: 'cat:4', type_name: '中文字幕' },
  { type_id: 'cat:5', type_name: '素人' },
  { type_id: 'cat:6', type_name: '剧情' },
  { type_id: 'cat:7', type_name: '人妻熟女' },
  { type_id: 'cat:8', type_name: '制服' },
  { type_id: 'cat:9', type_name: '职场OL' },
  { type_id: 'cat:10', type_name: '角色扮演' },
  { type_id: 'cat:11', type_name: '调教SM' },
  { type_id: 'cat:12', type_name: '成人综艺' },
  { type_id: 'cat:13', type_name: '魔镜号' },
  { type_id: 'cat:14', type_name: '家庭乱伦' },
  { type_id: 'cat:31', type_name: 'NTR' },
  { type_id: 'cat:42', type_name: '多人运动' },
  { type_id: 'cat:2', type_name: '国产精选' },
  { type_id: 'cat:38', type_name: '素人原创' },
  { type_id: 'cat:35', type_name: '国产自拍' },
  { type_id: 'cat:40', type_name: '探花系列' },
  { type_id: 'cat:46', type_name: '麻豆传媒' },
  { type_id: 'cat:48', type_name: '糖心vlog' },
  { type_id: 'cat:36', type_name: '情侣自拍' },
  { type_id: 'cat:37', type_name: '网红主播' },
  { type_id: 'cat:39', type_name: '剧情' },
  { type_id: 'cat:41', type_name: '偷拍' },
  { type_id: 'cat:49', type_name: '蜜桃传媒' },
  { type_id: 'cat:50', type_name: '星空传媒' },
  { type_id: 'cat:51', type_name: '天美传媒' },
  { type_id: 'cat:52', type_name: '香蕉视频' },
  { type_id: 'cat:53', type_name: '果冻传媒' },
  { type_id: 'cat:54', type_name: '杏吧原版' },
  { type_id: 'cat:55', type_name: '精东影业' },
  { type_id: 'shortvideo', type_name: 'AV解说' },
  { type_id: 'shortdrama', type_name: '短剧' },
  { type_id: 'tag:1', type_name: '巨乳' },
  { type_id: 'tag:116', type_name: '酒店' },
  { type_id: 'tag:159', type_name: '中文字幕' },
  { type_id: 'tag:166', type_name: '素人' },
  { type_id: 'tag:184', type_name: '黑丝' },
  { type_id: 'tag:263', type_name: '河北彩花' },
  { type_id: 'tag:342', type_name: '口交' },
  { type_id: 'tag:22', type_name: '熟女' },
  { type_id: 'tag:23', type_name: '苗条' },
  { type_id: 'tag:20', type_name: '童颜' },
  { type_id: 'tag:348', type_name: '清纯' },
  { type_id: 'tag:21', type_name: '御姐' },
  { type_id: 'tag:34', type_name: '丰满' },
  { type_id: 'tag:29', type_name: '美腿' },
  { type_id: 'tag:349', type_name: '性感' },
  { type_id: 'tag:350', type_name: '素颜' },
  { type_id: 'tag:50', type_name: '人妻' },
  { type_id: 'tag:46', type_name: '女教师' },
  { type_id: 'tag:72', type_name: '女上司' },
  { type_id: 'tag:56', type_name: '护士' },
  { type_id: 'tag:71', type_name: '邻居太太' },
  { type_id: 'tag:351', type_name: '职场OL' },
  { type_id: 'tag:57', type_name: '女仆' },
  { type_id: 'tag:76', type_name: '寡妇' },
  { type_id: 'tag:58', type_name: '空姐' },
  { type_id: 'tag:107', type_name: '深喉' },
  { type_id: 'tag:109', type_name: '足交' },
  { type_id: 'tag:112', type_name: '骑乘位' },
  { type_id: 'tag:119', type_name: '捆绑' },
  { type_id: 'tag:111', type_name: '后入' },
  { type_id: 'tag:108', type_name: '乳交' },
  { type_id: 'tag:104', type_name: '颜射' },
  { type_id: 'tag:103', type_name: '内射' },
  { type_id: 'tag:352', type_name: 'SM调教' },
  { type_id: 'tag:156', type_name: '无码' },
  { type_id: 'tag:353', type_name: '4K超清' },
  { type_id: 'tag:163', type_name: 'VR' },
  { type_id: 'tag:354', type_name: '经典作品' },
  { type_id: 'tag:355', type_name: '新人出道' },
  { type_id: 'tag:356', type_name: '剧情长片' },
  { type_id: 'tag:181', type_name: '完整版' },
  { type_id: 'tag:357', type_name: '独家作品' },
  { type_id: 'tag:183', type_name: '破解版' },
  { type_id: 'tag:54', type_name: 'JK制服' },
  { type_id: 'tag:358', type_name: '瑜伽裤' },
  { type_id: 'tag:53', type_name: '制服' },
  { type_id: 'tag:195', type_name: '和服' },
  { type_id: 'tag:197', type_name: '泳装' },
  { type_id: 'tag:359', type_name: '旗袍' },
  { type_id: 'tag:188', type_name: '高跟鞋' },
  { type_id: 'tag:185', type_name: '丝袜' },
  { type_id: 'tag:360', type_name: '职业装' },
  { type_id: 'tag:262', type_name: '三上悠亚' },
  { type_id: 'tag:271', type_name: '石川澪' },
  { type_id: 'tag:365', type_name: '枫可怜' },
  { type_id: 'tag:366', type_name: '八木奈奈' },
  { type_id: 'tag:295', type_name: '葵司' },
  { type_id: 'tag:272', type_name: '桃乃木香奈' },
  { type_id: 'tag:274', type_name: '天使萌' },
  { type_id: 'tag:276', type_name: '相泽南' },
  { type_id: 'tag:267', type_name: '明里紬' },
  { type_id: 'tag:48', type_name: '办公室' },
  { type_id: 'tag:361', type_name: '居家' },
  { type_id: 'tag:261', type_name: '温泉' },
  { type_id: 'tag:362', type_name: '浴室' },
  { type_id: 'tag:240', type_name: '厨房' },
  { type_id: 'tag:363', type_name: '户外' },
  { type_id: 'tag:125', type_name: '电车' },
  { type_id: 'tag:364', type_name: '摄影棚' },
  { type_id: 'tag:301', type_name: '学校' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** 封面必须走站方 /_img?u= 图片代理 (封面 AES 加密存储, 直链返回 application/octet-stream) */
function proxyCover(url) {
  url = t(url);
  if (!url) return '';
  if (url.indexOf('/_img?u=') >= 0) {
    // 已是代理地址: 主域 avporn.co 统一换成当前镜像域 (镜像域代理实测同样 200)
    return url.replace(/^https?:\/\/avporn\.co\//i, HOST + '/');
  }
  return HOST + '/_img?u=' + encodeURIComponent(absUrl(url));
}

function fmtDur(sec) {
  sec = parseInt(sec, 10);
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (m < 10 ? '0' : '') + m;
  const ss = (s < 10 ? '0' : '') + s;
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}

/** ISO8601 时长 PT2H29M35S -> 秒 */
function parseIsoDur(s) {
  const m = t(s).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600)
    + (parseInt(m[2] || '0', 10) * 60)
    + parseInt(m[3] || '0', 10);
}

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    if (typeof fetch !== 'undefined') {
      try {
        const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
        return await r.text();
      } catch (e2) {
        return '';
      }
    }
    return '';
  }
}

async function getJson(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    if (data && typeof data === 'object') return data;
    const s = String(data || '');
    return s ? JSON.parse(s) : null;
  } catch (e) {
    if (typeof fetch !== 'undefined') {
      try {
        const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
        return await r.json();
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

/** /api/v1/video/list 返回的条目 -> 卡片 */
function videoItemToCard(it) {
  if (!it || it.id == null) return null;
  const dur = fmtDur(it.durationSeconds);
  const code = t(it.code);
  return {
    vod_id: 'v:' + it.id,
    vod_name: decodeHtml(it.title || ('视频 ' + it.id)),
    vod_pic: proxyCover(it.coverUrl || ''),
    vod_remarks: dur + (code ? ' · ' + code : ''),
  };
}

/** 视频列表 HTML (vcard) -> 卡片, 用于搜索页 */
function parseVcardHtml(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a href="\/videos\/(\d+)\/" class="vcard__link">([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[2];
    let title = '';
    const am = body.match(/alt="([^"]{2,200})"/i);
    if (am) title = decodeHtml(am[1]);
    if (!title) continue;
    seen.add(id);
    let pic = '';
    const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
    if (nm) pic = nm[1];
    else {
      const im = body.match(/(?:src|data-src)="([^"]+)"/i);
      if (im) pic = im[1];
    }
    let remarks = '';
    const dm = body.match(/<span class="dur">([^<]+)<\/span>/i);
    if (dm) remarks = t(dm[1]);
    const bm = body.match(/<span class="vcard__badge">([^<]+)<\/span>/i);
    if (bm) remarks = remarks ? remarks + ' · ' + t(bm[1]) : t(bm[1]);
    out.push({
      vod_id: 'v:' + id,
      vod_name: title,
      vod_pic: proxyCover(pic),
      vod_remarks: remarks,
    });
  }
  return out;
}

/** AV解说列表 HTML (shorts-card) -> 卡片 */
function parseShortsHtml(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a href="\/short-video\/(\d+)\/" class="shorts-card">([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[2];
    let title = '';
    const tm = body.match(/shorts-card__title">([^<]{2,200})</i)
      || body.match(/alt="([^"]{2,200})"/i);
    if (tm) title = decodeHtml(tm[1]);
    if (!title) continue;
    seen.add(id);
    let pic = '';
    const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
    if (nm) pic = nm[1];
    let remarks = '';
    const dm = body.match(/shorts-card__dur">([^<]+)</i);
    if (dm) remarks = t(dm[1]);
    out.push({
      vod_id: 'sv:' + id,
      vod_name: title,
      vod_pic: proxyCover(pic),
      vod_remarks: remarks,
    });
  }
  return out;
}

/** 短剧列表 HTML (sd-card) -> 卡片, 单页无翻页 */
function parseDramaHtml(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a href="\/short-drama\/(\d+)\/ep-1\/"[^>]*class="sd-card__art[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[2];
    let title = '';
    const am = body.match(/alt="([^"]{2,200})"/i);
    if (am) title = decodeHtml(am[1]);
    if (!title) continue;
    seen.add(id);
    let pic = '';
    const nm = body.match(/<noscript><img[^>]*src="([^"]+)"/i);
    if (nm) pic = nm[1];
    out.push({
      vod_id: 'sd:' + id,
      vod_name: title,
      vod_pic: proxyCover(pic),
      vod_remarks: '短剧',
    });
  }
  return out;
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
  const size = 20;

  // AV解说: HTML 列表
  if (id === 'shortvideo') {
    const url = page <= 1 ? HOST + '/short-video/' : HOST + '/short-video/?page=' + page;
    const list = parseShortsHtml(await getHtml(url));
    return { page, pagecount: 35, limit: list.length || size, total: 35 * size, list };
  }
  // 短剧: HTML 列表, 单页
  if (id === 'shortdrama') {
    const list = page > 1 ? [] : parseDramaHtml(await getHtml(HOST + '/short-drama/'));
    return { page, pagecount: 1, limit: list.length || size, total: list.length, list };
  }

  // 视频列表走 JSON API
  let qs = 'sort=latest&page=' + page + '&size=' + size;
  if (id === 'hot') qs = 'sort=popular&page=' + page + '&size=' + size;
  else if (id.indexOf('cat:') === 0) qs = 'categoryIds=' + id.slice(4) + '&sort=latest&page=' + page + '&size=' + size;
  else if (id.indexOf('tag:') === 0) qs = 'tagIds=' + id.slice(4) + '&sort=latest&page=' + page + '&size=' + size;
  else if (id !== 'home' && id !== '') qs = 'categoryIds=' + encodeURIComponent(id) + '&sort=latest&page=' + page + '&size=' + size;

  const json = await getJson(HOST + '/api/v1/video/list?' + qs);
  const videos = json && json.data && json.data.videos;
  const items = (videos && Array.isArray(videos.items)) ? videos.items : [];
  const list = [];
  for (const it of items) {
    const c = videoItemToCard(it);
    if (c) list.push(c);
  }
  const total = (videos && videos.total) || 0;
  const pagecount = total > 0 ? Math.ceil(total / size) : 999;
  return { page, pagecount, limit: list.length || size, total: total || 999 * size, list };
}

/** 从详情页 HTML 取 JSON-LD VideoObject 的 contentUrl / 标题 / 简介 / 封面 / 时长 / 番号 */
function extractVideoDetail(html) {
  const out = { manifest: '', title: '', desc: '', pic: '', durSec: 0, code: '' };
  if (!html) return out;
  const cm = html.match(/"contentUrl"\s*:\s*"([^"]+manifest\.m3u8[^"]*)"/i);
  if (cm) out.manifest = cm[1];
  // 番号只在详情页「番号」栏（detail-meta__code），不在标题里；兜底取面包屑末项
  let km = html.match(/detail-meta__code[\s\S]{0,400}?<span>([A-Za-z0-9][A-Za-z0-9\-]{2,24})<\/span>/i);
  if (!km) km = html.match(/"@type":"ListItem","position":\d+,"name":"([A-Za-z]{2,10}-\d{2,8}[A-Za-z]?)"/i);
  if (km) out.code = t(km[1]);
  let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) out.title = decodeHtml(m[1]).replace(/\s*[｜|]\s*免费高清观看\s*-\s*AVporn\s*$/i, '').replace(/\s*-\s*AVporn\s*$/i, '');
  m = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  if (m) out.desc = decodeHtml(m[1]);
  m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) out.pic = m[1];
  m = html.match(/"duration"\s*:\s*"([^"]+)"/i);
  if (m) out.durSec = parseIsoDur(m[1]);
  return out;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const rawId = String(raw || '').trim();
  if (!rawId) return { list: [] };

  // 短剧: 走 drama API, 集数放 token, 播放时现取签名
  if (rawId.indexOf('sd:') === 0 || /\/short-drama\/(\d+)/.test(rawId)) {
    const did = rawId.indexOf('sd:') === 0 ? rawId.slice(3) : (rawId.match(/\/short-drama\/(\d+)/) || [])[1];
    const json = await getJson(HOST + '/api/v1/drama/' + did);
    const d = json && json.data;
    if (!d) return { list: [] };
    const eps = Array.isArray(d.episodes) ? d.episodes : [];
    const playUrl = [];
    for (const ep of eps) {
      const n = ep.episodeNo;
      if (n == null) continue;
      playUrl.push('第' + n + '集$drama:' + did + ':' + n);
    }
    if (!playUrl.length) return { list: [] };
    const dramaVod = {
      vod_id: 'sd:' + did,
      vod_name: decodeHtml(d.title || ('短剧 ' + did)),
      vod_pic: proxyCover(d.coverUrl || ''),
      vod_content: decodeHtml(d.blurb || ''),
      vod_remarks: '共' + (d.totalEpisodes || eps.length) + '集',
      vod_play_from: NAME,
      vod_play_url: playUrl.join('#'),
    };
    // 字幕：按集 token（drama:did:n）登记片名，首集后台预热（不 await）
    subRegister(['sd:' + did], dramaVod);
    return { list: [dramaVod] };
  }

  // 视频 / AV解说: 详情页 HTML, JSON-LD contentUrl 现取签名 manifest
  let vid = '';
  let pageUrl = '';
  if (rawId.indexOf('sv:') === 0 || /\/short-video\/(\d+)/.test(rawId)) {
    vid = rawId.indexOf('sv:') === 0 ? rawId.slice(3) : (rawId.match(/\/short-video\/(\d+)/) || [])[1];
    pageUrl = HOST + '/short-video/' + vid + '/';
  } else if (rawId.indexOf('v:') === 0 || /\/videos\/(\d+)/.test(rawId) || /^\d+$/.test(rawId)) {
    vid = rawId.indexOf('v:') === 0 ? rawId.slice(2) : (rawId.match(/\/videos\/(\d+)/) || [null, rawId.replace(/[^0-9]/g, '')])[1];
    pageUrl = HOST + '/videos/' + vid + '/';
  } else {
    return { list: [] };
  }
  if (!vid) return { list: [] };

  const html = await getHtml(pageUrl);
  const det = extractVideoDetail(html);
  if (!det.manifest) return { list: [] };
  const isSv = rawId.indexOf('sv:') === 0 || pageUrl.indexOf('/short-video/') >= 0;
  const manifest = absUrl(det.manifest);
  const videoVod = {
    vod_id: (isSv ? 'sv:' : 'v:') + vid,
    vod_name: det.title || vid,
    vod_pic: proxyCover(det.pic),
    vod_content: det.desc,
    vod_remarks: fmtDur(det.durSec),
    vod_play_from: NAME,
    vod_play_url: '播放$' + manifest,
  };
  // 字幕：番号只在详情页「番号」栏里，不在标题里；登记名 = 番号 + 标题，
  // 否则 core 从标题抽不到番号、搜不到字幕（只影响字幕登记，不动播放与显示）
  const subTitle = det.code ? det.code + ' ' + videoVod.vod_name : videoVod.vod_name;
  subCacheName(manifest, subTitle);
  subCacheName(videoVod.vod_id, subTitle);
  subWarm(manifest);
  return { list: [videoVod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || '').trim();
  if (!id) return { parse: 0, url: '' };
  // 字幕搜索先启动（subsP），与签名现取并行；短剧等 manifest 到手后再挂载
  const subsP = subSearchAll(subNormKey(id)).catch(() => []);
  // 短剧集 token: 现取签名 manifest
  const dm = id.match(/^drama:(\d+):(\d+)$/);
  if (dm) {
    const json = await getJson(HOST + '/api/v1/drama/' + dm[1] + '/episodes/' + dm[2] + '/play');
    const playUrl = json && json.data && json.data.playUrl;
    if (playUrl) {
      return subAttach({ parse: 0, url: absUrl(playUrl), header: { 'User-Agent': UA, 'Referer': HOST + '/' } }, subsP);
    }
    return subAttach({ parse: 0, url: '' }, subsP);
  }
  // 视频 / AV解说: manifest 直链 (detail 现取的签名地址)
  const subs = await subsP;
  const result = {
    parse: 0,
    url: absUrl(id),
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
  // 注意: /search?q= 会 301 到 /search/?q=, 直接用带斜杠的形式
  let url = HOST + '/search/?q=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const list = parseVcardHtml(await getHtml(url));
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

// ---------- 字幕 token-key 接线（抄自 javsaga 草稿，仅短剧分支用） ----------
// subNormKey：play 入参归一（"集名$token" 剥前缀）；
// subRegister：detail 按 [入参 id, vod_id, 每个 episode id] 登记片名，首集后台预热；
// subAttach：play 挂载，仅结果带非空 url 且字幕有命中时才加 subs 键。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}
function subRegister(detailIds, vod) {
  try {
    if (!vod || !vod.vod_name) return;
    const name = String(vod.vod_name);
    const keys = new Set();
    for (const i of (Array.isArray(detailIds) ? detailIds : [detailIds])) {
      if (i) keys.add(String(i));
    }
    if (vod.vod_id) keys.add(String(vod.vod_id));
    const eps = [];
    for (const grp of String(vod.vod_play_url || '').split('$$$')) {
      for (const seg of grp.split('#')) {
        const k = seg.indexOf('$');
        if (k >= 0) {
          const ep = seg.slice(k + 1);
          if (ep) { keys.add(ep); eps.push(ep); }
        }
      }
    }
    for (const k of keys) subCacheName(k, name);
    const warmKey = eps[0] || (vod.vod_id ? String(vod.vod_id) : '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
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
