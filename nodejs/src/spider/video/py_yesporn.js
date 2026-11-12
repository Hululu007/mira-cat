// YesPorn (https://yesporn.vip) -> CatPawOpen spider
// KVS 站。探查 2026-11-13（VM）：列表 20 条/页，p1/p2 零重叠；分类 58 个
// 真实分类（/categories/ 分 3 页：20+20+18，p4 404）；搜索翻页走
// ?from_videos=<页码>（/search/<q>/2/ 是 404）。
// 播放注意：详情页 flashvars 三档（480p/720p/1080p）VM 侧实测全部 404，
// 原因已坐实（2026-11-13 复验）：get_file 令牌绑定 kt_ips 里的出口 IP，
// 而 VM 出口 IPv6 每次连接都换（连抓三次 kt_ips 各不相同），详情与播放
// 永远不在同一 IP 上，故一律 404；同页截图 206、预览经 302 到 cdn3 可
// 200 播，站未死、未被墙。手机单 IP 应可播，须真机定性。字幕：不接。
import req from '../../util/req.js';

const KEY = 'py_yesporn';
const NAME = 'YesPorn';
const HOST = 'https://yesporn.vip';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;
const SEARCH_SIZE = 20;

// 与 anysex 同款：detail 登记详情页会话 cookie，play() 随地址带上
// （KVS get_file 常要会话 cookie；VM 侧 404 主因是 IP 绑定，cookie
// 救不了 VM，但手机单 IP 下缺 cookie 可能照样 410/404，故照 anysex 补齐）。
const playAuthCache = new Map();

function cacheAuth(url, cookie, referer) {
  if (!url || !cookie) return;
  playAuthCache.set(url, { cookie, referer });
  if (playAuthCache.size > 200) playAuthCache.delete(playAuthCache.keys().next().value);
}

const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'popular', type_name: '最热' },
  { type_id: 'top', type_name: '评分最高' },
  { type_id: 'categories', type_name: '全部类别' },
];

// 58 个真实分类：/categories/ 1-3 页全量抓取（2026-11-13），站方原文名，不编造。
const SUBS = [{"n":"GILF","v":"gilf"},{"n":"Doctor","v":"doctor"},{"n":"BBW","v":"bbw"},{"n":"Fetish","v":"fetish"},{"n":"Cheating","v":"cheating"},{"n":"Striptease","v":"striptease"},{"n":"Big Ass","v":"big-ass"},{"n":"Sex","v":"sex"},{"n":"Mature","v":"mature"},{"n":"MILF","v":"milf"},{"n":"Stepmom","v":"stepmom"},{"n":"Anal","v":"anal"},{"n":"Latina","v":"latina"},{"n":"Big Dick","v":"big-dick"},{"n":"Facial","v":"facial"},{"n":"Step Daughter","v":"step-daughter"},{"n":"Step sister","v":"step-sister"},{"n":"Uncategorized","v":"uncategorized"},{"n":"Big tits","v":"big-tits"},{"n":"Family","v":"family"},{"n":"Blowjob","v":"blowjob"},{"n":"Deep Throat","v":"deep-throat"},{"n":"Ebony","v":"ebony"},{"n":"Tattoo","v":"tattoo"},{"n":"Massage","v":"massage"},{"n":"Curvy","v":"curvy"},{"n":"Creampie","v":"creampie"},{"n":"Japanese","v":"japanese"},{"n":"shaved pussy","v":"shaved-pussy"},{"n":"Brunette","v":"brunette"},{"n":"Car","v":"car"},{"n":"Interracial","v":"interracial"},{"n":"Blonde","v":"blonde"},{"n":"Cuckold","v":"cuckold"},{"n":"Hardcore","v":"hardcore"},{"n":"Hairy Pussy","v":"hairy-pussy"},{"n":"Sex Toys","v":"sex-toys"},{"n":"POV","v":"pov"},{"n":"Voyeur","v":"voyeur"},{"n":"Threesome","v":"threesome"},{"n":"Skinny","v":"skinny"},{"n":"Orgasm","v":"orgasm"},{"n":"Asian","v":"asian"},{"n":"Big Boobs","v":"big-boobs"},{"n":"BBC","v":"bbc"},{"n":"Lingerie","v":"lingerie"},{"n":"Public","v":"public"},{"n":"DP","v":"dp"},{"n":"Outdoor","v":"outdoor"},{"n":"Cosplay","v":"cosplay"},{"n":"Small tits","v":"small-tits"},{"n":"Teen","v":"teen"},{"n":"Gangbang","v":"gangbang"},{"n":"Lesbians","v":"lesbian"},{"n":"Swingers","v":"swingers"},{"n":"BDSM","v":"bdsm"},{"n":"Feet","v":"feet"},{"n":"Orgy","v":"orgy"}];
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
  if (eff === 'latest') base = HOST + '/latest-updates/';
  else if (eff === 'popular') base = HOST + '/most-popular/';
  else if (eff === 'top') base = HOST + '/top-rated/';
  else base = HOST + '/categories/' + eff + '/';
  return page > 1 ? base + page + '/' : base;
}

function searchUrl(wd, page) {
  const base = HOST + '/search/' + encodeURIComponent(wd) + '/';
  return page > 1 ? base + '?from_videos=' + page : base;
}

// 列表：每条一个 <div class="thumb ... item">；详情链接与标题在锚点上，
// 封面取 img src（390x218），清晰度在 .qualtiy、时长在 .time。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]+href="(https:\/\/yesporn\.vip\/video\/\d+\/[^"]+\/)"[^>]*title="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const title = decodeHtml(m[2]);
    const tail = html.slice(m.index, m.index + 2000);
    let pic = '';
    const im = tail.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    if (im) pic = im[1];
    const qm = tail.match(/class="qualtiy">\s*([^<]+?)\s*<\/div>/i);
    const tm = tail.match(/class="time">\s*([^<]+?)\s*<\/div>/i);
    const remarks = [qm ? t(qm[1]) : '', tm ? t(tm[1]) : ''].filter(Boolean).join(' ');
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
  // 播放：flashvars 三档（video_url / video_alt_url / video_alt_url2），
  // 值带 function/0/ 前缀，剥掉后即播放地址；档位名取 *_text。有几档出几档。
  const tiers = [];
  const seen = new Set();
  const push = (u, label) => {
    u = t(u);
    label = t(label);
    if (!u || !label || seen.has(label)) return;
    seen.add(label);
    tiers.push({ label, url: u.replace(/&amp;/g, '&') });
  };
  const g = (re) => {
    const mm = html.match(re);
    return mm ? mm[1] : '';
  };
  push(g(/video_url:\s*'function\/0\/([^']+)'/), g(/video_url_text:\s*'([^']+)'/));
  push(g(/video_alt_url:\s*'function\/0\/([^']+)'/), g(/video_alt_url_text:\s*'([^']+)'/));
  push(g(/video_alt_url2:\s*'function\/0\/([^']+)'/), g(/video_alt_url2_text:\s*'([^']+)'/));
  tiers.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  // 登记会话 cookie：无 cookie 时播放地址可能 410/404，play() 须带上（同 anysex）。
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

