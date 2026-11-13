// YesPorn (https://yesporn.vip) -> CatPawOpen spider
// KVS 站。探查 2026-11-13（VM）：列表 20 条/页，p1/p2 零重叠；分类 58 个
// 真实分类（/categories/ 分 3 页：20+20+18，p4 404）；搜索翻页走
// ?from_videos=<页码>（/search/<q>/2/ 是 404）。
// 封面（2026-11-13 坐实）：列表前 4 条是 eager 图（img src 即真封面），
// 其余 16 条是懒加载（src 为 1x1 gif data URI，真封面在 data-original，
// 另有 data-webp）；旧代码只读 src，故 16/20 无封面——正对用户反馈
// “有的可以加载出封面、有的不能”。已改读 data-original 优先。
// 播放 v2（2026-11-13 坐实，走下载腿）：
// 令牌是 42 位 hex（不是 48 位）：前 32 位按文件恒定、后 10 位随出口 IP
// 变；详情页 flashvars 令牌取 /5/ 文件在 VM/Worker/真机三侧全灭
// （12 次循环 + 全部变体 + embed 腿 + Worker /diag 三档全 404），
// 与 UA/Range/Referer/Cookie/方法无关，详情腿判死。
// 下载页 view_video_download.php?id=<id>&format=<档位> 里现铸的令牌
// 取文件全通：76639 三档（480p 272MB / 720p 516MB / 1080p 985MB，
// 全片 206 + 真 ftyp）、16937 的 720p（206，296MB）；下载腿取文件
// 13 次全部 206。下载页不带 cookie/Referer 也能出链接（链接已在
// HTML 里，20 秒倒计时只是装饰）；文件请求必须带任一有效匿名会话
// cookie（无 cookie → 410）。集名携带视频 id + 档位，play() 点播时
// 现取下载页、现铸现播；无此档位时回退次档，绝不回空 url（空 url＝
// 无限转圈）。残留风险唯一一项：令牌疑似绑出口 IP（旧令牌+新 IP →
// 410，但时间亦变，未完全分离）——蜘蛛与播放器同在手机上、同出口、
// 相隔数秒，真机是最后一步。
// 字幕：不接。
import req from '../../util/req.js';

const KEY = 'py_yesporn';
const NAME = 'YesPorn';
const HOST = 'https://yesporn.vip';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;
const SEARCH_SIZE = 20;
const DL_TIMEOUT = 12000;
const DL_FALLBACK_TIMEOUT = 8000;

// 下载页的档位号（format 参数）：只认这三个；站内没有的档位不硬编。
const DL_FMTS = [1080, 720, 480];

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
    // 封面：懒加载图真地址在 data-original（data-webp 为次选），只有前几
    // 条 eager 图才有真 src；旧代码只读 src，16/20 的图是 1x1 gif data URI。
    const imgTag = tail.match(/<img[^>]*>/i);
    if (imgTag) {
      const tag = imgTag[0];
      const dm = tag.match(/data-original="(https?:\/\/[^"]+)"/i)
        || tag.match(/data-webp="(https?:\/\/[^"]+)"/i)
        || tag.match(/\ssrc="(https?:\/\/[^"]+)"/i);
      if (dm) pic = dm[1];
    }
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
  // 播放 v2：集名携带视频 id + 档位 + 详情页 URL（供 play() 现取下载页
  // 现铸令牌、失败时回退嗅探用）。档位只出 flashvars 里有的，有几档出
  // 几档；详情页的直链令牌已死，不再放进集名。
  const tiers = parseTiers(html);
  const vm = url.match(/\/video\/(\d+)\//);
  const vid = vm ? vm[1] : '';
  if (!vid || !tiers.length) return { list: [{ vod_id: url, vod_name: name || url, vod_pic: pic, vod_play_from: NAME, vod_play_url: '' }] };
  const playUrl = tiers.map((q) => q.label + '$yp:' + vid + '|' + q.label + '|' + url).join('#');
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

// flashvars 三档解析（只用于详情的档位清单）：video_url /
// video_alt_url / video_alt_url2，档位名取 *_text。返回按清晰度数字
// 从高到低排好的 [{label}]。直链本身已死，不再取 url。
function parseTiers(html) {
  const tiers = [];
  const seen = new Set();
  const push = (label) => {
    label = t(label);
    if (!label || seen.has(label)) return;
    seen.add(label);
    tiers.push({ label });
  };
  const g = (re) => {
    const mm = html.match(re);
    return mm ? mm[1] : '';
  };
  if (/video_url:\s*'function\/0\//.test(html)) push(g(/video_url_text:\s*'([^']+)'/));
  if (/video_alt_url:\s*'function\/0\//.test(html)) push(g(/video_alt_url_text:\s*'([^']+)'/));
  if (/video_alt_url2:\s*'function\/0\//.test(html)) push(g(/video_alt_url2_text:\s*'([^']+)'/));
  tiers.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  return tiers;
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
// transformResponse 可防住）。同时回 set-cookie（文件请求必须带任一
// 有效匿名会话 cookie，无 cookie → 410；下载页自己会 set-cookie）。
async function getPage(url, referer, timeout) {
  try {
    const r = await req.get(url, { headers: headers(referer), timeout: timeout || 20000, responseType: 'text', transformResponse: [(d) => d] });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    let cookies = [];
    if (r && r.headers) {
      const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
      if (Array.isArray(sc)) cookies = sc;
      else if (typeof sc === 'string' && sc) cookies = [sc];
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

// 从下载页 HTML 提取下载链接：接受任意类型号（/3/ 或 /5/，16937 的
// 720p 是 /3/）。链接可能带 ?download_filename=…&download=true，
// 有无均可，保留原样。每档下载页只含该档一条链接，优先按档位文件名
// 匹配（_720p/_1080p），否则取第一条。
function extractDlLink(html, wantFmt) {
  if (!html) return '';
  const links = [];
  const re = /href="([^"]*get_file[^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) links.push(m[1].replace(/&amp;/g, '&'));
  if (!links.length) {
    const re2 = /(https?:\/\/yesporn\.vip)?\/get_file\/\d\/[0-9a-f]{42}\/\d+\/\d+\/[\w.-]+\/?(\?[^"'\s<>]*)?/gi;
    while ((m = re2.exec(html))) links.push(m[0]);
  }
  if (!links.length) return '';
  const pick = (pred) => links.find((u) => pred(u));
  if (wantFmt === 720) return absUrl(pick((u) => /_720p\.mp4/i.test(u)) || links[0]);
  if (wantFmt === 1080) return absUrl(pick((u) => /_1080p\.mp4/i.test(u)) || links[0]);
  return absUrl(pick((u) => !/_720p\.mp4/i.test(u) && !/_1080p\.mp4/i.test(u)) || links[0]);
}

// 下载腿：取下载页现铸令牌。wantFmt 无链接时（站内无此档，如 16937
// 无 1080p）按档位递减回退到实际有的最高档；全部无链接返回 ''。
async function downloadLeg(vid, wantFmt, timeoutMs) {
  const order = DL_FMTS.filter((f) => f <= wantFmt);
  for (let i = 0; i < order.length; i++) {
    const fmt = order[i];
    const dlUrl = HOST + '/view_video_download.php?id=' + vid + '&format=' + fmt;
    try {
      const pg = await getPage(dlUrl, HOST + '/', i === 0 ? timeoutMs : DL_FALLBACK_TIMEOUT);
      const link = extractDlLink(pg.html, fmt);
      if (link) {
        return { url: link, fmt, dlUrl, cookie: cookieHeader(pg.cookies) };
      }
    } catch (e) { /* 下一档 */ }
  }
  return null;
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
  const raw = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const dollar = raw.indexOf('$');
  const rest = dollar >= 0 ? raw.slice(dollar + 1) : raw;
  const ym = rest.match(/^yp:(\d+)\|([^|]+)(?:\|(.+))?$/);
  // 旧版集名（v1 的详情令牌直链）已死，不再重铸：能从中抠出视频 id 与
  // 档位就走下载腿，抠不出则原样透传（快败不断圈）。
  let vid = '';
  let tierLabel = '';
  let detailUrl = '';
  if (ym) {
    vid = ym[1];
    tierLabel = ym[2];
    detailUrl = t(ym[3] || '');
  } else {
    const um = rest.match(/\/get_file\/\d+\/[0-9a-f]{42}\/\d+\/(\d+)\/([\w.-]+)/i);
    if (um) {
      vid = um[1];
      const fn = um[2];
      tierLabel = /_1080p/i.test(fn) ? '1080p' : (/_720p/i.test(fn) ? '720p' : '480p');
      detailUrl = HOST + '/video/' + vid + '/';
    }
  }
  if (!detailUrl && vid) detailUrl = HOST + '/video/' + vid + '/';
  if (vid) {
    const wantFmt = parseInt(tierLabel, 10) || 720;
    const hit = await downloadLeg(vid, DL_FMTS.includes(wantFmt) ? wantFmt : 720, DL_TIMEOUT);
    if (hit) {
      const header = { 'User-Agent': UA, 'Referer': hit.dlUrl };
      if (hit.cookie) header.Cookie = hit.cookie;
      return { parse: 0, url: hit.url, header };
    }
    // 该片下载页上没有任何可播档位：走嗅探兜底（方案 B），不回空 url。
    return { parse: 1, url: detailUrl || HOST + '/', msg: '该片暂无可播的清晰度，已转站内播放' };
  }
  // 非 yp: 且非直链：原样透传（旧缓存集名），否则嗅探兜底，绝不回空 url。
  if (/^https?:\/\//i.test(rest)) {
    return { parse: 0, url: rest, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  return { parse: 1, url: HOST + '/', msg: '播放地址解析失败，请重试' };
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
