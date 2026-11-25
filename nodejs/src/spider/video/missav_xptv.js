// MissAV — 2026-11-26 全面重写（用户令：删了重写；2026-11-26 05:43 再令：
// 只留能做的镜像，不能做的删了别备用，必须修好）。
// 唯一可用镜像是 missav.fans（missav-fetch Worker 实测只有它能拉到，
// live/ws/ai 全是 403）。视频 host 随镜像固定：
//   c.surrit.mrstcdn.store（无码流出等）/ surrit 基域（中文字幕等）/ b-cdn（新片）。
//
// 播放分流（单线，不分组；2026-11-26 根因修正）：
//   c.surrit 子域：直链（与 REX MissAV_ovo 3.6.6 同款，用户 2026-11-24 真机确认
//     可播；此前猫源把子域经本地 /proxy/m3u8 是错的——代理内调未定义的
//     unb64url，每次都回 400，设备侧无限转圈的根因就在此，/proxy 已整段删除）；
//   surrit 基域：走 missav-hls Worker v3（改写 .jpeg 分片为 /seg.ts）；
//   b-cdn：直链（分片已是 .ts）。
//   字幕：沿用已验证的字幕聚合（迅雷 > 迅雷看看 > SubtitleCat）。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_missav_xptv';
const NAME = 'MissAV';

// 唯一可用镜像（用户令 2026-11-26：能做的留，不能做的删）：
// missav-fetch Worker 实测只有 missav.fans 能拉到（200、12 条），
// missav.live / missav.ws / missav.ai 全是 403（16B），已全部删除，
// 不再做备用。视频 host 随之固定为 c.surrit.mrstcdn.store / surrit 基域 / b-cdn。
const HOSTS = ['https://missav.fans'];
let HOST = HOSTS[0];

// HTML 抓取走 missav-fetch Worker（绕设备侧 CF 指纹拦截），未部署时回落直连。
const MISSAV_FETCH = 'https://missav-fetch.li768435813.workers.dev';
// 清单代理走 missav-hls Worker v3（只放行 surrit 基域，改写 .jpeg 分片为 .ts）。
const MISSAV_HLS = 'https://missav-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

// 分类（31 个，与站方一致）
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

const M3U8_SUFFIX = '/playlist.m3u8';

function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function headers(referer) {
  const h = { 'User-Agent': UA };
  if (referer) h['Referer'] = referer;
  return h;
}

// 验证页判定：Cloudflare 挑战页不是真实内容，必须换域名重试。
function isValidMissavHtml(s) {
  if (!s) return false;
  if (s.includes('Just a moment...')) return false;
  if (s.includes('正在进行安全验证')) return false;
  if (s.includes('请验证您是真人')) return false;
  if (s.includes('challenges.cloudflare.com')) return false;
  return s.includes('thumbnail') || s.includes('og:title');
}

// 单个 URL 取数：先走 Worker 腿（绕设备侧 CF 指纹拦截），无效时回落直连。
async function fetchOne(url, referer) {
  try {
    const { data } = await req.get(MISSAV_FETCH + '/?u=' + encodeURIComponent(url), { timeout: 20000 });
    const s = String(data || '');
    if (isValidMissavHtml(s)) return s;
  } catch (e) {}
  try {
    const { data } = await req.get(url, { headers: headers(referer), timeout: 20000 });
    const s = String(data || '');
    if (isValidMissavHtml(s)) return s;
  } catch (e) {}
  return '';
}

// 多域名容灾取 HTML：先试原 URL，无效时把同一路径换到其他域名逐个试，
// 首个有效者胜出并记为当前 HOST；全部无效回 ''。
async function getHtml(url, referer) {
  const list = [];
  const seen = new Set();
  const push = (u) => { if (u && !seen.has(u)) { seen.add(u); list.push(u); } };
  push(url);
  try {
    const u = new URL(url);
    const path = u.pathname + (u.search || '');
    for (const h of HOSTS) push(h + path);
  } catch (e) {}
  for (const cand of list) {
    const s = await fetchOne(cand, referer);
    if (s) {
      try { HOST = new URL(cand).origin; } catch (e) {}
      return s;
    }
  }
  return '';
}

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return HOST + (u.startsWith('/') ? u : '/' + u);
}

// 封面改写（2026-11-26 用户报封面时有时无）：站方新封面 host
// d.surrit.mrstcdn.store 设备侧打不开（DNS 不可达），但同一张封面
// 在 fourhoi.mrstcdn.store 上有同一份（同路径 cover-t.jpg，实测 200 真图），
// 且 fourhoi 本就是旧封面 host、设备侧可达。故只改写封面 host，视频地址不动。
function fixCover(u) {
  u = String(u || '').trim();
  if (!u) return '';
  return u.replace(/^https:\/\/d\.surrit\.mrstcdn\.store\//i, 'https://fourhoi.mrstcdn.store/');
}

// 列表解析：thumbnail 卡片（封面 data-src、标题、链接、备注/时长）。
function parseCards(html) {
  const cards = [];
  if (!html || html.includes('Just a moment...')) return cards;
  const $ = cheerio.load(html);
  $('.thumbnail').each((_, e) => {
    const el = $(e);
    const href = el.find('.text-secondary').attr('href') || '';
    const title = cleanText(el.find('.text-secondary').text());
    if (!href || !title) return;
    const cover = fixCover(absUrl(el.find('.w-full').attr('data-src')));
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
  pagecount = Math.max(pagecount || 0, page);
  return {
    page,
    pagecount,
    limit,
    total: pagecount * limit,
    list,
  };
}

// Dean Edwards packer 解包：详情页的 eval(function(p,a,c,k,e,d)...) 块内含
// 直链 (source=主清单、source842=720p、source1280=1080p)，解包即得。
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

// 从详情 HTML 的 packed JS 解出视频直链，返回 [{name:'1080p',url},...]。
// host 不限（b-cdn / surrit / c.surrit 均可），只出真实分档，不出“自动”。
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

// 拉主清单：先走 missav-hls Worker，再回落直连。返回清单正文（含 #EXTM3U 才算有效）。
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

// 从主清单正文解析分档位高度。
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

// 清单代理地址（missav-hls Worker v3）：只有 surrit 基域走 Worker
// （改写 .jpeg 分片指回 Worker /seg.ts）。子域（c.surrit.*）在 CF 网络内
// SSL 握手失败（525），Worker 取不到、只会 302；b-cdn 分片已是 .ts、
// Worker 白名单不放行（403），一律直链。
function workerProxyUrl(targetUrl, referer) {
  try {
    const hm = String(targetUrl || '').match(/^https?:\/\/([^\/]+)/i);
    const host = hm ? hm[1].toLowerCase() : '';
    if (host !== 'surrit.mrstcdn.store' && host !== 'surrit.com') return targetUrl;
    return `${MISSAV_HLS}/m3u8?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return targetUrl; }
}

// 播放地址分流（2026-11-26 根因修正）：c.surrit 子域一律直链，不再走本地 /proxy。
// 证据：REX MissAV_ovo 3.6.6 同款分流（子域直链、基域走 Worker）用户 2026-11-24
// 真机确认可播；TuT 的加密 REX MissAV 模块同样全分类可播。猫源此前把子域强制
// 经 /proxy/m3u8（js2p  scheme + 本地改写），是唯一与可播的 REX 做法不同的腿，
// 设备侧转圈的根因就在这条腿。surrit 基域仍走 Worker（改写 .jpeg 分片为 .ts）；
// b-cdn 等其他 host 直链。
function playUrlForTrack(reqIn, targetUrl, detailUrl) {
  try {
    return workerProxyUrl(targetUrl, detailUrl) || targetUrl;
  } catch (e) { return targetUrl; }
}

// 详情 + 分档：packed JS 快路径优先，取不到时拉主清单发现分档，再取不到按标准档位现拼。
// 只出真实分档，不出“自动”。
async function getTracks(detailUrl) {
  const html = await getHtml(detailUrl);
  const info = { vod_id: detailUrl, vod_name: '', vod_pic: '', vod_content: '', vod_remarks: '' };
  if (!html) return { info, tracks: [] };
  const $ = cheerio.load(html);
  info.vod_name = cleanText($('meta[property="og:title"]').attr('content')) || cleanText($('title').text());
  info.vod_pic = fixCover(absUrl($('meta[property="og:image"]').attr('content')));
  info.vod_content = cleanText($('meta[property="og:description"]').attr('content'));
  info.vod_remarks = cleanText($('meta[property="og:url"]').attr('content'));

  const tracks = [];
  // UUID：先从 seek 缩略图取，取不到退回任意 UUID（详情页内仅视频自身一个 UUID）。
  let match = html.match(/(?:[a-z0-9.-]*\.)?surrit(?:\.com|\.mrstcdn\.store)\\\/([^"\\]+)\\\/seek\\\/_0\.jpg/);
  if (!match) {
    const anyUuid = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
    if (anyUuid) match = [anyUuid[0], anyUuid[0]];
  }
  // 主机随片变化：优先用 packed 直链自带的主机，取不到才从 HTML 猜。
  let host = 'surrit.mrstcdn.store';
  const packedFirst = extractPackedUrls(html).filter((t) => t.name !== 'master')[0];
  if (packedFirst) {
    const hm = String(packedFirst.url || '').match(/^https?:\/\/([^\/]+)/i);
    if (hm && hm[1]) host = hm[1].toLowerCase();
  } else {
    const hm = String(html || '').match(/([a-z0-9.-]*surrit\.[a-z0-9.-]+)/i);
    if (hm && hm[1]) host = hm[1].replace(/\.+$/, '').toLowerCase();
  }
  const prefix = `https://${host}/`;
  if (match && match[1]) {
    const uuid = match[1];
    // ① 快路径：详情页 packed JS 自带分档直链，解包即得。
    const packed = extractPackedUrls(html).filter((t) => t.name !== 'master');
    const seenNames = new Set();
    for (const t of packed) {
      if (seenNames.has(t.name)) continue;
      seenNames.add(t.name);
      tracks.push(t);
    }
    // ② packed JS 无分档时：拉主清单发现分档。
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
    // ③ 仍无分档时：按标准档位现拼。
    if (!tracks.length) {
      for (const h of [1080, 720, 480, 360]) {
        tracks.push({ name: `${h}p`, url: `${prefix}${uuid}/${h}p/video.m3u8` });
      }
    }
    tracks.sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  }
  return { info, tracks };
}

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

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function homeVod() {
  const { list } = await getCards(JSON.stringify({ id: 'dm509/cn/release', page: 1 }));
  return { list: (list || []).slice(0, 20) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || CLASSES[0].type_id);
  const filters = body.filters || {};
  const { list } = await getCards(JSON.stringify({ id, page, filters }));
  // 本页有内容就报 page+1（App 知道还有下一页）、空页才报 page（到底）。
  return { page, pagecount: list.length ? page + 1 : page, limit: list.length || 12, list };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const vid = String(ids[0] || '').trim();
  if (!vid) return { list: [] };
  const detailUrl = absUrl(vid);
  const { info, tracks } = await getTracks(detailUrl);
  if (!info.vod_name && !tracks.length) return { list: [] };
  // 单线：每档分辨率只给一个地址，按 host 分流（见 playUrlForTrack）。
  // 格式 `名字$详情页@@播单地址`，play() 拆出详情页当 Referer。
  const vod = {
    vod_id: detailUrl,
    vod_name: info.vod_name || detailUrl,
    vod_pic: info.vod_pic,
    vod_remarks: info.vod_remarks,
    vod_content: info.vod_content,
    vod_play_from: NAME,
    vod_play_url: tracks.map((t) => `${t.name}$${detailUrl}@@${playUrlForTrack(reqIn, t.url, detailUrl)}`).join('#'),
  };
  if (vod.vod_name && vod.vod_play_url) subRegister(ids, vod);
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  // App 传进来的 body.id 是 vod_play_url 里的 "线路名$地址" 全串，
  // 必须先剥掉 "$" 前的线路名再返回，否则播放器拿到非法地址。
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let url = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); url = id.slice(at + 2); }
  if (!url) return { parse: 0, url: '' };
  const subsP = subSearchAll(subNormKey(url)).catch(() => []);
  // Origin 跟详情页同源（多域名容灾后详情页可能来自任一域名）。
  let origin = HOST;
  if (durl) { try { origin = new URL(durl).origin; } catch (e) {} }
  return subAttach({
    parse: 0,
    url,
    header: {
      'User-Agent': UA,
      'Referer': durl || HOST + '/',
      'Origin': origin,
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
    },
  };
}
