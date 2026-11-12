// PimpBunny (py_pimpbunny)
// 站点: https://pimpbunny.com（用户点名）/ 官方镜像 https://pimpbunny.net
// 站方状态 (2026-11-13 VM 实测):
//   - pimpbunny.com 首页/分类/视频直链一律 403 + 1861 字节 Bunny Shield
//     PoW 挑战页（data-pow，须浏览器解 PoW 才能过；机房出口被拦）。
//     首页 meta 自述 .net 为 "the official PimpBunny Net mirror"，
//     详情页视频地址即指向 pimpbunny.com/videos/...，故蜘蛛走 .net
//     镜像取 HTML（VM 下 200），与 .com 同源同内容。
//   - 详情页唯一播放源: <video id="wpst-video"> 内单条
//     <source src="https://pimpbunny.net/stream/video.mp4?v=<base64>">
//     （base64 解开即 https://pimpbunny.com/videos/<slug>/），单 MP4，
//     页内无多档、无 m3u8；下载按钮旁 "HD 1080p" 字样是外站广告
//     （rustydrawer.com），不是可验证的流清晰度，故只出一条"正片"，
//     不编 1080p/720p 档位。
//   - /stream/video.mp4 本身同样被 Bunny Shield 拦（VM 下 403 + 挑战页，
//     换桌面 UA / video Accept / Referer 均无效；此前探查的 4 个分片
//     样本全是 1861 字节挑战页）。即 VM 侧只能验到播放地址结构，
//     拉不到首分片字节；手机住宅出口是否过墙须真机定性（同 javrate
//     的 Bunny 墙先例：只拦机房出口、不拦手机）。
//   - 列表分页必须带 ?filter=latest：默认排序首页 30 条/页、翻页在边界
//     处重复 1-2 条（anal p1/p2、home p1/p2/p3 实测）；带 filter=latest
//     后一律 20 条/页，p1/p2 零重叠（anal、home、tag、search 实测）。
//   - 封面为站内 wp-content/uploads 真 JPEG（实测 200，444KB）。
// 分类呈现（用户 2026-11-13 长期规矩）：顶级分类 + 筛选卡片，不平铺。
//   - 分类：/categories/ 页实测 20 个（单页、无翻页），全量入卡。
//   - 标签：站内 1652 个（/tags/ 页），取 219 部抽样中频次最高的
//     41 个（已剔除与分类重复的 slug 与 onlyfans-*/private-sex-tape
//     等无区分度通用标签）；显示名由 slug 还原。
//   - 模特：站内 /actors/ 93 页，取 219 部抽样中频次最高的 29 个
//     （harness 验出 Bougie 无演员页、已剔除；其余 29 个均有量）。
//   - 演员页规范地址为 /actor/<slug>/（/?actors=<slug> 会 301 到它）。
// 字幕：无番号，不接字幕芯。219 部抽样标题（首页/分类/搜索/标签/
//   演员）用 JAV 番号正则全扫为 0 命中——本站是 OnlyFans 泄露站，
//   标题为英文描述，无番号形态；按用户 2026-11-04 口径"无番号不接"。
//   （主线 sextb.js 的尾码优先 subLangOf 已实读核对，与存档一致，
//   但本站无码可查，接芯只会给每次点播加最多 6s 空搜，故不接。）
import req from '../../util/req.js';

const KEY = 'py_pimpbunny';
const NAME = 'PimpBunny';
const SITE = 'https://pimpbunny.net';
const COM = 'https://pimpbunny.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 20;

// 分类卡片：/categories/ 页实测 20 个（2026-11-13）。
const CAT_CARDS = [
  { n: '4K', v: '4k' },
  { n: 'Anal', v: 'anal' },
  { n: 'Asian', v: 'asian' },
  { n: 'BBC', v: 'bbc' },
  { n: 'BDSM', v: 'bdsm' },
  { n: 'Big Ass', v: 'big-ass' },
  { n: 'Big Boobs', v: 'big-boobs' },
  { n: 'Bizarre', v: 'bizarre' },
  { n: 'Blowjob', v: 'blowjob' },
  { n: 'Bunnies', v: 'bunnies' },
  { n: 'Cosplay', v: 'cosplay' },
  { n: 'Cosplayer', v: 'cosplayer' },
  { n: 'Deep Throat', v: 'deep-throat' },
  { n: 'Double Penetration', v: 'double-penetration' },
  { n: 'Exclusive', v: 'exclusive' },
  { n: 'Feet', v: 'feet' },
  { n: 'Fetish', v: 'fetish' },
  { n: 'Japanese', v: 'japanese' },
  { n: 'Latina', v: 'latina' },
  { n: 'Lesbian', v: 'lesbian' },
];

// 标签卡片：219 部抽样中频次最高的 40 个（已剔除与分类重复及通用标签）。
const TAG_CARDS = [
  { n: 'Doggy Style', v: 'doggy-style' },
  { n: 'Tattoos', v: 'tattoos' },
  { n: 'Ass', v: 'ass' },
  { n: 'POV Blowjob', v: 'pov-blowjob' },
  { n: 'Missionary', v: 'missionary' },
  { n: 'Pussy Play', v: 'pussy-play' },
  { n: 'Pussy Rubbing', v: 'pussy-rubbing' },
  { n: 'Cute', v: 'cute' },
  { n: 'Natural Body', v: 'natural-body' },
  { n: 'Dildo Riding', v: 'dildo-riding' },
  { n: 'Solo Masturbation', v: 'solo-masturbation' },
  { n: 'Brunette', v: 'brunette' },
  { n: 'Natural Tits', v: 'natural-tits' },
  { n: 'Anal Dildoing', v: 'anal-dildoing' },
  { n: 'Butt Plug', v: 'butt-plug' },
  { n: 'Big Tits', v: 'big-tits' },
  { n: 'Anal Creampie', v: 'anal-creampie' },
  { n: 'Solo Dildo', v: 'solo-dildo' },
  { n: 'BWC', v: 'bwc' },
  { n: 'Cowgirl', v: 'cowgirl' },
  { n: 'Anal Play', v: 'anal-play' },
  { n: 'Blonde', v: 'blonde' },
  { n: 'Solo Girl', v: 'solo-girl' },
  { n: 'Reverse Cowgirl', v: 'reverse-cowgirl' },
  { n: 'Shaved Pussy', v: 'shaved-pussy' },
  { n: 'Fingering', v: 'fingering' },
  { n: 'Amateur', v: 'amateur' },
  { n: 'Anal Plug', v: 'anal-plug' },
  { n: 'POV Anal', v: 'pov-anal' },
  { n: 'Pink Pussy', v: 'pink-pussy' },
  { n: 'Cumshot', v: 'cumshot' },
  { n: 'Petite', v: 'petite' },
  { n: 'Big Lips', v: 'big-lips' },
  { n: 'Small Tits', v: 'small-tits' },
  { n: 'Big Pussy', v: 'big-pussy' },
  { n: 'Dick Riding', v: 'dick-riding' },
  { n: 'Anal Masturbation', v: 'anal-masturbation' },
  { n: 'Cum', v: 'cum' },
  { n: 'Side Fuck', v: 'side-fuck' },
  { n: 'Big Cock', v: 'big-cock' },
  { n: 'Anal Solo', v: 'anal-solo' },
];

// 模特卡片：219 部抽样中频次最高的 30 个；显示名为 slug 还原。
const ACTOR_CARDS = [
  { n: 'Abbie Sykes', v: 'abbie-sykes' },
  { n: 'Missslily', v: 'missslily' },
  { n: 'Dredd', v: 'dredd' },
  { n: 'Anna Ralphs', v: 'anna-ralphs' },
  { n: 'Devon Jenelle', v: 'devon-jenelle' },
  { n: 'Rusitaok', v: 'rusitaok' },
  { n: 'Angela White', v: 'angela-white' },
  { n: 'Daria Angel', v: 'daria-angel' },
  { n: 'Vivienne Vo', v: 'vivienne-vo' },
  { n: 'Kwini Kim', v: 'kwini-kim' },
  { n: 'PanteraNika', v: 'panteranika' },
  { n: 'Little Tina', v: 'little-tina' },
  { n: 'Skylar Vox', v: 'skylar-vox' },
  { n: 'Aluraye', v: 'aluraye' },
  { n: 'Lola Rose', v: 'lola-rose' },
  { n: 'Myelliqueen', v: 'myelliqueen' },
  { n: 'Purple Bitch', v: 'purple-bitch' },
  { n: 'Taylor Banks', v: 'taylor-banks' },
  { n: 'Cherry Apricot', v: 'cherry-apricot' },
  { n: 'Eden Ivy', v: 'eden-ivy' },
  { n: 'Lulu Wild', v: 'lulu-wild' },
  { n: 'Agatha Vega', v: 'agatha-vega' },
  { n: 'Lilwaifulia', v: 'lilwaifulia' },
  { n: 'Madiiitay', v: 'madiiitay' },
  { n: 'Elle Brooke', v: 'elle-brooke' },
  { n: 'Xxxmilamonet', v: 'xxxmilamonet' },
  { n: 'Poetryandcherry', v: 'poetryandcherry' },
  { n: 'Eimi Girl', v: 'eimi-girl' },
  { n: 'Gabbie Carter', v: 'gabbie-carter' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return SITE + u;
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + '/' + u;
}

// Bunny Shield 挑战页：1861 字节 "Establishing a secure connection"。
function isShield(html) {
  if (!html || typeof html !== 'string') return true;
  if (html.length < 2000) return true;
  if (html.indexOf('bunny-shield') >= 0) return true;
  if (/Establishing a secure connection/i.test(html.slice(0, 3000))) return true;
  return false;
}

async function getText(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: timeoutMs || 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt || isShield(txt)) return '';
    return txt;
  } catch (e) {
    return '';
  }
}

// 列表卡片：<article class="thumb-block ...">...</article>
//   <a href="<详情 URL>" title="<标题>">
//   <img src="<封面>"> ... <span class="duration">MM:SS</span>
// 只取主循环 article，忽略导航/侧栏/页脚链接。
function parseList(html) {
  const list = [];
  if (!html) return list;
  const re = /<article[^>]*class="thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const seg = m[1];
    const href = seg.match(/<a\s+href="([^"]+)"/);
    const title = seg.match(/<span\s+class="title">([^<]+)<\/span>/);
    if (!href || !title) continue;
    const id = fixUrl(href[1]);
    const name = clean(title[1]);
    if (!id || !name) continue;
    const img = seg.match(/<img[^>]*src="([^"]+)"/);
    const dur = seg.match(/class="duration"[^>]*>([^<]+)</);
    list.push({
      vod_id: id,
      vod_name: name,
      vod_pic: img ? fixUrl(img[1]) : '',
      vod_remarks: dur ? t(dur[1]) : '',
    });
  }
  return list;
}

// 页数：取分页区 /page/N/ 的最大值（Last 链接或数字链接均可）；
// 无分页链接时：满页则未知（page+1），不满页即最后一页。
function parsePagecount(html, page, listLen) {
  let max = 0;
  if (html) {
    const re = /\/page\/(\d+)\//g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  if (max >= page) return max;
  return listLen >= PAGE_SIZE ? page + 1 : page;
}

function listResult(html, page) {
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html, page, list.length),
    limit: list.length || PAGE_SIZE,
    total: 0,
    list,
  };
}

function listUrl(base, page) {
  if (page <= 1) return base + '?filter=latest';
  return base + 'page/' + page + '/?filter=latest';
}

function isoDurToStr(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const d = parseInt(m[1] || '0', 10);
  const h = parseInt(m[2] || '0', 10) + d * 24;
  const mi = parseInt(m[3] || '0', 10);
  const s = parseInt(m[4] || '0', 10);
  const total = h * 3600 + mi * 60 + s;
  if (total <= 0) return '';
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const mms = hh > 0 ? String(mm).padStart(2, '0') : String(mm);
  const sss = String(ss).padStart(2, '0');
  return hh > 0 ? hh + ':' + mms + ':' + sss : mms + ':' + sss;
}

async function init() {
  return {};
}

async function home() {
  return {
    class: [
      { type_id: 'latest', type_name: '最新' },
      { type_id: 'cats', type_name: '分类' },
      { type_id: 'tags', type_name: '标签' },
      { type_id: 'actors', type_name: '模特' },
    ],
    filters: {
      cats: [{ key: 'sub', name: '分类', value: CAT_CARDS }],
      tags: [{ key: 'sub', name: '标签', value: TAG_CARDS }],
      actors: [{ key: 'sub', name: '模特', value: ACTOR_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  let base = '';
  if (id === 'latest') base = SITE + '/';
  else if (id === 'cats') base = SITE + '/' + (sub || CAT_CARDS[0].v) + '/';
  else if (id === 'tags') base = SITE + '/tag/' + (sub || TAG_CARDS[0].v) + '/';
  else if (id === 'actors') base = SITE + '/actor/' + (sub || ACTOR_CARDS[0].v) + '/';
  else return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const html = await getText(listUrl(base, page));
  return listResult(html, page);
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const id = t(raw);
  if (!id) return { list: [] };
  const url = /^https?:\/\//i.test(id) ? id : SITE + '/' + id.replace(/^\/+/, '') + '/';
  const html = await getText(url);
  if (!html) return { list: [] };
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name = h1 ? clean(h1[1]) : '';
  if (!name) return { list: [] };
  // 唯一播放源：<source src="https://pimpbunny.net/stream/video.mp4?v=...">
  const src = html.match(/<source[^>]*src="([^"]+stream\/video\.mp4[^"]*)"/)
    || html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/);
  if (!src) return { list: [] };
  const stream = fixUrl(src[1]);
  const poster = html.match(/<video[^>]*poster="([^"]+)"/)
    || html.match(/property="og:image"\s+content="([^"]+)"/);
  const durMeta = html.match(/itemprop="duration"\s+content="([^"]+)"/);
  const desc = html.match(/<meta\s+itemprop="description"\s+content="([^"]+)"/);
  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: poster ? fixUrl(poster[1]) : '',
      vod_content: desc ? clean(desc[1]).slice(0, 200) : '',
      vod_remarks: durMeta ? isoDurToStr(durMeta[1]) : '',
      vod_play_from: NAME,
      vod_play_url: '正片$' + stream,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  if (!/^https?:\/\//i.test(id)) return { parse: 0, url: '' };
  // 单 MP4 直链（/stream/video.mp4?v=<base64>，站方代理回源 .com）。
  // 注意：该地址在机房出口会被 Bunny Shield 拦（VM 实测 403），
  // 手机住宅出口是否过墙须真机定性；此处只返地址，不做嗅探。
  return {
    parse: 0,
    url: id,
    header: { 'User-Agent': UA, 'Referer': SITE + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const q = encodeURIComponent(wd);
  const url = page <= 1 ? SITE + '/?s=' + q : SITE + '/page/' + page + '/?s=' + q;
  const html = await getText(url);
  // 无命中时站方仍会渲染 20 条推荐视频（与主循环同形），须以计数为准：
  // <span class="search-video-number">0 video found</span> 即空结果。
  if (html && /search-video-number">\s*0\s+video/i.test(html)) {
    return { page, pagecount: page, limit: 0, total: 0, list: [] };
  }
  const res = listResult(html, page);
  const totalM = html && html.match(/search-video-number">\s*([\d,]+)\s+videos?\s+found/i);
  if (totalM) {
    const total = parseInt(totalM[1].replace(/,/g, ''), 10) || 0;
    res.total = total;
    res.pagecount = Math.max(page, Math.ceil(total / PAGE_SIZE));
  }
  return res;
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
