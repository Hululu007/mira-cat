import req from '../../util/req.js';

// IPornBase —— AV空投軍團（ipornbase.com 主站 + ipornbase.xyz 2站，同站双域名，见 NOTES.md）
// Drupal 站：列表 /<section>/<sort>（?page=N，0-based），标签 /tags/<词>（?page=N），详情 /video/<slug>，
// 播放 window.m3u8List 首条直链（单码率媒体播单，无多档 rendition，不设假清晰度）；封面为站内直链 /sites/default/files/styles/...（img src 直出，无懒加载加密）。
// 分类：站方菜单 8 区（名与路径均取自首页实测）+ filters 排序（最近更新/最新发行/中文字幕/今日/本周/本月/年度热门/总观看数）；
// 用户点名近义项实测：無碼破解 / 巨乳 / 大屁股 均为真实标签页（h1 与标题一致、每页 12 条），已加；無碼流出 = JAV無碼流出区本身；
// 减码 / 减少马赛克查无标签页（404、0 条），未加、不硬凑。
// 字幕按条目接（仅标题或地址含番号的条目才接芯，无番号不接），芯与模板同一套 Layer A（subSlugTitle 仅放宽尾斜杠要求，因本站链接无尾斜杠）。
const HOSTS = ['https://ipornbase.com', 'https://ipornbase.xyz'];
const PRIMARY = HOSTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const SECTIONS = [
  { id: 'japanese', name: '日本AV', base: 'japanese' },
  { id: 'uncensored-leak', name: 'JAV無碼流出', base: 'uncensored-leak' },
  { id: 'fc2', name: 'FC2素人', base: 'fc2' },
  { id: 'hentai', name: '裏番', base: 'hentai' },
  { id: 'western', name: '歐美', base: 'western' },
  { id: 'asian', name: '亞洲國產AV', base: 'asian' },
  { id: 'korean', name: '韓國直播', base: 'korean' },
  { id: 'ai', name: '黃果短劇', base: 'ai' },
];
const SORTS = [
  { n: '最近更新', v: 'new' },
  { n: '最新發行', v: 'release' },
  { n: '中文字幕', v: 'sub' },
  { n: '今日熱門', v: 'today-hot' },
  { n: '本週熱門', v: 'weekly-hot' },
  { n: '本月熱門', v: 'monthly-hot' },
  { n: '年度熱門', v: 'yearly-hot' },
  { n: '總觀看數', v: 'hot' },
];
const TAGS = [
  { id: 'tag-wuma-pojie', name: '無碼破解', word: '無碼破解' },
  { id: 'tag-juru', name: '巨乳', word: '巨乳' },
  { id: 'tag-dapigu', name: '大屁股', word: '大屁股' },
];

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

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  return s;
}

// 双域名顺序回落：主站（.com，实测更快）先行；空/非 200/异常才走 .xyz。返回 { html, host }。
async function getPage(path) {
  let p = String(path || '');
  if (p.startsWith('//')) p = 'https:' + p;
  for (const host of HOSTS) {
    const url = p.startsWith('/') ? host + p : p;
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': host + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        timeout: 20000,
      });
      if (r.status && r.status !== 200) continue;
      const body = typeof r.data === 'string' ? r.data : '';
      if (!body) continue;
      return { html: body, host };
    } catch (e) { /* 换下一个域名 */ }
  }
  return { html: '', host: PRIMARY };
}

// 字幕芯取数原语（与模板一致）：统一回 {status, body}
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

// 卡片：图链 <a href="/video/<slug>"><img src alt=标题></a>；按 URL 合并，标题取 img alt（无 alt 时取锚内文本）
function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](\/video\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.includes('go.') || raw.startsWith('http')) continue;
    const inner = m[2] || '';
    let it = byUrl.get(raw);
    if (!it) { it = { vod_id: raw, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(raw, it); }
    const imgM = inner.match(/<img[^>]+>/i);
    if (imgM) {
      const srcM = imgM[0].match(/(?:data-original|data-src|src)=["']([^"']+)["']/i);
      if (srcM && !it.vod_pic) {
        const cand = srcM[1].trim();
        if (cand && !/loading|placeholder|logo/i.test(cand)) it.vod_pic = normUrl(cand.startsWith('http') ? cand : absUrl(cand, host));
      }
      const altM = imgM[0].match(/alt=["']([^"']*)["']/i);
      if (altM && !it.vod_name) { const t = cleanLabel(altM[1]); if (t.length > 1) it.vod_name = t; }
    }
    if (!it.vod_name) { const txt = cleanLabel(inner); if (txt && txt.length > 2) it.vod_name = txt; }
  }
  const out = [];
  for (const it of byUrl.values()) {
    if (it.vod_pic || it.vod_name) {
      if (!it.vod_name) it.vod_name = '精彩视频';
      out.push(it);
    }
  }
  return out;
}

function hasNextPage(html, page) {
  const h = String(html || '');
  return h.includes('?page=' + page) || h.includes('&amp;page=' + page) || h.includes('&page=' + page);
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
  const slug = (String(durl || '').match(/\/video\/([^/?#]+)/) || [])[1] || '';
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



async function home() {
  const classes = [{ type_id: 'home', type_name: '首頁推薦' }];
  for (const s of SECTIONS) classes.push({ type_id: s.id, type_name: s.name });
  for (const t of TAGS) classes.push({ type_id: t.id, type_name: t.name });
  const filters = {};
  for (const s of SECTIONS) filters[s.id] = [{ key: 'sort', name: '排序', value: SORTS }];
  let list = [];
  try {
    const { html, host } = await getPage('/');
    list = parseCards(html, host).slice(0, 20);
  } catch (e) { list = []; }
  return { class: classes, filters, list };
}

function sectionPath(sec, sort, page) {
  let base;
  if (sort === 'sub') base = '/' + sec.base + '/new?field_video_tags_target_id=1&sort_by=created';
  else base = '/' + sec.base + '/' + sort;
  if (page > 1) base += (base.includes('?') ? '&page=' + (page - 1) : '?page=' + (page - 1));
  return base;
}

function tagPath(tag, page) {
  let base = '/tags/' + encodeURIComponent(tag.word);
  if (page > 1) base += '?page=' + (page - 1);
  return base;
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  if (zoneId === 'home' || !zoneId) {
    const { html, host } = await getPage('/');
    return { page: 1, pagecount: 1, list: parseCards(html, host) };
  }
  const tag = TAGS.find((t) => t.id === zoneId);
  if (tag) {
    const { html, host } = await getPage(tagPath(tag, page));
    const list = parseCards(html, host);
    return { page, pagecount: hasNextPage(html, page) ? page + 1 : page, list };
  }
  const sec = SECTIONS.find((s) => s.id === zoneId);
  if (!sec) return { page, pagecount: page, list: [] };
  const sort = String(extend.sort || 'new').trim() || 'new';
  const { html, host } = await getPage(sectionPath(sec, sort, page));
  const list = parseCards(html, host);
  return { page, pagecount: hasNextPage(html, page) ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let path = '/search?fulltext=' + encodeURIComponent(kw);
  if (page > 1) path += '&page=' + (page - 1);
  const { html, host } = await getPage(path);
  const list = parseCards(html, host);
  return { page, pagecount: hasNextPage(html, page) ? page + 1 : page, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : PRIMARY + rawId;
  const { html, host } = await getPage(rawId);
  if (!html) return { list: [] };
  let mainTitle = '精彩视频';
  const h1M = html.match(/<h1[^>]*class=["'][^"']*vdtitle[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h1M) mainTitle = cleanLabel(h1M[1]) || mainTitle;
  else {
    const tM = html.match(/<title>(.*?)<\/title>/i);
    if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*[|｜-]\s*AV空投軍團.*$/i, '').trim() || mainTitle;
  }
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const vM = html.match(/<video[^>]*poster=["']([^"']+)["']/i);
  if (vM) posterPic = normUrl(vM[1].trim().startsWith('http') ? vM[1].trim() : absUrl(vM[1].trim(), host));
  const m3u8M = html.match(/window\.m3u8List\s*=\s*\[([\s\S]*?)\]/);
  const urls = [];
  if (m3u8M) {
    for (const q of m3u8M[1].matchAll(/["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/g)) {
      const u = q[1].trim();
      if (u && !urls.includes(u)) urls.push(u);
    }
    if (!urls.length) {
      for (const q of m3u8M[1].matchAll(/["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/g)) {
        const u = q[1].trim();
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
  }
  let playUrl = '';
  if (urls.length === 1) playUrl = '正片$' + durl + '@@' + urls[0];
  else if (urls.length > 1) playUrl = urls.map((u, i) => '線路' + (i + 1) + '$' + durl + '@@' + u).join('#');
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: urls.length ? 'HD' : '',
      vod_content: 'IPornBase',
      vod_play_from: 'IPornBase',
      vod_play_url: playUrl,
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
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': PRIMARY + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_ipornbase', name: 'IPornBase', type: 3 },
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
