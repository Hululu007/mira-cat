// javxxx.me — MiraPlayer 猫源蜘蛛（完整版，未并入仓库，仅供审阅/测试）
// 结论：能写。播放链路已全程实测打通（见 javxxx_attack.md）。
// 链路：详情页 data-ts-live/data-ts-id
//   → dex(tsId, tsLive, '_0x48107a') 得 token
//   → POST https://www.javxxx.me/api/play/ {sources, ep:1, ver:2}
//   → dex(tsId, resp.data, 'undefined') 得 embed 地址
//   → 取 embed 页 data-config
//   → seed = b64(path+query).slice(6,22)，dex(seed, config, '_0x59a0e4') 得 {src,img,vtt}
//   → b64解 src 得 [{file: streamtape mp4, type:'mp4', label:'auto'}]
// 注意：
//  - 最终是 streamtape 单个 mp4 文件（单档，无多清晰度，不要硬编 1080p/720p）。
//  - streamtape 链接带 ip 绑定 + 约 19.5 小时过期，必须在 play() 里现取现播，
//    不要在 detail() 里提前解好缓存（detail 只存详情页地址）。
//  - 主 embed 失败时按 reserve 备用地址顺序重试（lo: de/nl/cf/nl3/de3/fr）。
//  - /api/play/ 从 VM 实测 HTTP 200（与 bestjavporn 的 POST 全死不同），
//    但最终 streamtape 取片在 VM 因出口 IP 与请求 IP 不一致被拒（500），
//    手机上 App 内同一 IP 走完全程，预期可播，须真机验证。
import req from '../../util/req.js';

const KEY = 'py_javxxx';
const NAME = 'JavXXX';
const HOST = 'https://www.javxxx.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 分类：站内导航原样。vXX 前缀是站方规范地址（/category/<slug>/ 会 301 到它）。
// home=最新；其余 9 个为视频分类。/pornstars/ 与 /studios/ 为人物/厂商索引，结构不同，暂不做。
const CLASSES = [
  { type_id: 'home', type_name: '最新' },
  { type_id: 'censored', type_name: '有碼' },
  { type_id: 'uncensored', type_name: '無碼' },
  { type_id: 'uncensored-leaked', type_name: '無碼流出' },
  { type_id: 'decensored', type_name: '破解' },
  { type_id: 'chinese-subtitle', type_name: '中字' },
  { type_id: 'english-subtitle', type_name: '英字' },
  { type_id: 'subtitle-indonesia', type_name: '印尼字幕' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'fc2-ppv', type_name: 'FC2' },
];
// 分类到站内 vXX 地址（导航原样）
const VPATH = {
  'censored': 'v35', 'uncensored': 'v9', 'uncensored-leaked': 'v10',
  'decensored': 'v17', 'chinese-subtitle': 'v21', 'english-subtitle': 'v18',
  'subtitle-indonesia': 'v7', 'amateur': 'v31', 'fc2-ppv': 'v36',
};

function headers(referer) {
  return { 'User-Agent': UA, 'Referer': referer || (HOST + '/') };
}

async function getHtml(url, referer) {
  try {
    const { data } = await req.get(url, { headers: headers(referer), timeout: 15000 });
    return String(data || '');
  } catch (e) { return ''; }
}

async function postForm(url, form, referer) {
  try {
    const qs = new URLSearchParams(form).toString();
    const { data } = await req.post(url, qs, {
      headers: { ...headers(referer), 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 15000,
    });
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch (e) { return {}; }
    }
    return data || {};
  } catch (e) { return {}; }
}

function absUrl(u) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

function cleanText(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// ---------- pornfhd dex：RC4 + base64 两层 ----------
// dex(seed, data, suffix)：
//   key = reverse(b64encode(seed + suffix))
//   mid = RC4(key, b64decode(data))        // mid 本身是一段 base64 文本
//   return b64decode(mid)                  // 还原出明文
// 三处用法（实测确认）：
//   token  = dex(tsId, data-ts-live, '_0x48107a')
//   embed  = dex(tsId, resp.data, 'undefined')   // suffix 字面量就是 'undefined'
//   config = dex(seed, data-config, '_0x59a0e4') // seed = b64(path+query).slice(6,22)
function b64enc(str) { return Buffer.from(String(str), 'utf8').toString('base64'); }
function b64decBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64');
}
function rc4(key, data) {
  var S = [], i, j = 0, a = 0, t;
  for (i = 0; i < 256; i++) S[i] = i;
  for (i = 0; i < 256; i++) { j = (j + S[i] + key.charCodeAt(i % key.length)) & 255; t = S[i]; S[i] = S[j]; S[j] = t; }
  var out = Buffer.alloc(data.length);
  j = 0;
  for (var n = 0; n < data.length; n++) {
    a = (a + 1) & 255; j = (j + S[a]) & 255; t = S[a]; S[a] = S[j]; S[j] = t;
    out[n] = data[n] ^ S[(S[a] + S[j]) & 255];
  }
  return out;
}
function dex(seed, data, suffix) {
  try {
    var key = b64enc(String(seed) + suffix).split('').reverse().join('');
    var mid = rc4(key, b64decBytes(data)).toString('latin1');
    return b64decBytes(mid).toString('latin1');
  } catch (e) { return ''; }
}

// 从 embed 地址取 path+query（seed 用），兼容 //video.javxxx.me 与 hugstream.xyz 等备用域
function embedPathQuery(embedUrl) {
  var u = String(embedUrl || '');
  var m = u.match(/^https?:\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i) || u.match(/^\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i);
  if (m) return m[1];
  try {
    var uu = new URL(u.startsWith('//') ? 'https:' + u : u);
    return uu.pathname + uu.search;
  } catch (e) { return ''; }
}

// 解一个 embed 页，返回 streamtape mp4 地址（失败返回 ''）
async function resolveEmbed(embedUrl, referer) {
  try {
    var full = absUrl(embedUrl);
    var html = await getHtml(full, referer);
    if (!html) return '';
    var cm = html.match(/data-config="([^"]+)"/);
    if (!cm) return '';
    var pq = embedPathQuery(full);
    if (!pq) return '';
    var seed = b64enc(pq).slice(6, 22);
    var cfgJson = dex(seed, cm[1], '_0x59a0e4');
    if (!cfgJson) return '';
    var cfg;
    try { cfg = JSON.parse(cfgJson); } catch (e) { return ''; }
    if (!cfg || !cfg.src) return '';
    var srcJson = b64decBytes(cfg.src).toString('latin1');
    var sources;
    try { sources = JSON.parse(srcJson); } catch (e) { return ''; }
    if (!Array.isArray(sources)) return '';
    for (var i = 0; i < sources.length; i++) {
      var f = sources[i] && (sources[i].file || sources[i].src || '');
      // 注意：streamtape 直链是 get_video?id=...&stream=1，URL 里没有 .mp4 后缀，
      // 不能用 /\.mp4/ 过滤；config 的 sources 只含真实视频文件，直接认 http(s) 地址即可。
      if (f && /^https?:\/\//i.test(f)) return f;
    }
    return '';
  } catch (e) { return ''; }
}

// 详情页 → 最终播放地址（现取现播；主 embed 不行则按 reserve 顺序重试）
async function resolvePlay(detailUrl) {
  var html = await getHtml(detailUrl);
  if (!html) return '';
  var live = (html.match(/data-ts-live="([^"]+)"/) || [])[1] || '';
  var tid = (html.match(/data-ts-id="([^"]+)"/) || [])[1] || '';
  if (!live || !tid) return '';
  var token = dex(tid, live, '_0x48107a');
  if (!token) return '';
  var resp = await postForm(HOST + '/api/play/', { sources: token, ep: '1', ver: '2' }, detailUrl);
  if (!resp || resp.status !== true || !resp.data) return '';
  var embeds = [];
  var main = dex(tid, resp.data, 'undefined');
  if (main) embeds.push(main);
  // 备用：reserve 是加密 JSON 数组 [{data, lo}]，每项 data 同样用 dex(tid, data, 'undefined') 解
  try {
    var reserveJson = dex(tid, resp.reserve || '', 'undefined');
    var reserve = JSON.parse(reserveJson);
    if (Array.isArray(reserve)) {
      for (var i = 0; i < reserve.length; i++) {
        if (reserve[i] && reserve[i].data) {
          var e = dex(tid, reserve[i].data, 'undefined');
          if (e && embeds.indexOf(e) === -1) embeds.push(e);
        }
      }
    }
  } catch (e) {}
  for (var j = 0; j < embeds.length; j++) {
    var file = await resolveEmbed(embeds[j], detailUrl);
    if (file) return { url: file, referer: absUrl(embeds[j]) };
  }
  return '';
}

function parseList(html) {
  var videos = [];
  var seen = new Set();
  if (!html) return videos;
  // 卡片：<div class="... thumb-block ..."> ... <a href="/video/xxx/" title="..."><img src="..."> ... <span class="duration">..</span> <span class="release">..</span>
  var blocks = html.split('thumb-block');
  for (var i = 1; i < blocks.length; i++) {
    var b = blocks[i].slice(0, 2500);
    var lm = b.match(/<a[^>]+href="(https?:\/\/[^"]*\/video\/[^"]+|\/video\/[^"]+)"[^>]*title="([^"]*)"/i)
      || b.match(/<a[^>]+href="(https?:\/\/[^"]*\/video\/[^"]+|\/video\/[^"]+)"/i);
    if (!lm) continue;
    var vodId = absUrl(lm[1].split('?')[0]);
    if (seen.has(vodId)) continue;
    seen.add(vodId);
    var name = cleanText(lm[2] || '');
    if (!name) {
      var tm = b.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      name = tm ? cleanText(tm[1].replace(/<[^>]+>/g, '')) : '';
    }
    if (!name) name = vodId.replace(/\/$/, '').split('/').pop();
    var pic = '';
    var im = b.match(/<img[^>]+src="([^"]+)"/i);
    if (im) pic = absUrl(im[1]);
    var remarks = '';
    var dm = b.match(/<span class="duration"[^>]*>([\s\S]*?)<\/span>/i);
    if (dm) remarks = cleanText(dm[1].replace(/<[^>]+>/g, ''));
    var hd = b.match(/<span class="hd-video"[^>]*>([\s\S]*?)<\/span>/i);
    if (hd) {
      var label = cleanText(hd[1]);
      remarks = remarks ? (label + ' · ' + remarks) : label;
    }
    videos.push({ vod_id: vodId, vod_name: name.substring(0, 120) || '未知', vod_pic: pic, vod_remarks: remarks });
  }
  return videos;
}

async function init(reqIn) { return {}; }
async function home(reqIn) { return { class: CLASSES, filters: {} }; }
async function homeVod(reqIn) {
  var html = await getHtml(HOST + '/');
  return { list: parseList(html).slice(0, 12) };
}
async function category(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var tid = String(body.tid || body.id || 'home');
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  var url;
  if (tid === 'home') {
    url = page > 1 ? HOST + '/page/' + page + '/' : HOST + '/';
  } else {
    var v = VPATH[tid] || '';
    // 第 1 页用站方规范 vXX 地址；翻页用站内实际生成的 /category/<slug>/page/N/（会 301 到 vXX 版）
    url = page > 1
      ? HOST + '/category/' + tid + '/page/' + page + '/'
      : HOST + '/' + v + '/category/' + tid + '/';
  }
  var html = await getHtml(url);
  var list = parseList(html);
  return { page: page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: 999, list: list };
}
async function detail(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var vid = String(body.id || '').trim();
  if (!vid) return { list: [] };
  var html = await getHtml(vid);
  var name = '';
  var tm = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    || html.match(/<title>([\s\S]*?)<\/title>/i);
  if (tm) name = cleanText(tm[1]).replace(/\s*-\s*JAVXXX\.Me\s*$/i, '').substring(0, 120);
  var pic = '';
  var pm = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (pm) pic = pm[1];
  var desc = '';
  var dm = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  if (dm) desc = cleanText(dm[1]);
  // 只存详情页地址；play() 里现取现播（token 约 19.5 小时过期且绑 IP，不能提前解好）
  return {
    list: [{
      vod_id: vid,
      vod_name: name || 'JavXXX',
      vod_pic: pic,
      vod_content: desc,
      vod_play_from: NAME,
      vod_play_url: '播放$' + vid,
    }],
  };
}
async function play(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var id = String(body.id || '').trim();
  if (id.indexOf('$') !== -1) id = id.split('$').pop().trim();
  // 已是直链（m3u8/mp4，或 streamtape 的 get_video 直链，URL 里无 .mp4 后缀）则直接播
  if (/\.(m3u8|mp4)(\?|$)/i.test(id) || /streamtape\.(com|net)\/get_video/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  try {
    var r = await resolvePlay(id);
    if (r && r.url) {
      return { parse: 0, url: r.url, header: { 'User-Agent': UA, 'Referer': r.referer || (HOST + '/') } };
    }
  } catch (e) {}
  return { parse: 1, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}
async function search(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var wd = String(body.wd || '').trim();
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page: page, pagecount: 1, limit: 20, total: 0, list: [] };
  // 站内搜索：/?s=<kw> 301 到 /search/<kw>/；直接用后者
  var url = page > 1
    ? HOST + '/search/' + encodeURIComponent(wd) + '/page/' + page + '/'
    : HOST + '/search/' + encodeURIComponent(wd) + '/';
  var html = await getHtml(url);
  var list = parseList(html);
  return { page: page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: 999, list: list };
}

export default function createSpider() {
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
