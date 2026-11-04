import req from '../../util/req.js';
import * as cheerio from 'cheerio';

// Pornhub - MiraPlayer Spider（多重兜底版）
// 耐用性设计（针对 2026-11-04 用户报障：部分分类空、全部播不了）：
//  1) 双镜像：cn.pornhub.com 为主，www.pornhub.com 为备用；任一镜像返回空页/拦截页/请求失败时
//     自动换另一镜像重试，不再单点依赖一个域名（设备网络屏蔽某一镜像时另一镜像仍可出数）。
//  2) 列表解析三层兜底：缩略图锚点 -> 标题锚点 -> 卡片内任意 view_video 链接；标题与封面同样多属性兜底，
//     且 vod_id 为空的卡片直接丢弃，杜绝“卡片能看、点开就失败”（旧代码一旦锚点 class 改名就会整页空 id）。
//  3) 详情播单三层提取：flashvars 正则 -> mediaDefinitions 花括号配平扫描 -> 全页 hls videoUrl 扫描；
//     只留 hls（get_media 的 mp4 链接实测只回空 JSON，不可播，已排除）；按清晰度降序、按清晰度去重。
//  4) 播放显式 parse: 0（旧代码没写 parse，App 可能走嗅探而非直播 m3u8，是全部播不了的最大嫌疑）；
//     选集串、整串、裸 URL、vod_id 四种输入全兼容，vod_id 输入时现取详情拿最高清晰度。
//  5) 全链路 try/catch：任一请求失败只换镜像/回空列表，不抛异常导致分类整页空白。
//  6) 详情播单验活 + 重取：站方播单签名按请求轮换 CDN 边缘（实测同一视频连取 3 次，
//     ev-h 边缘的播单可播、hv-h 边缘的播单在 VM 侧直接 410，且与 UA/Referer/Cookie 无关）；
//     详情取到播单后先验最高清晰度 master.m3u8 是否存活，明确已死（410/403/404）时重取详情换一套签名，
//     最多 3 次；验活本身网络不通时不再烧重试，直接回本集（播放器网络可能与蜘蛛不同）。
// 播单为站方签名地址（约 2 小时有效），详情现取现播，不要缓存播单。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HOSTS = ['https://cn.pornhub.com', 'https://www.pornhub.com'];
const PRIMARY = HOSTS[0];

const CATEGORIES = [
  { type_id: 'sy', type_name: 'Home' },
  { type_id: 'cm', type_name: 'Newest' },
  { type_id: 'mv', type_name: 'Most Viewed' },
  { type_id: 'ht', type_name: 'Hottest' },
  { type_id: 'tr', type_name: 'Top Rated' },
  { type_id: 'lg', type_name: 'Longest' },
  { type_id: 'c1', type_name: '亚洲人' },
  { type_id: 'c8', type_name: '巨乳' },
  { type_id: 'c17', type_name: '黑人女' },
  { type_id: 'c27', type_name: '女同' },
  { type_id: 'c28', type_name: '熟女' },
  { type_id: 'c65', type_name: '3P' },
  { type_id: 'c115', type_name: '独家' },
  { type_id: 'c111', type_name: '日本人' },
  { type_id: 'c241', type_name: 'Cosplay' },
  { type_id: 'c105', type_name: '60帧' },
];

function categoryPath(id, page) {
  if (id === 'sy') return page > 1 ? `/video?page=${page}` : '/video';
  if (id.startsWith('c')) return page > 1 ? `/video?c=${id.slice(1)}&page=${page}` : `/video?c=${id.slice(1)}`;
  return page > 1 ? `/video?o=${id}&page=${page}` : `/video?o=${id}`;
}

// 判断一页是不是真实内容页（拦截页/空页/验证页都没有这些标记）
function looksReal(html, need) {
  if (!html || html.length < 5000) return false;
  if (need === 'list') return html.includes('videoBox');
  if (need === 'detail') return html.includes('mediaDefinitions') || html.includes('videoUrl');
  return true;
}

// 双镜像抓取：主镜像失败或返回非内容页时自动换备用镜像；全部失败回空串（不抛异常）
async function fetchHtml(path, need) {
  for (const host of HOSTS) {
    try {
      const { data } = await req.get(host + path, { headers: { 'User-Agent': UA }, timeout: 20000 });
      const html = String(data || '');
      if (looksReal(html, need)) return html;
    } catch (e) { /* 换下一个镜像 */ }
  }
  return '';
}

function normalizePath(id) {
  let path = String(id || '').replace(/^https?:\/\/[^\/]+/, '');
  if (!path.startsWith('/')) path = '/' + path;
  return path;
}

function parseList(html) {
  const $ = cheerio.load(html);
  const list = [];
  $('li.videoBox').each((_, el) => {
    const $el = $(el);
    const href = $el.find('.phimage a.img').attr('href')
      || $el.find('.title a').attr('href')
      || $el.find('a[href*="view_video.php?viewkey="]').attr('href')
      || '';
    const name = $el.find('.title a').attr('title')
      || $el.find('.title a').text().trim()
      || $el.find('.phimage img').attr('alt')
      || '';
    const $img = $el.find('.phimage img').first();
    let pic = $img.attr('src')
      || $img.attr('data-mediumthumb')
      || $img.attr('data-image')
      || $img.attr('data-src')
      || $img.attr('data-thumb')
      || $img.attr('data-original')
      || '';
    if (pic.startsWith('//')) pic = 'https:' + pic;
    const remarks = $el.find('.views').text().trim() || '';
    const duration = $el.find('.duration').text().trim() || '';
    // vod_id 为空的卡片点开必失败，直接丢弃，不让它进列表
    if (href && (name || pic)) {
      list.push({ vod_id: href, vod_name: name, vod_pic: pic, vod_remarks: remarks, vod_duration: duration });
    }
  });
  return list;
}

function qualityOf(def, url) {
  let q = parseInt(String((def && def.quality) || '').replace(/[^0-9]/g, ''), 10) || 0;
  if (!q && url) {
    const m = url.match(/(2160|1440|1080|720|480|360|240)P_/i);
    if (m) q = parseInt(m[1], 10);
  }
  return q;
}

// 只留 hls 播单，按清晰度降序、按清晰度去重，拼成“1080P$url#720P$url...”选集串
function buildEpisodes(defs) {
  const byQ = new Map();
  for (const d of defs) {
    const url = String((d && d.videoUrl) || '');
    if (!url || !/^https?:\/\//.test(url)) continue;
    if (!/\/hls\//.test(url) && !/master\.m3u8/.test(url)) continue;
    const q = qualityOf(d, url);
    if (!byQ.has(q)) byQ.set(q, url);
  }
  const sorted = [...byQ.entries()].sort((a, b) => b[0] - a[0]);
  return sorted.map(([q, u]) => (q ? q + 'P' : '默认') + '$' + u).join('#');
}

function extractMediaDefs(html) {
  // 第 1 层：现行 flashvars 单行赋值正则（实测多页全过，保留为首选）
  const m = html.match(/var flashvars_.* = \{(.*?)\};/);
  if (m && m[1]) {
    try {
      const j = JSON.parse('{' + m[1] + '}');
      if (j.mediaDefinitions && j.mediaDefinitions.length) return j.mediaDefinitions;
    } catch (e) { /* 落到下一层 */ }
  }
  // 第 2 层：全局 mediaDefinitions 数组，花括号配平扫描（变量改名、多行排版也能捡回）
  const idx = html.indexOf('"mediaDefinitions"');
  if (idx >= 0) {
    const arrStart = html.indexOf('[', idx);
    if (arrStart >= 0) {
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = arrStart; i < html.length; i++) {
        const ch = html[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '[' || ch === '{') depth++;
        if (ch === ']' || ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > arrStart) {
        try {
          const arr = JSON.parse(html.slice(arrStart, end + 1));
          if (Array.isArray(arr) && arr.length) return arr;
        } catch (e) { /* 落到下一层 */ }
      }
    }
  }
  // 第 3 层：全页扫描 hls videoUrl（连 mediaDefinitions 字段名都变了也能捡回播单）
  const urls = [];
  const seen = new Set();
  const re = /"videoUrl"\s*:\s*"([^"]+)"/g;
  let mm;
  while ((mm = re.exec(html)) !== null) {
    const u = mm[1].replace(/\\\//g, '/');
    if (/\/hls\//.test(u) && /master\.m3u8/.test(u) && !seen.has(u)) {
      seen.add(u);
      urls.push({ quality: '', videoUrl: u });
    }
  }
  return urls;
}

async function home(e) {
  return { class: CATEGORIES };
}

async function category(e) {
  const id = String(e.body.id || 'sy');
  let page = parseInt(e.body.page, 10) || 1;
  if (page < 1) page = 1;
  const html = await fetchHtml(categoryPath(id, page), 'list');
  const list = html ? parseList(html) : [];
  return { page, pagecount: list.length < 20 ? page : page + 1, list, filter: [] };
}

// 验最高清晰度 master.m3u8 是否存活：'live' | 'dead' | 'unknown'（网络不通）
async function verifyLive(url) {
  try {
    const { data } = await req.get(url, { headers: { 'User-Agent': UA, Referer: PRIMARY + '/' }, timeout: 10000 });
    const text = String(data || '');
    if (text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF')) return 'live';
    return 'dead';
  } catch (e) {
    if (e && e.response && (e.response.status === 410 || e.response.status === 403 || e.response.status === 404)) return 'dead';
    return 'unknown';
  }
}

async function detail(e) {
  const id = String(e.body.id || '');
  if (!id) return { list: [] };
  const path = normalizePath(id);
  let lastPlayUrl = '';
  let lastName = '';
  let lastPic = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const html = await fetchHtml(path, 'detail');
    if (!html) break;
    const playUrl = buildEpisodes(extractMediaDefs(html));
    if (!playUrl) break;
    const $ = cheerio.load(html);
    lastName = $('h1.title').text().trim()
      || $('meta[property="og:title"]').attr('content')
      || $('h1').first().text().trim()
      || $('title').text().trim()
      || '';
    lastPic = $('meta[property="og:image"]').attr('content') || '';
    lastPlayUrl = playUrl;
    const topUrl = playUrl.split('#')[0].split('$').pop() || '';
    const verdict = topUrl ? await verifyLive(topUrl) : 'dead';
    if (verdict === 'live') break;
    if (verdict === 'unknown') break;
    // verdict === 'dead'：本套签名已死，重取详情换一套签名（边缘按请求轮换）
  }
  if (!lastPlayUrl) return { list: [] };
  return { list: [{ vod_id: id, vod_name: lastName, vod_pic: lastPic, vod_play_from: 'Pornhub', vod_play_url: lastPlayUrl }] };
}

async function play(e) {
  const id = String(e.body.id || '');
  let url = '';
  if (id.includes('$')) {
    // 选集串（单集或整串）：取第一集，详情已按清晰度降序排，第一集即最高清晰度
    url = (id.split('#')[0].split('$').pop() || '');
  } else if (/^https?:\/\//.test(id)) {
    url = id;
  }
  if (!url && id) {
    // App 若直接传了 vod_id（/view_video.php?viewkey=...），现取详情拿最高清晰度
    const html = await fetchHtml(normalizePath(id), 'detail');
    if (html) {
      const eps = buildEpisodes(extractMediaDefs(html));
      if (eps) url = (eps.split('#')[0].split('$').pop() || '');
    }
  }
  return { parse: 0, url: url || '', header: { 'User-Agent': UA, origin: PRIMARY, referer: PRIMARY + '/' } };
}

async function search(e) {
  const wd = String(e.body.wd || '');
  let page = parseInt(e.body.page, 10) || 1;
  if (page < 1) page = 1;
  const path = `/video/search?search=${encodeURIComponent(wd)}&page=${page}`;
  const html = await fetchHtml(path, 'list');
  const list = html ? parseList(html) : [];
  return { page, pagecount: list.length < 20 ? page : page + 1, list };
}

export default function spider() {
  return {
    meta: { key: 'py_pornhub', name: 'Pornhub', type: 3 },
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
