// Avbebe — avbebe.com（H動畫/成人動畫/里番，WordPress JNews）
// 结构：分类 /archives/category/{slug}/，分页 /page/N/；列表为 JNews 文章块
// （标题 h3.jeg_post_title、封面 img data-src）；详情页 FV Player 的
// "sources":[{"src":"https://52cute.com/acg/{postId}/{nn}/video.m3u8"}]，
// 每 nn 一集（多集番按集出线，单集只出一线）；m3u8 为单码率 VOD，
// 须带 Referer（avbebe.com）才回 200，否则 403；分片为相对路径，播放器按
// m3u8 地址解析。搜索 /?s=<词>。本站为动画、无番号，不接字幕芯。
// 分類：馬賽克破解（LTX 相关）必须保留；華語AV/高清素人 的子分类做筛选卡片。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_avbebe';
const NAME = 'Avbebe';
const HOST = 'https://avbebe.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 顶级分类（slug 为站方 URL 编码后的形态，2026-11-28 实测）
const CLASSES = [
  { type_id: 'new', type_name: '新番' },
  { type_id: 'h%e5%8b%95%e7%95%ab%e5%bd%b1%e7%89%87', type_name: '動畫卡通' },
  { type_id: '3d%e5%8b%95%e7%95%ab', type_name: '3D動畫' },
  { type_id: '%e6%b3%a1%e9%ba%b5%e7%95%aa', type_name: '泡麵番' },
  { type_id: '%e6%88%90%e4%ba%bah%e6%bc%ab%e7%95%ab', type_name: '成人漫畫' },
  { type_id: '%e8%8f%af%e8%aa%9eav', type_name: '華語AV' },
  { type_id: '%e9%a6%ac%e8%b3%bd%e5%85%8b%e7%a0%b4%e8%a7%a3', type_name: '馬賽克破解' },
  { type_id: '%e9%ab%98%e6%b8%85%e4%b8%ad%e5%ad%97', type_name: '高清中字' },
  { type_id: '%e9%ab%98%e6%b8%85%e7%b4%a0%e4%ba%ba', type_name: '高清素人' },
];

// 子分类做筛选卡片（不平铺）：華語AV 下两子分类、高清素人 下一子分类
const FILTERS = {
  '%e8%8f%af%e8%aa%9eav': [
    { key: 'sub', name: '子分类', value: [
      { n: '華語AV-片商', v: '%e8%8f%af%e8%aa%9eav/%e8%8f%af%e8%aa%9eav-%e7%89%87%e5%95%86' },
      { n: '華語AV-素人', v: '%e8%8f%af%e8%aa%9eav/%e8%8f%af%e8%aa%9eav-%e7%b4%a0%e4%ba%ba' },
    ] },
  ],
  '%e9%ab%98%e6%b8%85%e7%b4%a0%e4%ba%ba': [
    { key: 'sub', name: '子分类', value: [
      { n: '絕美逸品', v: '%e9%ab%98%e6%b8%85%e7%b4%a0%e4%ba%ba/%e7%b5%95%e7%be%8e%e9%80%b8%e5%93%81' },
    ] },
  ],
};

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const b = base || HOST;
  return b + (u.startsWith('/') ? u : '/' + u);
}

async function getText(url, extraHeaders) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', ...(extraHeaders || {}) },
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    if (r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 列表：JNews 文章块。封面 img 在标题之前（同一文章块内），用正则一次抓
// 封面+链接+标题；data-src 为真图（data:image 占位图跳过）。
function parseCards(html) {
  const cards = [];
  if (!html) return cards;
  const seen = new Set();
  const re = /<img[^>]+data-src="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,3000}?<h3 class="jeg_post_title">\s*<a href="(https:\/\/avbebe\.com\/archives\/\d+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cover = m[1];
    const href = m[2];
    const title = cleanText(m[3]);
    if (!href || !title || seen.has(href)) continue;
    if (/^data:image/i.test(cover)) continue;
    seen.add(href);
    cards.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: '' });
  }
  // 兜底：只有标题无封面的，用 cheerio 补
  if (!cards.length) {
    const $ = cheerio.load(html);
    $('h3.jeg_post_title a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const title = cleanText($(a).text());
      if (!href || !title || seen.has(href)) return;
      seen.add(href);
      cards.push({ vod_id: href, vod_name: title, vod_pic: '', vod_remarks: '' });
    });
  }
  return cards;
}

function parsePagecount(html, curPage) {
  let max = curPage;
  if (html) {
    const re = /\/page\/(\d+)[\/'"]/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// 详情页 FV Player sources：站方现把配置写进 data-item 属性，JSON 经 HTML 实体编码
// （&quot; 代引号、\/ 代斜杠），地址是 /acg/watch/{id}/playlist.m3u8（单集）
// 或旧式 /acg/{id}/{nn}/video.m3u8（多集按 nn 分集）。先解码再匹配，两式兼容。
function extractSources(html) {
  const out = [];
  const seen = new Set();
  const norm = String(html || '').replace(/&quot;/g, '"').replace(/\\\//g, '/');
  const re = /"src"\s*:\s*"((?:https?:)?\/\/[^"]+?\.m3u8)"/g;
  let m;
  while ((m = re.exec(norm)) !== null) {
    let u = m[1];
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u) || seen.has(u)) continue;
    seen.add(u);
    const nn = (u.match(/\/acg\/\d+\/(\d+)\/video\.m3u8/) || [])[1] || '';
    out.push({ nn, url: u });
  }
  out.sort((a, b) => (parseInt(a.nn, 10) || 0) - (parseInt(b.nn, 10) || 0));
  return out;
}

async function init() {
  return {};
}

async function home() {
  const html = await getText(HOST + '/');
  return { class: CLASSES, filters: FILTERS, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || 'new').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  // 子分类筛选卡片：选中的卡片地址优先，未选走顶级分类
  const slug = (extend.sub && String(extend.sub).trim()) || id;
  const base = '/archives/category/' + String(slug).replace(/^\/+/, '').replace(/\/+$/, '');
  const url = page > 1 ? HOST + base + '/page/' + page + '/' : HOST + base + '/';
  const html = await getText(url);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (!id) return { list: [] };
  const durl = absUrl(id);
  const html = await getText(durl);
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  let name = cleanText($('meta[property="og:title"]').attr('content'))
    || cleanText($('title').text()).replace(/\s*[–-]\s*Avbebe.*$/i, '').trim();
  const pic = absUrl($('meta[property="og:image"]').attr('content')) || '';
  const srcs = extractSources(html);
  const eps = [];
  for (let i = 0; i < srcs.length; i++) {
    const s = srcs[i];
    const label = srcs.length > 1 ? ('第' + (parseInt(s.nn, 10) || (i + 1)) + '集') : '正片';
    eps.push(label + '$' + s.url);
  }
  const vod = {
    vod_id: durl,
    vod_name: name,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: eps.join('#'),
  };
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  // 52cute m3u8 须带 Referer（avbebe.com）才回 200，否则 403；分片为相对路径。
  return {
    parse: 0,
    url: id,
    header: {
      'User-Agent': UA,
      'Referer': HOST + '/',
      'Origin': HOST,
    },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
  const q = encodeURIComponent(wd);
  const url = page > 1 ? HOST + '/page/' + page + '/?s=' + q : HOST + '/?s=' + q;
  const html = await getText(url);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
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
