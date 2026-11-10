// Px8x (https://8xx6.lol) -> CatPawOpen spider
// 全站文字 base64 混淆: document.write(d('...')), d() 即 atob; 解码后去掉 display:none 噪音 span
// 列表 /list/{id}-N.html, 详情 /video/{id}.html, 播放走详情页 hls.loadSource 里的
// https://m.892539.xyz/play.php?site_id={n}&source_id={id} (site_id 不固定, 12/13 都见过, 必须从详情页现取, 不能写死)
// 封面明文直链, 无 Referer 门禁; 清单 METHOD=NONE (本批唯一不加密), 单档不编造清晰度
import req from '../../util/req.js';

const KEY = 'py_px8x';
const NAME = 'Px8x';
const HOST = 'https://8xx6.lol';
const PLAY_HOST = 'https://m.892539.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 首页最新 + 顶级 8 个 + 额外 7 个 distinct 视频列表
// 注意: 891200/901200/911200/921200 四个 "*200" 列表实测是种子(/torrent/)页、不是视频, 已排除, 不进蜘蛛
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '901179', type_name: '国产' },
  { type_id: '911179', type_name: '有码' },
  { type_id: '921179', type_name: '无码' },
  { type_id: '931179', type_name: '欧美' },
  { type_id: '941179', type_name: '传媒' },
  { type_id: '951179', type_name: '探花' },
  { type_id: '961179', type_name: '中文' },
  { type_id: '971179', type_name: '动漫' },
  { type_id: '891319', type_name: '日韩无码' },
  { type_id: '901339', type_name: '日本无码' },
  { type_id: '901309', type_name: '欧美极品' },
  { type_id: '901169', type_name: '国产专区' },
  { type_id: '911169', type_name: '日本有码' },
  { type_id: '921169', type_name: '日本无码2' },
  { type_id: '931169', type_name: '欧美情色' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    const s = String(data || '');
    if (s) return s;
  } catch (e) {
    // fall through to fetch fallback
  }
  try {
    if (typeof fetch !== 'undefined') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
      return await r.text();
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

/** base64 解码 (站方 d() = atob + escape/decodeURIComponent, 等价于按 UTF-8 解码) */
function b64decode(s) {
  try {
    return Buffer.from(String(s || ''), 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

/**
 * 还原混淆页面: 把 document.write(d('...')) 替换成解码后的 HTML,
 * 再去掉解码后插在文字中间的 display:none 噪音 span
 */
function decodePage(html) {
  if (!html) return '';
  let out = html.replace(/document\.write\(d\((['"])([A-Za-z0-9+/=]+)\1\)\)/g, (m, q, b) => b64decode(b));
  out = out.replace(/<span[^>]*display\s*:\s*none[^>]*>.*?<\/span>/gi, '');
  return out;
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    return HOST + '/';
  }
  return HOST + '/list/' + cat + '-' + page + '.html';
}

/** 解析列表/搜索页: 封面取缩略图锚点里的 img, 标题取标题锚点里的 <script> 文本, 按 id 合并去重 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const decoded = decodePage(html);

  // 封面: <a href="/video/{id}.html"><img ... src="封面">
  const covers = {};
  const order = [];
  const coverRe = /<a href="\/video\/(\d+)\.html">\s*<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = coverRe.exec(decoded)) !== null) {
    const id = m[1];
    if (!covers[id]) {
      covers[id] = absUrl(m[2]);
      order.push(id);
    }
  }

  // 标题: <a ... href="/video/{id}.html"><script>标题;</script></a>
  const titles = {};
  const titleRe = /<a[^>]*href="\/video\/(\d+)\.html"[^>]*>\s*<script[^>]*>([^<]+?);?\s*<\/script>/gi;
  while ((m = titleRe.exec(decoded)) !== null) {
    const id = m[1];
    if (!titles[id]) titles[id] = decodeHtml(m[2]);
  }

  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const title = titles[id] || '';
    out.push({
      vod_id: id,
      vod_name: title || ('视频 ' + id),
      vod_pic: covers[id] || '',
      vod_remarks: '',
    });
  }
  return out;
}

/** 详情页标题: 优先取 document.title = d('...') 解码; 兜底取 h1 文本 */
function extractTitle(rawHtml, decodedHtml, fallback) {
  let m = rawHtml.match(/document\.title\s*=\s*d\((['"])([A-Za-z0-9+/=]+)\1\)/);
  if (m) {
    const s = t(b64decode(m[2]));
    if (s) return decodeHtml(s);
  }
  m = decodedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) {
    const s = t(m[1].replace(/<[^>]+>/g, '').replace(/;\s*$/, ''));
    if (s) return decodeHtml(s);
  }
  m = decodedHtml.match(/<title>([^<]*)<\/title>/i);
  if (m && t(m[1])) return decodeHtml(m[1]);
  return fallback || '';
}

/** 详情页播放地址: 优先取 hls.loadSource 里的完整地址, 兜底按 site_id/source_id 拼 */
function extractPlayUrl(decodedHtml) {
  let m = decodedHtml.match(/hls\.loadSource\(['"]([^'"]+play\.php[^'"]*)['"]\)/i);
  if (m) return t(m[1]);
  m = decodedHtml.match(/play\.php\?site_id=(\d+)&(?:amp;)?source_id=(\d+)/i);
  if (m) return PLAY_HOST + '/play.php?site_id=' + m[1] + '&source_id=' + m[2];
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
  // 首页只有一页
  if ((id === 'home' || id === '') && page > 1) {
    return { page, pagecount: 1, limit: 0, total: 0, list: [] };
  }
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: id === 'home' || id === '' ? 1 : 999,
    limit: list.length || 20,
    total: (id === 'home' || id === '') ? list.length : 999 * 20,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/video\/(\d+)/)?.[1] || String(raw || '').replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };

  const pageUrl = HOST + '/video/' + vid + '.html';
  const html = await getHtml(pageUrl);
  if (!html) return { list: [] };
  const decoded = decodePage(html);

  const name = extractTitle(html, decoded, vid);
  const playUrl = extractPlayUrl(decoded);
  // 详情页无本片封面 (只有相关视频缩略图), vod_pic 留空, App 沿用列表封面
  const eps = playUrl ? ['播放$' + playUrl] : [];

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
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
  let url = HOST + '/search.php?content=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
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
