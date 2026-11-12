// AnySex (https://anysex.com) -> CatPawOpen spider
// KVS 站。探查 2026-11-13（VM）：列表 24 条/页（搜索 50 条/页），p1/p2
// 零重叠；分类 79 个真实分类（/videos/categories/ 单页全量，带计数）；
// /videos/best/ 是按月归档页（/best/2/ 404），不作顶级分类。
// 播放：详情页 <source> 直给三至四档 mp4（720p/480p/240p，部分新片另有 1080p，H.264，实测 206）。
// 注意：播放地址必须带详情页会话 cookie，无 cookie 时新鲜 token 立刻 410，
// 故 detail 把 Set-Cookie 按播放地址登记，play() 带上 Cookie + Referer。
// 字幕：不接（欧美站无番号）。
import req from '../../util/req.js';

const KEY = 'py_anysex';
const NAME = 'AnySex';
const HOST = 'https://anysex.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const SEARCH_SIZE = 50;

// 播放鉴权缓存：播放地址 -> {cookie, referer}（detail 登记，play 取用）。
// 与字幕芯的 subNameCache 同款模块级缓存，同一 App 会话内 detail->play
// 先后调用即命中；上限 200 条防膨胀。
const playAuthCache = new Map();

function cacheAuth(url, cookie, referer) {
  if (!url || !cookie) return;
  playAuthCache.set(url, { cookie, referer });
  if (playAuthCache.size > 200) playAuthCache.delete(playAuthCache.keys().next().value);
}

const CLASSES = [
  { type_id: 'new', type_name: '最新' },
  { type_id: 'popular', type_name: '最热' },
  { type_id: 'categories', type_name: '全部类别' },
];

// 79 个真实分类：/videos/categories/ 单页全量抓取（2026-11-13），站方原文名，不编造。
const SUBS = [{"n":"Step Family","v":"step-family"},{"n":"Mom","v":"mom"},{"n":"Old+Young (18-25)","v":"old-young"},{"n":"Homemade","v":"homemade"},{"n":"Hot Teen 18+","v":"teen"},{"n":"Black porn","v":"black-porn"},{"n":"Granny","v":"granny"},{"n":"Compilation","v":"compilation"},{"n":"Amateur","v":"amateur"},{"n":"Anal","v":"anal"},{"n":"Vintage","v":"vintage"},{"n":"Lesbian","v":"lesbian"},{"n":"Cheating","v":"cheating"},{"n":"Milf","v":"milf"},{"n":"Big Dick","v":"big-dick"},{"n":"Cum in mouth","v":"cum-in-mouth"},{"n":"Celebrities","v":"celebrities"},{"n":"Housewife","v":"housewive"},{"n":"Threesome","v":"threesome"},{"n":"Mature","v":"mature"},{"n":"Close-up","v":"close-up"},{"n":"Cuckold","v":"cuckold"},{"n":"Reality","v":"reality"},{"n":"AI Generated","v":"ai"},{"n":"Japanese","v":"japanese"},{"n":"Cream Pie","v":"cream-pie"},{"n":"Masturbation","v":"masturbation"},{"n":"BBW","v":"bbw"},{"n":"Hentai","v":"hentai"},{"n":"Bisexual","v":"bisexual"},{"n":"Beauty","v":"beauty"},{"n":"Orgasm","v":"orgasm"},{"n":"Hairy","v":"hairy"},{"n":"Upskirt","v":"upskirt"},{"n":"Gangbang","v":"gangbang"},{"n":"Latina","v":"latina"},{"n":"Interracial","v":"interracial"},{"n":"BDSM","v":"bdsm"},{"n":"Erotic","v":"erotic"},{"n":"Swingers","v":"swingers"},{"n":"Teacher","v":"teacher"},{"n":"Hardcore","v":"hardcore"},{"n":"Massage","v":"massage"},{"n":"Big Tits","v":"big-tits"},{"n":"POV","v":"pov"},{"n":"Sex Toys","v":"sex-toys"},{"n":"Thick Ass","v":"ass"},{"n":"Indian","v":"indian"},{"n":"Femdom","v":"femdom"},{"n":"College","v":"college"},{"n":"Squirting","v":"squirting"},{"n":"Ebony","v":"ebony"},{"n":"Double Penetration","v":"dp"},{"n":"Public","v":"public"},{"n":"Handjob","v":"handjob"},{"n":"Party","v":"party"},{"n":"Small Tits","v":"small-tits"},{"n":"Cumshot","v":"cumshot"},{"n":"Lingerie","v":"lingerie"},{"n":"Arab","v":"arab"},{"n":"Orgy","v":"orgy"},{"n":"Russian Girl","v":"russian"},{"n":"Asian","v":"asian"},{"n":"Blowjob","v":"blowjob"},{"n":"Webcam","v":"webcam"},{"n":"Beach","v":"beach"},{"n":"Uniform","v":"uniform"},{"n":"Fisting","v":"fisting"},{"n":"Doggystyle","v":"doggystyle"},{"n":"Office","v":"office"},{"n":"Brazilian","v":"brazilian"},{"n":"Outdoor","v":"outdoor"},{"n":"British 🇬🇧","v":"british"},{"n":"Stockings","v":"stockings"},{"n":"German","v":"german"},{"n":"French","v":"french"},{"n":"Pantyhose","v":"pantyhose"},{"n":"Italian","v":"italian"},{"n":"Footjob","v":"footjob"}];
const FILTERS = {
  categories: [{ key: 'sub', name: '类别', value: SUBS }],
};

function effCat(tid, sub) {
  if (tid === 'categories') {
    if (sub && SUBS.some((s) => s.v === sub)) return sub;
    return SUBS[0].v;
  }
  return tid;
}

function listUrl(eff, page) {
  let base;
  if (eff === 'new') base = HOST + '/videos/new/';
  else if (eff === 'popular') base = HOST + '/videos/most-viewed/';
  else base = HOST + '/videos/categories/' + eff + '/';
  return page > 1 ? base + page + '/' : base;
}

function searchUrl(wd, page) {
  const q = 'q=' + encodeURIComponent(wd);
  return page > 1 ? HOST + '/search/' + page + '/?' + q : HOST + '/search/?' + q;
}

// 列表：每条一个 <div class="item" data-video-id>；详情链接在
// a.popfire 上，标题取 img alt（无 alt 时取 strong.title），封面取
// img src，清晰度在 .is-hd、时长在 .duration。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]+href="(https:\/\/anysex\.com\/video\/\d+\/[^"]+\/)"[^>]*class="popfire"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const tail = html.slice(m.index, m.index + 1800);
    let title = '';
    let pic = '';
    const im = tail.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*alt="([^"]*)"/i)
      || tail.match(/<img[^>]+alt="([^"]*)"[^>]*src="(https?:\/\/[^"]+)"/i);
    if (im) {
      if (/^https?:\/\//i.test(im[1])) { pic = im[1]; title = im[2]; }
      else { title = im[1]; pic = im[2]; }
    }
    if (!title) {
      const tm = tail.match(/<strong class="title">\s*([\s\S]*?)\s*<\/strong>/i);
      if (tm) title = tm[1];
    }
    title = decodeHtml(title);
    const qm = tail.match(/class="is-hd[^"]*">\s*([^<]+?)\s*<\/span>/i);
    const dm = tail.match(/class="duration">\s*([^<]+?)\s*<\/div>/i);
    const remarks = [qm ? t(qm[1]) : '', dm ? t(dm[1]) : ''].filter(Boolean).join(' ');
    out.push({ vod_id: href, vod_name: title || href, vod_pic: pic, vod_remarks: remarks });
  }
  return out;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let url = t(raw);
  if (!url) return { list: [] };
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const pg = await getPage(url);
  const html = pg.html;
  if (!html) return { list: [] };
  let name = '';
  const og = html.match(/property="og:title"[^>]*content="([^"]+)"/i)
    || html.match(/content="([^"]+)"[^>]*property="og:title"/i)
    || html.match(/property='og:title'[^>]*content='([^']+)'/i);
  if (og) name = decodeHtml(og[1]);
  if (!name) {
    const hm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (hm) name = decodeHtml(hm[1].replace(/<[^>]*>/g, ' '));
  }
  let pic = '';
  const pm = html.match(/property="og:image"[^>]*content="([^"]+)"/i)
    || html.match(/content="([^"]+)"[^>]*property="og:image"/i)
    || html.match(/property='og:image'[^>]*content='([^']+)'/i);
  if (pm) pic = absUrl(pm[1]);
  // 播放：<video id="main_video"> 内 <source src title="<档>p">，有几档出几档。
  const tiers = [];
  const seen = new Set();
  const re = /<source[^>]+src="([^"]+\.mp4[^"]*)"[^>]*title="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = t(m[2]);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    tiers.push({ label, url: m[1].replace(/&amp;/g, '&') });
  }
  tiers.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  // 登记会话 cookie：无 cookie 时播放地址立刻 410，play() 须带上。
  const ck = cookieHeader(pg.cookies);
  for (const q of tiers) cacheAuth(q.url, ck, url);
  const playUrl = tiers.map((q) => q.label + '$' + q.url).join('#');
  return {
    list: [{
      vod_id: url,
      vod_name: name || url,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

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

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer || HOST + '/',
  };
}

// 取页：强制拿原始文本（axios 在站方回 JSON 时会自动解析成对象，
// String(data) 得 "[object Object]"；responseType:'text' + 恒等
// transformResponse 可防住）。同时回 set-cookie（anysex 的播放地址
// 必须带详情页会话 cookie 才能取到 200，无 cookie 一律 410）。
async function getPage(url, referer) {
  try {
    const r = await req.get(url, { headers: headers(referer), timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    let cookies = [];
    if (r && r.headers) {
      const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
      if (Array.isArray(sc)) cookies = sc;
      else if (typeof r.headers.getSetCookie === 'function') {
        try { cookies = r.headers.getSetCookie(); } catch (e) { /* 忽略 */ }
      }
    }
    return { html, cookies };
  } catch (e) {
    return { html: '', cookies: [] };
  }
}

async function getHtml(url, referer) {
  const p = await getPage(url, referer);
  return p.html;
}

function cookieHeader(cookies) {
  return (cookies || []).map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
}

// 页数：优先取分页块里的最大页码（KVS 分页含末页链接，4kporno/anysex
// 有 class="last" 末页、yesporn 窗口内含末页码）；取不到时按本页自证：
// 短页即末页、满页报 page+1（总数整除页容时会多报一页，App 要一次
// 空页即收尾，与 javass/丝瓜同款）。
function pagecountFromHtml(html, page, list, pageSize) {
  let max = 0;
  const pi = html.indexOf('pagination');
  if (pi >= 0) {
    const blk = html.slice(pi, pi + 6000);
    const end = blk.indexOf('</ul>');
    const seg = end >= 0 ? blk.slice(0, end) : blk;
    const re = /<a[^>]*>\s*(\d+)\s*<\/a>/g;
    let m;
    while ((m = re.exec(seg))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
    // 末页链接的文本常是 Last/»，页码只在 href 里（/…/<N>/），一并取最大值。
    const re2 = /href="[^"]*\/(\d+)\/"/g;
    while ((m = re2.exec(seg))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  if (max >= page) return max;
  return list.length < pageSize ? page : page + 1;
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: FILTERS };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const tid = String(body.id || body.tid || CLASSES[0].type_id);
  const extend = body.filters || body.extend || {};
  const eff = effCat(tid, String(extend.sub || ''));
  const html = await getHtml(listUrl(eff, page));
  const list = parseList(html);
  return { page, pagecount: pagecountFromHtml(html, page, list, PAGE_SIZE), list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const html = await getHtml(searchUrl(wd, page));
  const list = parseList(html);
  return { page, pagecount: pagecountFromHtml(html, page, list, SEARCH_SIZE), list };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const m = id.match(/\$?(https?:\/\/[^\s$#]+)/);
  const url = m ? m[1] : (/^https?:\/\//i.test(id) ? id : '');
  if (!url) return { parse: 0, url: '' };
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const hit = playAuthCache.get(url);
  if (hit) {
    if (hit.referer) result.header.Referer = hit.referer;
    if (hit.cookie) result.header.Cookie = hit.cookie;
  }
  return result;
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

