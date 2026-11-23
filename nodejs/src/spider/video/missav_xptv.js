import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_missav_xptv';
const NAME = 'MissAV';
// 源文件(XPTV)里的 site 是 https://missav.ai，但实测该域名不通(超时)，
// 用户此前已确认可用域名为 missav.fans，此处使用可用域名
const HOST = 'https://missav.fans';
// HTML 抓取走 missav-fetch Worker（绕设备侧 CF 指纹拦截），未部署时回落直连
const MISSAV_FETCH = 'https://missav-fetch.li768435813.workers.dev';
// 清单代理走 missav-hls Worker（2026-11-23 新建）：设备侧蜘蛛 req 直取
// surrit 清单被 CF 指纹拦截，本地 /proxy/m3u8 拉不到清单、蜘蛛也发现
// 不了分档位线路；Worker 在 Cloudflare 网络内拉清单并改写分片后缀
// (?x=.ts，ffmpeg 拒 .jpeg 分片)，只转清单文本、不转视频分片。
const MISSAV_HLS = 'https://missav-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

// 源文件 appConfig.tabs 映射 (31 个分类)
const CLASSES = [
  { type_id: 'dm509/cn/release', type_name: '新作上市' },
  { type_id: 'dm561/cn/uncensored-leak', type_name: '无码流出' },
  { type_id: 'dm265/cn/chinese-subtitle', type_name: '中文字幕' },
  { type_id: 'cn/genres/%E5%B7%A8%E4%B9%B3', type_name: '巨乳' },
  { type_id: 'cn/genres/%E5%A4%A7%E5%B1%81%E8%82%A1', type_name: '大屁股' },
  { type_id: 'dm2091/cn/genres/VR', type_name: 'VR' },
  { type_id: 'dm242/cn/today-hot', type_name: '今日热门' },
  { type_id: 'dm168/cn/weekly-hot', type_name: '本週热门' },
  { type_id: 'dm207/cn/monthly-hot', type_name: '本月热门' },
  { type_id: 'dm23/cn/siro', type_name: 'SIRO' },
  { type_id: 'dm20/cn/luxu', type_name: 'LUXU' },
  { type_id: 'dm17/cn/gana', type_name: 'GANA' },
  { type_id: 'dm14/cn/maan', type_name: 'PRESTIGE PREMIUM' },
  { type_id: 'dm23/cn/scute', type_name: 'S-CUTE' },
  { type_id: 'dm19/cn/ara', type_name: 'ARA' },
  { type_id: 'dm95/cn/fc2', type_name: 'FC2' },
  { type_id: 'dm628/cn/heyzo', type_name: 'HEYZO' },
  { type_id: 'dm29/cn/tokyohot', type_name: '东京热' },
  { type_id: 'dm58345/cn/1pondo', type_name: '一本道' },
  { type_id: 'dm124158/cn/caribbeancom', type_name: 'Caribbeancom' },
  { type_id: 'dm1442/cn/caribbeancompr', type_name: 'Caribbeancompr' },
  { type_id: 'dm58632/cn/10musume', type_name: '10musume' },
  { type_id: 'dm668/cn/pacopacomama', type_name: 'pacopacomama' },
  { type_id: 'dm135/cn/gachinco', type_name: 'Gachinco' },
  { type_id: 'dm26/cn/xxxav', type_name: 'XXX-AV' },
  { type_id: 'dm24/cn/marriedslash', type_name: '人妻斩' },
  { type_id: 'dm19/cn/naughty4610', type_name: '顽皮 4610' },
  { type_id: 'dm22/cn/naughty0930', type_name: '顽皮 0930' },
  { type_id: 'dm34/cn/madou', type_name: '麻豆传媒' },
  { type_id: 'dm17/cn/twav', type_name: 'TWAV AV' },
  { type_id: 'dm15/cn/furuke', type_name: 'Furuke AV' },
];

const M3U8_PREFIXES = [
  'https://surrit.mrstcdn.store/', // 当前实际使用的 surrit 域名(2026-10 实测)
  'https://surrit.com/',           // XPTV 源文件里的旧域名,保留兜底
];
const M3U8_SUFFIX = '/playlist.m3u8';

// ---------- m3u8 本地代理 (修复分片 .jpeg 伪装导致的不可拖动) ----------
// 病因 (2026-10-23 实证): surrit 的分片是 TS 内容却用 videoN.jpeg
// 文件名 + image/jpeg 类型下发。严格 HLS 内核 (ffmpeg 系, 本地
// ffprobe 实测) 按分片扩展名白名单直接拒绝 .jpeg 分片 ("not in
// allowed_segment_extensions"), 建不起 VOD 时间轴: 播放器退化为
// 不可拖动的流式播放、还可能从中间分片起播 (用户真机反馈: 不从
// 头播 + 没办法快进后退)。实测给分片 URL 尾加 ?x=.ts 后 ffmpeg
// 立刻能解析时长/拖动, 而 CDN 忽略查询串、字节不变。
// 修法 (同 avhub /proxy/m3u8 先例): detail 的播放地址改为本地
// 代理地址, 代理实时拉清单并改写——媒体清单的分片行改成 CDN
// 绝对地址 + ?x=.ts 后缀 (分片仍直连 CDN, 不经代理); 主清单的
// variant 行改指回代理 (让 variant 清单也被改写)。代理拉取失败
// 时 302 回源清单, 不比旧行为更差。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 构造本地代理地址 (js2p://_WEB_ 为 App 动态地址 scheme, 同 avhub 先例)
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

async function fetchPlaylistText(url, referer) {
  try {
    const { data, status } = await req.get(url, {
      headers: headers(referer),
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    if (status >= 200 && status < 300 && data) return String(data);
  } catch (e) { /* 落空走 302 降级 */ }
  return '';
}

// 播放地址 (2026-11-23 第八轮)：分主机走不同的代理，全部改写分片为 .ts
// ——MiraPlayer 的 ffmpeg 拒 .jpeg 分片，直接给它 .jpeg 直链播不了。
//   ① 子域主机 (c.surrit 等)：Worker 拉不到 (SSL 525)，走猫源本地
//      /proxy/m3u8（设备本机拉清单、分片改写为 /proxy/<b64>/<b64>.ts，
//      第五轮已按 py_mogu 已验证写法落地）；
//   ② 基域 (surrit.mrstcdn.store / surrit.com)：走 missav-hls Worker v3
//      (/m3u8 改写分片指回 Worker /seg.ts)。
// 之前第六轮给子域回直链是错的：REX 播放器吃 .jpeg，MiraPlayer 不吃，
// 所以只有基域（走 Worker、已改 .ts）的中文字幕能播，其他分类全灭。
function playUrlForTrack(reqIn, targetUrl, detailUrl) {
  try {
    const hm = String(targetUrl || '').match(/^https?:\/\/([^\/]+)/i);
    const host = hm ? hm[1].toLowerCase() : '';
    const isSub = host && host !== 'surrit.mrstcdn.store' && host !== 'surrit.com' &&
      (host.indexOf('.surrit.mrstcdn.store') > 0 || host.indexOf('.surrit.com') > 0);
    if (isSub) {
      return proxyUrl(reqIn, '/proxy/m3u8', targetUrl, detailUrl) || targetUrl;
    }
    return workerProxyUrl(targetUrl, detailUrl) || targetUrl;
  } catch (e) { return targetUrl; }
}

// 清单代理地址 (missav-hls Worker v3)：u/r 为 b64url 编码。
// 子域主机 (如 c.surrit.mrstcdn.store) 在 Cloudflare 网络内 SSL 握手
// 失败 (525)，Worker 取不到、只会 302 回直链；这类主机直接回直链，
// 播放器经设备网络直取 (同 REX 3.6.6 已验证能播)。基域仍走 Worker
// (v3 改写分片指回 Worker /seg.ts)。
function workerProxyUrl(targetUrl, referer) {
  try {
    const hm = String(targetUrl || '').match(/^https?:\/\/([^\/]+)/i);
    const host = hm ? hm[1].toLowerCase() : '';
    if (host && host !== 'surrit.mrstcdn.store' && host !== 'surrit.com' &&
      (host.indexOf('.surrit.mrstcdn.store') > 0 || host.indexOf('.surrit.com') > 0)) {
      return targetUrl;
    }
    return `${MISSAV_HLS}/m3u8?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

// 拉主清单：先走 missav-hls Worker（绕设备侧 CF 指纹拦截），再回落直连。
// 返回清单正文（含 #EXTM3U 才算有效），拉不到返回 ''。
async function fetchMasterPlaylist(masterUrl, referer) {
  try {
    const w = workerProxyUrl(masterUrl, referer);
    if (w) {
      const { data } = await req.get(w, { timeout: 20000 });
      const s = String(data || '');
      if (s.includes('#EXTM3U')) return s;
    }
  } catch (e) { /* 回落直连 */ }
  try {
    const { data } = await req.get(masterUrl, {
      headers: headers(referer),
      timeout: 20000,
    });
    const s = String(data || '');
    if (s.includes('#EXTM3U')) return s;
  } catch (e) { /* 拉不到 */ }
  return '';
}

// 从主清单正文解析分档位高度：优先 STREAM-INF 的 RESOLUTION，
// 回落直连清单的相对 variant 行 (720p/video.m3u8)。
// Worker 改写后的主清单 variant 行已指回 Worker，但 STREAM-INF 的
// RESOLUTION 不变，故两种格式通用；返回去重后降序高度数组。
function parseVariantHeights(masterText) {
  const heights = [];
  const lines = String(masterText || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const m = line.match(/RESOLUTION=\d+x(\d+)/i);
    if (m) heights.push(parseInt(m[1], 10));
  }
  if (!heights.length) {
    for (const raw of lines) {
      const t = raw.trim();
      const m = t.match(/^(\d+)p\/video\.m3u8$/);
      if (m) heights.push(parseInt(m[1], 10));
    }
  }
  return [...new Set(heights)].filter((h) => h > 0).sort((a, b) => b - a);
}

// Dean Edwards packer 解包：详情页的 eval(function(p,a,c,k,e,d)...) 块内含
// 直链 (source=主清单、source842=720p、source1280=1080p)，解包即得，
// 无需拉主清单，解析快且主机随片正确。
function unpackPacker(packed) {
  if (!packed) return '';
  const m = String(packed).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\),0,\{\}\)\)/);
  if (!m) return '';
  const p = m[1].replace(/\\'/g, "'");
  const a = parseInt(m[2], 10) || 36;
  const k = m[4].split('|');
  return p.replace(/\b[0-9a-z]+\b/g, (w) => {
    const idx = parseInt(w, a);
    if (!isNaN(idx) && idx >= 0 && idx < k.length && k[idx]) return k[idx];
    return w;
  });
}

// 从详情 HTML 的 packed JS 解出 surrit 直链，返回 [{name:'1080p',url},...]。
// name 由 URL path 取 (/1080p/ /720p/ /480p/ /360p/)，master 为 playlist.m3u8。
// source1280 实际指 720p 时 (无 1080p 的片) 按 path 归 720p 并去重。
function extractPackedUrls(html) {
  const out = [];
  if (!html) return out;
  const blocks = String(html).match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('[\s\S]*?',\d+,\d+,'[\s\S]*?'\.split\('\|'\),0,\{\}\)\)/g) || [];
  const seen = new Set();
  for (const block of blocks) {
    let unpacked = '';
    try { unpacked = unpackPacker(block); } catch (e) { continue; }
    if (!unpacked) continue;
    const urls = unpacked.match(/https?:\/\/[^\s'"<>]+\.m3u8/g) || [];
    for (const raw of urls) {
      const url = String(raw).replace(/\\+$/g, '');
      if (!/surrit/i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      const rm = url.match(/\/(1080p|720p|480p|360p)\/video\.m3u8/i);
      const name = rm ? rm[1].toLowerCase() : (url.includes('playlist.m3u8') ? 'master' : '');
      if (!name) continue;
      out.push({ name, url });
    }
  }
  return out;
}

// 从详情 HTML 取 surrit 主机 (随片变化：surrit.mrstcdn.store /
// c.surrit.mrstcdn.store ...)，构造直链时用此主机，勿写死。
// HTML 里链接常为转义形式 (https:\\/\\/c.surrit...)，故不锚定 scheme，
// 直接匹配主机名。
function surritHostFromHtml(html) {
  const m = String(html || '').match(/([a-z0-9.-]*surrit\.[a-z0-9.-]+)/i);
  return m ? m[1].replace(/\.+$/, '') : '';
}

// 取字节（清单/分片通用）：30s 超时、2 次尝试；失败返回 null，走 302 降级。
// （同 py_mogu/py_siguaspw 已验证的写法：responseType arraybuffer，
// 不加 transformResponse，Buffer.from(r.data)。）
async function fetchBytes(url, referer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: headers(referer),
        timeout: 30000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (r.status >= 200 && r.status < 300 && r.data) return Buffer.from(r.data);
    } catch (e) { /* 重试，落空走 302 降级 */ }
  }
  return null;
}

// 改写清单正文: selfBase 为代理自身地址 (由进来的请求 Host 拼出,
// 清单正文里必须是真实 http 地址, 不能嵌 js2p)。
// - 主清单 (含 EXT-X-STREAM-INF): variant 行 -> 指回代理;
// - 媒体清单: 分片行 -> 路径段形式 /proxy/<b64url>/<b64url>.ts
//   (末尾加 .ts 后缀过 ffmpeg 分片后缀白名单；b64url 字母表无 '.',
//   代理入口先剥后缀再解码，无歧义；同 py_mogu/py_siguaspw 已验证);
// - # 行 URI="..." 属性 absolutize (surrit 无密钥, 仅兜底)。
function rewriteMissavM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = raw.includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try { return `URI="${new URL(uri, playlistUrl).toString()}"`; } catch (e) { return all; }
        });
      }
      return line;
    }
    let abs;
    try { abs = new URL(s, playlistUrl).toString(); } catch (e) { return line; }
    if (isMaster) {
      return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
    }
    // 媒体清单: 分片不走 CDN 直链, 改走本地代理路径段形式。
    // 播放器直取 CDN 分片会失败 (随片主机 c.surrit 等在播放器网络侧
    // 不可达, 且 .jpeg 后缀会被 ffmpeg 白名单拒); 代理经设备 req.get
    // 取分片 (与清单同一网络路径, 带 Referer/UA), URL 以 .ts 结尾。
    return `${selfBase}/proxy/${b64url(abs)}/${b64url(referer || '-')}.ts`;
  });
  return out.join('\n');
}

// 代理入口（两种地址格式都接受，同 py_mogu/py_siguaspw 已验证）：
// 主格式（detail/play 发出）：/proxy/m3u8?u={b64url}&r={b64url}；
// 分片格式（改写后的媒体清单分片行）：/proxy/{b64url 目标}/{b64url referer}.ts。
// 取回的文本是 #EXTM3U 即按清单改写；否则按字节透传：路径段形式来的是
// 分片回 video/mp2t（支持 Range，便于拖动），查询串形式来的是密钥回
// application/octet-stream。取不到时 302 回原地址。
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  let viaPath = false;
  if (!uEnc) {
    const wild = request?.params && request.params['*'];
    let segs = [];
    if (wild) segs = String(wild).split('/').filter(Boolean);
    else {
      const rawPath = String((request?.raw && request.raw.url) || request?.url || '').split('?')[0];
      const pi = rawPath.indexOf('/proxy/');
      if (pi >= 0) segs = rawPath.slice(pi + 7).split('/').filter(Boolean);
    }
    if (segs.length && segs[segs.length - 1].endsWith('.ts')) {
      segs[segs.length - 1] = segs[segs.length - 1].slice(0, -3);
    }
    if (segs.length) { uEnc = segs[0]; rEnc = segs[1] || ''; viaPath = true; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  const buf = await fetchBytes(target, referer);
  if (!buf || !buf.length) { reply.redirect(target); return; }
  const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
  if (head.trimStart().startsWith('#EXTM3U')) {
    reply.header('Content-Type', 'application/vnd.apple.mpegurl');
    reply.header('Cache-Control', 'no-cache');
    reply.send(rewriteMissavM3u8(buf.toString('utf8'), target, selfBase, referer));
    return;
  }
  // 非清单内容：路径段形式来的是分片；查询串形式来的是密钥（16 字节）。
  if (viaPath) {
    const range = request?.headers && request.headers.range;
    const m = range ? String(range).match(/bytes=(\d+)-(\d*)/) : null;
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Accept-Ranges', 'bytes');
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
      if (start < buf.length && start <= end) {
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        reply.send(buf.subarray(start, end + 1));
        return;
      }
    }
    reply.send(buf);
    return;
  }
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.send(buf);
}

function headers(referer) {
  const h = { 'User-Agent': UA };
  if (referer) h['Referer'] = referer;
  return h;
}

async function getHtml(url, referer) {
  // 先走 Worker 腿（绕设备侧 CF 指纹拦截）；Worker 未部署或返回无效时回落直连
  try {
    const { data } = await req.get(MISSAV_FETCH + '/?u=' + encodeURIComponent(url), { timeout: 20000 });
    const s = String(data || '');
    if (s && !s.includes('Just a moment...') && (s.includes('thumbnail') || s.includes('og:title'))) return s;
  } catch (e) {}
  try {
    const { data } = await req.get(url, { headers: headers(referer), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    return '';
  }
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return HOST + (u.startsWith('/') ? u : '/' + u);
}

// 解析视频卡片列表 (.thumbnail),对应 XPTV getCards/search 的解析逻辑
function parseCards(html) {
  const cards = [];
  if (!html || html.includes('Just a moment...')) return cards;
  const $ = cheerio.load(html);
  $('.thumbnail').each((_, e) => {
    const el = $(e);
    const href = el.find('.text-secondary').attr('href') || '';
    const title = cleanText(el.find('.text-secondary').text());
    if (!href || !title) return;
    const cover = absUrl(el.find('.w-full').attr('data-src'));
    const remarks = cleanText(el.find('.left-1').text());
    const duration = cleanText(el.find('.right-1').text());
    cards.push({
      vod_id: absUrl(href),
      vod_name: title,
      vod_pic: cover,
      vod_remarks: [remarks, duration].filter(Boolean).join(' '),
    });
  });
  return cards;
}

// 从分页链接提取最大页码
function parsePagecount(html, curPage) {
  let max = 0;
  const re = /[?&]page=(\d+)/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max > 0 ? max : (curPage + 1);
}

function wrapPage(page, pagecount, list) {
  list = Array.isArray(list) ? list : [];
  const limit = list.length || 12;
  // 确保 pagecount 至少为当前页，避免播放器认为没有更多页
  pagecount = Math.max(pagecount || 0, page);
  return {
    page,
    pagecount,
    limit,
    total: pagecount * limit,
    list,
  };
}

// 对应 XPTV getCards: ext = JSON 字符串 {id, page, filters?}
async function getCards(ext) {
  ext = JSON.parse(ext || '{}');
  const { page = 1, id, filters = {} } = ext;
  if (!id) return { html: '', list: [] };
  let url = `${HOST}/${id}?page=${page}`;
  if (filters.filters) url += `&filters=${encodeURIComponent(filters.filters)}`;
  if (filters.sort) url += `&sort=${encodeURIComponent(filters.sort)}`;
  else url += '&sort=released_at';
  if (filters.keyword) url += `&keyword=${encodeURIComponent(filters.keyword)}`;
  if (filters.actress) url += `&actress=${encodeURIComponent(filters.actress)}`;
  if (filters.tag) url += `&tag=${encodeURIComponent(filters.tag)}`;
  const html = await getHtml(url);
  return { html, list: parseCards(html) };
}

// 对应 XPTV getTracks + 详情页信息解析
// 返回: { info: {vod_id, vod_name, vod_pic, vod_content, vod_remarks}, tracks: [{name, url}] }
async function getTracks(detailUrl) {
  const html = await getHtml(detailUrl);
  const info = { vod_id: detailUrl, vod_name: '', vod_pic: '', vod_content: '', vod_remarks: '' };
  if (!html) return { info, tracks: [] };
  const $ = cheerio.load(html);
  info.vod_name = cleanText($('meta[property="og:title"]').attr('content')) || cleanText($('title').text());
  info.vod_pic = absUrl($('meta[property="og:image"]').attr('content'));
  info.vod_content = cleanText($('meta[property="og:description"]').attr('content'));
  info.vod_remarks = cleanText($('meta[property="og:url"]').attr('content'));

  const tracks = [];
  // XPTV 正则 /surrit\.com\\\/(.+)\\\/seek\\\/_0\.jpg/
  // 实测站点已换成 surrit.mrstcdn.store，这里同时兼容新旧域名与随片子域
  // (c.surrit.mrstcdn.store 等，SNOS-524 的根因：写死主机拿不到 UUID)。
  let match = html.match(/(?:[a-z0-9.-]*\.)?surrit(?:\.com|\.mrstcdn\.store)\\\/([^"\\]+)\\\/seek\\\/_0\.jpg/);
  // 兜底 (2026-11-23): 个别详情页无 seek 缩略图时,退回任意 UUID
  // (实测详情页内仅视频自身一个 UUID)。
  if (!match) {
    const anyUuid = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
    if (anyUuid) match = [anyUuid[0], anyUuid[0]];
  }
  // 主机随片变化 (surrit.mrstcdn.store / c.surrit.mrstcdn.store ...)，从
  // seek 链接取，勿写死；写死主机是 SNOS-524 拿不到分档的根因。
  // (2026-11-23 第十一轮：packed 直链自带正确主机，优先用它，勿用
  // surritHostFromHtml 首匹配——HTML 里可能先出现别的主机。)
  let host = surritHostFromHtml(html) || 'surrit.mrstcdn.store';
  const packedFirst = extractPackedUrls(html).filter((t) => t.name !== 'master')[0];
  if (packedFirst) {
    const hm = String(packedFirst.url || '').match(/^https?:\/\/([^\/]+)/i);
    if (hm && hm[1]) host = hm[1].toLowerCase();
  }
  const prefix = `https://${host}/`;
  if (match && match[1]) {
    const uuid = match[1];
    // ① 快路径 (2026-11-23)：详情页 packed JS 自带 1080p/720p 直链
    // (source1280/source842)，解包即得，无需拉主清单，解析快。
    // 只出真实分档，不出“自动”。
    const packed = extractPackedUrls(html).filter((t) => t.name !== 'master');
    const seenNames = new Set();
    for (const t of packed) {
      if (seenNames.has(t.name)) continue;
      seenNames.add(t.name);
      tracks.push(t);
    }
    // ② packed JS 无分档时：用正确主机拉主清单发现分档 (Worker 优先)。
    if (!tracks.length) {
      const masterUrl = prefix + uuid + M3U8_SUFFIX;
      const body = await fetchMasterPlaylist(masterUrl, detailUrl);
      if (body) {
        const heights = parseVariantHeights(body);
        for (const h of heights) {
          tracks.push({ name: `${h}p`, url: `${prefix}${uuid}/${h}p/video.m3u8` });
        }
      }
    }
    // ③ 仍无分档时：按标准档位现拼 (1080p/720p/480p/360p)，只出真实
    // 分档、不出“自动”；播放器点不存在的档会失败，但总比只有“自动”强，
    // 且多数片至少有 720p/480p/360p。
    if (!tracks.length) {
      for (const h of [1080, 720, 480, 360]) {
        tracks.push({ name: `${h}p`, url: `${prefix}${uuid}/${h}p/video.m3u8` });
      }
    }
    tracks.sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  }
  return { info, tracks };
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function homeVod() {
  // 首页推荐改用"新作上市"第一页（2026-11-02 查实：新作上市与最近更新第 1、2 页内容连顺序全同，最近更新分类已删）
  const { list } = await getCards(JSON.stringify({ id: 'dm509/cn/release', page: 1 }));
  return { list: (list || []).slice(0, 20) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || CLASSES[0].type_id);
  const filters = body.filters || {};
  const { list } = await getCards(JSON.stringify({ id, page, filters }));
  // 翻页 (2026-11-23)：改用包内已验证的动态 pagecount（py_siguaspw 同款）——
  // 本页有内容就报 page+1（App 知道还有下一页）、空页才报 page（到底）。
  // 之前固定 pagecount:999 + limit:list.length，加载更多不出新内容。
  const items = list || [];
  return { page, pagecount: items.length ? page + 1 : page, limit: items.length || 12, list: items };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const vid = String(ids[0] || '').trim();
  if (!vid) return { list: [] };
  const detailUrl = absUrl(vid);
  const { info, tracks } = await getTracks(detailUrl);
  if (!info.vod_name && !tracks.length) return { list: [] };
  // 播放地址 (2026-11-24 第十二轮，用户令)：拆掉多线路分组，回到单线
  // 正常播放——每档分辨率只给一个地址，不再分“本地代理/直连”两组。
  // 地址直接用详情页 packed JS 的 surrit 直链（REX 同款直链，站方未换
  // 址：missav.fans + c.surrit.mrstcdn.store 已复核）；play() 按
  // py_mogu 格式 `名字$详情页@@播单地址` 拆出详情页当 Referer。
  // 探针已删（用户反馈详情页小字被挡、看不到）。
  const vod = {
    vod_id: detailUrl,
    vod_name: info.vod_name || detailUrl,
    vod_pic: info.vod_pic,
    vod_remarks: info.vod_remarks,
    vod_content: info.vod_content,
    vod_play_from: NAME,
    vod_play_url: tracks.map((t) => `${t.name}$${detailUrl}@@${t.url}`).join('#'),
  };
  if (vod.vod_name && vod.vod_play_url) subRegister(ids, vod);
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  // 根因 (2026-11-23)：App 传进来的 body.id 是 vod_play_url 里的
  // "线路名$地址" 全串（如 1080p$https://...），必须先剥掉 "$" 前的
  // 线路名再返回，否则播放器拿到的是非法地址、转圈几秒后加载失败。
  // 能播的源（py_mogu/py_siguaspw）都在 play() 开头剥 "$"，这里漏了。
  // 第十轮：地址按 py_mogu 格式带详情页 `名字$详情页@@播单地址`，
  // 剥 "$" 后再按 "@@" 拆出详情页当 Referer（REX 送详情页 Referer）。
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let url = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); url = id.slice(at + 2); }
  if (!url) return { parse: 0, url: '' };
  const subsP = subSearchAll(subNormKey(url)).catch(() => []);
  // XPTV getPlayinfo 直接返回直链 + 请求头;此处返回给客户端
  // (2026-11-23 第十一轮：补 Origin，REX 每集带 Referer+UA+Origin 三件套)。
  return subAttach({
    parse: 0,
    url,
    header: {
      'User-Agent': UA,
      'Referer': durl || HOST + '/',
      'Origin': HOST,
    },
  }, subsP);
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 12, total: 0, list: [] };
  const text = encodeURIComponent(wd);
  const url = `${HOST}/cn/search/${text}?page=${page}`;
  const html = await getHtml(url);
  const list = parseCards(html);
  return { page, pagecount: 999, limit: list.length || 12, total: 999 * 12, list };
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。
const SUB_UA = (typeof UA !== 'undefined' && UA) ? UA : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function subCleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。
async function subHttp(url, headers, timeoutMs) {
  try {
    const r = await req.request({
      method: 'GET',
      url,
      headers: headers || {},
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const text = typeof r.data === 'string' ? r.data : (r.data == null ? '' : String(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。
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

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? subCleanText(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
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

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
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

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
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

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
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

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
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

// oracle 条目归一 (组件 normalizeResult 的字段口径)
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

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
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

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
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

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
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

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
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
    const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
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

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
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

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

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
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
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

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}

export default function spider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/homeVod', homeVod);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
      // (2026-11-24 第十二轮，用户令拆代理)：本地 /proxy/* 代理路由已摘，
      // 不再走本地代理；m3u8Proxy/fetchBytes/rewriteMissavM3u8 等函数留
      // 在文件内备查，不再被调用。
    },
  };
}
