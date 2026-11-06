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

function t(v) { return String(v == null ? '' : v).trim(); }
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
function subWarmUrls(urls, title) {
  const list = (urls || []).filter(Boolean);
  for (const u of list) subCacheName(u, title);
  (async () => { for (const u of list) { try { await subSearchAll(u); } catch (e) {} } })().catch(() => {});
}

// ---------- 字幕聚合芯（与 py_ero / 第一批同款，照抄） ----------
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
  if (lastPlayUrl && lastName) subWarmUrls(lastPlayUrl.split('#').map((e) => e.split('$').pop()), lastName);
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
      if (eps) {
        url = (eps.split('#')[0].split('$').pop() || '');
        if (url) {
          const $t = cheerio.load(html);
          const _title = $t('h1.title').text().trim()
            || $t('meta[property="og:title"]').attr('content')
            || $t('h1').first().text().trim()
            || $t('title').text().trim()
            || '';
          if (_title) subCacheName(url, _title);
        }
      }
    }
  }
  const result = { parse: 0, url: url || '', header: { 'User-Agent': UA, origin: PRIMARY, referer: PRIMARY + '/' } };
  if (url) {
    const subs = await subSearchAll(url).catch(() => []);
    if (subs && subs.length) result.subs = subs;
  }
  return result;
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
