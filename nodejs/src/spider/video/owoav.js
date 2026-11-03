// owoav https://owoav.com —— 视频站（域名轮换：发布页 owodz.com / owodz.org 给出 owoav15.cc–owoav23.cc；
//   本蜘蛛不把 owoav.com 写死为唯一域名，HOST 失败时按发布页顺序重试：owoav.com → owoav20.cc →
//   owoav21.cc → owoav18.cc → owoav19.cc；其余轮换域未逐一实证，不写入重试表，待发布页更新后补）。
// 已实证：首页排序“新的/长的/在标签”；女优区（创作者频道列表，含 @handle 与视频数）；
//   详情页 /video/<数字id>/<32位hex>/；详情字段含时长、浏览数、添加日期、分类、标签、相关视频；
//   首页条目更新至数小时前；未见登录/VIP/验证提示。番号仅个别条目带编号，字幕门按条目判定。
// 未实证（代码中不编造）：全站分类导航表（故 home 仅写首页默认“最新视频”一类）；列表分页规律
//   （第 2 页起暂按 ?page=N 尝试，实测后修正）；详情页播放器源码形态（用通用 .m3u8/.mp4 正则提取）；
//   搜索路径（未实证，search 暂返回空列表，不编路径）。
// 字幕：芯与门照搬模板；subSlugTitle 为通用版（取详情页最后一个非空路径段）。
import req from '../../util/req.js';

const HOSTS = ['https://owoav.com', 'https://owoav20.cc', 'https://owoav21.cc', 'https://owoav18.cc', 'https://owoav19.cc'];
let activeHost = HOSTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const VIDEO_RE = /^\/video\/\d+\/[^\/]+\/?$/;

async function getHtml(path) {
  const p = String(path || '');
  if (p.startsWith('http')) return fetchText(p, { 'User-Agent': UA, 'Referer': activeHost + '/' });
  const order = [activeHost, ...HOSTS.filter((h) => h !== activeHost)];
  for (const host of order) {
    const html = await fetchText(host + p, { 'User-Agent': UA, 'Referer': host + '/' });
    if (html) { activeHost = host; return html; }
  }
  return '';
}
function hostOf(url) {
  try { return new URL(url).origin; } catch (e) { return activeHost; }
}

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}
function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function cleanLabel(s) { return clean(s).replace(/[$#]/g, ''); }
function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}
function resolveUrl(rel, base) {
  const r = String(rel || '').trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  if (!r) return '';
  if (r.startsWith('//')) return 'https:' + r;
  if (/^https?:\/\//i.test(r)) return r;
  try {
    const b = new URL(base);
    if (r.startsWith('/')) return b.origin + r;
    const dir = b.href.slice(0, b.href.lastIndexOf('/') + 1);
    return dir + r;
  } catch (e) { return r; }
}
function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'data-lazy-src', 'src', 'poster']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m && m[1].trim() && !/loading|placeholder|default/i.test(m[1])) return m[1].trim();
  }
  return '';
}
function parseCards(html, host, videoRe) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1].trim();
    if (!videoRe.test(href)) continue;
    if (seen.has(href)) continue;
    const inner = m[2];
    const picRaw = extractPic(inner);
    let title = '';
    const tM = inner.match(/(?:title=["']([^"']+)["']|alt=["']([^"']+)["']|<h\d[^>]*>([\s\S]*?)<\/h\d>)/i);
    if (tM) title = cleanLabel(tM[1] || tM[2] || tM[3] || '');
    if (!title) {
      const txt = cleanLabel(inner);
      if (txt) title = txt.split(' ').filter((x) => x.length > 1).slice(0, 8).join(' ');
    }
    let remarks = '';
    const upM = inner.match(/已更新\s*\d+\s*集/);
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (upM) remarks = upM[0];
    else if (durM) remarks = durM[1];
    else if (/HD/i.test(inner)) remarks = 'HD';
    if (href && (picRaw || title)) {
      seen.add(href);
      items.push({
        vod_id: href,
        vod_name: title || '视频',
        vod_pic: picRaw ? absUrl(picRaw, host) : '',
        vod_remarks: remarks,
      });
    }
  }
  return items;
}
// 通用播单提取：优先 .m3u8，其次 .mp4；覆盖 source/src/data-url/播放器变量等写法
function extractStream(html) {
  const h = String(html || '');
  const pats = [
    /data-url=["']([^"']+)["']/i,
    /(?:source|file|video_url|play_url|url)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
  ];
  for (const re of pats) {
    const m = h.match(re);
    if (m) {
      const u = m[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (/\.m3u8/i.test(u) || /\.mp4/i.test(u)) return u;
    }
  }
  let m = h.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  m = h.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  return '';
}
async function fetchText(url, headers) {
  try {
    const r = await req.get(url, { headers: headers || {}, timeout: 20000 });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}
// 主清单多档解析：#EXT-X-STREAM-INF（RESOLUTION/BANDWIDTH）+ 下一行 URI
function parseVariants(text, masterUrl) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln.startsWith('#EXT-X-STREAM-INF')) continue;
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (!cand) continue;
      if (cand.startsWith('#')) continue;
      uri = cand; break;
    }
    if (!uri) continue;
    const resM = ln.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bwM = ln.match(/BANDWIDTH=(\d+)/i);
    let name = '';
    if (resM) name = resM[2] + 'p';
    else if (bwM) name = Math.round(parseInt(bwM[1], 10) / 1000) + 'k';
    else name = '播放';
    out.push({ name, url: resolveUrl(uri, masterUrl) });
  }
  return out;
}
async function expandVariants(streamUrl) {
  if (!/\.m3u8/i.test(streamUrl)) return null;
  const text = await fetchText(streamUrl, {});
  if (!text || !text.includes('#EXT-X-STREAM-INF')) return null;
  const vars = parseVariants(text, streamUrl);
  return vars.length > 1 ? vars : null;
}
function titleOf(html, fallback) {
  const tM = String(html || '').match(/<title>(.*?)<\/title>/i);
  if (tM) {
    const t = clean(tM[1]).replace(/\s*[-_|]\s*(好色TV|owoav)\s*$/i, '');
    if (t) return t;
  }
  const hM = String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (hM) return clean(hM[1]) || fallback;
  return fallback;
}
function posterOf(html, host) {
  const ogM = String(html || '').match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogM) return absUrl(ogM[1].trim(), host);
  return '';
}
async function reqRaw(url, headers, timeoutMs) {
  try {
    let r;
    if (typeof req === 'function') {
      r = await req({ method: 'GET', url, headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5 });
    } else {
      r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    }
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const parts = String(durl || '').split('/').filter((x) => x);
  let seg = parts.length ? parts[parts.length - 1] : '';
  seg = seg.replace(/\.(html|htm|php)$/i, '');
  return seg ? clean(seg.replace(/[-_]+/g, ' ')) : '';
}

function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}-\d{2,8}[A-Z]?\b/,
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

async function home() {
  const classes = [{ type_id: 'latest', type_name: '最新视频' }];
  let list = [];
  try { list = parseCards(await getHtml('/'), activeHost, VIDEO_RE).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const path = page === 1 ? '/' : ('/?page=' + page);
  const html = await getHtml(path);
  const list = parseCards(html, activeHost, VIDEO_RE);
  return { page, pagecount: page, list };
}

async function search(reqIn) {
  // 搜索路径未实证，不编造：返回空列表，待实测后补。
  return { list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : activeHost + rawId;
  const html = await getHtml(rawId);
  if (!html) return { list: [] };
  const mainTitle = titleOf(html, 'owoav视频');
  const text = clean(html.replace(/>\s*</g, '> <'));
  const fields = [];
  let durVal = '';
  const durM = text.match(/时长[：:\s]*([0-9:]+)/);
  if (durM) { durVal = durM[1]; fields.push('时长：' + durM[1]); }
  const viewM = text.match(/([\d,]+)\s*次浏览/);
  if (viewM) fields.push('浏览：' + viewM[1].trim());
  const dateM = text.match(/添加[：:\s]*([0-9\-/]+)/);
  if (dateM) fields.push('添加：' + dateM[1]);
  const catM = text.match(/分类[：:\s]*([^\s|]+)/);
  if (catM) fields.push('分类：' + catM[1]);
  const content = fields.join(' | ');
  const poster = posterOf(html, activeHost);
  const code = subExtractCode(mainTitle);
  if (code) { subCacheName(durl, mainTitle); subWarm(durl); }
  const stream = extractStream(html);
  if (!stream) return { list: [{ vod_id: rawId, vod_name: mainTitle, vod_pic: poster, vod_remarks: '', vod_content: content, vod_play_from: 'owoav', vod_play_url: '' }] };
  const playUrl = stream.startsWith('//') ? 'https:' + stream : (stream.startsWith('http') ? stream : absUrl(stream, activeHost));
  const variants = await expandVariants(playUrl);
  let vodPlayUrl = '';
  if (variants) {
    vodPlayUrl = variants.map((v) => code
      ? (v.name + '$' + durl + '@@' + v.url)
      : (v.name + '$' + v.url)).join('#');
  } else {
    vodPlayUrl = code ? ('正片$' + durl + '@@' + playUrl) : ('正片$' + playUrl);
  }
  return { list: [{ vod_id: rawId, vod_name: mainTitle, vod_pic: poster, vod_remarks: durVal, vod_content: content, vod_play_from: 'owoav', vod_play_url: vodPlayUrl }] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  if (!/\.m3u8|\.mp4/i.test(target)) {
    const html = await getHtml(target.startsWith('/') ? target : ('/' + target));
    const stream = extractStream(html);
    if (!stream) return { parse: 0, url: '' };
    target = stream.startsWith('//') ? 'https:' + stream : (stream.startsWith('http') ? stream : absUrl(stream, activeHost));
  }
  const subsP = durl ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': activeHost + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'owoav', name: 'owoav', type: 3 },
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
