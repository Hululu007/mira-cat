import req from '../../util/req.js';

// 柚子短剧 (py_youzidj)
// 站点: https://youzidj.com (柚子短剧，AI 成人短剧，SSR 站)
// 2026-10-20 实测结构:
//   列表: article.drama-card 卡片 (24 条/页)，链接 /dramas/{slug}/season-1/，
//         封面 /catalogue-art/{uuid}-960.webp 同站直链 (无需代理)，
//         备注取 .home-card-episodes-long 如「更新至9集」。
//         分页统一 {base}/page/{n}/ (全部短剧 /dramas/、题材 /dramas/category/{slug}/、标签 /tags/{slug}/)。
//   详情: 剧集页内嵌 JSON-LD (TVSeason)，含剧名/简介/封面/episode 数组 (url+name+episodeNumber)。
//   搜索: /search/?q={wd} 服务端渲染，单页最多 24 条，站方无搜索分页。
//   播放: 集页面只有 data-video={videoId}/data-price，无裸流地址；
//         真链路 = 年龄确认 + 访客会话 + 播放授权，三步接口（2026-11-16 实测）：
//         0) POST /age-check（decision=accepted&return_to=/）-> 303，
//            Set-Cookie: eden_age_v2=accepted.<ts>.<ts+86400>.<sig>（24 小时）。
//            不带它调 playback 回 403「请先完成网站入口的年龄确认」。
//         1) POST /api/account/bootstrap（带 eden_age_v2）-> 建访客账户，
//            Set-Cookie: eden_account。
//         2) POST /api/playback/{videoId}?mode=hls（带两个 Cookie）
//            -> JSON {url: /media/{vid}/{ver}/master.m3u8, expires_at}
//               + Set-Cookie: eden_play_{videoId}。
//            mode=native 时回同路径的 native-current.mp4，同样要 Cookie。
//         3) 播放器直取 m3u8/分片时必须同带这三个 Cookie，否则 403；
//            播放器不转发 play 的 header，直链从根上播不了，
//            故 play() 改走 youzidj-fetch Worker 在服务端走完三步取流、
//            改写清单、分片代理（duanju91-fetch 同款），见 play()。
//   VIP: 站内有付费解锁机制，但抽查 18 部剧 35 集 data-price 全部为 0，
//        playback 均正常发授权。若某集 price>0，play() 落 parse:1 嗅探兜底。
//   VIP: 站内有付费解锁机制 (播放器 JS 有 402->unlock 分支、/api/orders)，
//        但抽查 18 部剧 35 集 (修仙/都市/古装/家庭伦理/武侠等，含首集与末集)
//        data-price 全部为 0、data-free=true，playback 均正常发授权。
//        若日后某集 price>0，接口会回 402，play() 自动落 parse:1 嗅探集页面兜底。
// 2026-10-20 翻页修复 (真机反馈: 除全部短剧外所有分类无法加载更多):
//   服务端复测 (inject + 真实 HTTP) 29 分类 p1/p2 全部正确，问题出在分类 id
//   回传环节: 'genre:urban'/'tag:romance' 含冒号，与能正常翻页的 'all' 的唯一
//   差异就在冒号。改为无冒号 id ('g_'/'t_' 前缀)，category() 同时兼容旧冒号 id、
//   百分号编码、裸 slug、中文名与 pg 页码字段，任何回传形态都能正确定位分类。
//   附带修复: 卡片链接只认 season-1，导致已出到 season-2+ 的剧被整卡丢弃
//   (校园少 2 部、绿帽少 4 部等)，改认 season-<数字>；单页满 24 条时不再误报
//   第 2 页 (逆袭实为单页 24 条)。

const KEY = 'py_youzidj';
const NAME = '柚子短剧';
const SITE = 'https://youzidj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';
// 2026-11-16：站方新加年龄确认门 + Cookie 绑定播放，见 play() 注释。
// 播放走 youzidj-fetch Worker（duanju91-fetch 同款），代码见
// youzidj-fetch-worker.js（用户部署）；Worker 未部署前 play() 自动
// 回落嗅探兜底，行为与现在一致。
const YZ_FETCH = 'https://youzidj-fetch.li768435813.workers.dev';

const GENRES = [
  { slug: 'cultivation', name: '修仙' },
  { slug: 'wealthy-family', name: '豪门' },
  { slug: 'urban', name: '都市' },
  { slug: 'costume', name: '古装' },
  { slug: 'family-ethics', name: '家庭伦理' },
  { slug: 'martial-arts', name: '武侠' },
  { slug: 'campus', name: '校园' },
];

const TAGS = [
  { slug: 'romance', name: '情感' },
  { slug: 'yu-jie', name: '御姐' },
  { slug: 'ni-xi', name: '逆袭' },
  { slug: 'tiao-jiao', name: '调教' },
  { slug: 'shu-nu', name: '熟女' },
  { slug: 'ren-qi', name: '人妻' },
  { slug: 'hou-gong', name: '后宫' },
  { slug: 'tou-qing', name: '偷情' },
  { slug: 'qi-huan', name: '奇幻' },
  { slug: 'xi-tong', name: '系统' },
  { slug: 'nu-pu', name: '女仆' },
  { slug: 'luo-li', name: '萝莉' },
  { slug: 'lu-mao', name: '绿帽' },
  { slug: 'xuan-yi', name: '悬疑' },
  { slug: 'mu-zi', name: '母子' },
  { slug: 'jiao-shi', name: '教师' },
  { slug: 'apocalypse', name: '末日' },
  { slug: 'chong-sheng', name: '重生' },
  { slug: 'chuan-yue', name: '穿越' },
  { slug: 'fu-nu', name: '父女' },
  { slug: 'jie-di', name: '姐弟' },
];

const CATS = [
  { type_id: 'all', type_name: '全部短剧' },
  ...GENRES.map(g => ({ type_id: 'g_' + g.slug, type_name: g.name })),
  ...TAGS.map(g => ({ type_id: 't_' + g.slug, type_name: g.name })),
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

// 带超时的原生 fetch 取文本 (req 兜底通道)
async function timedFetchText(url, headers, timeoutMs) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) {
    return '';
  } finally {
    clearTimeout(to);
  }
}

// 取页面 HTML: 框架 req 优先，fetch 兜底
async function getHtml(url) {
  const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
  try {
    const { data, status } = await req.get(url, { headers, timeout: 12000 });
    if (status === 200 && typeof data === 'string' && data) return data;
  } catch (e) { /* 换 fetch */ }
  return timedFetchText(url, headers, 12000);
}

// ---------- 列表解析 ----------
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const parts = String(html).split('<article class="drama-card');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].slice(0, 6000);
    const hm = block.match(/href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+\/)"/);
    if (!hm) continue;
    const url = hm[1];
    if (seen.has(url)) continue;
    seen.add(url);
    let title = '';
    const tm = block.match(/drama-card-title"[^>]*title="([^"]+)"/) || block.match(/drama-card-title"[^>]*>([^<]+)</);
    if (tm) title = clean(tm[1]);
    if (!title) {
      const am = block.match(/<img[^>]+alt="([^"]+?)海报"/);
      if (am) title = clean(am[1]);
    }
    let pic = '';
    const pm = block.match(/(\/catalogue-art\/[0-9a-f\-]+-960\.webp)/);
    if (pm) pic = SITE + pm[1];
    let remarks = '';
    const rm = block.match(/home-card-episodes-long">([^<]+)</);
    if (rm) remarks = clean(rm[1]);
    out.push({ vod_id: url, vod_name: title || url, vod_pic: pic, vod_remarks: remarks });
  }
  return out;
}

function parsePagecount(html, page, got) {
  let pc = page || 1;
  const nums = [...String(html).matchAll(/\/page\/(\d+)\//g)].map(x => parseInt(x[1], 10)).filter(n => n > 0 && n < 10000);
  if (nums.length) pc = Math.max(pc, ...nums);
  // 满页时也只在页面里真有更大页码链接才预告下一页 (逆袭单页正好 24 条，别误报)
  if (got >= 24 && nums.some(n => n > (page || 1))) pc = Math.max(pc, (page || 1) + 1);
  return pc;
}

function catBase(tid) {
  // 分类 id 容错: 新 id 'g_'/'t_' 前缀、旧 'genre:'/'tag:' id、裸 slug、中文名、
  // 百分号编码形态全部认，任何回传变形都能定位到同一分类
  let id = String(tid == null ? '' : tid).trim();
  try { id = decodeURIComponent(id); } catch (e) { /* 保持原样 */ }
  if (!id || id === 'all') return SITE + '/dramas/';
  let m = id.match(/^(?:g_|genre:)(.+)$/);
  if (m) return SITE + '/dramas/category/' + m[1] + '/';
  m = id.match(/^(?:t_|tag:)(.+)$/);
  if (m) return SITE + '/tags/' + m[1] + '/';
  const g = GENRES.find(x => x.slug === id || x.name === id);
  if (g) return SITE + '/dramas/category/' + g.slug + '/';
  const tg = TAGS.find(x => x.slug === id || x.name === id);
  if (tg) return SITE + '/tags/' + tg.slug + '/';
  return SITE + '/dramas/';
}

async function buildList(url, page, limit) {
  limit = limit || 30;
  const html = await getHtml(url);
  if (!html) return { page, pagecount: page, limit, total: 0, list: [] };
  const list = parseCards(html);
  const pc = parsePagecount(html, page, list.length);
  return { page, pagecount: Math.max(pc, page), limit, total: list.length, list };
}

// ---------- 接口实现 ----------
async function init(reqIn) {
  return {};
}

async function home(reqIn) {
  const cls = CATS.map(c => ({ type_id: c.type_id, type_name: c.type_name }));
  const html = await getHtml(SITE + '/');
  const list = html ? parseCards(html).slice(0, 30) : [];
  return { class: cls, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.tid || body.id) || 'all';
  const page = Math.max(1, parseInt(body.page != null ? body.page : body.pg, 10) || 1);
  const base = catBase(tid);
  const url = page > 1 ? base + 'page/' + page + '/' : base;
  return buildList(url, page, 30);
}

function findSeason(ld) {
  if (!ld || typeof ld !== 'object') return null;
  if (Array.isArray(ld)) {
    for (const x of ld) { const s = findSeason(x); if (s) return s; }
    return null;
  }
  if (Array.isArray(ld.episode)) return ld;
  if (ld['@graph']) return findSeason(ld['@graph']);
  return null;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { list: [] };
  const durl = /^https?:\/\//i.test(id) ? id : SITE + '/dramas/' + id.replace(/^\/+|\/+$/g, '') + '/season-1/';
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  let name = '';
  let desc = '';
  let pic = '';
  let episodes = [];
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const b of lds) {
    let obj = null;
    try { obj = JSON.parse(b[1]); } catch (e) { /* 下一块 */ }
    const season = findSeason(obj);
    if (!season) continue;
    name = clean((season.partOfSeries && season.partOfSeries.name) || season.name || '');
    desc = clean(season.description || '');
    pic = fixUrl(season.image || '');
    episodes = (season.episode || []).map(ep => ({
      n: parseInt(ep.episodeNumber, 10) || 0,
      label: clean(ep.name || ''),
      url: fixUrl(ep.url || ''),
    })).filter(ep => ep.url);
    if (episodes.length) break;
  }
  if (!episodes.length) {
    // JSON-LD 兜底: 直接扫集链接
    const re = /href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+-episode-(\d+)\/)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      episodes.push({ n: parseInt(m[2], 10) || episodes.length + 1, label: '', url: m[1] });
    }
  }
  if (!name) {
    const tm = html.match(/<title>([^<]+)<\/title>/);
    if (tm) name = clean(tm[1]).replace(/·.*$/, '').trim();
  }
  if (!pic) {
    const om = html.match(/property="og:image"\s+content="([^"]+)"/);
    if (om) pic = fixUrl(om[1]);
  }
  if (!desc) {
    const dm = html.match(/<meta name="description" content="([^"]+)"/);
    if (dm) desc = clean(dm[1]);
  }
  episodes.sort((a, b) => a.n - b.n);
  const purl = episodes.map(ep => (ep.label || ('第' + ep.n + '集')) + '$' + ep.url).join('#');

  return {
    list: [{
      vod_id: durl,
      vod_name: name || durl,
      vod_pic: pic,
      vod_remarks: episodes.length ? '共' + episodes.length + '集' : '',
      vod_content: desc,
      vod_play_from: '柚子短剧',
      vod_play_url: purl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  if (id.includes('$')) id = id.split('$').pop().trim();
  const epUrl = fixUrl(id);

  const html = await getHtml(epUrl);
  const vm = html && html.match(/data-video="([0-9a-f\-]{36})"/);
  if (!vm) {
    // 集页面拿不到 videoId (结构变更/付费墙): 嗅探兜底
    return { parse: 1, jx: 0, url: epUrl, header: { 'User-Agent': UA, 'Referer': REFERER } };
  }
  const videoId = vm[1];
  const pm = html.match(/data-price="([^"]*)"/);
  const price = pm ? pm[1] : '0';
  if (price !== '0') {
    // 付费集 (解锁制): 接口不发授权，交嗅探打开集页面走站方解锁流程
    return { parse: 1, jx: 0, url: epUrl, header: { 'User-Agent': UA, 'Referer': REFERER } };
  }
  // 2026-11-16：站方新加年龄确认门，播放链现为 age-check → bootstrap →
  // playback ?mode=hls，且 /media/ 下的 m3u8/分片必须同带三个 Cookie
  // （eden_age_v2、eden_account、eden_play_{videoId}）否则 403；
  // 播放器不转发 play 的 header，直链从根上播不了（已实测：无 Cookie
  // 的 m3u8/MP4 一律 403，javsb-relay 也取不到）。
  // 改走 youzidj-fetch Worker：Worker 在服务端走完三步取流、改写清单、
  // 分片代理（duanju91-fetch 同款），播放器只向 Worker 要流。
  // Worker 存活探针：根路径回版本字样才走 Worker，否则嗅探兜底
  // （Worker 未部署前行为与现在一致）。
  let workerOk = false;
  try {
    const probe = await req.get(YZ_FETCH + '/', { headers: { 'User-Agent': UA }, timeout: 5000 });
    const txt = probe && probe.data != null ? String(probe.data) : '';
    workerOk = txt.indexOf('youzidj fetch ok') >= 0;
  } catch (e) { workerOk = false; }
  if (!workerOk) {
    return { parse: 1, jx: 0, url: epUrl, header: { 'User-Agent': UA, 'Referer': REFERER } };
  }
  return {
    parse: 0,
    url: YZ_FETCH + '/play.m3u8?videoId=' + encodeURIComponent(videoId) + '&ep=' + encodeURIComponent(epUrl),
    header: { 'User-Agent': UA, 'Referer': epUrl },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page != null ? body.page : body.pg, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 30, total: 0, list: [] };
  if (page > 1) return { page, pagecount: 1, limit: 30, total: 0, list: [] }; // 站方搜索无分页
  const url = SITE + '/search/?q=' + encodeURIComponent(wd);
  const html = await getHtml(url);
  const list = html ? parseCards(html) : [];
  return { page: 1, pagecount: 1, limit: 30, total: list.length, list };
}

export default function createSpider() {
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
