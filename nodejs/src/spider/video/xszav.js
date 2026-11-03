// XSZAV —— MissAV 家族形态的 JAV 站
// 所用域名：https://cn.xszav2.com（中文入口基域；语言子域另有 en/jp/tw，
// 本蜘蛛只用 cn 子域。跳转方域名绝不能作蜘蛛基域；同家族其他镜像一律不用）
// 已实证项：
//   - 语言子域 cn/en/jp/tw；中文入口 cn.xszav2.com，标题自述免费高清日本 AV 在线看
//   - MissAV 家族形态的 JAV 站；番号大概率有，字幕门按条目判定（见 detail 内 code 门）
// 已证实（浏览器）：详情 /video/<数字id>（样本 /video/210567）；
//   首页本身即视频列表，故“最新”类 = 首页列表（非独立 /latest 路径）；
//   导航的日本AV/素人/无码是 href="#" 下拉菜单、无真实链接，不写成分类；
//   直播是外部广告链接，不写进分类。
// 未实证项（播放链标 UNVERIFIED，不得称已拿到真实播单）：
//   - 列表卡片形态、播放器形态（m3u8 还是 mp4、多码率与否）、列表翻页、
//     搜索路径 /search?q=（仅作通用占位）；本文件用通用提取
//     （source/video/data-url/播放器变量/全文正则），桩测 fixture 为结构忠实的
//     合成数据，play 链标 UNVERIFIED
// 播放类型与多档结论：见报告；detail 里拿到 .m3u8 后会抓一次主清单，
// 含 #EXT-X-STREAM-INF 时按档解析、多档各列一集，单档或抓不到只列单集，绝不编假档位。
import req from '../../util/req.js';

const HOST = 'https://cn.xszav2.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// 仅一分类：最新 = 首页列表（已证实首页本身即视频列表，非独立 /latest 路径）；
// 导航下拉项无真实链接、直播为外部广告链接，均不写。
// 未知 id 一律返回空列表，不猜路径。
const CATS = {
  'latest': '/',
  '/': '/',
};

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function originOf(url) {
  const m = String(url || '').match(/^(https?:\/\/[^/]+)/);
  return m ? m[1] : '';
}

function resolveUrl(base, rel) {
  rel = String(rel || '').trim();
  if (!rel) return '';
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.startsWith('//')) return 'https:' + rel;
  if (rel.startsWith('/')) return originOf(base) + rel;
  const dir = String(base || '').replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return dir + rel;
}

async function getHtml(path) {
  let url = String(path || '');
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  else if (!url.startsWith('http')) url = HOST + (url.startsWith('/') ? url : '/' + url);
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

async function getText(url) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕聚合芯的取数原语：统一回 {status, body}；设备 axios 走配置调用
// （responseType text 保证 JSON 原文不被提前解析），本机桩走 req.get。
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

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// ---------------- 字幕聚合（与 py_mogu 同一套 Layer A，2026-11-02 定版；subSlugTitle 为通用版） ----------------
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

// 通用版：取 durl 最后一个非空路径段、去扩展名、[-_]+ 换空格。
function subSlugTitle(durl) {
  const parts = String(durl || '').split('?')[0].split('#')[0].split('/').filter(Boolean);
  let slug = parts.length ? parts[parts.length - 1] : '';
  slug = slug.replace(/\.(html?|php|aspx)$/i, '');
  try { slug = decodeURIComponent(slug); } catch (e) { /* 保持原样 */ }
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
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

// ---------------- 通用列表 / 播放提取（卡片与播放器形态均未实证） ----------------
function extractPicFromInner(inner) {
  const imgM = inner.match(/<img[^>]*>/i);
  if (!imgM) return '';
  const tag = imgM[0];
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = tag.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      // data: 内联占位图（1px base64）不是封面，必须跳过；本站真实封面就叫 default.jpg，
      // 故 blocklist 里不能再有 default，否则真实封面会被误杀。
      if (!cand || cand.startsWith('data:')) continue;
      if (['loading.jpg', 'loading.png', 'placeholder', 'logo'].some((b) => cand.toLowerCase().includes(b))) continue;
      return cand.startsWith('//') ? 'https:' + cand : (cand.startsWith('/') ? HOST + cand : cand);
    }
  }
  return '';
}

function parseCards(html, host) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    let href = (m[1] || '').trim();
    const inner = m[2] || '';
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
    if (!/<img[^>]*>/i.test(inner)) continue; // 只有带图的卡片才算列表项，导航链接不带图
    if (href.startsWith(host)) href = href.slice(host.length) || '/';
    if (!href.startsWith('/') && !href.startsWith('http')) continue;
    if (seen.has(href)) continue;
    const pic = extractPicFromInner(inner);
    let title = '';
    const aTitle = m[0].match(/title=["']([^"']+)["']/i);
    const imgAlt = inner.match(/alt=["']([^"']+)["']/i);
    if (aTitle) title = cleanLabel(aTitle[1]);
    else if (imgAlt) title = cleanLabel(imgAlt[1]);
    if (!title) title = cleanLabel(inner).split(/\s+/).filter((x) => x.length > 1).slice(0, 8).join(' ');
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    const qM = inner.match(/\b(1080p|720p|480p|HD|4K)\b/i);
    if (href && (pic || title)) {
      seen.add(href);
      items.push({
        vod_id: href,
        vod_name: title || 'XSZAV',
        vod_pic: pic || '',
        vod_remarks: durM ? durM[1] : (qM ? qM[1].toUpperCase() : ''),
      });
    }
  }
  return items;
}

function cleanStreamUrl(raw) {
  if (!raw) return '';
  return String(raw).replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
}

// 只认 http(s) 的 .m3u8/.mp4；磁链、下载链接一律不进播单。
function extractStreams(html) {
  const m3u8s = [];
  const mp4s = [];
  const push = (u) => {
    const c = cleanStreamUrl(u);
    if (!c || !/^https?:\/\//i.test(c)) return;
    if (/\.m3u8([?#]|$)/i.test(c)) { if (!m3u8s.includes(c)) m3u8s.push(c); }
    else if (/\.mp4([?#]|$)/i.test(c)) { if (!mp4s.includes(c)) mp4s.push(c); }
  };
  const src = String(html || '');
  for (const mm of src.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:[?#][^\s"'<>]*)?/gi)) push(mm[0]);
  for (const mm of src.matchAll(/["'](\/[^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/gi)) push(HOST + mm[1]);
  return { m3u8s, mp4s };
}

function parseVariantPlaylist(text, baseUrl) {
  const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x.length > 0);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const inf = lines[i];
    const resM = inf.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bwM = inf.match(/BANDWIDTH=(\d+)/i);
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith('#')) { uri = lines[j]; break; }
    }
    if (!uri) continue;
    const abs = resolveUrl(baseUrl, uri);
    let label = '';
    if (resM) label = resM[2] + 'p';
    else if (bwM) label = Math.round(parseInt(bwM[1], 10) / 1000) + 'kbps';
    else label = '线路' + (variants.length + 1);
    if (abs && !variants.some((v) => v.url === abs)) variants.push({ label, url: abs });
  }
  return variants;
}

function labelForMp4(url, idx) {
  const mm = String(url || '').match(/(1080|720|480|360)[pP]?/);
  return mm ? mm[1] + 'p' : '线路' + (idx + 1);
}

async function home() {
  const classes = [
    { type_id: 'latest', type_name: '最新' },
  ];
  let list = [];
  try { list = parseCards(await getHtml('/'), HOST).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const path = CATS[rawId];
  if (!path) return { page, pagecount: page, list: [] };
  const target = page === 1 ? path : (path === '/' ? '/?page=' + page : path.replace(/\/$/, '') + '/page/' + page);
  const html = await getHtml(target);
  const list = parseCards(html, HOST);
  const hasNext = html.includes('/page/' + (page + 1)) || html.includes('?page=' + (page + 1)) || html.includes('page=' + (page + 1));
  return { page, pagecount: hasNext ? page + 1 : page, list };
}

async function search(reqIn) {
  // 搜索路径未实证，仅作通用占位。
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw) return { list: [] };
  const path = '/search?q=' + encodeURIComponent(kw) + (page > 1 ? '&page=' + page : '');
  const html = await getHtml(path);
  return { page, list: parseCards(html, HOST) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + (rawId.startsWith('/') ? rawId : '/' + rawId);
  const html = await getHtml(rawId);
  let mainTitle = '';
  const tM = html.match(/<title>(.*?)<\/title>/i);
  const ogM = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (tM) mainTitle = cleanLabel(tM[1]);
  else if (ogM) mainTitle = cleanLabel(ogM[1]);
  else if (h1M) mainTitle = cleanLabel(h1M[1]);
  if (!mainTitle) mainTitle = cleanLabel(subSlugTitle(durl)) || 'XSZAV';
  // 字幕门（按条目）：只有从标题 + 详情字段提到番号才预热、分集才带 durl；无番号用 plain 播单、不预热。
  subCacheName(durl, mainTitle);
  const code = subExtractCode(mainTitle + ' ' + durl);
  if (code) subWarm(durl);
  const descM = html.match(/name=["']description["'][^>]+content=["']([^"']+)["']/i);
  let posterPic = '';
  const ogPic = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogPic) posterPic = absUrl(ogPic[1].trim(), HOST);
  if (!posterPic) {
    const imgM = html.match(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/i);
    if (imgM) posterPic = absUrl(imgM[1].trim(), HOST);
  }
  const streams = extractStreams(html);
  const primary = streams.m3u8s[0] || streams.mp4s[0] || '';
  let episodes = [];
  if (primary && /\.m3u8([?#]|$)/i.test(primary)) {
    const pl = await getText(primary);
    const variants = pl.includes('#EXT-X-STREAM-INF') ? parseVariantPlaylist(pl, primary) : [];
    if (variants.length > 1) {
      episodes = variants.map((v) => (code ? v.label + '$' + durl + '@@' + v.url : v.label + '$' + v.url));
    } else {
      episodes = [code ? '正片$' + durl + '@@' + primary : '正片$' + primary];
    }
  } else if (primary && /\.mp4([?#]|$)/i.test(primary)) {
    if (!streams.m3u8s.length && streams.mp4s.length > 1) {
      episodes = streams.mp4s.map((u, i) => (code ? labelForMp4(u, i) + '$' + durl + '@@' + u : labelForMp4(u, i) + '$' + u));
    } else {
      episodes = [code ? '正片$' + durl + '@@' + primary : '正片$' + primary];
    }
  } else {
    // 详情页未提取到直链：分集 Id 回落为详情页本身，play() 里再抓一次 HTML 通用提取；
    // 仍拿不到时 play() 返回空，该站 play 项在报告里标 FAIL。
    episodes = ['正片$' + durl];
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: '',
      vod_content: descM ? cleanLabel(descM[1]) : '',
      vod_play_from: 'XSZAV',
      vod_play_url: episodes.join('#'),
    }],
  };
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
  const subsP = durl ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  let finalUrl = '';
  if (/^https?:\/\//i.test(target) && /\.(m3u8|mp4)([?#]|$)/i.test(target)) {
    finalUrl = target;
  } else {
    // 目标不是直链：当 HTML 抓一次，用通用 .m3u8/.mp4 正则提取。
    const pageUrl = target.startsWith('http') ? target : HOST + (target.startsWith('/') ? target : '/' + target);
    const html = await getHtml(pageUrl);
    const streams = extractStreams(html);
    finalUrl = streams.m3u8s[0] || streams.mp4s[0] || '';
  }
  if (!finalUrl) return { parse: 0, url: '' };
  const result = { parse: 0, url: finalUrl, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'xszav', name: 'XSZAV', type: 3 },
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
