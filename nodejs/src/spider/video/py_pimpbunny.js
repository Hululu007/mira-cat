// PimpBunny (py_pimpbunny)
// 站点: https://pimpbunny.com（用户点名）/ 官方镜像 https://pimpbunny.net
// 站方状态 (2026-11-13 VM 实测):
//   - pimpbunny.com 首页/分类/视频直链一律 403 + 1861 字节 Bunny Shield
//     PoW 挑战页（data-pow，须浏览器解 PoW 才能过；机房出口被拦）。
//     首页 meta 自述 .net 为 "the official PimpBunny Net mirror"，
//     详情页视频地址即指向 pimpbunny.com/videos/...，故蜘蛛走 .net
//     镜像取 HTML（VM 下 200），与 .com 同源同内容。
//   - 详情页唯一播放源: <video id="wpst-video"> 内单条或多条
//     <source src="https://pimpbunny.net/stream/...">
//     （两种 URL 形态：旧式 /stream/video.mp4?v=<base64>，新式
//     /stream/<base64>.mp4；base64 解开即
//     https://pimpbunny.com/videos/<slug>/）。
//     页内无 m3u8。下载按钮旁 "HD 1080p" 字样是外站广告
//     （rustydrawer.com），不是可验证的流清晰度。
//   - 档位核查（2026-11-13 实测，不编档位）：部分详情页（如 Kwini Kim）
//     有 4 条 <source>，label 分别为 1080p/720p/480p/360p，但 4 条
//     src 字节完全相同——站内"四档菜单"是同一 URL 的重复 label。
//     站源（.com 视频页，经 jina 诊断取文本）每部只有 1 个真实文件：
//     Abbie、Kwini 抽样均为单个 <hash>_720p.mp4（get_file 直链，
//     带 v-acctoken + rnd 参数）。故本站无真实多档可出：详情只给
//     一条"正片"，不把 1 条流展开成 4 档假菜单。
//   - /stream/video.mp4 本身同样被 Bunny Shield 拦（VM 下 403 +
//     挑战页，换桌面 UA / video Accept / Referer=详情页 / Range /
//     Sec-Fetch-Dest: video / 带详情页 cookie 均无效；新式
//     /stream/<b64>.mp4 同样 403；.com 的 get_file 直链即使带
//     新鲜 v-acctoken，VM 下同样 403 0 字节——机房出口被拦与
//     token 无关）。即 VM 侧只能验到播放地址结构，拉不到首分片
//     字节；手机住宅出口是否过墙须真机定性（同 javrate
//     的 Bunny 墙先例：只拦机房出口、不拦手机）。
//   - 断点定位（2026-11-13，用户手机 Safari 站内自带播放能播，
//     App 内点播失败）：详情页 HTML 本身不走 Shield（VM 下 200，
//     页内无 shield 脚本、无 Set-Cookie），断点不在取页；断在播
//     放请求一步——Safari 以浏览器身份（Safari UA + Referer=详情
//     页 + Sec-Fetch-Dest: video + 浏览器 TLS 指纹）请求 /stream
//     能过，而 App 把裸 URL 交给原生播放器时请求上下文不同
//     （播放器自带 UA / 可能丢 Referer / 302 跳到 .com get_file
//     时头丢失），被 Shield 拦。蜘蛛侧修法（本文件 v2）：
//     ① play() 先用 HEAD（6s，maxRedirects:0）探 /stream 是否
//     302 到最终 get_file 直链，拿到就把最终地址 + Safari UA +
//     Referer=详情页直接交给播放器（与 Safari 跳转后的请求等价，
//     不再经过会丢头的跳转）；② 探不到（挑战页/超时/非 3xx）
//     则退回 parse:1，把详情页交给播放器嗅探（manko Upload18
//     同款做法），由 App 内浏览器环境复现 Safari 站内播放。
//     不解 PoW、不伪造凭证、不拿用户 cookie。
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
  // 播放源：<video id="wpst-video"> 块内全部 <source>；多档页的 4 条
  // label（1080p/720p/480p/360p）src 字节相同，去重后只剩 1 条
  // 真实流（见文件头档位核查），故只出一条"正片"，不编假档位。
  // 集串同时带详情页与直链，供 play() 先解析、后嗅探。
  const vBlock = html.match(/<video[^>]*id="wpst-video"[^>]*>([\s\S]*?)<\/video>/)
    || html.match(/<video[^>]*>([\s\S]*?)<\/video>/);
  const srcs = [];
  if (vBlock) {
    const re = /<source[^>]*src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(vBlock[1])) !== null) {
      const u = fixUrl(m[1]);
      if (u && srcs.indexOf(u) < 0) srcs.push(u);
    }
  }
  let stream = srcs[0] || '';
  if (!stream) {
    const src = html.match(/<source[^>]*src="([^"]+stream\/video\.mp4[^"]*)"/)
      || html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/);
    if (src) stream = fixUrl(src[1]);
  }
  if (!stream) return { list: [] };
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
      vod_play_url: '正片$pbplay:' + url + '|' + stream,
    }],
  };
}

// /stream 是代理：站内播放时它应 302 到 .com get_file 真实文件。
// 用 HEAD（不拉 body）+ maxRedirects:0 只读跳转目标；拿到最终地址
// 就交给播放器直连（等价于 Safari 跳转后的那次请求，不再经过会
// 丢头的跳转）。任何失败（挑战页/超时/非 3xx/无 Location）都返回
// ''，由 play() 退回 parse:1 嗅探线。本地已验：axios 1.6.7
// maxRedirects:0 + validateStatus 恒真时 302 响应可正常返回，
// headers.location 完整。
async function resolveFinal(stream, referer) {
  try {
    const r = await req.head(stream, {
      headers: { 'User-Agent': UA, 'Referer': referer || SITE + '/' },
      timeout: 6000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const loc = r && r.headers && (r.headers.location || r.headers.Location);
    if (r && r.status >= 300 && r.status < 400 && loc) {
      const u = new URL(String(loc), stream).href;
      if (/^https?:\/\//i.test(u)) return u;
    }
  } catch (e) { /* 解析失败即退回嗅探线 */ }
  return '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  // 新式集串：pbplay:<详情页>|<直链>
  if (id.indexOf('pbplay:') === 0) {
    const rest = id.slice('pbplay:'.length);
    const bar = rest.indexOf('|');
    const detailUrl = bar >= 0 ? rest.slice(0, bar) : rest;
    const stream = bar >= 0 ? rest.slice(bar + 1) : '';
    // 腿 1：解析出最终文件地址，直接交给播放器（Safari UA +
    // Referer=详情页，与 Safari 跳转后的请求等价）。
    if (stream) {
      const final = await resolveFinal(stream, detailUrl);
      if (final) {
        return {
          parse: 0,
          url: final,
          header: { 'User-Agent': UA, 'Referer': detailUrl },
        };
      }
    }
    // 腿 2：解析不到（挑战页/超时）→ 把详情页交给播放器嗅探，
    // 由 App 内浏览器环境复现 Safari 站内播放（manko Upload18
    // 同款 parse:1 做法；不解 PoW、不伪造凭证）。
    if (detailUrl) {
      return {
        parse: 1,
        url: detailUrl,
        header: { 'User-Agent': UA, 'Referer': SITE + '/' },
      };
    }
    return { parse: 0, url: '' };
  }
  // 旧缓存集串：裸 /stream 直链 → 老行为原样直出。
  if (/^https?:\/\//i.test(id) && /\/stream\//i.test(id)) {
    return {
      parse: 0,
      url: id,
      header: { 'User-Agent': UA, 'Referer': SITE + '/' },
    };
  }
  // 裸详情页 → 嗅探线。
  if (/^https?:\/\/pimpbunny\.net\//i.test(id)) {
    return {
      parse: 1,
      url: id,
      header: { 'User-Agent': UA, 'Referer': SITE + '/' },
    };
  }
  return { parse: 0, url: '' };
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
