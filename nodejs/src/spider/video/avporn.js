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

/** 从详情页 HTML 取 JSON-LD VideoObject 的 contentUrl / 标题 / 简介 / 封面 / 时长 */
function extractVideoDetail(html) {
  const out = { manifest: '', title: '', desc: '', pic: '', durSec: 0 };
  if (!html) return out;
  const cm = html.match(/"contentUrl"\s*:\s*"([^"]+manifest\.m3u8[^"]*)"/i);
  if (cm) out.manifest = cm[1];
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
    return {
      list: [{
        vod_id: 'sd:' + did,
        vod_name: decodeHtml(d.title || ('短剧 ' + did)),
        vod_pic: proxyCover(d.coverUrl || ''),
        vod_content: decodeHtml(d.blurb || ''),
        vod_remarks: '共' + (d.totalEpisodes || eps.length) + '集',
        vod_play_from: NAME,
        vod_play_url: playUrl.join('#'),
      }],
    };
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
  return {
    list: [{
      vod_id: (isSv ? 'sv:' : 'v:') + vid,
      vod_name: det.title || vid,
      vod_pic: proxyCover(det.pic),
      vod_content: det.desc,
      vod_remarks: fmtDur(det.durSec),
      vod_play_from: NAME,
      vod_play_url: '播放$' + absUrl(det.manifest),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || '').trim();
  if (!id) return { parse: 0, url: '' };
  // 短剧集 token: 现取签名 manifest
  const dm = id.match(/^drama:(\d+):(\d+)$/);
  if (dm) {
    const json = await getJson(HOST + '/api/v1/drama/' + dm[1] + '/episodes/' + dm[2] + '/play');
    const playUrl = json && json.data && json.data.playUrl;
    if (playUrl) {
      return { parse: 0, url: absUrl(playUrl), header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
    }
    return { parse: 0, url: '' };
  }
  // 视频 / AV解说: manifest 直链 (detail 现取的签名地址)
  return {
    parse: 0,
    url: absUrl(id),
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
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
