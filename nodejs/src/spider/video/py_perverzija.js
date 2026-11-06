// Perverzija Tube - 由 REX 模块 user.perverzija（作者 Tiamo）移植
// 站点 https://tube.perverzija.com；播放链：详情页 iframe -> xtremestream 播放器页取 vt
// -> proto_api castsign 取 ct -> castmaster 生成标准 HLS（变体按 q 分档）+ 自适应兜底
// 注意：VM 侧 castsign 一律返回 forbidden-vt（VM 出口被拦，详情/列表/播放器页均通）；
// 本链路为 REX 原作者实测链路，设备侧能否签发以用户真机为准。
import req from '../../util/req.js';

const KEY = 'py_perverzija';
const NAME = 'Perverzija';
const SITE = 'https://tube.perverzija.com';
const XS = 'https://perv.xtremestream.xyz';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CATS = [
  { type_id: '/?orderby=date', type_name: '最新' },
  { type_id: '/?orderby=view', type_name: '最多播放' },
  { type_id: '/?orderby=like', type_name: '最多点赞' },
  { type_id: '/featured-scenes/', type_name: '精选场景' },
  { type_id: '/full-movie/', type_name: '完整影片' },
  { type_id: '/vr/', type_name: 'VR' },
  { type_id: '/studio/brazzers/', type_name: 'Brazzers' },
  { type_id: '/studio/realitykings/', type_name: 'RealityKings' },
  { type_id: '/studio/bangbros/', type_name: 'BangBros' },
  { type_id: '/studio/teamskeet/', type_name: 'TeamSkeet' },
  { type_id: '/studio/naughtyamerica/', type_name: 'NaughtyAmerica' },
  { type_id: '/tag/anal/', type_name: '标签热门' },
];

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ');
}
function H(referer, extra) {
  const h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  if (extra) Object.assign(h, extra);
  return h;
}
async function getText(url, referer, extra) {
  const { data } = await req.get(url, { headers: H(referer, extra), timeout: 25000 });
  return typeof data === 'string' ? data : JSON.stringify(data || '');
}

function listingHtml(html) {
  const h = String(html || '');
  let start = h.search(/class="(?:video|search)-listing-content/);
  if (start < 0) start = 0;
  let end = h.length;
  for (const mark of ['wp-pagenavi', 'class="pagination', '<nav class="navigation', 'id="footer', 'class="tm_related', 'related-section']) {
    const j = h.indexOf(mark, start);
    if (j > 0 && j < end) end = j;
  }
  return h.slice(start, end);
}

function parseCards(html) {
  const h = listingHtml(html);
  const out = [];
  const seen = {};
  const starts = [];
  const re = /<div[^>]+class="[^"]*\bvideo-item\b[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(h))) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const seg = h.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : Math.min(starts[i] + 6000, h.length));
    const a = seg.match(/<a\s+href="(https:\/\/tube\.perverzija\.com\/[^"\/]+\/)"(?:\s+title="([^"]*)")?/);
    if (!a) continue;
    const url = a[1];
    if (seen[url]) continue;
    const img = seg.match(/<img[^>]+src="([^"]+)"/);
    const h3 = seg.match(/<h3[^>]*>[\s\S]{0,200}?<a[^>]*>([\s\S]{1,300}?)<\/a>/);
    const alt = seg.match(/<img[^>]+alt="([^"]*)"/);
    let title = clean(a[2] || (h3 && h3[1]) || (alt && alt[1]) || '');
    if (!title) title = url.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');
    const p = seg.match(/<p[^>]*>([\s\S]{20,600}?)<\/p>/);
    let desc = clean(p ? p[1] : '');
    if (!desc || desc.length < 20) desc = '';
    seen[url] = 1;
    out.push({ vod_id: 'perv:' + url, vod_name: title, vod_pic: img ? img[1] : '', vod_remarks: desc.slice(0, 60) });
  }
  return out;
}

function pageUrl(path, page) {
  let p = Math.max(1, parseInt(page, 10) || 1);
  let base = String(path || '/');
  let query = '';
  const qi = base.indexOf('?');
  if (qi >= 0) { query = base.slice(qi); base = base.slice(0, qi); }
  if (base.charAt(0) !== '/') base = '/' + base;
  if (!/\/$/.test(base)) base += '/';
  if (p <= 1) return SITE + base + query;
  return SITE + base + 'page/' + p + '/' + query;
}

function slugifyActor(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function home() {
  let list = [];
  try {
    list = parseCards(await getText(pageUrl('/?orderby=date', 1), SITE + '/'));
  } catch (e) { list = []; }
  return { class: CATS, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '/?orderby=date');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let list = [];
  try {
    list = parseCards(await getText(pageUrl(tid, page), SITE + '/'));
  } catch (e) { list = []; }
  return { page, pagecount: list.length ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = t(body.wd);
  if (!kw) return { list: [] };
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let url = SITE + '/?s=' + encodeURIComponent(kw) + (page > 1 ? '&paged=' + page : '');
  let cards = [];
  try { cards = parseCards(await getText(url, SITE + '/')); } catch (e) {}
  if (!cards.length && /\s/.test(kw) && !/\d/.test(kw)) {
    const slug = slugifyActor(kw);
    if (slug) {
      try { cards = parseCards(await getText(SITE + '/stars/' + slug + '/' + (page > 1 ? 'page/' + page + '/' : ''), SITE + '/')); } catch (e) {}
    }
  }
  return { list: cards };
}

function isoToSec(v) {
  const m = String(v || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
}

async function parseDetail(url) {
  const html = await getText(url, SITE + '/');
  const titleM = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]{1,400}?)<\/h1>/) || html.match(/<title>([\s\S]{1,300}?)<\/title>/);
  const title = clean(titleM ? titleM[1] : '').replace(/\s*\|\s*Perverzija\.com\s*$/i, '');
  const coverM = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/);
  const descM = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/) || html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/);
  const durM = html.match(/"duration"\s*:\s*"(PT[^"]+)"/);
  const iframeM = html.match(/<iframe[^>]+src="([^"]*xtremestream[^"]*)"/) || html.match(/<iframe[^>]+src="([^"]*\/player\/index\.php\?data=([0-9a-f]{32}))[^"]*"/);
  let videoId = '';
  let embed = '';
  if (iframeM) {
    const src = String(iframeM[1]);
    const idM = src.match(/[?&]data=([0-9a-fA-F]{32})/);
    if (idM) videoId = idM[1].toLowerCase();
    const hostM = src.match(/^(https?:\/\/[^\/]+)/);
    if (hostM) embed = hostM[1];
  }
  if (!videoId) {
    const anyId = html.match(/(?:embedUrl|iframe)[^\n]{0,200}?[?&]data=([0-9a-fA-F]{32})/);
    if (anyId) videoId = anyId[1].toLowerCase();
  }
  return { videoId, embed, title, cover: coverM ? coverM[1] : '', desc: clean(descM ? descM[1] : ''), seconds: durM ? isoToSec(durM[1]) : 0 };
}

// 线路缓存 10 分钟：详情与播放共用，避免重复签发
const STREAM_CACHE = new Map();
const STREAM_TTL = 10 * 60 * 1000;

async function playlistAlive(url, referer) {
  try {
    const raw = await getText(url, referer);
    return raw.indexOf('#EXTM3U') >= 0;
  } catch (e) { return false; }
}

async function resolveStream(url, d) {
  if (!d.videoId) throw new Error('未找到播放器 id，可能影片无源');
  const cached = STREAM_CACHE.get(d.videoId);
  if (cached && Date.now() - cached.t < STREAM_TTL) return cached.lines;
  const bases = [];
  const pushBase = (b) => { if (b && bases.indexOf(b) < 0) bases.push(b); };
  pushBase(d.embed);
  pushBase(XS);
  pushBase('https://pervm1.xtremestream.xyz');
  pushBase('https://pervl5.xtremestream.xyz');
  pushBase('https://pervm2.xtremestream.xyz');
  const playerReferer = url;
  let base = '';
  let vt = '';
  let playerUrl = '';
  let lastErr = '';
  for (const b of bases) {
    const tryUrl = b + '/player/index.php?data=' + d.videoId;
    let page = '';
    try { page = await getText(tryUrl, playerReferer); } catch (e) { lastErr = String(e && e.message || e); continue; }
    const vtM = page.match(/boot\(\s*["']?[0-9a-fA-F]{32}["']?\s*,\s*["']([^"']+)["']/);
    if (vtM) { base = b; vt = String(vtM[1]).replace(/\s+/g, ''); playerUrl = tryUrl; break; }
    lastErr = '该子域无 ftk 令牌';
  }
  if (!vt) throw new Error('播放器页未返回 vt 令牌' + (lastErr ? '：' + lastErr : ''));
  const apiBase = base + '/player/proto_api.php?data=' + d.videoId;
  const vtParam = '&vt=' + encodeURIComponent(vt);
  const signResp = await getText(apiBase + '&op=castsign' + vtParam, playerUrl, { 'X-XS-P': '1', 'Accept': '*/*' });
  const ct = String(signResp || '').replace(/\s+/g, '');
  if (!ct || ct.indexOf('forbidden') === 0) throw new Error('castsign 签名失败');
  const cm = apiBase + vtParam + '&ct=' + encodeURIComponent(ct) + '&op=castmaster';
  const autoLine = { name: '自动', desc: '自适应', url: cm };
  let master = '';
  try { master = await getText(cm, playerUrl, { 'X-XS-P': '1', 'Accept': '*/*' }); } catch (e) {}
  let quals = [];
  const re = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n(\S+)/g;
  let mm;
  while ((mm = re.exec(master))) {
    const lineUrl = String(mm[3]).trim();
    const qm = lineUrl.match(/[?&]q=(\d+)/);
    if (!qm) continue;
    quals.push({ q: qm[1], label: qm[1] + 'p', url: lineUrl });
  }
  if (!quals.length) {
    for (const fl of ['1080', '720', '480']) {
      quals.push({ q: fl, label: fl + 'p', url: apiBase + vtParam + '&ct=' + encodeURIComponent(ct) + '&op=castmedia&q=' + fl });
    }
  }
  quals.sort((a, b) => parseInt(b.q, 10) - parseInt(a.q, 10));
  const lines = [];
  for (const q of quals) {
    if (!(await playlistAlive(q.url, playerUrl))) continue;
    lines.push({ name: q.label, desc: q.label, url: q.url });
  }
  lines.push(autoLine);
  if (STREAM_CACHE.size > 100) STREAM_CACHE.delete(STREAM_CACHE.keys().next().value);
  STREAM_CACHE.set(d.videoId, { t: Date.now(), lines });
  return lines;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const url = id.replace(/^perv:/, '');
  if (!url) return { list: [] };
  let d;
  try { d = await parseDetail(url); } catch (e) { return { list: [] }; }
  let playFrom = [];
  let playUrls = [];
  try {
    const lines = await resolveStream(url, d);
    if (lines.length) {
      playFrom.push('Perverzija');
      playUrls.push(lines.map(l => l.name + '$' + l.url).join('#'));
      // 字幕预热：按每条播放地址登记片名（key 须与 play() 传给 subSearchAll
      // 的字符串完全一致——本源 play 直接取 $ 后的播放地址）；后台逐条串行
      // 找字幕（不 await，不一拥而上）
      for (const l of lines) subCacheName(l.url, d.title);
      (async () => {
        for (const l of lines) {
          try { await subSearchAll(l.url); } catch (e) {}
        }
      })().catch(() => {});
    }
  } catch (e) { /* 无播放线时只出详情，播放失败原因不写进标题 */ }
  return {
    list: [{
      vod_id: 'perv:' + url,
      vod_name: d.title || url,
      vod_pic: d.cover,
      vod_remarks: d.desc.slice(0, 80),
      vod_play_from: playFrom.join('$$$'),
      vod_play_url: playUrls.join('$$$'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const idx = id.indexOf('$');
  let url = idx >= 0 ? id.slice(idx + 1) : id;
  url = t(url);
  if (!url) return { parse: 0, url: '' };
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
  if (subs && subs.length) result.subs = subs;
  return result;
}

// ---------- 字幕聚合（与猫源同款芯一致，见 subdur-1102/cat-subtitle-core-1102.js） ----------
// 三槽：迅雷（键序 [番号， 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 两迅雷槽同走同一 oracle 接口、合并按 URL 去重、同条归高档位；合并序 =
// 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；全局上限 10、
// 单槽软上限 8。严过滤（条目须含番号或片名全文，无回退，宁缺毋滥）；
// 全程 req 主栈、逐请求超时 3s、总预算 6s、失败全静默、无命中不带 subs 键。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），秒级
// 原值直接用；无时长不显示、不编造。去重 key = 语言 + 小写去后缀文件名 +
// 归一化时长秒（无时长记 nodur）；同名同时长并一条，同名时长不同都留。
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
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
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

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
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
