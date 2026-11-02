import req from '../../util/req.js';

// AnimeSex https://animesex.club —— 动漫视频站（由用户提供的 AnimeSex.py 移植）
// 列表：WordPress <article> 卡片，封面 data-main-thumb；分页 /{path}/page/N/
// 详情：player-x.php?q=<base64> 解出 <video src>（直链）或 <iframe src>（嗅探 parse:1）
// 分类：文件内 9 类 + 站内 /genre/ 索引与详情页实测新增 8 类，共 17 类
const HOST = 'https://animesex.club';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const CLASSES = [
  { type_id: 'latest', type_name: '最新更新' },
  { type_id: 'anime/2d-hentai', type_name: '2D Hentai' },
  { type_id: 'anime/3d-hentai', type_name: '3D Hentai' },
  { type_id: 'genres/2d-hentai', type_name: '2D 合集' },
  { type_id: 'genres/3d-hentai', type_name: '3D 合集' },
  { type_id: 'genres/uncensored', type_name: '无码' },
  { type_id: 'genres/ahegao', type_name: 'Ahegao' },
  { type_id: 'genres/3d', type_name: '3D' },
  { type_id: 'genres/3dcg', type_name: '3DCG' },
  { type_id: 'genres/stockings', type_name: '丝袜' },
  { type_id: 'genres/large-breasts', type_name: '巨乳' },
  { type_id: 'genres/cream-pie', type_name: '内射' },
  { type_id: 'genres/fantasy', type_name: '幻想' },
  { type_id: 'genres/game', type_name: '游戏' },
  { type_id: 'genres/parody', type_name: '恶搞' },
  { type_id: 'genres/short-hair', type_name: '短发' },
  { type_id: 'genres/clothed', type_name: '着衣' },
];

function hdr() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function getHtml(url) {
  try {
    const r = await req.get(url, { headers: hdr(), timeout: 20000 });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

function clean(s) {
  let t = String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
  t = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[-|]\s*Anime\s*Sex\s*$/i, '').trim();
  return t;
}

function mainScope(html) {
  const m = String(html || '').match(/<main[^>]*>([\s\S]*?)<\/main>/);
  return m ? m[1] : String(html || '');
}

function parseList(html) {
  const scope = mainScope(html);
  const items = [];
  const seen = new Set();
  const re = /<article\b[^>]*>/g;
  let m;
  while ((m = re.exec(scope)) !== null) {
    const head = m[0];
    const seg = scope.slice(m.index, m.index + 3000);
    const lm = seg.match(/href="((?:https:\/\/animesex\.club)?\/video\/[^"]+)"/);
    if (!lm) continue;
    let link = lm[1];
    if (link.startsWith('/')) link = HOST + link;
    if (seen.has(link)) continue;
    seen.add(link);
    let cover = '';
    const tm = head.match(/data-main-thumb="([^"]+)"/);
    if (tm) cover = tm[1];
    let title = '';
    const t1 = seg.match(/title="([^"]+)"/);
    if (t1) title = clean(t1[1]);
    if (!title) {
      const al = seg.match(/alt="([^"]+)"/);
      if (al) title = clean(al[1]);
    }
    if (!title) title = clean(link.replace(/\/$/, '').split('/').filter(Boolean).pop().replace(/-/g, ' '));
    if (!cover) {
      const im = seg.match(/src="(https?:\/\/[^"]+\/wp-content\/uploads\/[^"]+)"/);
      if (im) cover = im[1];
    }
    items.push({ vod_id: link, vod_name: title || 'AnimeSex', vod_pic: cover, vod_remarks: '▶ AnimeSex' });
  }
  return items;
}

function pagecount(html, pg, count) {
  // 标题 "Page N of M" 是本站归档自己的总页数；/page/ 链接只取 <main> 主循环里的，站外挂件的分页链接会虚增页数
  const tm = String(html || '').match(/Page\s+\d+\s+of\s+(\d+)/);
  if (tm) return parseInt(tm[1], 10);
  const scope = mainScope(html);
  const nums = [];
  const re = /\/page\/(\d+)\//g;
  let x;
  while ((x = re.exec(scope)) !== null) nums.push(parseInt(x[1], 10));
  if (nums.length) return Math.max(...nums);
  return pg;
}

async function catPage(tid, pg) {
  tid = String(tid || '').replace(/^\/+|\/+$/g, '');
  let url;
  if (tid === 'latest') {
    url = pg <= 1 ? (HOST + '/?filter=latest') : (HOST + '/page/' + pg + '/?filter=latest');
  } else if (tid) {
    url = pg <= 1 ? (HOST + '/' + tid + '/') : (HOST + '/' + tid + '/page/' + pg + '/');
  } else {
    url = pg <= 1 ? (HOST + '/') : (HOST + '/page/' + pg + '/');
  }
  const html = await getHtml(url);
  const list = parseList(html);
  const pc = pagecount(html, pg, list.length);
  return { page: pg, pagecount: pc, limit: 30, total: pc * 30, list };
}

async function home() {
  try {
    const r = await catPage('latest', 1);
    return { class: CLASSES, list: r.list };
  } catch (e) {
    return { class: CLASSES, list: [] };
  }
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  try {
    return await catPage(tid, page);
  } catch (e) {
    return { page, pagecount: page, limit: 30, total: 0, list: [] };
  }
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw) return { list: [] };
  const q = encodeURIComponent(kw);
  const url = page <= 1 ? (HOST + '/?s=' + q) : (HOST + '/page/' + page + '/?s=' + q);
  const html = await getHtml(url);
  const list = parseList(html);
  const pc = pagecount(html, page, list.length);
  return { page, pagecount: pc, limit: 30, total: pc * 30, list };
}

function fixUrl(u) {
  if (!u) return '';
  return String(u).split(' ').join('%20');
}

function playFrom(html) {
  const re = /player-x\.php\?q=([A-Za-z0-9+/=]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const dec = Buffer.from(m[1], 'base64').toString('utf8');
      const tagMatch = dec.match(/[?&]tag=([^&]*)/);
      const tag = tagMatch ? decodeURIComponent(tagMatch[1]) : '';
      const srcs = [...tag.matchAll(/src=["']([^"']+)["']/g)].map((x) => x[1]);
      if (!srcs.length) continue;
      if (tag.includes('<iframe')) return { url: srcs[0], parse: 1 };
      return { url: srcs[0], parse: 0 };
    } catch (e) { continue; }
  }
  const m2 = html.match(/https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*/);
  if (m2) return { url: m2[0], parse: 0 };
  return { url: '', parse: 0 };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!raw) return { list: [] };
  const url = raw.startsWith('http') ? raw : (HOST + '/' + raw.replace(/^\/+/, ''));
  const html = await getHtml(url);
  let title = '';
  const h1 = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (h1) title = clean(h1[1]);
  if (!title) {
    const tm = html.match(/<title>([\s\S]*?)<\/title>/);
    if (tm) title = clean(tm[1]);
  }
  let cover = '';
  const pic = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/)
    || html.match(/data-main-thumb="([^"]+)"/);
  if (pic) cover = pic[1];
  let desc = '';
  const dm = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/)
    || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/)
  if (dm) desc = clean(dm[1]);
  const p = playFrom(html);
  return {
    list: [{
      vod_id: raw,
      vod_name: title || 'AnimeSex',
      vod_pic: cover,
      vod_remarks: p.parse === 1 ? '需解析' : '▶ 直连',
      vod_content: desc || 'AnimeSex 动漫视频',
      vod_play_from: 'AnimeSex',
      vod_play_url: p.url ? ('正片$' + fixUrl(p.url)) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let target = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (target.includes('$')) target = target.split('$').pop();
  if (!target) return { parse: 0, url: '' };
  const header = { 'User-Agent': UA, 'Referer': HOST + '/' };
  const low = target.toLowerCase();
  if (low.includes('.mp4') || low.includes('.m3u8')) return { parse: 0, url: target, header };
  return { parse: 1, url: target, header };
}

export default function createSpider() {
  return {
    meta: { key: 'py_animesex', name: 'AnimeSex', type: 3 },
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
