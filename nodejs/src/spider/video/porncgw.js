// porn吃瓜网 (https://porncgw.com) -> CatPawOpen spider
// 2026-11-04 修：(1) 最新更新 API 失败/回空时回落首页 SSR 卡片；(2) /list/ 首頁改走 /list 避 301；
// (3) /video/ 的 SSR videoSrc 无 auth_key 会 403，改用 VideoObject contentUrl 签名地址；(4) 超时 15s->30s；(5) 只用框架 req。
// 列表为 SSR 卡片 (article.card + a.card-link + img data-src);
// 详情页 SSR JSON 内嵌已签名 videoSrc (yd-hls.hzjvlo.cn 的 m3u8, 分片/密钥均为带签名绝对地址), play 抓一次详情页直返;
// 短剧 /drama/{id}/ 为简介+分集列表, 分集页 /drama/{id}/{n}/ 同样内嵌 videoSrc;
// 封面 pic.drleao.cn 为 AES-128-CBC 加密图 (与 AvHub/818 同 key), 必须走 bagua-img-proxy Worker 解密出图。
import req from '../../util/req.js';

const KEY = 'py_porncgw';
const NAME = 'porn吃瓜网';
const HOST = 'https://porncgw.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';
const TIMEOUT = 30000;

// 站内导航 21 个分类 (路径已逐个复核); /archives/ 为图文文章不收。
// 最新更新 = 首页: 站点根路径无服务端分页 (/2/、/page/2/、?page=2 均 404)，
// 但站方无限滚动走 JSON API /api/videos/category/home?page=N&size=20（2026-11-03 实测第 2 页 20 条正常）。
const CATS = [
  { type_id: 'latest', type_name: '最新更新', path: '/' },
  { type_id: 'list', type_name: '短视频', path: '/list/' },
  { type_id: 'long-video', type_name: '长视频', path: '/long-video/' },
  { type_id: 'today', type_name: '今日吃瓜', path: '/today/' },
  { type_id: 'recommend', type_name: '推荐吃瓜', path: '/recommend/' },
  { type_id: 'hot-cgbd', type_name: '吃瓜榜单', path: '/hot/cgbd/' },
  { type_id: 'hot-whhl', type_name: '网红黑料', path: '/hot/whhl/' },
  { type_id: 'hot-snsf', type_name: '熟女少妇', path: '/hot/snsf/' },
  { type_id: 'hot-xsxy', type_name: '学生校园', path: '/hot/xsxy/' },
  { type_id: 'ent-cgtq', type_name: '出轨偷情', path: '/entertainment/cgtq/' },
  { type_id: 'ent-zplc', type_name: '自拍流出', path: '/entertainment/zplc/' },
  { type_id: 'door-jiudian', type_name: '酒店', path: '/door/jiudian/' },
  { type_id: 'door-chezhen', type_name: '车震', path: '/door/chezhen/' },
  { type_id: 'shrd-ylbg', type_name: '娱乐八卦', path: '/shrd/ylbg/' },
  { type_id: 'shrd-wybl', type_name: '网友爆料', path: '/shrd/wybl/' },
  { type_id: 'ntxl', type_name: '女同系列', path: '/ntxl/' },
  { type_id: 'omxl', type_name: '欧美系列', path: '/omxl/' },
  { type_id: 'jqyy', type_name: '剧情演绎', path: '/jqyy/' },
  { type_id: 'yzcm', type_name: '亚洲传媒', path: '/yzcm/' },
  { type_id: 'ai-aidj', type_name: 'AI短剧', path: '/ai/aidj/' },
  { type_id: 'ai-aimj', type_name: 'AI漫剧', path: '/ai/AImj/' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer || HOST + '/',
  };
}

// 取页面: 框架 req 优先, fetch 兜底; 返回 { html, finalUrl } (搜索 301 跳 tag 页要读最终地址)
// 只用框架 req（App 内无全局 fetch，fetch 兜底在设备上是死代码）
async function fetchPage(url, referer) {
  try {
    const res = await req.get(url, { headers: headers(referer), timeout: TIMEOUT });
    const html = String(res?.data || '');
    if (html) {
      const finalUrl = res?.request?.res?.responseUrl || url;
      return { html, finalUrl };
    }
  } catch (e) { /* ignore */ }
  return { html: '', finalUrl: url };
}

async function getHtml(url, referer) {
  const { html } = await fetchPage(url, referer);
  return html;
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

// 封面统一走 Worker 解密 (pic.drleao.cn 加密图, App 图片加载拼不出本地代理)
function proxyCover(imgUrl) {
  imgUrl = absUrl(decodeHtml(imgUrl));
  if (!imgUrl) return '';
  if (imgUrl.indexOf('bagua-img-proxy') >= 0) return imgUrl;
  return IMG_PROXY + encodeURIComponent(imgUrl);
}

// og:image 在 expose.eisees.com (返回 0 字节不可用): 同路径换到 pic.drleao.cn 再走 Worker
function fallbackCover(ogImage) {
  const u = absUrl(decodeHtml(ogImage));
  if (!u) return '';
  try {
    const parsed = new URL(u);
    if (/eisees\.com$/i.test(parsed.hostname)) {
      return proxyCover('https://pic.drleao.cn' + parsed.pathname);
    }
  } catch (e) { /* ignore */ }
  return proxyCover(u);
}

// 解析列表卡片: article.card 内含 data-title/data-views/data-time 与 a.card-link、img data-src
function parseCards(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<article[^>]*class="card video-card"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const end = html.indexOf('</article>', m.index);
    const body = end > m.index ? html.slice(m.index, end) : html.slice(m.index, m.index + 3000);
    const hrefM = body.match(/<a[^>]*class="card-link"[^>]*href="([^"]+)"/i) || body.match(/href="(\/(?:video|drama)\/\d+\/)"/i);
    if (!hrefM) continue;
    const path = hrefM[1];
    if (seen.has(path)) continue;
    const imgM = body.match(/<img[^>]*data-src="([^"]+)"/i);
    if (!imgM) continue;
    seen.add(path);
    const titleM = tag.match(/data-title="([^"]*)"/);
    const timeM = tag.match(/data-time="([^"]*)"/);
    const viewsM = tag.match(/data-views="([^"]*)"/);
    let name = titleM ? decodeHtml(titleM[1]) : '';
    if (!name) {
      const altM = body.match(/<img[^>]*alt="([^"]+)"/i);
      if (altM) name = decodeHtml(altM[1]).replace(/视频封面$/, '');
    }
    const time = timeM ? t(timeM[1]) : '';
    const views = viewsM ? t(viewsM[1]) : '';
    out.push({
      vod_id: path,
      vod_name: name || path,
      vod_pic: proxyCover(imgM[1]),
      vod_remarks: time || (views && views !== '0' ? views + '播放' : ''),
    });
  }
  return out;
}

// 分页摘要: 共 <strong>814</strong> 条 · 第 <strong>2/41</strong> 页
function parsePager(html) {
  if (!html) return null;
  const m = html.match(/共\s*<strong>(\d+)<\/strong>\s*条[\s\S]{0,40}?第\s*<strong>\d+\/(\d+)<\/strong>\s*页/);
  if (!m) return null;
  return { total: parseInt(m[1], 10) || 0, pagecount: parseInt(m[2], 10) || 1 };
}

async function buildList(url, page, singlePage) {
  let { html } = await fetchPage(url);
  let list = parseCards(html);
  if (!list.length) {
    // 空页时换斜杠形态重试一次（有的路径 301 归一化，个别请求层跟随跳转不可靠）
    const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/';
    if (alt !== url) {
      const r2 = await fetchPage(alt);
      const list2 = parseCards(r2.html);
      if (list2.length) { html = r2.html; list = list2; }
    }
  }
  if (singlePage) {
    return { page, pagecount: 1, limit: list.length || 20, total: list.length, list };
  }
  const pager = parsePager(html);
  return {
    page,
    pagecount: pager ? pager.pagecount : (list.length >= 20 ? page + 1 : page),
    limit: list.length || 20,
    total: pager ? pager.total : list.length,
    list,
  };
}

function catOf(tid) {
  return CATS.find(c => c.type_id === tid) || CATS[0];
}

function catUrl(cat, page) {
  if (cat.type_id === 'latest') return HOST + cat.path;
  if (page <= 1) {
    // /list/ 会 301 到 /list：首页直接用无斜杠地址，避开一次跳转
    if (cat.type_id === 'list') return HOST + '/list';
    return HOST + cat.path;
  }
  return HOST + cat.path + page + '/';
}

function unescapeJsonStr(s) {
  return String(s)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// 取详情页 SSR JSON 里的字符串字段 (处理 \uXXXX 等转义)
function jsonStr(html, key) {
  const m = html.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  if (!m) return '';
  return unescapeJsonStr(m[1]);
}

// VideoObject 的 contentUrl（带签名播单）。注意：页内第一个 contentUrl 是 logo（ImageObject），
// 必须从 VideoObject 位置起取，否则会拿到 logo 地址。
function videoObjectContentUrl(html) {
  const idx = html.indexOf('VideoObject');
  if (idx < 0) return '';
  const seg = html.slice(idx, idx + 3000);
  const m = seg.match(/"contentUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return '';
  return unescapeJsonStr(m[1]);
}

function ogContent(html, prop) {
  const m = html.match(new RegExp('property="' + prop + '"[^>]*content="([^"]*)"', 'i'))
    || html.match(new RegExp('content="([^"]*)"[^>]*property="' + prop + '"', 'i'));
  return m ? decodeHtml(m[1]) : '';
}

// 详情封面: 优先页面 JSON 的 posterSrc, 缺失时用 og:image 同路径换 pic.drleao.cn
function detailCover(html) {
  const poster = jsonStr(html, 'posterSrc');
  if (poster) return proxyCover(poster);
  const og = ogContent(html, 'og:image');
  if (og) return fallbackCover(og);
  return '';
}

function cleanName(raw, fallback) {
  const name = decodeHtml(raw || '').replace(/\s*-\s*porn吃瓜网\s*$/, '').trim();
  return name || fallback || '';
}

async function init() {
  return {};
}

async function home() {
  const { html } = await fetchPage(HOST + '/');
  return {
    class: CATS.map(c => ({ type_id: c.type_id, type_name: c.type_name })),
    filters: {},
    list: parseCards(html),
  };
}

// 最新更新走站方 JSON API 分页（SSR 根路径无分页，之前写死单页导致无法加载更多）
async function fetchApi(url) {
  try {
    const res = await req.get(url, { headers: headers(HOST + '/'), timeout: TIMEOUT });
    let d = res?.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return null; } }
    return d || null;
  } catch (e) { /* ignore */ }
  return null;
}

async function buildApiLatest(page) {
  const d = await fetchApi(HOST + '/api/videos/category/home?page=' + page + '&size=20');
  const items = d?.data?.items || d?.items || [];
  const pg = d?.data?.pagination || d?.pagination || {};
  const list = [];
  const seen = new Set();
  for (const it of items) {
    const path = t(it.url);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    list.push({
      vod_id: path,
      vod_name: t(it.title) || path,
      vod_pic: proxyCover(it.cover || ''),
      vod_remarks: t(it.episode_badge) || '',
    });
  }
  if (list.length) {
    const pagecount = parseInt(pg.pages, 10) || (list.length >= 20 ? page + 1 : page);
    const total = parseInt(pg.total, 10) || list.length;
    return { page, pagecount, limit: list.length || 20, total, list };
  }
  // API 失败/回空时回落：首页 SSR 卡片就是同一批最新内容（仅第 1 页回落，
  // pagecount=page 不再翻页，避免翻页重复拉首页）
  if (page <= 1) {
    const { html } = await fetchPage(HOST + '/');
    const fb = parseCards(html);
    return { page, pagecount: page, limit: fb.length || 20, total: fb.length, list: fb };
  }
  return { page, pagecount: page, limit: 20, total: 0, list: [] };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const cat = catOf(t(body.id || body.tid) || 'latest');
  if (cat.type_id === 'latest') return buildApiLatest(page);
  return buildList(catUrl(cat, page), page, false);
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let path = t(raw);
  const idm = path.match(/\/(video|drama)\/\d+(?:\/\d+)?\//);
  if (idm) path = idm[0];
  if (!/^\/(video|drama)\/\d+\/$/.test(path)) {
    // 短剧分集 id 归一到短剧主页
    const dm = path.match(/^\/drama\/(\d+)\/\d+\/$/);
    if (dm) path = '/drama/' + dm[1] + '/';
    else return { list: [] };
  }
  const pageUrl = HOST + path;
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };

  const name = cleanName(jsonStr(html, 'title') || ogContent(html, 'og:title'), path);
  const content = ogContent(html, 'og:description');
  const pic = detailCover(html);

  let playUrl;
  if (path.indexOf('/drama/') === 0) {
    const id = path.match(/\/drama\/(\d+)\//)[1];
    const nums = new Set();
    const re = new RegExp('href="/drama/' + id + '/(\\d+)/"', 'g');
    let m;
    while ((m = re.exec(html)) !== null) nums.add(parseInt(m[1], 10));
    const eps = [...nums].sort((a, b) => a - b);
    if (!eps.length) eps.push(1);
    playUrl = eps.map(n => `第${n}集$/drama/${id}/${n}/`).join('#');
  } else {
    playUrl = '正片$' + path;
  }

  return {
    list: [{
      vod_id: path,
      vod_name: name,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (id.includes('$')) id = id.split('$').pop().trim();
  if (/\.m3u8(\?|$)/i.test(id)) {
    // 2026-11-04 代理修：m3u8 播单与分片/密钥必带 auth_key，播放器丢签即 403，
    // 改走蜘蛛本地 /proxy/m3u8，播放器不再直触带签第三方地址
    const proxy = proxyUrl(reqIn, '/proxy/m3u8', id, HOST + '/');
    return { parse: 0, url: proxy || id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  const path = id.match(/\/(video|drama)\/\d+(?:\/\d+)?\//)?.[0] || id;
  if (!path || path.charAt(0) !== '/') return { parse: 0, url: '' };
  const pageUrl = HOST + path;
  const html = await getHtml(pageUrl, HOST + '/');
  // 2026-11-03 修：cshort 路 videoSrc 源站 502 已死，同页 videoSrcHevc 可用时改用后者；
  // 2026-11-04 修：/video/ 的 SSR videoSrc 无 auth_key，实测 403 0 字节；VideoObject 的
  // contentUrl 是同一条带签名的播单，优先用它（否则播单代理 302 回落到死链即加载失败）
  const src0 = jsonStr(html, 'videoSrc');
  const hevc = jsonStr(html, 'videoSrcHevc');
  const signed = videoObjectContentUrl(html);
  let src = '';
  if (src0 && /\/cshort\//i.test(src0)) src = hevc;
  else if (src0 && /auth_key=/i.test(src0)) src = src0;
  else if (signed && /\.m3u8/i.test(signed) && /auth_key=/i.test(signed)) src = signed;
  else if (hevc && /auth_key=/i.test(hevc)) src = hevc;
  else src = src0 || hevc;
  if (src && /^https?:\/\//i.test(src)) {
    if (/\.m3u8(\?|#|$)/i.test(src)) {
      const proxy = proxyUrl(reqIn, '/proxy/m3u8', src, pageUrl);
      return { parse: 0, url: proxy || src, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
    }
    return { parse: 0, url: src, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  // 兜底: 交嗅探打开页面本身
  return { parse: 1, url: pageUrl, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}

// 搜索常 301 跳到 /tag/{slug}/ 页: 记住跳转目标, 翻页直接拼 tag 路径
const searchBaseCache = new Map();

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };

  const cached = searchBaseCache.get(wd);
  if (page > 1 && cached) {
    return buildList(HOST + cached + page + '/', page, false);
  }
  const { html, finalUrl } = await fetchPage(HOST + '/search/' + encodeURIComponent(wd) + '/');
  const list = parseCards(html);
  // 记录跳转后的 tag 路径 (含从分页链接反推)
  let base = '';
  try {
    const p = new URL(finalUrl).pathname;
    if (/^\/tag\/[^/]+\/$/.test(p)) base = p;
  } catch (e) { /* ignore */ }
  if (!base) {
    const pm = html.match(/href="(\/tag\/[^/]+\/)\d+\/"/);
    if (pm) base = pm[1];
  }
  if (base) searchBaseCache.set(wd, base);
  const pager = parsePager(html);
  if (page > 1 && base) {
    return buildList(HOST + base + page + '/', page, false);
  }
  return {
    page,
    pagecount: pager ? pager.pagecount : (list.length >= 20 ? page + 1 : page),
    limit: list.length || 20,
    total: pager ? pager.total : list.length,
    list,
  };
}

// ---------- 播单改写代理（2026-11-04：分片/密钥必带 auth_key，播放器丢签即 403；
// 播单与分片/密钥一律走蜘蛛本地代理，播放器不再直触带签第三方地址。仿 ero 先例的
// /proxy/m3u8 路由，但分片/密钥改为字节透传而非 302（302 回到带签地址等于没修））
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 ero 先例）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}
async function fetchText(url, referer) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST },
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    const text = typeof r.data === 'string' ? r.data : '';
    if (r.status >= 200 && r.status < 300 && text) return text;
  } catch (e) { /* 落空走 302 降级 */ }
  return '';
}
async function fetchBytes(url, referer) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST },
      timeout: 30000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300 && r.data) return Buffer.from(r.data);
  } catch (e) { /* 落空走 302 降级 */ }
  return null;
}
function contentTypeFor(url) {
  const u = String(url).split('?')[0].toLowerCase();
  if (u.endsWith('.ts')) return 'video/mp2t';
  if (u.endsWith('.m4s')) return 'video/iso.segment';
  if (u.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}
function rewriteProxy(raw, playlistUrl, selfBase, referer) {
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            return `URI="${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}"`;
          } catch (e) { return all; }
        });
      }
      return line;
    }
    try {
      const abs = new URL(s, playlistUrl).toString();
      return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
    } catch (e) { return line; }
  });
  return out.join('\n');
}
// GET /proxy/m3u8?u={b64url 地址}&r={b64url referer}：m3u8 走改写，分片/密钥/初始化段走字节透传
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  if (!q.u) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST;
  try {
    target = unb64url(q.u);
    if (q.r) referer = unb64url(q.r) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  try {
    if (/\.m3u8(\?|#|$)/i.test(target)) {
      const raw = await fetchText(target, referer);
      if (!raw || !raw.includes('#EXTM3U')) { reply.redirect(target); return; }
      const host = request.headers && request.headers.host;
      const selfBase = host
        ? `http://${host}/spider/${KEY}/3`
        : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.send(rewriteProxy(raw, target, selfBase, referer));
    } else {
      const buf = await fetchBytes(target, referer);
      if (!buf || !buf.length) { reply.redirect(target); return; }
      reply.header('Content-Type', contentTypeFor(target));
      reply.header('Cache-Control', 'no-cache');
      reply.send(buf);
    }
  } catch (e) {
    try { reply.redirect(target); } catch (e2) { /* 已发送则忽略 */ }
  }
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
      fastify.get('/proxy/m3u8', m3u8Proxy);
      fastify.post('/search', search);
    },
  };
}
