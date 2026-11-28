// 白虎逼 — baihubi.com（白虎/無修正 JAV）
// 结构：自定义站。列表 .card.h-100（封面 /data/{CODE}/cover.jpg、标题 h3.card-title、
// 链接 /{id}-1-1.html）；详情页 QUALITY_SOURCE 数组给直链 mp4（R2 预签名，3000 秒有效，
// 详情现取现用）；排序靠 Cookie sort=id/hits/faves；分页 /page-N.html；
// 搜索 /search/<词>/。标签云 /category_list 有 1815 个标签，取前 40 热门作筛选卡片
// （含 無修正/流出/モザイク崩壊/モザイク無し 四个 LTX 相关标签）。
// 播放：每档 QUALITY_SOURCE 出一集（通常只有 Low_Quality 一档，绝不编造）；
// 有番号（HEYZO/FC2-PPV 等）接字幕芯。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_baihubi';
const NAME = '白虎逼';
const HOST = 'https://baihubi.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 顶级分类：3 个排序 + FC2 Daily + 推荐 + 标签（筛选卡片）
const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'hottest', type_name: '最热' },
  { type_id: 'faves', type_name: '最多收藏' },
  { type_id: 'fc2daily', type_name: 'FC2 Daily' },
  { type_id: 'recommend', type_name: '推荐' },
  { type_id: 'tags', type_name: '标签' },
];

// 前 40 热门标签（2026-11-28 /category_list 实测，按片数排；
// 無修正/流出/モザイク崩壊/モザイク無し 为 LTX 相关，必须保留）
const TOP_TAGS = [
  ['中出し', '%e4%b8%ad%e5%87%ba%e3%81%97'],
  ['素人', '%e7%b4%a0%e4%ba%ba'],
  ['個人撮影', '%e5%80%8b%e4%ba%ba%e6%92%ae%e5%bd%b1'],
  ['ハメ撮り', '%e3%83%8f%e3%83%a1%e6%92%ae%e3%82%8a'],
  ['無修正', '%e7%84%a1%e4%bf%ae%e6%ad%a3'],
  ['パイパン', '%e3%83%91%e3%82%a4%e3%83%91%e3%83%b3'],
  ['フェラ', '%e3%83%95%e3%82%a7%e3%83%a9'],
  ['美乳', '%e7%be%8e%e4%b9%b3'],
  ['巨乳', '%e5%b7%a8%e4%b9%b3'],
  ['オリジナル', '%e3%82%aa%e3%83%aa%e3%82%b8%e3%83%8a%e3%83%ab'],
  ['スレンダー', '%e3%82%b9%e3%83%ac%e3%83%b3%e3%83%80%e3%83%bc'],
  ['美尻', '%e7%be%8e%e5%b0%bb'],
  ['可愛い', '%e5%8f%af%e6%84%9b%e3%81%84'],
  ['美女', '%e7%be%8e%e5%a5%b3'],
  ['色白', '%e8%89%b2%e7%99%bd'],
  ['コスプレ', '%e3%82%b3%e3%82%b9%e3%83%97%e3%83%ac'],
  ['クンニ', '%e3%82%af%e3%83%b3%e3%83%8b'],
  ['生ハメ', '%e7%94%9f%e3%83%8f%e3%83%a1'],
  ['美人', '%e7%be%8e%e4%ba%ba'],
  ['高画質', '%e9%ab%98%e7%94%bb%e8%b3%aa'],
  ['カリビアンコム', '%E3%82%AB%E3%83%AA%E3%83%93%E3%82%A2%E3%83%B3%E3%82%B3%E3%83%A0'],
  ['美脚', '%e7%be%8e%e8%84%9a'],
  ['制服', '%e3%82%bb%e3%83%95%e3%82%8a'],
  ['G-Queen', 'G-Queen'],
  ['個撮', '%e5%80%8b%e6%92%ae'],
  ['潮吹き', '%e6%bd%ae%e5%90%b9%e3%81%8d'],
  ['オナニー', '%e3%82%aa%e3%83%8a%e3%83%8b%e3%83%bc'],
  ['手コキ', '%e3%89%8b%e3%82%b3%e3%82%ad'],
  ['人妻', '%e4%ba%ba%e5%a6%bb'],
  ['騎乗位', '%e9%a8%8e%e4%b9%97%e4%bd%8d'],
  ['ロリ', '%e3%83%ad%e3%83%aa'],
  ['顔出し', '%e9%a1%94%e5%87%ba%e3%81%97'],
  ['パイズリ', '%e3%83%91%e3%82%a4%e3%82%ba%e3%83%aa'],
  ['一本道', '%E4%B8%80%E6%9C%AC%E9%81%93'],
  ['HEYZO', 'HEYZO'],
  ['乱交', '%e4%b9%b1%e4%ba%a4'],
  ['NTR', 'NTR'],
  ['流出', '%e6%b5%81%e5%87%ba'],
  ['モザイク崩壊', '%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af%e5%b4%a9%e5%a3%8a'],
  ['モザイク無し', '%e3%83%a2%e3%82%b6%e3%82%a4%e3%82%af%e7%84%a1%e3%81%97'],
];

const FILTERS = {
  tags: [
    { key: 'tag', name: '标签', value: TOP_TAGS.map(([n, v]) => ({ n, v })) },
  ],
};

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const b = base || HOST;
  return b + (u.startsWith('/') ? u : '/' + u);
}

async function getText(url, extraHeaders) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...(extraHeaders || {}) },
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    if (r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 列表：.card.h-100（标题 h3.card-title、封面 img.card-img-top、链接 /{id}-1-1.html）。
// gallery 视频块（.thumb-block.gallery-video-block）无标题，不采。
function parseCards(html) {
  const cards = [];
  if (!html) return cards;
  const $ = cheerio.load(html);
  $('.card.h-100').each((_, e) => {
    const el = $(e);
    const a = el.find('a[href*="-1-1.html"]').first();
    const href = a.attr('href') || '';
    const title = cleanText(el.find('h3.card-title').text());
    if (!href || !title) return;
    const img = el.find('img.card-img-top').first();
    const cover = absUrl(img.attr('data-src') || img.attr('src') || '');
    const actress = cleanText(el.find('a[href^="/actress/"]').first().text());
    const series = cleanText(el.find('a[href^="/series/"]').first().text());
    const remarks = [series, actress].filter(Boolean).join(' ');
    cards.push({
      vod_id: absUrl(href),
      vod_name: title,
      vod_pic: cover,
      vod_remarks: remarks,
    });
  });
  return cards;
}

function parsePagecount(html, curPage) {
  let max = curPage;
  if (html) {
    const re = /page_go\((\d+)\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// 详情页 QUALITY_SOURCE 数组：{tier,line,hq,cn,url}，url 为 R2 预签名直链 mp4。
function extractQuality(html) {
  const out = [];
  const m = String(html || '').match(/QUALITY_SOURCE=\[(.*?)\];/s);
  if (!m) return out;
  const re = /\{\s*tier\s*:\s*"([^"]+)"[^}]*?url\s*:\s*"([^"]+)"/g;
  let mm;
  const seen = new Set();
  while ((mm = re.exec(m[1])) !== null) {
    const tier = mm[1];
    const url = mm[2];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ tier, url });
  }
  return out;
}

function tierLabel(tier) {
  const t = String(tier || '');
  if (/^low/i.test(t)) return '低清';
  if (/^high/i.test(t)) return '高清';
  if (/^original/i.test(t)) return '原画';
  if (/^medium/i.test(t)) return '标清';
  return t.replace(/_/g, ' ') || '正片';
}

// 从封面/mp4 地址里取番号（如 /data/Heyzo-0500/cover.jpg、/data2/FC2-PPV-4719212/1.mp4）
function codeOf(text) {
  const m = String(text || '').match(/\/data2?\/([A-Za-z0-9][A-Za-z0-9\-_]*)\//);
  return m ? m[1] : '';
}

async function init() {
  return {};
}

async function home() {
  const html = await getText(HOST + '/', { Cookie: 'sort=hits' });
  return { class: CLASSES, filters: FILTERS, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || 'hottest').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  let base = '/';
  let headers = {};
  if (id === 'latest') { base = '/'; headers = { Cookie: 'sort=id' }; }
  else if (id === 'hottest') { base = '/'; headers = { Cookie: 'sort=hits' }; }
  else if (id === 'faves') { base = '/'; headers = { Cookie: 'sort=faves' }; }
  else if (id === 'fc2daily') { base = '/fc2daily'; }
  else if (id === 'recommend') { base = '/recommend'; }
  else if (id === 'tags') {
    const tag = String(extend.tag || '').trim();
    if (!tag) return { page, pagecount: page, limit: 20, total: 0, list: [] };
    base = '/search/' + tag;
  } else {
    base = '/';
    headers = { Cookie: 'sort=hits' };
  }
  const b = base.replace(/\/+$/, '');
  const url = page > 1 ? HOST + b + '/page-' + page + '.html' : HOST + (b === '' ? '/' : b);
  const html = await getText(url, headers);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (!id) return { list: [] };
  const durl = absUrl(id);
  const html = await getText(durl);
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  let name = cleanText($('meta[property="og:title"]').attr('content'))
    || cleanText($('title').text()).replace(/\s*-\s*白虎逼.*$/i, '').trim();
  let pic = absUrl($('meta[property="og:image"]').attr('content'))
    || absUrl($('#playerCnt').attr('poster') || '');
  const qs = extractQuality(html);
  const code = codeOf(pic) || (qs[0] ? codeOf(qs[0].url) : '');
  if (code && name && name.toUpperCase().indexOf(code.toUpperCase()) < 0) {
    name = code + ' ' + name;
  }
  const eps = [];
  for (const q of qs) {
    if (!q.url) continue;
    eps.push(tierLabel(q.tier) + '$' + q.url);
  }
  const vod = {
    vod_id: durl,
    vod_name: name,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: eps.join('#'),
  };
  if (eps.length && subExtractCode(name)) {
    for (const e of eps) subCacheName(e.split('$').pop(), name);
    (async () => {
      for (const e of eps) {
        try { await subSearchAll(e.split('$').pop()); } catch (err) {}
      }
    })().catch(() => {});
  }
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  const url = id;
  const regTitle = subNameCache.get(url) || '';
  const subs = subExtractCode(regTitle) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
  const base = '/search/' + encodeURIComponent(wd);
  const url = page > 1 ? HOST + base + '/page-' + page + '.html' : HOST + base + '/';
  const html = await getText(url);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
}

// ---------- 共享字幕芯（与 av01/av123 等蜘蛛同款自包含块：
//   迅雷 > 迅雷看看 > SubtitleCat；只挂有番号条目；全局上限 10、单槽 8；
//   总预算 6s、失败静默；无结果不带 subs 键）----------
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
  const m = String(durl || '').match(/\/data2?\/([A-Za-z0-9][A-Za-z0-9\-_]*)\//);
  return m ? m[1].replace(/[-_]+/g, ' ') : '';
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

export default function spider() {
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
