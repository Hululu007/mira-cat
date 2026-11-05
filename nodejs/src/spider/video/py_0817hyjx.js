import req from '../../util/req.js';

// AV影社 https://www.0817hyjx.com/cn —— 日本 AV 聚合站（MissAV 系镜像站）
// 列表：<article class="ms2-card">（img src 直链封面 + alt 标题 + 时长 span）；翻页 ?page=N
// 详情：<h1> 标题 + iframe playdaili.com/api/public/missav-player/<id>，
//   该页内 <script id="missav-config"> JSON 含 poster 与 source（playorigincdn.com master.m3u8）
// 播放：单码率（master 仅一条 media.m3u8，分片为 .jpeg 伪装的 ts，HEAD 200 video/mp2t）；
//   站方不给多档，绝不编假清晰度。字幕按条目接（仅标题/地址含番号的条目才接芯）。
const HOST = 'https://www.0817hyjx.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
// 分类全部取自本站实测：导航菜单（首页 HTML）+ 类型索引页（带影片数）。
// 用户点名的 无码流出 / 巨乳 / 大屁股 均有真实对应；无码破解 / 减码 / 减少马赛克
// 在类型索引 1-15 页扫描中无对应项，故未加（见 NOTES.md），不用近义词顶替。
const CLASSES = [
  { v: 'new', n: '最近更新' },
  { v: 'release', n: '新作上市' },
  { v: 'chinese-subtitle', n: '中文字幕' },
  { v: 'uncensored-leak', n: '无码流出' },
  { v: 'today-hot', n: '今日热门' },
  { v: 'weekly-hot', n: '本週热门' },
  { v: 'monthly-hot', n: '本月热门' },
  { v: 'genres/VR', n: 'VR' },
  { v: 'genres/%E5%B7%A8%E4%B9%B3', n: '巨乳' },
  { v: 'genres/%E5%A4%A7%E5%B1%81%E8%82%A1', n: '大屁股' },
  { v: 'genres/%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD', n: '巨乳偏好' },
  { v: 'genres/%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD', n: '屁股偏好' },
  { v: 'genres/%E5%A4%96%E5%9B%BD%E5%A5%B3%E4%BC%98', n: '欧美大片' },
  { v: 'fc2', n: 'FC2' },
  { v: 'heyzo', n: 'HEYZO' },
  { v: 'tokyohot', n: '东京热' },
  { v: '1pondo', n: '一本道' },
  { v: 'caribbeancom', n: 'Caribbeancom' },
  { v: 'caribbeancompr', n: 'Caribbeancompr' },
  { v: '10musume', n: '10musume' },
  { v: 'pacopacomama', n: 'pacopacomama' },
  { v: 'gachinco', n: 'Gachinco' },
  { v: 'xxxav', n: 'XXX-AV' },
  { v: 'marriedslash', n: '人妻斩' },
  { v: 'naughty4610', n: '顽皮 4610' },
  { v: 'naughty0930', n: '顽皮 0930' },
  { v: 'siro', n: 'SIRO' },
  { v: 'luxu', n: 'LUXU' },
  { v: 'gana', n: 'GANA' },
  { v: 'maan', n: 'PRESTIGE PREMIUM' },
  { v: 'scute', n: 'S-CUTE' },
  { v: 'ara', n: 'ARA' },
  { v: 'madou', n: '麻豆传媒' },
  { v: 'twav', n: 'TWAV' },
  { v: 'furuke', n: 'Furuke' },
  { v: 'klive', n: '韩国直播' },
  { v: 'clive', n: '中国直播' },
];

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

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return u;
}

async function getHtml(url) {
  let full = String(url || '');
  if (full.startsWith('//')) full = 'https:' + full;
  else if (full.startsWith('/')) full = HOST + full;
  try {
    const r = await req.get(full, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/cn', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    const raw = typeof r.data === 'string' ? r.data : '';
    // 2026-11-05: 站方新加 xsg-base64-v2 混淆壳（document.write 输出 base64 编码的
    // 真实页面，无 JS 引擎时直接解析只能拿到空壳）；壳里只有一段长 base64，解开即
    // 真实页面（含 ms2-card 卡片），解不开或解开后无卡片时回落原文。
    if (raw.includes('data-xsg-obfuscation')) {
      try {
        const cands = raw.match(/"([A-Za-z0-9+/=]{1000,})"/g) || [];
        let best = '';
        for (const c of cands) {
          const inner = c.slice(1, -1);
          if (inner.length > best.length) best = inner;
        }
        if (best) {
          const decoded = Buffer.from(best, 'base64').toString('utf-8');
          if (decoded.includes('<article')) return decoded;
        }
      } catch (e) { /* fall through */ }
    }
    return raw;
  } catch (e) { return ''; }
}

function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<article[^>]*class="[^"]*ms2-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const inner = m[1];
    // 2026-11-05: 站方卡片 href 改为绝对地址（https://www.0817hyjx.com/cn/xxx），
    //   只认相对 /cn/ 会漏全部卡片；任意 href 均取 /cn/<slug> 归一为相对地址。
    const hrefM = inner.match(/href=["']([^"']+)["']/);
    if (!hrefM) continue;
    const slugM = hrefM[1].match(/\/cn\/([A-Za-z0-9][^"'?#]*)/);
    if (!slugM) continue;
    const href = '/cn/' + slugM[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const imgM = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    const altM = inner.match(/<img[^>]+alt=["']([^"']*)["']/i);
    const durM = inner.match(/ms2-duration[^>]*>([^<]+)</);
    const title = clean(altM ? altM[1] : '');
    const h3M = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const name = title || (h3M ? clean(h3M[1]) : '') || '精彩视频';
    out.push({ vod_id: href, vod_name: name, vod_pic: imgM ? imgM[1].trim() : '', vod_remarks: durM ? durM[1].trim() : '' });
  }
  return out;
}

function catPath(v) {
  return '/cn/' + String(v || '').replace(/^\/+/, '');
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
  const slug = (String(durl || '').match(/\/cn\/([^/?#]+)/) || [])[1] || '';
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
  const classes = [{ type_id: 'home', type_name: '首页推荐' }];
  for (const c of CLASSES) classes.push({ type_id: c.v, type_name: c.n });
  let list = [];
  try { list = parseCards(await getHtml('/cn')); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (tid === 'home' || !tid) {
    return { page: 1, pagecount: 1, list: parseCards(await getHtml('/cn')) };
  }
  const path = catPath(tid);
  const url = page === 1 ? path : (path + '?page=' + page);
  const html = await getHtml(url);
  const list = parseCards(html);
  const next = page < 50 && list.length > 0 && html.includes('?page=' + (page + 1));
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/cn/search?keyword=' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  const h1M = html.match(/<h1>([\s\S]*?)<\/h1>/i);
  const mainTitle = h1M ? clean(h1M[1]) : '';
  const tM = html.match(/<title>(.*?)<\/title>/i);
  const title = mainTitle || (tM ? clean(tM[1]).replace(/\s*-\s*日本AV高清在线播放\s*-\s*AV影社\s*$/i, '').trim() : '') || '精彩视频';
  subCacheName(durl, title);
  let playUrl = '';
  let posterPic = '';
  const iframeM = html.match(/<iframe[^>]+src=["'](https:\/\/playdaili\.com\/api\/public\/missav-player\/\d+)["']/i);
  if (iframeM) {
    const playerHtml = await getHtml(iframeM[1]);
    const cfgM = playerHtml.match(/id="missav-config">(\{[\s\S]*?\})<\/script>/);
    if (cfgM) {
      try {
        const cfg = JSON.parse(cfgM[1]);
        if (cfg.source && String(cfg.source).startsWith('https://')) playUrl = String(cfg.source);
        if (cfg.poster) posterPic = String(cfg.poster);
      } catch (e) { /* ignore */ }
    }
    if (!playUrl) {
      const srcM = playerHtml.match(/"source"\s*:\s*"([^"]+)"/);
      if (srcM) playUrl = srcM[1];
    }
  }
  if (!posterPic) {
    const slug = rawId.split('/').filter(Boolean).pop() || '';
    if (slug) posterPic = 'https://webp.cdnimg261015.com/video-covers/missav/' + slug + '.jpg';
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: title,
      vod_pic: posterPic,
      vod_remarks: 'HD',
      vod_content: title,
      vod_play_from: 'AV影社',
      vod_play_url: playUrl ? ('正片$' + durl + '@@' + playUrl) : '',
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
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/cn' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_0817hyjx', name: '0817hyjx', type: 3 },
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
