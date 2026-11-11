// 黄视频 (https://huang.video) -> CatPawOpen spider
// Rails 站：视频库 /videos（40 条/页，97 页）、短剧库 /c/shorts（24 部/页，20 页，
//   /series/<id> 分集，每集是一个 /videos/<id>）、博主 /creators/<slug>（视频或剧集）。
// 列表卡：<article id="video_N|series_N">，封面 h.matecdn.com/videos/<hash>/cover.webp，
//   时长 badge；分页 aria-label="第 N 页"。
// 详情：data-xg-player-source-value 直给 master.m3u8（h.matecdn.com/videos/<hash>/master.m3u8）。
// 播放链（实测 2026-11-12）：
//   master/变体/分片全程强制 Referer: https://huang.video/*（无 Referer 一律 403，
//   UA 无关；curl/Chrome/iOS/AppleCoreMedia 四路验证过）。播放器不把 play 的 header
//   转发给变体/分片请求，故直出 master 在 App 里必死（master 能取、变体 403）。
//   因此播放一律走 huangvideo-hls Worker（/p/ 变体播单 + /f/ 分片，Worker 内注入
//   Referer 并改写播单）——Worker 待用户部署，部署名 huangvideo-hls。
//   封面直链 200 无防盗链；取页直连 200 无验证墙，取页不需要 Worker。
// 分辨率：实测 5 部片（糖心/ASMR/短剧/PMV 各类）master 均只含 720p 一个变体
//   （BANDWIDTH 3488000, avc1.640028）；代码按 master 真实变体出线，单档只列一条，
//   若某片日后出现多档会自动出多线，绝不硬编。
// 字幕：已接定版 subcore（2026-11-02）；但本站片名全为中文标题、基本不含番号，
//   只有抠出番号的片才登记+预热，实测基本无字幕可贴（见 harness）。
// 分类：49 个（实测）：首页最新 + 视频库 + 短剧库 + 糖心 12 + 福利姬 10 + 探花 10
//   + PMV 7 + ASMR 1 + 短剧工作室 6；创作者按 /creators 页顺序取前 N（站内 93 个
//   博主全量列出既验不过来、App 里也翻不动）；子分类名前缀标组，注释标从属。
import req from '../../util/req.js';

const KEY = 'py_huangvideo';
const NAME = '黄视频';
const HOST = 'https://huang.video';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 播放中转 Worker（用户 Cloudflare 账号，待部署）：huangvideo-hls
//   https://huangvideo-hls.li768435813.workers.dev（代码见 batch1110/huangvideo-worker.js）
const WORKER = 'https://huangvideo-hls.li768435813.workers.dev';
const RELAY_KEY = 'lai-hls-1';

const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'videos', type_name: '视频库' },
  { type_id: 'shorts', type_name: '短剧库' },
  // 糖心Vlog 组：站内 42 个博主，按 /creators 页顺序取前 12
  { type_id: 'c:fortunecutie', type_name: '糖心·饼干姐姐' },
  { type_id: 'c:xiaoxinnai', type_name: '糖心·小欣奈' },
  { type_id: 'c:91qsxw', type_name: '糖心·情深叉喔' },
  { type_id: 'c:baihumiao', type_name: '糖心·白虎喵' },
  { type_id: 'c:nana-taipei', type_name: '糖心·台北娜娜' },
  { type_id: 'c:zyxm711', type_name: '糖心·梓怡学妹' },
  { type_id: 'c:tumeijiang', type_name: '糖心·兔美酱' },
  { type_id: 'c:mengzaier', type_name: '糖心·萌崽儿' },
  { type_id: 'c:jijiaolian', type_name: '糖心·鸡教练' },
  { type_id: 'c:qiobnxingcai', type_name: '糖心·桥本香菜' },
  { type_id: 'c:beer-pineapple', type_name: '糖心·菠萝啤beer' },
  { type_id: 'c:labotianxin', type_name: '糖心·蜡笔甜心' },
  // 网红福利姬组：站内 33 个博主，按 /creators 页顺序取前 10
  { type_id: 'c:tututugirls', type_name: '福利姬·Nina妈妈' },
  { type_id: 'c:laohucai', type_name: '福利姬·老虎菜' },
  { type_id: 'c:unababyainio', type_name: '福利姬·火爆李老师' },
  { type_id: 'c:yooheejade', type_name: '福利姬·小Annie' },
  { type_id: 'c:tthenmei', type_name: '福利姬·小小t' },
  { type_id: 'c:looks199', type_name: '福利姬·深圳第一深情' },
  { type_id: 'c:gomu', type_name: '福利姬·咕姆gomu' },
  { type_id: 'c:tiaotiaosheep', type_name: '福利姬·跳跳羊' },
  { type_id: 'c:yizhidingmei', type_name: '福利姬·一只顶美' },
  { type_id: 'c:ququ999999', type_name: '福利姬·趣趣' },
  // 探花大神组：站内 10 个博主，全部
  { type_id: 'c:anmoxiaozi', type_name: '探花·按摩小子' },
  { type_id: 'c:dududown2ride', type_name: '探花·dududown2ride' },
  { type_id: 'c:tangbohu', type_name: '探花·唐伯虎' },
  { type_id: 'c:pdx739', type_name: '探花·派大星(伊藤诚)' },
  { type_id: 'c:lixunhuan', type_name: '探花·李寻欢探花' },
  { type_id: 'c:zaixaiwanglaoshi', type_name: '探花·在下王老师' },
  { type_id: 'c:ubersex24h', type_name: '探花·深海杀人鲸-小张历险记' },
  { type_id: 'c:haodadebaomihua', type_name: '探花·好大的爆米花' },
  { type_id: 'c:kanocoxx', type_name: '探花·杭州黑人博主kanocoxx' },
  { type_id: 'c:tailang', type_name: '探花·泰浪探花' },
  // PMV 组：站内 7 个博主，全部
  { type_id: 'c:tianshuihongliu', type_name: 'PMV·天水洪流PMV' },
  { type_id: 'c:maroji', type_name: 'PMV·MarojiPMV' },
  { type_id: 'c:fraudworkpmv', type_name: 'PMV·海绵婊婊PMV' },
  { type_id: 'c:klao', type_name: 'PMV·K佬PMV' },
  { type_id: 'c:pmvtik', type_name: 'PMV·PmvTik' },
  { type_id: 'c:zhangyuge-pmv', type_name: 'PMV·章鱼哥PMV' },
  { type_id: 'c:daluanjiang', type_name: 'PMV·大卵酱PMV' },
  // ASMR 组：站内 1 个博主
  { type_id: 'c:xizhou', type_name: 'ASMR·你的好朋友西洲' },
  // 短剧工作室组：站内 6 个，全部（/c/shorts 页创作者）
  { type_id: 'c:huangdou', type_name: '短剧·黄豆魔改短剧' },
  { type_id: 'c:crdj91', type_name: '短剧·91成人短剧' },
  { type_id: 'c:yeguoduanju', type_name: '短剧·野果短剧' },
  { type_id: 'c:chengguo', type_name: '短剧·橙果短剧' },
  { type_id: 'c:huang-guo', type_name: '短剧·黄果短剧' },
  { type_id: 'c:huangguo', type_name: '短剧·黄果AI短剧' },
];

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer || HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const r = await req.get(url, { headers: headers(), timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    if (r.status >= 200 && r.status < 300) return text;
  } catch (e) {}
  // fetch 兜底 (App 内无全局 fetch 时 typeof 守卫跳过)
  try {
    if (typeof fetch === 'undefined') return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 22000);
    const r = await fetch(url, { headers: headers(), signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return '';
    return String(await r.text() || '');
  } catch (e) {
    return '';
  }
}

// 取播单文本（m3u8）：必须带 Referer（CDN 强制），responseType 恒等防解析
async function getText(url, hdrs) {
  try {
    const r = await req.get(url, { headers: hdrs || {}, timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    if (r.status >= 200 && r.status < 300) {
      return typeof r.data === 'string' ? r.data : '';
    }
  } catch (e) {}
  return '';
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home') return HOST + '/';
  if (cat === 'videos') return HOST + '/videos?page=' + page;
  if (cat === 'shorts') return HOST + '/c/shorts?page=' + page;
  if (cat.indexOf('c:') === 0) return HOST + '/creators/' + cat.slice(2) + '?page=' + page;
  return HOST + '/';
}

function parseMaxPage(html) {
  if (!html) return 1;
  let max = 0;
  const re = /aria-label="第\s*(\d+)\s*页"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max || 1;
}

function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    const am = body.match(/<a[^>]+href=["'](\/(?:videos|series)\/\d+)["']/i);
    if (!am) continue;
    const href = absUrl(am[1]);
    if (seen.has(href)) continue;
    seen.add(href);
    let title = '';
    const tm = body.match(/<h3[^>]*>\s*<a[^>]*>([^<]{1,200})<\/a>/i);
    if (tm) title = tm[1];
    if (!title) {
      const alm = body.match(/aria-label=["']([^"']{1,200})["']/i);
      if (alm) title = alm[1];
    }
    title = decodeHtml(title);
    if (!title) continue;
    let cover = '';
    const im = body.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (im) cover = absUrl(im[1]);
    let remarks = '';
    const dm = body.match(/<span[^>]*badge[^>]*>([^<]+)<\/span>/i);
    if (dm) remarks = t(dm[1]);
    out.push({
      vod_id: href,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: remarks,
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]).replace(/\s*\|\s*黄视频\s*$/i, '').trim();
  m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*\|\s*黄视频\s*$/i, '').trim();
  return fallback || '';
}

function extractCover(html) {
  let m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

function extractMaster(html) {
  if (!html) return '';
  let m = html.match(/data-xg-player-source-value="([^"]+)"/i);
  if (m) return m[1].replace(/&amp;/g, '&');
  m = html.match(/"contentUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
  if (m) return m[1].replace(/&amp;/g, '&');
  return '';
}

// 解析 master 播单的真实变体（RESOLUTION 或路径档位名），按带宽从高到低排
function parseVariants(masterText, baseUrl) {
  const out = [];
  if (!masterText || masterText.indexOf('#EXTM3U') < 0) return out;
  const lines = String(masterText).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = t(lines[i]);
    if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    const uri = t(lines[i + 1] || '');
    if (!uri || uri.charAt(0) === '#') continue;
    let bw = 0;
    const bm = s.match(/BANDWIDTH=(\d+)/i);
    if (bm) bw = parseInt(bm[1], 10) || 0;
    let label = '';
    const rm = s.match(/RESOLUTION=\d+x(\d+)/i);
    if (rm) label = rm[1] + 'p';
    if (!label) {
      const um = uri.match(/(^|\/)(\d{3,4}p)(\/|$)/i);
      if (um) label = um[2].toLowerCase();
    }
    if (!label) label = bw > 0 ? Math.round(bw / 1000) + 'k' : '播放';
    let abs = uri;
    try { abs = new URL(uri, baseUrl).toString(); } catch (e) {}
    out.push({ label, url: abs, bw });
  }
  out.sort((a, b) => b.bw - a.bw);
  return out;
}

function b64url(s) {
  return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// 变体播单走 Worker /p/ 中转（Worker 内注入 Referer 并改写分片地址）
function relayPlaylistUrl(targetUrl) {
  const ctx = JSON.stringify({ r: HOST + '/', k: RELAY_KEY });
  return WORKER + '/p/' + b64url(targetUrl) + '/' + b64url(ctx);
}

// 现取详情页 + master，返回真实变体（供 detail/play 共用）
async function resolveVariants(vid) {
  const durl = HOST + '/videos/' + vid;
  const html = await getHtml(durl);
  if (!html) return { durl, variants: [], name: '' };
  const master = extractMaster(html);
  const name = extractTitle(html, durl);
  if (!master) return { durl, variants: [], name };
  const mt = await getText(master, { 'User-Agent': UA, 'Referer': durl });
  return { durl, variants: parseVariants(mt, master), name };
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
  if (id === 'home' && page > 1) {
    return { page, pagecount: 1, limit: 0, total: 0, list: [] };
  }
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  const pc = id === 'home' ? 1 : parseMaxPage(html);
  return {
    page,
    pagecount: Math.max(pc, page),
    limit: list.length || 24,
    total: Math.max(pc, page) * (list.length || 24),
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let url = t(raw);
  if (!url) return { list: [] };
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const html = await getHtml(url);
  if (!html) return { list: [] };

  const name = extractTitle(html, url);
  const pic = extractCover(html);
  let content = '';
  const dm = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
  if (dm) content = decodeHtml(dm[1]);

  // 短剧分集页：/series/<id>，每集是一个 /videos/<id>（只取“第N集”锚点）
  if (/\/series\/\d+/.test(url)) {
    const eps = [];
    const seen = new Set();
    const re = /<a[^>]+href=["'](\/videos\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const label = decodeHtml(t(m[2]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
      const em = label.match(/第\s*(\d+)\s*集/);
      if (!em) continue;
      const vid = m[1].replace('/videos/', '');
      if (seen.has(vid)) continue;
      seen.add(vid);
      eps.push({ n: parseInt(em[1], 10), vid });
    }
    eps.sort((a, b) => a.n - b.n);
    const playUrl = eps.map((e) => '第' + e.n + '集$hv:' + e.vid + ':auto').join('#');
    return {
      list: [{
        vod_id: url,
        vod_name: name || url,
        vod_pic: pic,
        vod_content: content,
        vod_play_from: NAME,
        vod_play_url: playUrl,
      }],
    };
  }

  // 单视频页：现取 master 真实变体出线
  const vid = (url.match(/\/videos\/(\d+)/) || [])[1] || '';
  let lines = [];
  const master = extractMaster(html);
  if (master && vid) {
    const mt = await getText(master, { 'User-Agent': UA, 'Referer': url });
    const variants = parseVariants(mt, master);
    lines = variants.map((v) => v.label + '$hv:' + vid + ':' + v.label);
  }
  // 兜底：详情时 master 没取到也留一条线，play() 里现解（签名/网络抖动时重试）
  if (!lines.length && vid) lines = ['播放$hv:' + vid + ':auto'];
  // 字幕：片名能抠出番号才登记+后台预热（本站片名基本无番号，见文件头）
  if (name && subExtractCode(name)) {
    subCacheName(url, name);
    subWarm(url);
  }
  return {
    list: [{
      vod_id: url,
      vod_name: name || url,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: lines.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^hv:(\d+):(.+)$/);
  if (!m) return { parse: 0, url: '' };
  const vid = m[1];
  const want = m[2];
  const { durl, variants } = await resolveVariants(vid);
  if (!variants.length) return { parse: 0, url: '' };
  let hit = null;
  if (want && want !== 'auto') hit = variants.filter((v) => v.label === want)[0];
  if (!hit) hit = variants[0];
  const url = relayPlaylistUrl(hit.url);
  // 字幕：与 detail 同键（详情页地址），detail 预热过才查；无命中不带 subs 键
  const subs = subNameCache.has(durl) ? await subSearchAll(durl).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
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
  const url = HOST + '/search?q=' + encodeURIComponent(wd) + '&page=' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  const pc = parseMaxPage(html);
  return {
    page,
    pagecount: Math.max(pc, page),
    limit: list.length || 24,
    total: Math.max(pc, page) * (list.length || 24),
    list,
  };
}


// ---------- 字幕聚合 companion helpers（core 本身不含，见 /tmp/sp_py_javtiful.js） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
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
