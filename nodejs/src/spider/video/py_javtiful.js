// Javtiful - CatPawOpen JS Spider（2026-10-30 新源）
// 站点：https://javtiful.com/（点播站；首页重定向到 /main）
// 结构（2026-10-30 VM 全链实测）：
//  - 列表：卡片链接 /video/{id}/{slug}；分类 /category/{slug}；
//    分类（首页导航实测 9 个）：affair, amateur, beautiful-girl, big-tits,
//    drama, married-woman, mature-woman, office-lady, school-girls。
//  - 封面：详情 og:image = https://javtiful.com/uploads/uploads/videos/thumbs/…jpg；
//    列表卡片 img 的 data-src/src 同源。
//  - 播放（关键：票据时效约 30 分钟，play 时必须现取现投）：
//    详情页内联 JSON 含 "playback":{"endpoint":"/video/{id}/playback",
//    "ticket":"p1.{id}.0.{ts}.{hash}…"}；POST 该 endpoint，
//    body ticket=<ticket>，头 X-Requested-With: XMLHttpRequest + Referer embed 页，
//    返回 {"success":true,"sources":[{"src":"https://vXXXX.jav.si/hls/…/index.m3u8",
//    "type":"application/vnd.apple.mpegurl","fallbackSrc":"https://vXXXX.jav.si/p/…",
//    "size":720,"label":"720p"}],"defaultQuality":720}。
//    sources 有几档清晰度就列几条线（label/size），另附一条 MP4（fallbackSrc）。
import req from '../../util/req.js';

const KEY = 'py_javtiful';
const NAME = 'Javtiful';
const HOST = 'https://javtiful.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

async function getText(url, referer) {
  try {
    const { data } = await req.get(url, { headers: H(referer), timeout: 15000 });
    return String(data || '');
  } catch { return ''; }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  href = String(href || '').trim();
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return HOST + href;
  return HOST + '/' + href;
}

function imgOf(block) {
  const clean = block.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const m = clean.match(/<img[^>]*>/gi);
  if (!m) return '';
  for (const tag of m) {
    // 懒加载真实图优先：javtiful 卡片的 src 是占位图（video-thumb-placeholder.svg），
    // 真图在 data-front-lazy-src 里；旧写法先命中 src，封面全是占位图。
    const dm = tag.match(/data-[a-z0-9\-]*lazy-src\s*=\s*"([^"]+)"/i)
      || tag.match(/data-src\s*=\s*"([^"]+)"/i)
      || tag.match(/data-original\s*=\s*"([^"]+)"/i);
    if (dm && dm[1] && !/placeholder/i.test(dm[1]) && !/data:image/i.test(dm[1])) {
      return dm[1].startsWith('/') ? HOST + dm[1] : dm[1];
    }
    const sm = tag.match(/src\s*=\s*"([^"]+)"/i);
    if (sm && sm[1] && !/placeholder/i.test(sm[1]) && !/data:image/i.test(sm[1])) {
      return sm[1].startsWith('/') ? HOST + sm[1] : sm[1];
    }
  }
  return '';
}

// 卡片：<a href="/video/{id}/{slug}">…img…标题…</a>
function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]*href="(\/video\/\d+\/[^"]+)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const inner = m[2];
    let title = '';
    const am = inner.match(/<img[^>]*alt="([^"]+)"/i);
    if (am) title = stripTags(am[1]).replace(/^Thumbnail for\s+/i, '');
    if (!title) title = stripTags(inner);
    if (!title || title.length < 2) continue;
    items.push({ vod_id: absUrl(href), vod_name: title, vod_pic: imgOf(inner), vod_remarks: '' });
    if (items.length >= 60) break;
  }
  return items;
}

// 2026-10-30 晚扩到站内 /categories 索引的全部 21 个真实分类（均已验有内容）。
// 2026-10-30 深夜按用户令补前列：顶层类型页实测均 200 且有内容——
//  无码破解 = 站内 Reducing Mosaic（/reducing-mosaic，用户说的无码泄露/流出/减码
//  即此）；最新 = /videos（默认按新到旧排，ID 降序）；无码 = /uncensored；
//  有码 = /censored；分页均 ?page=N 已验。注意：站里没有“大屁股”“中字”
//  这两个榜单（无标签页、无字幕筛选，详情页亦无相关链接），故不编造，
//  最接近的丰满（bbw）仍紧随前列之后。
const CATS = [
  { type_id: '/reducing-mosaic', type_name: '无码破解' },
  { type_id: '/videos', type_name: '最新' },
  { type_id: '/uncensored', type_name: '无码' },
  { type_id: '/censored', type_name: '有码' },
  { type_id: '/category/bbw/', type_name: '丰满' },
  { type_id: '/category/big-tits/', type_name: '巨乳' },
  { type_id: '/category/affair/', type_name: '偷情' },
  { type_id: '/category/amateur/', type_name: '素人' },
  { type_id: '/category/beautiful-girl/', type_name: '美少女' },
  { type_id: '/category/chinese-av/', type_name: '国产' },
  { type_id: '/category/cosplay/', type_name: '角色扮演' },
  { type_id: '/category/drama/', type_name: '剧情' },
  { type_id: '/category/female-boss/', type_name: '女上司' },
  { type_id: '/category/female-investigator/', type_name: '女侦探' },
  { type_id: '/category/female-student/', type_name: '女学生' },
  { type_id: '/category/female-teacher/', type_name: '女教师' },
  { type_id: '/category/housekeeper/', type_name: '家政妇' },
  { type_id: '/category/hypnosis/', type_name: '催眠' },
  { type_id: '/category/married-woman/', type_name: '人妻' },
  { type_id: '/category/mature-woman/', type_name: '熟女' },
  { type_id: '/category/milf/', type_name: '熟妇' },
  { type_id: '/category/nurse/', type_name: '护士' },
  { type_id: '/category/office-lady/', type_name: 'OL' },
  { type_id: '/category/school-girls/', type_name: '校园' },
  { type_id: '/category/sister-in-law/', type_name: '嫂子' },
];

async function init() { return {}; }

async function home() {
  const html = await getText(HOST + '/main', HOST + '/');
  return { class: CATS, filters: {}, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(body.id || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid) tid = '/category/amateur/';
  const base = /^https?:\/\//i.test(tid) ? tid.replace(/\/+$/, '') : HOST + '/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
  const url = page === 1 ? (base + '/') : (base + '/?page=' + page);
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length ? 999999 : 0, list };
}

async function fetchPlayback(durl, html) {
  // 详情页内联 JSON： "playback":{"endpoint":"…","ticket":"…"}
  const pm = html.match(/"playback"\s*:\s*\{\s*"endpoint"\s*:\s*"([^"]+)"\s*,\s*"ticket"\s*:\s*"([^"]+)"/i);
  if (!pm) return null;
  const endpoint = pm[1].startsWith('http') ? pm[1] : HOST + pm[1];
  const ticket = pm[2];
  const embedMatch = html.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
  const referer = embedMatch ? embedMatch[1] : durl;
  try {
    const { data } = await req.post(endpoint, 'ticket=' + encodeURIComponent(ticket), {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': referer,
      },
      timeout: 15000,
    });
    const j = typeof data === 'string' ? JSON.parse(data) : data;
    if (j && j.success && Array.isArray(j.sources) && j.sources.length) return j.sources;
  } catch {}
  return null;
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    const durl = /^https?:\/\//i.test(raw) ? raw : HOST + (String(raw).startsWith('/') ? raw : '/' + raw);
    const html = await getText(durl, HOST + '/');
    const hm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i);
    const title = hm ? stripTags(hm[1]) : 'Javtiful';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const pic = ogm ? ogm[1] : '';
    const em = html.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
    const embedUrl = em ? em[1] : '';
    let playUrl = '';
    const lineUrls = [];
    const sources = await fetchPlayback(durl, html);
    if (sources) {
      const lines = [];
      const abs = (u) => {
        // 2026-11-01 站方 sources 改相对地址 MP4（如 /media/video/115295/720p?…，无 .mp4 后缀）：
        // 相对地址对播放器无意义，必须补成绝对地址（旧格式是绝对地址，无需处理）。
        u = String(u || '');
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        return HOST + (u.startsWith('/') ? u : '/' + u);
      };
      for (const s of sources) {
        if (!s.src) continue;
        const label = s.label || (s.size ? s.size + 'p' : '播放');
        lines.push(label + '$' + abs(s.src));
        lineUrls.push(abs(s.src));
      }
      const fb = sources.find(s => s.fallbackSrc);
      if (fb) { lines.push('MP4$' + abs(fb.fallbackSrc)); lineUrls.push(abs(fb.fallbackSrc)); }
      if (lines.length) playUrl = lines.join('#');
    }
    if (!playUrl) { playUrl = '网页播放$' + (embedUrl || durl); lineUrls.push(embedUrl || durl); }
    if (lineUrls.length) {
      // 字幕预热：按每条播放地址登记片名；后台逐条串行找字幕（不 await，
      // 不一拥而上——并行预热会把 SubtitleCat 搜索挤挂，见 py_one 实测教训）
      for (const u of lineUrls) subCacheName(u, title);
      subCacheName(durl, title);
      (async () => {
        for (const u of lineUrls) {
          try { await subSearchAll(u); } catch (e) {}
        }
      })().catch(() => {});
    }
    list.push({ vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: playUrl });
  }
  return { list };
}

async function play(reqIn) {
  let id = String(reqIn?.body?.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  // 2026-11-01：站方新 MP4 无 .mp4 后缀，旧判定（只认 .m3u8/.mp4）会误判 parse:1；
  // 含 /media/video/ 的即为站方直链视频，判 parse:0。
  const isVideo = /\.(m3u8|mp4)/i.test(id) || /\/media\/video\//i.test(id);
  // 字幕：detail 预热过则命中缓存/在途，一般不增加点播延迟；无命中不带 subs 键
  const subs = await subSearchAll(id).catch(() => []);
  const result = {
    parse: isVideo ? 0 : 1,
    url: id,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const url = HOST + '/search?q=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length, list };
}

// ---------- 字幕聚合（与猫源同款芯一致，2026-11-02 版：时长后缀 + 名字+时长去重） ----------
// 三槽：迅雷（键序 [番号， 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 两迅雷槽同走同一 oracle 接口、合并按 URL 去重、同条归高档位；合并序 =
// 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；全局上限 10、
// 单槽软上限 8。严过滤（条目须含番号或片名全文，无回退，宁缺毋滥）；
// 全程 req 主栈、逐请求超时 3s、总预算 6s、失败全静默、无命中不带 subs 键。
// 番号只从片名取，不从播放地址取（CDN 域名不可信）。
// 接线：detail 时按每条播放地址登记片名并后台串行预热（不 await）；play 时
// 命中缓存/在途、一般不增加点播延迟；未经过 detail 的直接点播无片名缓存
// 时返回无字幕（与接入前一致）。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();
function subCacheName(url, name) {
  if (!url || !name) return;
  subNameCache.set(url, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
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
function subCtx(url) {
  const title = (subNameCache.get(url) || '').trim();
  const code = subExtractCode(title);
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
function subMatchOf(url, ctx) {
  const text = ((ctx.title || '') + ' ' + String(url || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return { text, loose: text.replace(/[-_\s.]/g, ''), title, titleLoose: title.replace(/[-_\s.]/g, '') };
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
const subInflight = new Map();
async function subSearchAll(url) {
  const hit = subResultCache.get(url);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(url)) return subInflight.get(url);
  const p = (async () => {
    const ctx = subCtx(url);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(url, ctx);
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
        subResultCache.set(url, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(url, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(url, p);
  try { return await p; } finally { subInflight.delete(url); }
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
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
