// 夜社短剧 https://yeshedjs.com —— 短剧站（MiraPlayer 蜘蛛，type:3；同品牌平行域 yesheai.com、官方入口 yeshe.tv，以 yeshedjs.com 为主）
// 已实证（2026-11-04 文本抓取实探）：
//   - 首页行：为你推荐 / 夜社首发 / 成人短剧 / 魔改短剧 / AI短剧 / 古装短剧；底部 CATEGORIES 与各行“查看更多”链向分类页
//   - 分类页：夜社首发 /yssf.html、成人短剧 /crdj.html、AI短剧 /aidj.html、古装短剧 /gzdj.html、
//     魔改短剧 /videos.html?tag=mo-gai（详情页“相关题材”链）、排行榜 /ranks/hot.html（20 部）；
//     分类页含“最新更新 / 当前热播 / 随机推荐”切换，切换参数未实证，默认取页内首屏列表
//   - 详情页：/video/<拼音slug>.html，含“共 N 集 · 已更新 N 集 / 全 N 集”、简介、选集按钮与会员服务入口
//   - 播放页：/video/<拼音slug>/episode-<N>.html（任务简述称 /play.html，实探为 /episode-N.html，以实探为准），
//     页内含“播放线路”；条目带“共 N 集 / 更新至 N 集”；部分会员；无番号
// 未实证（代码只作通用处理，不编路径）：
//   - 各分类页翻页规律（category 第 2 页起仅尝试 ?page=N / &page=N，翻页未坐实）
//   - 选集按钮链接目标之外的播单提取方式（播放页文本抓取只见“播放线路”骨架，未拿到真实播单样本；
//     play() 用通用 .m3u8/.mp4 正则提取，遇主清单自动选最高档；真实播单形态待真机/实页复核）
//   - 站内搜索路径（未实证，search() 返回空列表，不编搜索地址）
//   - 多档清晰度：详情页不含播单，无法在 detail() 展开档位；play() 遇主清单时选最高档，不编假档位
// 字幕：照搬 py_mogu.js 字幕芯（迅雷 > 迅雷看看 > SubtitleCat，三槽、首中即停、严过滤、上限 10/单槽 8、总预算 6s）；
//   按条目接：仅当标题/详情提得出 code 时才预热并用 '第N集$durl@@分集页地址'，否则用 plain 分集页地址；
//   本站为短剧、无番号，字幕门预期全站不接，但芯与门照写。
import req from '../../util/req.js';

const HOST = 'https://yeshedjs.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const CATS = [
  { id: 'yssf', name: '夜社首发', path: '/yssf.html' },
  { id: 'crdj', name: '成人短剧', path: '/crdj.html' },
  { id: 'mogai', name: '魔改短剧', path: '/videos.html?tag=mo-gai' },
  { id: 'aidj', name: 'AI短剧', path: '/aidj.html' },
  { id: 'gzdj', name: '古装短剧', path: '/gzdj.html' },
  { id: 'rank_hot', name: '排行榜', path: '/ranks/hot.html' },
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

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

function unescStream(s) {
  return String(s || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
}

// 通用播单提取：video/source/data-url/JSON 变量/全文正则，优先 .m3u8 其次 .mp4
function extractStream(html) {
  const h = String(html || '');
  const pats = [
    /<video[^>]+src=["']([^"']+)["']/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /data-url=["']([^"']+)["']/i,
    /["'](?:file|source|url|videoUrl|playUrl)["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const re of pats) {
    const m = h.match(re);
    if (m) {
      const u = unescStream(m[1]);
      if (/\.(m3u8|mp4)(\?|#|$)/i.test(u) && /^https?:\/\//i.test(u)) return u;
    }
  }
  let m = h.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return unescStream(m[0]);
  m = h.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return unescStream(m[0]);
  return '';
}

function resolveRel(uri, base) {
  uri = String(uri || '').trim();
  if (!uri) return '';
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith('//')) return 'https:' + uri;
  try { return new URL(uri, base).toString(); } catch (e) {
    const b = String(base || '').replace(/[^/]*$/, '');
    return uri.startsWith('/') ? (String(base).match(/^https?:\/\/[^/]+/) || [''])[0] + uri : b + uri;
  }
}

// 主清单 #EXT-X-STREAM-INF 解析：取最高档（高度优先，码率次之），相对地址按主清单解析
function pickHighestVariant(masterText, masterUrl) {
  const lines = String(masterText || '').split(/\r?\n/);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const resM = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bwM = line.match(/BANDWIDTH=(\d+)/i);
    const uri = (lines[i + 1] || '').trim();
    if (!uri || uri.startsWith('#')) continue;
    const cand = { h: resM ? parseInt(resM[2], 10) : 0, bw: bwM ? parseInt(bwM[1], 10) : 0, url: resolveRel(uri, masterUrl) };
    if (!best || cand.h > best.h || (cand.h === best.h && cand.bw > best.bw)) best = cand;
  }
  return best ? best.url : '';
}

async function resolvePlayUrl(pageUrl) {
  const html = await getHtml(pageUrl);
  if (!html) return '';
  let stream = extractStream(html);
  if (!stream) return '';
  if (/\.m3u8(\?|#|$)/i.test(stream)) {
    const master = await getHtml(stream);
    if (master && master.includes('#EXT-X-STREAM-INF')) {
      const top = pickHighestVariant(master, stream);
      if (top) return top;
    }
  }
  return stream;
}

// 字幕聚合芯的取数原语：统一回 {status, body}；设备 axios 走配置调用，本机桩走 req.get。
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
  const parts = String(durl || '').split('/').filter((p) => p && p !== '');
  const last = parts.length ? parts[parts.length - 1] : '';
  const base = last.replace(/\.(html?|php|aspx)$/i, '').replace(/\.(m3u8|mp4)$/i, '');
  return base ? clean(base.replace(/[-_]+/g, ' ')) : '';
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

function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href=["'](\/video\/[a-z0-9-]+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1].trim();
    if (href.includes('episode-')) continue; // 选集/播放链不是剧集卡片
    const inner = m[2];
    const slug = (href.match(/\/video\/([a-z0-9-]+)\.html/i) || [])[1] || '';
    if (!slug || seen.has(slug)) continue;
    let pic = '';
    const imgM = inner.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/i);
    if (imgM) {
      const cand = imgM[1].trim();
      if (!cand.includes('cover-placeholder.png')) pic = absUrl(cand, HOST);
    }
    let title = '';
    const altM = inner.match(/(?:alt|title)=["']([^"']+)["']/i);
    if (altM) title = cleanLabel(altM[1]).replace(/海报$/g, '').trim();
    let txt = cleanLabel(inner);
    const remM = txt.match(/(共\s*\d+\s*集|更新至\s*\d+\s*集|全\s*\d+\s*集)/);
    if (!title) {
      txt = txt.replace(/短剧精选/g, '').replace(/(夜社首发|成人短剧|魔改短剧|AI短剧|古装短剧)/g, '');
      const nm = txt.match(/^(.*?)(?:共\s*\d+\s*集|更新至\s*\d+\s*集|全\s*\d+\s*集)/);
      title = (nm ? nm[1] : txt).trim();
    }
    if (slug && title) {
      seen.add(slug);
      items.push({ vod_id: '/video/' + slug + '.html', vod_name: title, vod_pic: pic, vod_remarks: remM ? remM[1] : '' });
    }
  }
  return items;
}

function hasNextPage(html, page) {
  const h = String(html || '');
  const n = page + 1;
  return h.includes('?page=' + n) || h.includes('&page=' + n) || h.includes('/page/' + n)
    || h.includes('>' + n + '<') || /下一页/.test(h);
}

async function home() {
  const classes = CATS.map((c) => ({ type_id: c.id, type_name: c.name }));
  let list = [];
  try { list = parseCards(await getHtml('/')).slice(0, 30); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const catId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const cat = CATS.find((c) => c.id === catId) || CATS[0];
  let path = cat.path;
  if (page > 1) path = cat.path + (cat.path.includes('?') ? '&' : '?') + 'page=' + page;
  const html = await getHtml(path);
  const list = parseCards(html);
  const next = list.length > 0 && hasNextPage(html, page);
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  // 站内搜索路径未实证，不编地址，返回空列表
  return { list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + (rawId.startsWith('/') ? rawId : '/' + rawId);
  const slug = (durl.match(/\/video\/([a-z0-9-]+)\.html/i) || [])[1] || '';
  if (!slug) return { list: [] };
  const html = await getHtml('/video/' + slug + '.html');
  let title = '';
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const tM = html.match(/<title>([\s\S]*?)<\/title>/i);
  title = cleanLabel(h1M ? h1M[1] : (tM ? tM[1] : ''));
  title = title.replace(/\s*[-–—]\s*夜社短剧.*$/i, '').trim() || '夜社短剧';
  let total = 0;
  const totM = html.match(/共\s*(\d+)\s*集\s*·\s*已更新\s*(\d+)\s*集/) || html.match(/全\s*(\d+)\s*集/) || html.match(/共\s*(\d+)\s*集/);
  if (totM) total = parseInt(totM[1], 10) || 0;
  let pic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM && !ogM[1].includes('cover-placeholder.png')) pic = absUrl(ogM[1].trim(), HOST);
  if (!pic) {
    const imgM = html.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/i);
    if (imgM && !imgM[1].includes('cover-placeholder.png')) pic = absUrl(imgM[1].trim(), HOST);
  }
  let content = '';
  const descM = html.match(/name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descM) content = cleanLabel(descM[1]).slice(0, 600);
  // 字幕门：仅当标题提得出 code 才预热并用 durl@@ 形态，否则 plain 分集页地址（本站短剧预期无 code）
  const code = subExtractCode(title);
  if (code) { subCacheName(durl, title); subWarm(durl); }
  const eps = [];
  const n = total > 0 ? total : 1;
  for (let i = 1; i <= n; i++) {
    const epPage = HOST + '/video/' + slug + '/episode-' + i + '.html';
    const epId = code ? (durl + '@@' + epPage) : epPage;
    eps.push('第' + i + '集$' + epId);
  }
  return {
    list: [{
      vod_id: '/video/' + slug + '.html',
      vod_name: title,
      vod_pic: pic,
      vod_remarks: total > 0 ? ('共' + total + '集') : '',
      vod_content: content,
      vod_play_from: '夜社短剧',
      vod_play_url: eps.join('#'),
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
  let url = '';
  if (/^https?:\/\/[^\s"'$<>]+\.(m3u8|mp4)(\?|#|$)/i.test(target)) {
    if (/\.m3u8(\?|#|$)/i.test(target)) {
      const master = await getHtml(target);
      if (master && master.includes('#EXT-X-STREAM-INF')) {
        const top = pickHighestVariant(master, target);
        if (top) url = top;
      }
    }
    if (!url) url = target;
  } else {
    url = await resolvePlayUrl(target);
  }
  if (!url) return { parse: 0, url: '' };
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'yeshe_dj', name: '夜社短剧', type: 3 },
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
