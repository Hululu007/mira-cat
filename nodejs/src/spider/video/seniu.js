// 色牛视频 (https://1.seniu5481.cc:8888) -> CatPawOpen spider
// 列表: /type/<id>/ 每页 9 条, 条目 <a href="/play/<16位hex>">, 标题在 .rank-title, 时长 secondsToHMS(秒)
// 详情/播放页 /play/<hex>: var url = "https://res-91c.99aries.com/m3u8/.../index.m3u8?sign=..." (签名约 10 小时有效, detail 现取)
// 封面是 base64 文本 .dat (解出 WebP), 直链当图用不了 -> 走 seniu-img-proxy Worker 解码代理
// m3u8 单档 360p (AES-128 分片), 只出一条播放线, 不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_seniu';
const NAME = '色牛';
const HOST = 'https://1.seniu5481.cc:8888';
const ALT_HOSTS = ['https://1.seniu5482.cc:8888', 'https://1.seniu5483.cc:8888'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 顶级 5 个 (大陆/日韩/欧美/动漫/综艺, /type/1-5) + 子分类 17 个 (导航栏实测顺序)
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '1', type_name: '大陆' },
  { type_id: '2', type_name: '日韩' },
  { type_id: '3', type_name: '欧美' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '5', type_name: '综艺' },
  { type_id: '31', type_name: 'AI脱衣' },
  { type_id: '29', type_name: '成人游戏' },
  { type_id: '6', type_name: '国产传媒' },
  { type_id: '7', type_name: '偷拍自拍' },
  { type_id: '35', type_name: '绿帽偷情' },
  { type_id: '36', type_name: 'JK萝莉' },
  { type_id: '37', type_name: '强奸迷奸' },
  { type_id: '38', type_name: '网红主播' },
  { type_id: '39', type_name: '吃瓜黑料' },
  { type_id: '10', type_name: '日韩无码' },
  { type_id: '11', type_name: '中文字幕' },
  { type_id: '12', type_name: '日韩杂类' },
  { type_id: '19', type_name: '欧美无码' },
  { type_id: '20', type_name: '黑白专区' },
  { type_id: '23', type_name: '少女动漫' },
  { type_id: '30', type_name: '网爆黑料' },
  { type_id: '28', type_name: '其他综艺' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function fetchOnce(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    if (data) return String(data);
  } catch (e) {}
  // fetch 兜底 (App 内无全局 fetch 时 typeof 守卫跳过)
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

// 主站取不到时换备用域 (5482/5483) 重试一次
async function getHtml(url) {
  let html = await fetchOnce(url);
  if (html) return html;
  for (const alt of ALT_HOSTS) {
    const altUrl = url.replace(HOST, alt);
    if (altUrl === url) continue;
    html = await fetchOnce(altUrl);
    if (html) return html;
  }
  return '';
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

// 站内标题/导航全是 &#xXXXX; 数字字符引用, 须解码; 另处理常用命名实体
function decodeHtml(s) {
  s = t(s);
  if (!s) return '';
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; }
  });
  s = s.replace(/&#(\d+);/g, (_, d) => {
    try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return ''; }
  });
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** 封面解码代理: .dat 是 base64 文本 (解出 WebP), App 直接当图加载会空白, 须经 Worker 解码成图片二进制 */
const IMG_PROXY = 'https://seniu-img-proxy.li768435813.workers.dev/?u=';

function proxyImgUrl(imgUrl) {
  imgUrl = t(imgUrl);
  if (!imgUrl) return '';
  if (/workers\.dev/i.test(imgUrl)) return imgUrl;
  return IMG_PROXY + encodeURIComponent(imgUrl);
}

function hms(sec) {
  sec = parseInt(sec, 10) || 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (h > 0 ? String(m) : String(m));
  const ss = String(s).length < 2 ? '0' + s : String(s);
  if (h > 0) return h + ':' + (String(m).length < 2 ? '0' + m : m) + ':' + ss;
  return mm + ':' + ss;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    return HOST + '/';
  }
  const base = HOST + '/type/' + encodeURIComponent(cat) + '/';
  return page > 1 ? base + page + '/' : base;
}

function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]+href="\/play\/([0-9a-f]{16})"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[2];
    const im = body.match(/data-original=["']([^"']+)["']/i)
      || body.match(/(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp|dat)[^"']*)["']/i);
    if (!im) continue;
    seen.add(id);

    let title = '';
    const tm = body.match(/class=["']rank-title["'][^>]*>([\s\S]*?)<\/div>/i);
    if (tm) title = decodeHtml(tm[1]).replace(/\s+/g, ' ').trim();
    if (!title) {
      const am = body.match(/title=["']([^"']{2,200})["']/i);
      if (am) title = decodeHtml(am[1]);
    }
    if (!title) title = '视频 ' + id;

    let remarks = '';
    const dm = body.match(/secondsToHMS\((\d+)\)/i);
    if (dm) remarks = hms(dm[1]);

    out.push({
      vod_id: id,
      vod_name: title,
      vod_pic: proxyImgUrl(absUrl(im[1])),
      vod_remarks: remarks,
    });
  }
  return out;
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
  const id = String(body.id || 'home');
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 9,
    total: 999 * 9,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const hex = String(raw || '').match(/([0-9a-f]{16})/i)?.[1] || '';
  if (!hex) return { list: [] };

  const pageUrl = HOST + '/play/' + hex;
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };

  let name = '';
  const tm = html.match(/class=["']video-title["'][^>]*>([\s\S]*?)<\/div>/i);
  if (tm) name = decodeHtml(tm[1]).replace(/\s+/g, ' ').trim();
  if (!name) name = '视频 ' + hex;

  // 详情页封面: 取页内第一个 data-original (相关推荐首图); 列表卡片本身已有封面, 此处仅作详情头图
  let pic = '';
  const pm = html.match(/data-original=["']([^"']+)["']/i);
  if (pm) pic = proxyImgUrl(absUrl(pm[1]));

  // 签名 m3u8 (约 10 小时有效): detail 现取, 不缓存
  let m3u8 = '';
  const um = html.match(/var\s+url\s*=\s*"([^"]+\.m3u8[^"]*)"/i);
  if (um) m3u8 = um[1];
  if (!m3u8) {
    const gm = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (gm) m3u8 = gm[0];
  }
  const eps = m3u8 ? ['播放$' + m3u8] : [];

  return {
    list: [{
      vod_id: hex,
      vod_name: name,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search/' + encodeURIComponent(wd) + '/';
  if (page > 1) url += page + '/';
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 9,
    total: 999 * 9,
    list,
  };
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
