// 蜜夜AI (https://littlepervert.com/zh-CN/) -> CatPawOpen spider
// AI 生成的成人短剧站（竖屏短剧，每部剧多集）。Vue 前端。
// 分类：5 个顶级分组 -> 66 个子分类（/zh-CN/categories/ 的 JSON-LD）。
// 列表：分类页 /zh-CN/c/<slug>/ 一次渲染全部剧集（JSON-LD ItemList + HTML 卡片），
//   站内无翻页（无“加载更多”按钮、?page= 参数被忽略、site.js 里无分类分页接口；
//   “共 X 部”与卡片数逐类核对一致，66 类 0 误差）。
// 翻页（2026-11-11 修）：蜘蛛在本地按 20 条一页切分（paginate），page 1 回前 20 条、
//   page 2 回剩余，pagecount=ceil(总数/20)；≤20 条的分类 pagecount=1 不触发翻页。
//   旧版 page 1 全量返回、page>1 直接回空，App 点“加载更多”拿不到内容。
// 详情：剧集页 /zh-CN/s/<slug>/ 内嵌 eps JSON（签名 m3u8，15 分钟过期）。
// 播放：签名疑似绑 IP，必须点播现取：detail 只放 token "lp:<slug>:<n>"，
// play() 现调 GET /p?s=<slug> 拿新鲜签名 m3u8。单档 720p 竖屏，无多清晰度。
import req from '../../util/req.js';

const KEY = 'py_littlepervert';
const NAME = '蜜夜AI';
const HOST = 'https://littlepervert.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// 本地分页页长：站内无翻页，分类页一次渲染全部剧集（“共 X 部”与卡片数一致），
// 蜘蛛在本地按 20 条一页切分，page 1 只回前 20 条、page 2 回剩余，pagecount=ceil(总数/20)，
// 这样 App 点“加载更多”能真正拿到剩余内容；≤20 条的分类 pagecount=1，不触发翻页。

// 66 个子分类（type_id 用 slug，type_name 用中文名），按站方 5 个分组排列
const CLASSES = [
  // 故事（13）
  { type_id: 'off-limits', type_name: '禁忌' },
  { type_id: 'pov', type_name: '第一人称' },
  { type_id: 'comedy', type_name: '喜剧' },
  { type_id: 'slow-burn', type_name: '慢热' },
  { type_id: 'rivals', type_name: '对手与复仇' },
  { type_id: 'suburbia', type_name: '郊区' },
  { type_id: 'travel', type_name: '旅行' },
  { type_id: 'fantasy', type_name: '奇幻' },
  { type_id: 'office', type_name: '办公室' },
  { type_id: 'historical', type_name: '历史' },
  { type_id: 'roommates', type_name: '室友' },
  { type_id: 'sci-fi', type_name: '科幻' },
  { type_id: 'bodyguard', type_name: '保镖与制服' },
  // 角色（10）
  { type_id: 'threesome', type_name: '3P' },
  { type_id: 'stepmom', type_name: '继母' },
  { type_id: 'milf', type_name: '熟女' },
  { type_id: 'wife', type_name: '人妻' },
  { type_id: 'femdom', type_name: '女王' },
  { type_id: 'dominant-women', type_name: '强势女' },
  { type_id: 'cuckold', type_name: '绿帽' },
  { type_id: 'group', type_name: '群交' },
  { type_id: 'monster-girl', type_name: '魔物娘' },
  { type_id: 'girl-girl', type_name: '女女' },
  // 氛围与癖好（15）
  { type_id: 'almost-caught', type_name: '差点被抓' },
  { type_id: 'blended-family', type_name: '重组家庭' },
  { type_id: 'cheating', type_name: '出轨' },
  { type_id: 'dares', type_name: '游戏与挑战' },
  { type_id: 'love-triangle', type_name: '三角恋' },
  { type_id: 'voyeur', type_name: '偷窥' },
  { type_id: 'royalty', type_name: '王室' },
  { type_id: 'wrestling', type_name: '摔角' },
  { type_id: 'roleplay', type_name: '角色扮演游戏' },
  { type_id: 'wedding', type_name: '婚礼' },
  { type_id: 'public', type_name: '公共场所' },
  { type_id: 'blackmail', type_name: '勒索' },
  { type_id: 'chastity', type_name: '贞操' },
  { type_id: 'foot-fetish', type_name: '恋足' },
  { type_id: 'bdsm', type_name: 'BDSM' },
  // 场景（10）
  { type_id: 'home', type_name: '家中' },
  { type_id: 'pool', type_name: '泳池' },
  { type_id: 'party', type_name: '派对' },
  { type_id: 'beach', type_name: '海滩与游艇' },
  { type_id: 'shower', type_name: '淋浴' },
  { type_id: 'car', type_name: '车内' },
  { type_id: 'outdoors', type_name: '户外' },
  { type_id: 'bedroom', type_name: '卧室' },
  { type_id: 'hotel', type_name: '酒店' },
  { type_id: 'gym', type_name: '健身房' },
  // 外形（18）
  { type_id: 'white', type_name: '白人' },
  { type_id: 'age-20s', type_name: '20多岁' },
  { type_id: 'blonde', type_name: '金发' },
  { type_id: 'busty', type_name: '巨乳' },
  { type_id: 'slim', type_name: '纤瘦' },
  { type_id: 'age-30s', type_name: '30多岁' },
  { type_id: 'athletic', type_name: '运动型' },
  { type_id: 'brunette', type_name: '棕发' },
  { type_id: 'colored-hair', type_name: '彩色头发' },
  { type_id: 'redhead', type_name: '红发' },
  { type_id: 'black-hair', type_name: '黑发' },
  { type_id: 'age-40s', type_name: '40岁以上' },
  { type_id: 'curvy', type_name: '丰满' },
  { type_id: 'big-ass', type_name: '巨臀' },
  { type_id: 'latina', type_name: '拉丁裔' },
  { type_id: 'asian', type_name: '亚洲人' },
  { type_id: 'petite', type_name: '娇小' },
  { type_id: 'ebony', type_name: '黑人' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/zh-CN/',
  };
}

async function getHtmlReq(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    return '';
  }
}

async function getHtmlFetch(url) {
  try {
    if (typeof fetch === 'undefined') return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 22000);
    const r = await fetch(url, { headers: headers(), signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return '';
    return String(await r.text() || '');
  } catch (e) {
    return '';
  }
}

async function getHtml(url) {
  let html = await getHtmlReq(url);
  if (html) return html;
  return await getHtmlFetch(url);
}

async function getJson(url) {
  const txt = await getHtml(url);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** 从剧集页 URL 取 slug（/zh-CN/s/<slug>/ 或 /zh-CN/s/<id>/） */
function slugFromUrl(url) {
  const m = String(url || '').match(/\/zh-CN\/s\/([^\/\?#]+)/i);
  return m ? m[1] : '';
}

/** 从 HTML 里按 key 取一段平衡括号的 JSON（数组或对象），返回解析后的值 */
function extractJsonByKey(html, key) {
  const re = new RegExp('"' + key + '"\\s*:\\s*(\\[|\\{)');
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  const open = html[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

/** 解析分类页/搜索页的剧集卡片：<div class="card">…href / img src+alt / 集数 */
function parseCards(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const chunks = String(html).split('<div class="card"');
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const hm = c.match(/<a[^>]+href="(\/zh-CN\/s\/[^"\/]+\/)"[^>]*>/i);
    if (!hm) continue;
    const url = absUrl(hm[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    const im = c.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    let title = '';
    let pic = '';
    if (im) {
      pic = absUrl(im[1]);
      const am = im[0].match(/alt="([^"]*)"/i);
      if (am) title = decodeHtml(am[1]);
    }
    if (!title) {
      const tm = c.match(/<span[^>]*class="ctitle"[^>]*>([^<]+)<\/span>/i)
        || c.match(/<h[23][^>]*>([^<]{2,120})<\/h/i);
      if (tm) title = decodeHtml(tm[1]);
    }
    let remarks = '';
    const em = c.match(/<span[^>]*class="epn"[^>]*aria-label="([^"]*)"/i)
      || c.match(/aria-label="(\d+\s*集)"/i);
    if (em) remarks = decodeHtml(em[1]).replace(/\s+/g, '');
    out.push({
      vod_id: url,
      vod_name: title || slugFromUrl(url) || url,
      vod_pic: pic,
      vod_remarks: remarks,
    });
  }
  return out;
}

/** 解析 JSON-LD ItemList（分类页备用通道） */
function parseJsonLd(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let d = null;
    try { d = JSON.parse(m[1]); } catch (e) { continue; }
    const arr = Array.isArray(d) ? d : [d];
    for (const it of arr) {
      if (!it || it['@type'] !== 'ItemList') continue;
      const els = it.itemListElement || [];
      for (const e of els) {
        const item = e && e.item ? e.item : null;
        if (!item || !item.url) continue;
        const url = absUrl(item.url);
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({
          vod_id: url,
          vod_name: decodeHtml(item.name || slugFromUrl(url)),
          vod_pic: absUrl(item.image || ''),
          vod_remarks: '',
        });
      }
    }
  }
  return out;
}

function parseList(html) {
  // 卡片优先（带集数备注），JSON-LD 兜底
  let list = parseCards(html);
  if (!list.length) list = parseJsonLd(html);
  return list;
}

function extractTitle(html, fallback) {
  let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[–—-]\s*AI成人短剧.*$/i, '').replace(/\s*[｜|].*$/, '');
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[–—-]\s*AI成人短剧.*$/i, '').replace(/\s*[｜|].*$/, '');
  return fallback || '';
}

function extractCover(html) {
  let m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

// 本地分页：把一次取回的完整列表按 PAGE_SIZE 切页返回
const PAGE_SIZE = 20;

function paginate(list, page) {
  const total = list.length;
  const pagecount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pagecount) {
    return { page, pagecount, limit: PAGE_SIZE, total, list: [] };
  }
  const start = (page - 1) * PAGE_SIZE;
  return { page, pagecount, limit: PAGE_SIZE, total, list: list.slice(start, start + PAGE_SIZE) };
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'off-limits');
  // 站内无翻页：分类页一次渲染全部剧集，本地按 20 条一页切分返回
  const html = await getHtml(HOST + '/zh-CN/c/' + encodeURIComponent(id) + '/');
  const list = parseList(html);
  return paginate(list, page);
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const pageUrl = absUrl(String(raw || ''));
  if (!pageUrl) return { list: [] };
  const slug = slugFromUrl(pageUrl);
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };

  const name = extractTitle(html, slug);
  const pic = extractCover(html);
  let content = '';
  const dm = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
  if (dm) content = decodeHtml(dm[1]);

  // 剧集页内嵌 eps JSON：[{n, u:"/h/<slug>/<n>.m3u8?x=..&t=..", poster, duration, subs}]
  // 签名只有 15 分钟有效，这里只放 token，不直接返回签名地址
  const eps = extractJsonByKey(html, 'eps');
  const plays = [];
  if (Array.isArray(eps)) {
    const sorted = eps.slice().sort((a, b) => (parseInt(a.n, 10) || 0) - (parseInt(b.n, 10) || 0));
    for (const ep of sorted) {
      const n = parseInt(ep.n, 10);
      if (!n || !slug) continue;
      plays.push('第' + n + '集$lp:' + slug + ':' + n);
    }
  }
  // eps 没解析出来时，尝试从 /p?s= 现取集数
  if (!plays.length && slug) {
    const fresh = await getJson(HOST + '/p?s=' + encodeURIComponent(slug));
    if (fresh && fresh.ok && fresh.u) {
      const keys = Object.keys(fresh.u).map((k) => parseInt(k, 10)).filter((n) => n > 0).sort((a, b) => a - b);
      for (const n of keys) plays.push('第' + n + '集$lp:' + slug + ':' + n);
    }
  }

  return {
    list: [{
      vod_id: pageUrl,
      vod_name: name || slug || pageUrl,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: plays.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const token = String(body.id || '');
  const m = token.match(/^lp:([^:]+):(\d+)$/);
  if (!m) {
    return { parse: 0, url: '', header: { 'User-Agent': UA, 'Referer': HOST + '/zh-CN/' } };
  }
  const slug = m[1];
  const n = m[2];
  // 点播现取：/p?s=<slug> 返回 15 分钟有效的新鲜签名地址
  const fresh = await getJson(HOST + '/p?s=' + encodeURIComponent(slug));
  let u = '';
  if (fresh && fresh.ok && fresh.u && fresh.u[n]) u = String(fresh.u[n]);
  // 兜底：/p 失败时从剧集页 eps 里取该集签名地址
  if (!u) {
    const html = await getHtml(HOST + '/zh-CN/s/' + encodeURIComponent(slug) + '/');
    const eps = extractJsonByKey(html, 'eps');
    if (Array.isArray(eps)) {
      const ep = eps.find((e) => String(e.n) === String(n));
      if (ep && ep.u) u = String(ep.u);
    }
  }
  if (!u) {
    return { parse: 0, url: '', header: { 'User-Agent': UA, 'Referer': HOST + '/zh-CN/' } };
  }
  return {
    parse: 0,
    url: absUrl(u.replace(/\\u0026/g, '&')),
    header: { 'User-Agent': UA, 'Referer': HOST + '/zh-CN/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  // 搜索页一次渲染全部结果、无翻页，本地按 20 条一页切分返回
  const html = await getHtml(HOST + '/zh-CN/search/?q=' + encodeURIComponent(wd));
  const list = parseList(html);
  return paginate(list, page);
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
