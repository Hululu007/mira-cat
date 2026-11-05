import req from '../../util/req.js';

// JavRate https://www.javrate.com/ —— 鑑黃師（站方自称 Javrate；标题“正妹AV,日本A片,國產AV,免費在綫看 - Javrate”）
// *** 2026-11-04 用户点名先写这 8 个，故本源已导入（原协调员 HELD 意见被用户指令取代）。
// 播放仍受限：见下文播放链路说明——列表/分类/详情/搜索/封面/字幕均实测可用，
// 唯播放需播单改写代理（token 30 秒 + 逐分片签名），代理未建前 App 内播单播一半会死，属已知限制、非新 bug。
// 播放链路（2026-11-04 VM 实测）：详情页 JSON-LD contentUrl 是未签名裸清单（videocdn.avking.xyz，
// 直接取 403）；真流须走详情页 iframe /player/v2?payload=… 取签名 master（cloud-*.avking.xyz，
// token 有效期仅 30 秒，过期即 403）；且每条分片请求都必须单独带 token 查询串（裸分片 403 实测），
// 站方自带播放器靠自定义 loader 给每个请求注入并刷新 token，App 播放器不会这样做，
// 故蜘蛛只能返回新鲜签名 master，无法保证 App 内播通、更无法撑过 30 秒后的分片。
// 除播放外全部实测可用：首页/菜单/关键词分类/详情/搜索/封面均为直链。
// 分类：菜单 3 个（censored/uncensored/chinese）+ 关键词分类（名与路径均取自站方 /keywords/movie 索引页实测）
// 列表翻页：菜单 /menu/<m>/5-2-<页>；关键词 /keywords/movie/<词>?page=<页>&moviesort=3（第 2 页标题实测“第2頁”）
// 搜索：/search/<关键词>（实测 FNS-274 返回 1 条）；详情 JSON-LD identifier.value 即番号，字幕按条目接。
const HOST = 'https://www.javrate.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const RELAY = 'https://javrate.li768435813.workers.dev';
// 2026-11-05: 手机直连 javrate.com 拿不到内容（VM 全通），取数改走 Worker 优先、
// 直连兜底；Worker 未部署时 Worker 腿速败、行为与原来一致，部署后无需重推即生效。
function b64url(str) {
  try {
    return Buffer.from(String(str), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function viaWorker(url) { return RELAY + '/f/' + b64url(url); }

// 2026-11-05 round2（照搬 porncgw 能通的取数韧性）：CF 挑战页特征识别 + sleep。
function isChallengeHtml(html) {
  if (!html) return false;
  return /Just a moment|Attention Required|challenges\.cloudflare\.com|cf-ray|cf-challenge/i.test(html);
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&x([0-9A-Fa-f]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').replace(/[$#]/g, '').trim();
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

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  const headers = { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
  // 取数：Worker 优先（手机直连被拦时走 Worker），直连兜底；每腿单次、有界返回。
  // 2026-11-05 LA 鉴别：LA 节点也空，排除 IP/验证问题；旧版 Worker 3×30s +
  //   直连 2×30s，挂住最长约 150 秒才回空，超 App 蜘蛛超时致空。故 Worker 8s、
  //   直连 3s 双界，总耗时至多约 11 秒；挑战页仍视为失败（其余逻辑不变）。
  const legs = [
    { u: viaWorker(url), ms: 8000 },
    { u: url, ms: 3000 },
  ];
  for (const leg of legs) {
    const p = (async () => {
      try {
        const r = await req.get(leg.u, { headers, timeout: leg.ms });
        const body = (r && r.data != null) ? String(r.data) : '';
        if (r && r.status === 200 && body && !isChallengeHtml(body)) return body;
      } catch (e) { /* ignore, next leg */ }
      return '';
    })();
    const to = new Promise((resolve) => setTimeout(() => resolve(''), leg.ms));
    const body = await Promise.race([p, to]);
    if (body) return body;
  }
  return '';
}

// 字幕芯取数原语（与 py_mogu 一致）：统一回 {status, body}
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

// 本站卡片是“图链 + 文链”多个 <a> 共用同一 /movie/detail/<uuid>.html，按 URL 合并图与标题
function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      if (cand && !['loading.jpg', 'loading.png', 'placeholder', 'default'].some((b) => cand.toLowerCase().includes(b))) return cand;
    }
  }
  return '';
}

function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](\/movie\/detail\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const pic = extractPic(inner);
    if (pic && !it.vod_pic) it.vod_pic = normUrl(pic.startsWith('http') ? pic : absUrl(pic, host));
    const txt = cleanLabel(inner);
    // 同一 URL 有图链（alt 仅番号）与文链（完整标题）两个锚点：取较长者，文链标题胜出
    if (txt && txt.length > 2 && txt.length > it.vod_name.length) it.vod_name = txt;
    // 本站图链锚点内无文字、标题只在 <img alt="..."> 里，取 alt 作标题兜底（去尾“封面”二字）
    if (!it.vod_name || it.vod_name.length < 3) {
      const altM = inner.match(/alt=["']([^"']+)["']/i);
      if (altM) { const altTxt = cleanLabel(altM[1]).replace(/\s*封面\s*$/, ''); if (altTxt && altTxt.length > it.vod_name.length) it.vod_name = altTxt; }
    }
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (durM && !it.vod_remarks) it.vod_remarks = durM[1];
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
  const slug = (String(durl || '').match(/\/movie\/detail\/([^/.]+)\.html/) || [])[1] || '';
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



// ---------------- JavRate 分类（全部站方实测存在） ----------------
// 菜单类：/menu/censored（日本A片/有碼，28860部）、/menu/uncensored（無碼A片，3004部）、
// /menu/chinese（國產AV，1619部）；关键词类：路径取自 /keywords/movie 索引页，
// 其中 無碼破解（57部）、巨乳（18066部）为实测标题“类别A片在綫免費播放”。
// 用户点名的 無碼流出 / 减码 / 减少马赛克 在站方索引里无完全对应名，未硬凑（最接近为 無碼破解 +
// 無碼A片菜单，见 NOTES.md）；大屁股无完全对应名，站方自有近义项为 美臀 / 巨尻，已列出。
const CATS = [
  { id: 'menu_censored', name: '日本A片', kind: 'menu', path: 'censored' },
  { id: 'menu_uncensored', name: '無碼A片', kind: 'menu', path: 'uncensored' },
  { id: 'menu_chinese', name: '國產AV', kind: 'menu', path: 'chinese' },
  { id: 'kw_wumapojie', name: '無碼破解', kind: 'kw', path: '無碼破解' },
  { id: 'kw_juru', name: '巨乳', kind: 'kw', path: '巨乳' },
  { id: 'kw_meitun', name: '美臀', kind: 'kw', path: '美臀' },
  { id: 'kw_juqiao', name: '巨尻', kind: 'kw', path: '巨尻' },
  { id: 'kw_meiru', name: '美乳', kind: 'kw', path: '美乳' },
  { id: 'kw_zhongwen', name: '中文字幕', kind: 'kw', path: '中文字幕' },
  { id: 'kw_4k', name: '4K', kind: 'kw', path: '4k' },
  { id: 'kw_zhifu', name: '制服', kind: 'kw', path: '制服' },
  { id: 'kw_renqi', name: '人妻', kind: 'kw', path: '人妻' },
  { id: 'kw_shunv', name: '熟女', kind: 'kw', path: '熟女' },
  { id: 'kw_nvjiaoshi', name: '女教師', kind: 'kw', path: '女教師' },
  { id: 'kw_hushi', name: '護士', kind: 'kw', path: '護士' },
  { id: 'kw_kongjie', name: '空姐', kind: 'kw', path: '空姐' },
  { id: 'kw_ol', name: 'OL', kind: 'kw', path: 'ol' },
];
const CAT_MAP = {};
for (const c of CATS) CAT_MAP[c.id] = c;

function catUrl(cat, page) {
  if (cat.kind === 'menu') {
    return page <= 1 ? ('/menu/' + cat.path) : ('/menu/' + cat.path + '/5-2-' + page);
  }
  const base = '/keywords/movie/' + encodeURIComponent(cat.path);
  return page <= 1 ? base : (base + '?page=' + page + '&moviesort=3');
}

async function home() {
  const classes = [{ type_id: 'new', type_name: '最新更新' }];
  for (const c of CATS) classes.push({ type_id: c.id, type_name: c.name });
  let list = [];
  try { list = parseCards(await getHtml('/'), HOST).slice(0, 30); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid || tid === 'new') {
    const html = await getHtml('/movie/new');
    return { page: 1, pagecount: 1, list: parseCards(html, HOST) };
  }
  const cat = CAT_MAP[tid];
  if (!cat) return { page, pagecount: page, list: [] };
  const html = await getHtml(catUrl(cat, page));
  const list = parseCards(html, HOST);
  const hasNext = page === 1 ? list.length > 0 : list.length > 0;
  return { page, pagecount: hasNext ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/search/' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html, HOST) };
}

function extractPayload(html) {
  const m = String(html || '').match(/\/player\/v2\?payload=([^"'&]+)/);
  return m ? m[1] : '';
}

function extractLd(html, key) {
  const m = String(html || '').match(new RegExp('"' + key + '":\\s*"([^"]+)"'));
  return m ? unescapeHtml(m[1]) : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  if (!html) return { list: [] };
  let mainTitle = extractLd(html, 'name');
  if (!mainTitle) {
    const tM = html.match(/<title>(.*?)<\/title>/i);
    if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*\|\s*Javrate\s*$/i, '').trim();
  }
  if (!mainTitle) mainTitle = '精彩视频';
  subCacheName(durl, mainTitle);
  // 封面：详情页 _m.webp 大图优先，退回 JSON-LD thumbnailUrl（_s.webp），均为 picture.avking.xyz 直链（VM 实测 200）
  let posterPic = '';
  const mPosters = html.match(/https:\/\/picture\.avking\.xyz[^"'\s<>]+?_m\.webp/g);
  if (mPosters && mPosters.length) posterPic = mPosters[0];
  if (!posterPic) posterPic = extractLd(html, 'thumbnailUrl');
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = normUrl(ogM[1].trim());
  }
  const desc = extractLd(html, 'description');
  const code = extractLd(html, 'value');
  const payload = extractPayload(html);
  // 播单不在详情时固化：play() 凭 payload 现取 player v2（token 仅 30 秒有效，详情时取必过期，
  // 故详情只存 payload，不存签名 URL）；无 payload 时不给播单，避免 parse:0 空 url 转圈。
  const playUrl = payload ? ('正片$' + durl + '@@' + payload) : '';
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: code || 'HD',
      vod_content: desc || 'JavRate',
      vod_play_from: 'JavRate',
      vod_play_url: playUrl,
    }],
  };
}

async function resolveSignedMaster(durl, payload) {
  // 现取 player v2（Referer 必须为详情页），抽签名 master；master 内含 720p/1080p 两档（首个样本实测），
  // 但返回 master 本身（自适应），不在此虚构分档选单；分片仍需 token（见文件头），App 内播通与否未经证实。
  const playerHtml = await getHtml('/player/v2?payload=' + encodeURIComponent(payload));
  if (!playerHtml) return '';
  const found = [];
  const re = /https:\/\/cloud-[a-z0-9-]+\.avking\.xyz[^"'\s<>]+?playlist\.m3u8[^"'\s<>]*/g;
  let m;
  while ((m = re.exec(playerHtml)) !== null) {
    const u = unescapeHtml(m[0]);
    if (u.indexOf('token=') >= 0 && found.indexOf(u) < 0) found.push(u);
  }
  return found.length ? found[0] : '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let payload = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); payload = id.slice(at + 2); }
  if (!payload) return { parse: 0, url: '' };
  // 字幕按条目接：仅当标题含番号才搜，否则不带 subs 键（与模板同一口径）
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  let target = '';
  try { target = await resolveSignedMaster(durl, payload); } catch (e) { target = ''; }
  if (!target) {
    // 兜底：详情 JSON-LD 的裸清单（已知取数 403，仅作“非空”保底，不宣称可播）
    try {
      const html = await getHtml(durl.startsWith('http') ? durl : durl);
      const bare = extractLd(html, 'contentUrl');
      if (bare) target = bare;
    } catch (e) { /* ignore */ }
  }
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_javrate', name: 'JavRate', type: 3 },
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
