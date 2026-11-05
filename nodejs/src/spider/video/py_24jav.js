import req from '../../util/req.js';

// 24JAV https://www4.24-jav.com/ —— WordPress 站（泰语界面，日语 AV）
// 帖子 = /<番号小写>/（如 /adn-814/）；播放 = 详情页 mee 播放器 iframe 的 token 拼确定性 master 链
//   https://<mee18player.com|meeplayer.com>/hlsr2/<40位hex>/master（VM 实测 4 个标题均直接返回 1080p 单档 master 播单，
//   无需调 player 的 /api/video + /api/resolve；该 API 在 VM 侧数次调用后回 403 Forbidden，属上游限流，
//   master 直链不受影响）。播单 variant 段为 .jpg 后缀分片（站方自家播放器同样如此），属 HLS 正常形态。
// 分类：首页实测 70 个 /genre/<slug>/ + 菜单/归档实测的 /category/subthai|uncensored|censored/
//   （uncensored 即站方自有的“无码”分区；无码流出/无码破解/减码无独立 slug，不硬编，见 NOTES.md；
//   大屁股无对应 genre，'back' 为背后位而非臀部向，不作近义顶替）
// 搜索：/?s=<关键词>（站方 SearchAction 结构，实测 ADN-814 / MIRD 均回帖子）
// 翻页：归档 /page/<N>/（首页 /page/<N>/、分类与 genre 同理）
// 字幕：与模板同一套 Layer A（迅雷 > 迅雷看看 > SubtitleCat），仅番号条目接芯；单码率 1080p，不编假档位。
const HOST = 'https://www4.24-jav.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

// 站方偶发 Cloudflare 520（实测搜索与分类页均有 transient 520），取数最多 3 次重试。
async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        timeout: 20000,
      });
      if (r.status && r.status !== 200) continue;
      const body = typeof r.data === 'string' ? r.data : '';
      if (body) return body;
    } catch (e) { /* retry */ }
  }
  return '';
}

async function getText(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': HOST + '/' },
        timeout: 15000,
      });
      if (r.status === 200 && typeof r.data === 'string' && r.data) return r.data;
    } catch (e) { /* retry */ }
  }
  return '';
}

// 列表卡片：<article class="box"> 内 <a class="tip" href="/<slug>/" title="番号 + 泰语标题"> + <img src>
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<article class="box"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const block = m[0];
    const aM = block.match(/<a[^>]+class="tip"[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i)
      || block.match(/<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i);
    if (!aM) continue;
    const href = aM[1].trim();
    if (!href.startsWith('/') && !href.startsWith(HOST)) continue;
    const path = href.startsWith(HOST) ? href.slice(HOST.length) : href;
    if (seen.has(path)) continue;
    seen.add(path);
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    const qM = block.match(/<span class="quality[^"]*">([^<]+)<\/span>/i);
    out.push({
      vod_id: path,
      vod_name: cleanLabel(aM[2]) || path.replace(/\//g, ''),
      vod_pic: imgM ? normUrl(imgM[1].trim()) : '',
      vod_remarks: qM ? cleanLabel(qM[1]) : '',
    });
  }
  return out;
}

// 详情页 mee 播放器 iframe：https://<mee18player.com|meeplayer.com>/play/<40位hex>
// （2026-11-05 实测 token 为 40 位 hex，旧口径称 32 位 md5，只取前 32 位拼 master 会 404；
//   另有同款 meeplayer.com，master 按 iframe 的 host 拼。）
function extractMeeMd5(html) {
  const m = String(html || '').match(/https?:\/\/(mee18player\.com|meeplayer\.com)\/play\/([a-f0-9]{32,64})/i);
  if (!m) return null;
  return { host: m[1].toLowerCase(), token: m[2].toLowerCase() };
}

function masterUrl(mee) {
  return 'https://' + (mee && mee.host ? mee.host : 'mee18player.com') + '/hlsr2/' + mee.token + '/master';
}

// 解析 master 播单的 STREAM-INF 档位（RESOLUTION + 下一行 variant URL）；失败返回空数组。
function parseMasterVariants(masterText) {
  const lines = String(masterText || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const inf = lines[i].match(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)/);
    if (inf && lines[i + 1] && lines[i + 1].trim() && !lines[i + 1].startsWith('#')) {
      out.push({ label: inf[2] + 'p', url: lines[i + 1].trim() });
    }
  }
  return out;
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
  const slug = (String(durl || '').match(/\/([a-z0-9-]+)\/?$/) || [])[1] || '';
  return slug || '';
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
// ---------------- 分类（全部取自站方实测：菜单 + 首页 genre 云 + 归档页标题） ----------------
const GENRES = [
  ['3p', '三人行'], ['abuse', '虐待'], ['affair', '出轨'], ['back', '背后位'],
  ['bath', '洗浴'], ['beautiful-girl', '美少女'], ['big-tits', '巨乳'], ['blowjob', '口交'],
  ['bukkake', '颜射'], ['busty-fetish', '巨乳癖'], ['cervix', '宫颈'], ['cowgirl', '女上位'],
  ['creampie', '中出'], ['cuckold', '绿帽'], ['cum', '射精'], ['cunnilingus', '舔阴'],
  ['debut-production', '出道作'], ['dirty-talk', '淫语'], ['drama', '剧情'], ['elder-male', '大叔'],
  ['facials', '面部射精'], ['female-teacher', '女教师'], ['footjob', '足交'], ['gal', '辣妹'],
  ['glasses', '眼镜'], ['hot-spring', '温泉'], ['how-to', '教学'], ['huge-cocks', '巨根'],
  ['humiliation', '羞辱'], ['incest', '乱伦'], ['instructor', '教官'], ['kiss', '接吻'],
  ['lesbian', '女同'], ['lesbian-kiss', '女同接吻'], ['lotion', '乳液'], ['lotion-oil', '精油'],
  ['m-girl', 'M女'], ['male-squirting', '男潮'], ['married', '已婚'], ['married-woman', '人妻'],
  ['mature', '熟女'], ['mini', '娇小'], ['mother', '母亲'], ['muscle', '肌肉'],
  ['nasty', '下流'], ['nurse', '护士'], ['ol', '白领'], ['older-sister', '姐姐'],
  ['orgasm', '高潮'], ['orgy', '群交'], ['original-collaboration', '原创合作'], ['other-asian', '其他亚洲'],
  ['outdoors', '户外'], ['pantyhose', '连裤袜'], ['pov', '第一视角'], ['restraint', '束缚'],
  ['school-swimsuit', '学校泳装'], ['schoolgirls', '女学生'], ['shaved', '白虎'], ['slender', '苗条'],
  ['slut', '淫娃'], ['solowork', '单体作品'], ['squirting', '潮吹'], ['sun-tan', '晒痕'],
  ['sweat', '汗水'], ['swimsuit', '泳装'], ['titty-fuck', '乳交'], ['toy', '玩具'],
  ['urination', '排尿'], ['vibe', '振动棒'],
];

async function home() {
  const classes = [
    { type_id: 'home', type_name: '最新' },
    { type_id: 'category/subthai', type_name: '泰语字幕' },
    { type_id: 'category/uncensored', type_name: '无码' },
    { type_id: 'category/censored', type_name: '有码' },
  ];
  for (const [slug, name] of GENRES) classes.push({ type_id: 'genre/' + slug, type_name: name });
  let list = [];
  try { list = parseCards(await getHtml('/')).slice(0, 24); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

function archivePath(id, page) {
  if (id === 'home' || !id) return page > 1 ? '/page/' + page + '/' : '/';
  return page > 1 ? '/' + id + '/page/' + page + '/' : '/' + id + '/';
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'home');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const path = archivePath(id, page);
  const html = await getHtml(path);
  const list = parseCards(html);
  const nextMarker = id === 'home' || !id ? '/page/' + (page + 1) + '/' : '/' + id + '/page/' + (page + 1) + '/';
  const hasNext = html.includes(nextMarker);
  return { page, pagecount: hasNext ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/?s=' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  const h1M = html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '精彩视频';
  if (h1M) mainTitle = cleanLabel(h1M[1]) || mainTitle;
  else if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*-\s*24-Jav\.com.*$/i, '').trim() || mainTitle;
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM) posterPic = normUrl(ogM[1].trim());
  if (!posterPic) {
    const im = html.match(/<img[^>]+class="[^"]*entry-image[^"]*"[^>]+src="([^"]+)"/i);
    if (im) posterPic = normUrl(im[1].trim());
  }
  const mee = extractMeeMd5(html);
  let playUrl = '';
  if (mee) {
    // 优先读 master 播单拆真实档位（实测均为单档 1080p）；读不到则直接给 master 单档。
    const variants = parseMasterVariants(await getText(masterUrl(mee)));
    const opts = variants.length ? variants : [{ label: '正片', url: masterUrl(mee) }];
    playUrl = opts.map((o) => o.label + '$' + durl + '@@' + o.url).join('#');
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: mee ? '1080p' : '',
      vod_content: '24JAV',
      vod_play_from: '24JAV',
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
  if (!target) {
    // 自愈：重取详情页再提 md5 拼 master；仍无则走网页兜底，绝不返回 parse:0 空 url。
    if (durl) {
      const mee = extractMeeMd5(await getHtml(durl.startsWith('http') ? durl.slice(HOST.length) : durl));
      if (mee) target = masterUrl(mee);
    }
    if (!target) return { parse: 1, url: durl || HOST + '/' };
  }
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_24jav', name: '24JAV', type: 3 },
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
