// 羞羞视频 (https://7.3237xiu.cc:8888) -> CatPawOpen spider
// 与 seniu(色牛)同款后端；整站 HTML 是 document.write(decodeURIComponent(...))，须先解码再解析
// 封面是 base64 文本 .dat，直链当图用不了，须走解码代理 Worker
// 播放为签名 m3u8(res-xx2.99aries.com，约 10 小时有效)，detail() 现取播放页拿新鲜地址
// 单档 360p(个别竖屏 202x360)，不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_313xiu';
const NAME = '羞羞';
const HOST = 'https://7.3237xiu.cc:8888';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 顶级 5 个 + 子分类 17 个(与 seniu 同 id 体系，导航栏实测)
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '1', type_name: '大陆' },
  { type_id: '2', type_name: '日韩' },
  { type_id: '3', type_name: '欧美' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '5', type_name: '综艺' },
  { type_id: '6', type_name: '国产传媒' },
  { type_id: '7', type_name: '偷拍自拍' },
  { type_id: '10', type_name: '日韩无码' },
  { type_id: '11', type_name: '中文字幕' },
  { type_id: '12', type_name: '日韩杂类' },
  { type_id: '19', type_name: '欧美无码' },
  { type_id: '20', type_name: '黑白专区' },
  { type_id: '23', type_name: '少女动漫' },
  { type_id: '28', type_name: '其他综艺' },
  { type_id: '29', type_name: '成人游戏' },
  { type_id: '30', type_name: '网爆黑料' },
  { type_id: '31', type_name: 'AI脱衣' },
  { type_id: '35', type_name: '绿帽偷情' },
  { type_id: '36', type_name: 'JK萝莉' },
  { type_id: '37', type_name: '强奸迷奸' },
  { type_id: '38', type_name: '网红主播' },
  { type_id: '39', type_name: '吃瓜黑料' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

/** 整站 HTML 是 document.write(decodeURIComponent("..."))，逐块解码还原；无此结构时原样返回
 * 注意：块内容是 encodeURIComponent 编码的，其中 " 会被编成 %22（块内无字面双引号），
 * 但 ' 不会被编码（块内可能含字面单引号），所以只能用 [^"]* 匹配双引号块，不能用 [^"']* */
function decodePage(html) {
  if (!html) return '';
  const re = /decodeURIComponent\(\s*"([^"]*)"\s*\)|decodeURIComponent\(\s*'([^']*)'\s*\)/g;
  let m;
  let out = '';
  let found = false;
  while ((m = re.exec(html)) !== null) {
    found = true;
    const chunk = m[1] !== undefined ? m[1] : m[2];
    try {
      out += decodeURIComponent(chunk);
    } catch (e) {
      // 解码失败的块原样保留，避免丢内容
      out += chunk;
    }
  }
  return found ? out : html;
}

async function fetchText(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    // fetch 兜底（App 内无全局 fetch 时跳过）
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
        if (r && r.ok) return await r.text();
      }
    } catch (e2) {
      // ignore
    }
    return '';
  }
}

async function getHtml(url) {
  if (!url) return '';
  const raw = await fetchText(url);
  if (!raw) return '';
  return decodePage(raw);
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

/** 解 HTML 实体：&#xXXXX; / &#DDDD; / &amp; 等（本站标题用数字实体编码） */
function decodeEntities(s) {
  let out = t(s);
  if (!out) return '';
  out = out.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
    const code = parseInt(hex, 16);
    return isNaN(code) ? m : String.fromCharCode(code);
  });
  out = out.replace(/&#(\d+);/g, function (m, dec) {
    const code = parseInt(dec, 10);
    return isNaN(code) ? m : String.fromCharCode(code);
  });
  out = out
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return t(out);
}

/** 秒数 -> H:MM:SS 或 M:SS（站内 document.write(secondsToHMS(n))） */
function fmtDur(sec) {
  sec = parseInt(sec, 10);
  if (isNaN(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = (m < 10 ? '0' : '') + m;
  const ss = (s < 10 ? '0' : '') + s;
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

/** 封面解码代理：.dat 是 base64 文本，App 直接当图加载会空白，须经 Worker 解码成图片二进制 */
const IMG_PROXY = 'https://seniu-img-proxy.li768435813.workers.dev/?u=';

function proxyImgUrl(imgUrl) {
  if (!imgUrl) return '';
  // 已是代理地址直接返回
  if (/workers\.dev/i.test(imgUrl)) return imgUrl;
  return IMG_PROXY + encodeURIComponent(imgUrl);
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    // 首页只有第 1 页有内容
    return page <= 1 ? HOST + '/' : '';
  }
  // 分类页：/category/<id>/，翻页 /category/<id>/<N>/
  return page > 1 ? HOST + '/category/' + cat + '/' + page + '/' : HOST + '/category/' + cat + '/';
}

function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  // 每条 = 图片链 + 标题链各一次（同 /view/<16位hex>），标题为数字实体编码
  const re = /<a href="\/view\/([0-9a-f]{16})" class="vod-img">([\s\S]*?)<\/a>\s*<a href="\/view\/\1" class="vod-title">([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const imgBlock = m[2] || '';
    const cm = imgBlock.match(/data-original=["']([^"']+)["']/i);
    if (!cm) continue;
    seen.add(id);

    const title = decodeEntities(m[3]);
    let remarks = '';
    const dm = imgBlock.match(/secondsToHMS\((\d+)\)/);
    if (dm) remarks = fmtDur(dm[1]);

    out.push({
      vod_id: id,
      vod_name: title || id,
      vod_pic: proxyImgUrl(cm[1]),
      vod_remarks: remarks,
    });
  }
  return out;
}

function extractVid(raw) {
  let s = t(raw);
  if (!s) return '';
  const m = s.match(/view\/([0-9a-f]{16})/i);
  if (m) return m[1];
  if (/^[0-9a-f]{16}$/i.test(s)) return s;
  return '';
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
  const url = listUrl(id, page);
  const html = await getHtml(url);
  const list = parseList(html);
  const isHome = id === 'home' || id === '';
  return {
    page,
    pagecount: isHome ? 1 : 999,
    limit: list.length || 9,
    total: isHome ? list.length : 999 * 9,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = extractVid(raw);
  if (!vid) return { list: [] };

  const pageUrl = HOST + '/view/' + vid + '/';
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };

  // 标题：<h1> 为明文
  let name = '';
  const hm = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (hm) name = decodeEntities(hm[1]);
  if (!name) {
    const tm = html.match(/<title>([^<]{2,200})<\/title>/i);
    if (tm) name = decodeEntities(tm[1]);
  }

  // 播放地址：详情页 JS 直给签名 m3u8，detail 时现取，保证签名新鲜（约 10 小时有效）
  let m3u8 = '';
  const um = html.match(/var url\s*=\s*"([^"]+\.m3u8[^"]*)"/i);
  if (um) m3u8 = um[1];
  if (!m3u8) {
    const any = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
    if (any) m3u8 = any[0];
  }

  const eps = [];
  if (m3u8) eps.push('播放$' + m3u8);

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      // 详情页无主视频封面（页内 data-original 全是“猜你喜欢”相关视频的封面，不能错用），留空
      vod_pic: '',
      vod_content: '',
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
  // 路径式搜索：/search/<关键词>/，翻页按分类页同款格式 /search/<关键词>/<N>/（翻页格式未实测，为合理推测）
  const url = page > 1
    ? HOST + '/search/' + encodeURIComponent(wd) + '/' + page + '/'
    : HOST + '/search/' + encodeURIComponent(wd) + '/';
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
