// NJAV (www.njav.com) -> CatPawOpen spider
// 站点形态（2026-11-16 亲自用 curl + iPhone UA 实测，全部 200）：内容在 /en/ 路径下
// （无 /en/ 的归档 404）。列表卡 box-item（xvideos/<slug>、javcdn 缩略图、detail 真标题
// ＋ duration 时长），上游每页 12 条、?page=N 翻页，站方称 53 万部。两个站方怪癖
// （2026-11-16 实测）：① 厂牌/题材页末尾斜杠即 404（/en/tags/SIRO 200，/en/tags/SIRO/
// 404），翻页直接 ?page=N；② 搜索区分大小写，大写番号回无关结果（q=MEYD-385 回 12 部
// 无关片，q=meyd-385 精确回 1 部），蜘蛛统一把关键词转小写再查。封面两档：
// resize/ 330px 与 images/ 800px，本蜘蛛用 images/ 大图（/resize/ 换 /images/）。
// 播放链：详情 /en/xvideos/<slug> → 点播页 /vv/<slug> 里 clink() 的 /jm/<base64>
// → 302 upload18.org 播放页 window.PLAYER_CONFIG 的 m3u8 字段＝helvid.com 签名 HLS
// （约 2 小时过期，蜘蛛现铸现用、内存钉存 100 分钟），alternate720 多数片为空。
// 取数头：iPhone UA；取 master 时不要 Referer；桌面 UA 一律 403；helvid 按签名里
// 的设备类别 d=apple 验 UA 类别，铸播必须同类别同出口。
// 分辨率（实测 4 部片，档位按片不同，绝不编造）：master 是多变体 master，1080p+720p+480p、
// 1080p+720p+480p+360p、720p 单档、720p 单档。变体行格式：
// #EXT-X-STREAM-INF:...RESOLUTION=1920x1080,NAME="1080p"，下一行即变体地址（原样用，
// 不要重拼）。变体播单 200、1,765 个分片、首分片 Range 206、首字节 TS 魔数 0x47（已验）。
// 详情时铸造并解析变体、一档一线（高到低）；play() 接到 njav:<slug>@@<档位> 时重新铸造
// （保证新鲜）、重新解析变体、按档位取变体地址。详情铸造失败时仍留一条 lazy“正片”线，
// play 时再铸一次（master 约 2 小时过期，点播时重铸才稳）；铸造两次都失败才回 parse:1
// 嗅探详情页（绝不回 parse:0 + 空 url，那是无限转圈）。
// 字幕：片名带番号才接芯（subExtractCode 能抠出号才登记＋预热），不带不接；只按登记标题
// 取番号，绝不从播放地址域名里抠番号；绝不调 playFinish（芯里未定义）。
import req from '../../util/req.js';

const KEY = 'py_njav';
const NAME = 'NJAV';
const HOST = 'https://www.njav.com';
const EN = HOST + '/en';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PLAY_HEADERS = { 'User-Agent': UA }; // 播放头不要 Referer（helvid apple 类配方）

// 顶级分类 10 个：最新更新、新片发布、8 个栏目（/en/<cat>/ 下全部，实测 200）。
const CLASSES = [
  { type_id: 'latest', type_name: '最新更新', path: '/recent-update/' },
  { type_id: 'release', type_name: '新片发布', path: '/new-release/' },
  { type_id: 'censored', type_name: '有码', path: '/censored/' },
  { type_id: 'uncensored', type_name: '无码', path: '/uncensored/' },
  { type_id: 'uncensored-leaked', type_name: '无码流出', path: '/uncensored-leaked/' },
  { type_id: 'amateur', type_name: '素人', path: '/amateur/' },
  { type_id: 'chinese-av', type_name: '国产AV', path: '/chinese-av/' },
  { type_id: 'chinese-live', type_name: '国产直播', path: '/chinese-live/' },
  { type_id: 'korean-live', type_name: '韩国直播', path: '/korean-live/' },
  { type_id: 'english-subtitle', type_name: '英文字幕', path: '/english-subtitle/' },
];

// 厂牌 18 个（首页导航实测，与 REX 模块一致；值即站内 tag 名，建 URL 时 encode）。
const TAGS = ['SIRO', 'LUXU', '200GANA', 'FC2', 'HEYZO', 'CARIBBEANCOM', '10MUSUME', 'PACOPACOMAMA', 'S-CUTE', 'PRESTIGE PREMIUM', 'ARA', 'ACZD', 'NNPJ', 'MRHP', 'DOCP', 'C0930', 'H0930', 'H4610'];
// 题材 23 个（REX 模块枚举，详情页 genre 链接实测在站；值即站内 genre 名，建 URL 时 encode）。
const GENRES = [
  { n: '中出', v: 'Creampie' }, { n: '美少女', v: 'Beautiful Girl' }, { n: '痴女', v: 'Slut' },
  { n: '口交', v: 'Blowjob' }, { n: '主观视角', v: 'POV' }, { n: '单体', v: 'Solowork' },
  { n: '人妻', v: 'Married Woman' }, { n: '主妇', v: 'Housewife' }, { n: 'NTR', v: 'Ntr' },
  { n: '剧情', v: 'Drama' }, { n: '不伦', v: 'Affair' }, { n: '出轨妻', v: 'Cheating Wife' },
  { n: '近亲', v: 'Incest' }, { n: '巨乳', v: 'Large Breasts' }, { n: '贫乳', v: 'Small Breasts' },
  { n: '学生', v: 'School Girls' }, { n: '义姐妹', v: 'Step Sister' }, { n: '乳交', v: 'Tits Fuck' },
  { n: '自慰', v: 'Masturbation' }, { n: '野外', v: 'Public Sex' }, { n: '无码', v: 'Uncensored' },
  { n: '高清', v: 'Hi-Def' }, { n: '长片4H+', v: 'Over 4 Hours' },
];

const PAGE_SIZE = 12;

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function bigCover(u) {
  return String(u || '').replace('/resize/', '/images/');
}

function unescapeCfg(s) {
  return String(s || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');
}

// 取页：responseType:'text' + transformResponse 恒等（rdd22 教训：JSON 回包会被 axios
// 解析成对象）；3 次重试；App 内无全局 fetch，fetch 分支只在有 fetch 的环境生效。
async function getHtml(url, referer) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': referer || HOST + '/',
  };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req.get(url, { headers, timeout: 20000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true });
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return '';
}

// 取 master：只带 iPhone UA，不要 Referer（2026-11-16 实测：无 Referer 200；
// 桌面 UA 一律 403；helvid 按签名 d=apple 验 UA 类别）。
async function getMaster(url) {
  const headers = { 'User-Agent': UA };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req.get(url, { headers, timeout: 20000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true });
      if (r && r.status === 200 && r.data) return String(r.data);
    } catch (e) {}
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers });
        if (r && r.ok) return await r.text();
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return '';
}

// 列表解析：box-item 卡；href="xvideos/<slug>" 在缩略图与标题两处各出现一次，按 slug 去重。
function parseCards(html) {
  const items = [];
  if (!html) return items;
  const seen = new Set();
  const parts = String(html).split('box-item');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 2500);
    const hrefM = /href="xvideos\/([a-z0-9][a-z0-9-]*)"/.exec(chunk);
    if (!hrefM) continue;
    const slug = hrefM[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const imgM = /data-src="([^"]+)"/.exec(chunk) || /<img[^>]+src="(https:\/\/static\.javcdn[^"]+)"/.exec(chunk);
    const cover = imgM ? bigCover(imgM[1]) : ('https://static.javcdn.vip/images/' + slug + '/thumb_h.webp');
    const nameM = /<div class="detail">\s*<a[^>]*>([^<]+)<\/a>/.exec(chunk) || /<div class="name">([^<]+)<\/div>/.exec(chunk);
    const title = nameM ? decodeHtml(nameM[1]).trim() : slug.toUpperCase();
    const durM = /<div class="duration">([^<]+)<\/div>/.exec(chunk) || /<i class="ribbon">([^<]+)<\/i>/.exec(chunk);
    const dur = durM ? durM[1].trim() : '';
    items.push({
      vod_id: 'njav:' + slug,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: dur,
    });
  }
  return items;
}

// 变体解析：NAME="1080p" 优先，缺失时按 RESOLUTION 就近映射标准档；高到低排序、按档去重。
function parseMaster(text) {
  const out = [];
  const seen = new Set();
  const STD = [240, 360, 480, 720, 1080, 1440, 2160];
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const inf = /#EXT-X-STREAM-INF:([^\n]*)/.exec(lines[i]);
    if (!inf) continue;
    let j = i + 1, uri = '';
    while (j < lines.length) {
      const s = t(lines[j]);
      if (s && s.charAt(0) !== '#') { uri = s; break; }
      j++;
    }
    if (!uri) continue;
    let label = '';
    const nm = /NAME="([^"]+)"/.exec(inf[1]);
    if (nm && /^\d+p$/i.test(nm[1])) label = nm[1].toLowerCase();
    if (!label) {
      const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
      if (rm) {
        const mn = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10));
        let best = STD[0], bd = 1e9;
        for (const s of STD) { const d = Math.abs(s - mn); if (d < bd) { bd = d; best = s; } }
        label = best + 'p';
      }
    }
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, url: uri });
  }
  out.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  return out;
}

// 铸造：/vv/<slug> → /jm/<token>（自动跟随 302 到 upload18 播放页）
// → PLAYER_CONFIG 的 m3u8（helvid 签名 HLS）＋ alternate720。钉存 100 分钟。
const mintCache = new Map();
async function mint(slug) {
  const cached = mintCache.get(slug);
  if (cached && cached.exp > Date.now() + 60000) return cached;
  const detailUrl = EN + '/xvideos/' + slug;
  const vv = await getHtml(HOST + '/vv/' + slug, detailUrl);
  const jmM = /"(\/jm\/[A-Za-z0-9+/=]+)"/.exec(vv);
  if (!jmM) return null;
  const play = await getHtml(HOST + jmM[1], HOST + '/vv/' + slug);
  const mM = /"m3u8"\s*:\s*"([^"]+)"/.exec(play);
  if (!mM) return null;
  const aM = /"alternate720"\s*:\s*"([^"]*)"/.exec(play);
  const res = {
    u: unescapeCfg(mM[1]),
    alt: aM ? unescapeCfg(aM[1]) : '',
    exp: Date.now() + 100 * 60 * 1000,
  };
  if (!res.u) return null;
  mintCache.set(slug, res);
  if (mintCache.size > 200) mintCache.delete(mintCache.keys().next().value);
  return res;
}

// 现铸现解档位：{ tiers: [{label, url}], alt }；取不到 master 时 tiers 为空。
async function resolveTiers(slug) {
  const minted = await mint(slug);
  if (!minted) return { tiers: [], alt: '' };
  const masterText = await getMaster(minted.u);
  const tiers = parseMaster(masterText);
  return { tiers, alt: minted.alt || '' };
}

function parseSlug(raw) {
  const s = t(raw);
  if (!s) return '';
  const m = /^njav:([a-z0-9][a-z0-9-]*)/.exec(s);
  if (m) return m[1];
  const u = /\/xvideos\/([a-z0-9][a-z0-9-]*)/.exec(s);
  if (u) return u[1];
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return s;
  return '';
}

function listUrlFor(id, page, flt) {
  const tag = t(flt.tag || (flt.tag && flt.tag.value) || '');
  const genre = t(flt.genre || (flt.genre && flt.genre.value) || '');
  let base;
  let noSlash = false;
  if (tag) { base = EN + '/tags/' + encodeURIComponent(tag); noSlash = true; }
  else if (genre) { base = EN + '/genre/' + encodeURIComponent(genre); noSlash = true; }
  else {
    const c = CLASSES.find((x) => x.type_id === id) || CLASSES[0];
    base = EN + c.path.replace(/\/$/, '');
  }
  const p = Math.max(1, parseInt(page, 10) || 1);
  // 厂牌/题材页：末尾斜杠即 404（2026-11-16 实测：/en/tags/SIRO 200，/en/tags/SIRO/ 404）；
  // 翻页直接 ?page=N。栏目页带斜杠正常。
  if (noSlash) return p <= 1 ? base : base + '?page=' + p;
  return p <= 1 ? base + '/' : base + '/?page=' + p;
}

async function init() {
  return {};
}

async function home() {
  const cls = CLASSES.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  const groups = [
    { key: 'tag', name: '厂牌', value: TAGS.map((x) => ({ n: x, v: x })) },
    { key: 'genre', name: '题材', value: GENRES.map((g) => ({ n: g.n, v: g.v })) },
  ];
  for (const c of CLASSES) filters[c.type_id] = groups;
  return { class: cls, filters };
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const flt = body.filters || body.extend || {};
  const html = await getHtml(listUrlFor(id, page, flt));
  const list = parseCards(html);
  // 上游每页 12 条：满页说明可能还有下一页，短页即末页。
  const pagecount = list.length >= PAGE_SIZE ? page + 1 : page;
  return { page, pagecount, limit: PAGE_SIZE, total: list.length, list };
}

async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: 1, limit: PAGE_SIZE, total: 0, list: [] };
  // 搜索区分大小写：大写番号返回无关结果（2026-11-16 实测：q=MEYD-385 回 12 部无关片，
  // q=meyd-385 精确回 1 部）；统一转小写再查。
  let url = EN + '/search?q=' + encodeURIComponent(wd.toLowerCase());
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url);
  const list = parseCards(html);
  const pagecount = list.length >= PAGE_SIZE ? page + 1 : page;
  return { page, pagecount, limit: PAGE_SIZE, total: list.length, list };
}

async function detail(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const slug = parseSlug(raw);
  if (!slug) return { list: [] };
  const durl = EN + '/xvideos/' + slug;
  const html = await getHtml(durl);
  if (!html) return { list: [] };
  const h1M = /<h1>([^<]+)<\/h1>/.exec(html);
  const title = h1M ? decodeHtml(h1M[1]).trim() : slug.toUpperCase();
  const postM = /data-poster="([^"]+)"/.exec(html);
  const cover = postM ? bigCover(postM[1]) : ('https://static.javcdn.vip/images/' + slug + '/thumb_h.webp');
  const lenM = /data-len="([^"]+)"/.exec(html);
  const dur = lenM ? lenM[1] : '';
  const dateM = /"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(html);
  const genres = [];
  const gRe = /href="genre\/([^"]+)"/g;
  let gm;
  while ((gm = gRe.exec(html)) !== null) {
    const gn = decodeHtml(gm[1]);
    if (gn && genres.indexOf(gn) < 0) genres.push(gn);
  }
  const content = [dur, dateM ? dateM[1] : '', genres.length ? genres.join(' / ') : ''].filter(Boolean).join(' · ');
  // 播放线：现铸现解变体，一档一线（高到低）；单档片只有一段；alternate720 只在
  // 主 master 无变体时作 720P 备用线；铸造失败留 lazy“正片”线，play 时再铸一次。
  const eps = [];
  let tiers = [];
  try {
    const r = await resolveTiers(slug);
    tiers = r.tiers || [];
    if (tiers.length) {
      for (const v of tiers) eps.push(v.label + '$njav:' + slug + '@@' + v.label);
    } else if (r.alt) {
      eps.push('720P$njav:' + slug + '@@ALT');
    }
  } catch (e) {}
  if (!eps.length) eps.push('正片$njav:' + slug + '@@BEST');
  // 字幕：片名带番号才接（subExtractCode 能抠出号才登记＋预热），不带不接。
  if (subExtractCode(title)) {
    for (const e of eps) {
      const u = e.split('$').pop();
      if (u) subCacheName(u, title);
    }
    subCacheName(durl, title);
    subWarm(eps[0].split('$').pop());
  }
  return {
    list: [{
      vod_id: 'njav:' + slug,
      vod_name: title,
      vod_pic: cover,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const id = t(raw);
  if (!id) return { parse: 0, url: '' };
  // 防御：若 id 本身就是 helvid 地址，直接交播放器（不经过铸造）。
  if (/^https?:\/\/helvid\.com\//i.test(id)) {
    return { parse: 0, url: id, header: PLAY_HEADERS };
  }
  const m = /^njav:([a-z0-9][a-z0-9-]*)(?:@@(.+))?$/.exec(id);
  if (!m) return { parse: 0, url: '' };
  const slug = m[1];
  const want = (m[2] || 'BEST').toUpperCase();
  const durl = EN + '/xvideos/' + slug;
  // 铸造失败先重试一次（清缓存重铸），仍失败回 parse:1 嗅探详情页。
  let resolved = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) mintCache.delete(slug);
      resolved = await resolveTiers(slug);
      if (resolved && (resolved.tiers.length || resolved.alt)) break;
    } catch (e) {}
    resolved = null;
  }
  if (!resolved || (!resolved.tiers.length && !resolved.alt)) {
    return { parse: 1, url: durl };
  }
  let url = '';
  if (want === 'ALT') {
    url = resolved.alt || (resolved.tiers.length ? resolved.tiers[0].url : '');
  } else if (want === 'BEST') {
    url = resolved.tiers.length ? resolved.tiers[0].url : resolved.alt;
  } else {
    const hit = resolved.tiers.find((v) => v.label.toUpperCase() === want);
    url = hit ? hit.url : (resolved.tiers.length ? resolved.tiers[0].url : resolved.alt);
  }
  if (!url) return { parse: 1, url: durl };
  // 字幕：只在 detail 登记过（即片名带番号）的地址上查；无登记不带 subs 键。
  const subs = subNameCache.has(id) ? await subSearchAll(id).catch(() => []) : [];
  const result = { parse: 0, url, header: PLAY_HEADERS };
  if (subs && subs.length) result.subs = subs;
  return result;
}


// ---------- 字幕聚合 companion helpers（core 本身不含） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
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
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
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
  // 尾码优先：文件名尾码（如 -en.srt / .zh-cn.ass）才是真语言，文件名里的“简体中文”
  // 常只是原字幕名（SubtitleCat 语言误标真 bug，2026-11-07 修成尾码优先）。
  // 尾码无匹配时再看名称/语言字段关键词。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans' || c === 'sc') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hk' || c === 'hant' || c === 'tc') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (c === 'ko' || c === 'kor') return { tag: '韩文', rank: 5 };
  }
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
