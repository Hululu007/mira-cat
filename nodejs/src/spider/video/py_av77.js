// AV77 (https://av77.com) -> CatPawOpen spider
// 免費高清日本 AV 在線看，站方自稱十萬部以上、每日更新；VM 直连 200、无墙无登录墙。
// 列表：服务端渲染，每页 24 条，翻页 ?page=N（p1/p2 实测 0 重叠）；卡片在
//   <div class="item-wrapper"> 里：<a href="/<slug>"> + <img data-src/src 封面>
//   + 时长 span + 标题锚（class 含 text-secondary，属性间可含换行）。
//   封面走站方图床代理（ig2.pppppppp.top / kimg.pppppppp.top / 直链），实测 200 JPEG。
// 分类：站内导航三组下拉（日本AV/素人/無碼影片/亞洲AV）+ 顶部平铺项；
//   類型 /genres 页实测 37 个（站内顺序）；/release 为 JS 加载、无服务端列表，
//   已剔除；/today-hot 404，已剔除；其余 14 个顶级分类均逐个实测有内容。
// 详情：标题/封面/简介取 og:*（属性值含 &#x2F; 等实体，需 decodeHtml）。
// 播放源（详情页内联 Dean Edwards packer 两种方言，见 unpackAll）：
//   1. surrit.com/<uuid>/playlist.m3u8（MissAV 系 CDN）：主播单含 360p/480p/720p
//      三档（FC2 类片为 640x360/842x480 两档）；直连 surrit 回 Cloudflare 403，
//      必须走站方自带代理 https://pl3.vvvvvvvv.top/api/play?url=<原地址>（与站内
//      JS 行为一致；pl3 偶发 500 "curl exit 6"，master 取数重试一次；
//      无 Referer 也 200；变体地址已由 pl3 改写、含 &r=missav.ws）。
//      详情出线按主播单实测档位逐档出（720p/480p/360p），绝不硬编。
//   2. player.xxnet999.com/.../index.m3u8（时间工作室类）：媒体播单（AES-128、
//      相对 .ts），站内直播不包代理，单线“原画”直出；smil playlist.m3u8
//      （kinostream 类，token+expires 签名）是主播单，含 5 档纯码率变体
//      （4M/3M/2M/800k/400k，无 RESOLUTION），同样单线“原画”直出主播单、
//      由播放器自适应，不按码率猜分辨率。
//   3. v6.slv525627.com / krevonix.com/.../index.m3u8（动漫类）：主播单单变体
//      720p，走 pl3 改写后出线（直连亦 200，但站内行为是包 pl3，照站内走）。
//   4. 无 packer 的条目（马赛姆/猎奇类）：详情页下载按钮给直链 MP4：
//      xxnet999 签名 1080p mp4（node fetch 实测 206 video/mp4；curl 空回
//      复，系 VM curl 栈问题）、pl2 包 stream.defeated.xxx fullhd mp4
//      （VM 侧直连与 pl2 均 403，上游 Forbidden，设备侧待定性；仍按站内
//      链接原样出线，不编造）。
//   分片为 .jpeg 后缀伪装（MissAV 同款，播单内即如此，播放器按 URL 取段）。
// 字幕：片名带番号（ALDN-452 / JUQ-779 / FC2-PPV-1210450 / SIRO-4971…）
//   一律接 sextb.js 同款字幕芯（整块照抄，仅 subSlugTitle 按本站 /<slug>
//   适配）；detail 里 subRegister 登记 + subWarm 预热，play 里并行
//   subSearchAll，有命中才挂 subs。
// 复核 (2026-11-13, 另一工人独立重测后改动):
//   - 站 alive (curl 200, 前任 "curl 000" 系 VM 出口瞬断); /today-hot 等 404、
//     /release 无服务端列表, 与原注一致。
//   - 猎奇 PLANTSVSCUNTS-690 packer 直接给 MP4 (f/mp4 变量 = pl2 包的 .mp4):
//     原版会把 MP4 当 m3u8 取主播单再二次包 pl3, 已改 MP4 直出原链接。
//     该 pl2 MP4 VM 侧 403 (上游 Forbidden, 设备侧待定性); 马赛姆 MP4
//     (xxnet999 签名 1080p) VM 侧 200 video/mp4 23MB, 但服务器忽略 Range
//     (回 200 全量而非 206, harness 的 mp4 206 校验不适用, 以 curl 实测为准)。
//   - 字幕键对齐: 出线附 @详情 URL, play 剥离后用裸详情 URL 查字幕
//     (原版 warm 用 durl、play 用播单地址, 预热永不命中)。
//   - 页数改取页面 "/ N" 实值 (原版 page+1 恒虚高); home 补列表;
//     显示名按任务要求暂用 Av77。
//   - 2026-11-13 live harness 首轮 7 错后的再修: ① unpack 正则尾部误要求
//     `.split('|')))`，而站内实际是 `.split('|'),0,{}`，packer 永不命中、
//     详情出线全空，已去掉尾部 `))` 要求；② parseList 按 thumbnail div
//     切块（首页卡片无 item-wrapper），并只认字面 <a href= 与 http(s)
//     封面，Alpine 模板块（:href/:data-src JS 表达式、data: 占位图）不
//     再漏进首页列表（home 离线 116 条全为真卡）；③ GANA 剔除（见上）。
//     备注: /siro p1/p2 有 1 条非边界重叠（siro-3315，p1 第 12 条、p2
//     第 11 条），站内排序本身不稳定，非蜘蛛问题。
//   - 2026-11-12 20:48-20:52 UTC 站方侧异动: /vr 连取 5 次均返回某 VR
//     详情页整页（HTTP 200，CF 缓存 max-age=1800），而 20:40 harness
//     运行时 /vr 还是正常列表（24/24，首条 WPVR-112）；/new、/anime、
//     /siro 同期正常。系站方 /vr 路由/边缘缓存故障，非蜘蛛问题；该详情
//     页经 parseList 得 0 条（仅模板块，已排除）。另 /uncensored-leak
//     页内 24 卡有 3 条重复（21 唯一），故 p1=21/p2=22 是站内重复卡片
//     而非解析漏。猎奇 MP4 按文件而异：PVC13 经 pl2 Range 206 通，
//     PLANTSVSCUNTS-690 的 FRZAPerfectCopy-hd.mp4 探查时直连/pl2 均 403。
import req from '../../util/req.js';

const KEY = 'py_av77';
const NAME = 'Av77';
const HOST = 'https://av77.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 站方自带播单代理（站内 JS 同款拼接方式：原地址直接拼在 ?url= 后，不编码）
const PL3 = 'https://pl3.vvvvvvvv.top/api/play?url=';
const PAGE_SIZE = 24;

// 類型（/genres 页站内顺序，37 个，2026-11-13 实测）
const GENRE_CARDS = [
  { n: '外国女优', v: '外国女优' }, { n: '独家', v: '独家' }, { n: '中出', v: '中出' },
  { n: '单体作品', v: '单体作品' }, { n: '巨乳', v: '巨乳' }, { n: '人妻', v: '人妻' },
  { n: '熟女', v: '熟女' }, { n: '素人', v: '素人' }, { n: '美少女', v: '美少女' },
  { n: '口交', v: '口交' }, { n: '薄格', v: '薄格' }, { n: '多人运动', v: '多人运动' },
  { n: '骑乘', v: '骑乘' }, { n: '痴女', v: '痴女' }, { n: '4小时以上', v: '4小时以上' },
  { n: '女高中生', v: '女高中生' }, { n: '潮吹', v: '潮吹' }, { n: '合集', v: '合集' },
  { n: '自拍', v: '自拍' }, { n: '乳交', v: '乳交' }, { n: '苗条', v: '苗条' },
  { n: '恋物癖', v: '恋物癖' }, { n: '企划', v: '企划' }, { n: '美乳', v: '美乳' },
  { n: '乱伦', v: '乱伦' }, { n: '搭讪', v: '搭讪' }, { n: 'NTR', v: 'NTR' },
  { n: '偷拍', v: '偷拍' }, { n: '颜射', v: '颜射' }, { n: '淫乱', v: '淫乱' },
  { n: '自慰', v: '自慰' }, { n: '剧情', v: '剧情' }, { n: '手淫', v: '手淫' },
  { n: '姐姐', v: '姐姐' }, { n: '羞辱', v: '羞辱' }, { n: '拘束', v: '拘束' },
  { n: '纪录片', v: '纪录片' },
];
// 無碼影片（站内导航顺序，14 个）
const UNCENSORED_CARDS = [
  { n: '無碼流出', v: 'uncensored-leak' }, { n: 'FC2', v: 'fc2' }, { n: 'HEYZO', v: 'heyzo' },
  { n: '東京熱', v: 'tokyohot' }, { n: '一本道', v: '1pondo' }, { n: 'Caribbeancom', v: 'caribbeancom' },
  { n: 'Caribbeancompr', v: 'caribbeancompr' }, { n: '10musume', v: '10musume' },
  { n: 'pacopacomama', v: 'pacopacomama' }, { n: 'Gachinco', v: 'gachinco' },
  { n: 'XXX-AV', v: 'xxxav' }, { n: '人妻斬', v: 'marriedslash' },
  { n: '頑皮 4610', v: 'naughty4610' }, { n: '頑皮 0930', v: 'naughty0930' },
];
// 素人（站内导航顺序，5 个；GANA /gana 实测 200 但零卡片、站内显示“没有找到”，已剔除）
const AMATEUR_CARDS = [
  { n: 'SIRO', v: 'siro' }, { n: 'LUXU', v: 'luxu' },
  { n: 'PRESTIGE PREMIUM', v: 'maan' }, { n: 'S-CUTE', v: 'scute' }, { n: 'ARA', v: 'ara' },
];
// 亞洲AV（站内导航顺序，11 个）
const ASIAN_CARDS = [
  { n: '麻豆傳媒', v: 'madou' }, { n: 'TWAV', v: 'twav' }, { n: 'Furuke', v: 'furuke' },
  { n: '韓國直播', v: 'klive' }, { n: '中國直播', v: 'clive' }, { n: '抖阴视频', v: 'tiktok' },
  { n: '明星换脸', v: 'starface' }, { n: '主播直播', v: 'cnlive' }, { n: '国产传媒', v: 'cmedia' },
  { n: '玩偶姐姐', v: 'playgirl' }, { n: '网-曝-门', v: 'netdoor' },
];

const CLASSES = [
  { type_id: 'new', type_name: '最近更新' },
  { type_id: 'chinese-subtitle', type_name: '中文字幕' },
  { type_id: 'genres', type_name: '類型' },
  { type_id: 'uncensored', type_name: '無碼影片' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'asian', type_name: '亞洲AV' },
  { type_id: 'madou', type_name: '国产AV' },
  { type_id: 'kinostream', type_name: 'kinostream' },
  { type_id: 'timestudio', type_name: '时间工作室' },
  { type_id: 'anime', type_name: '成人动漫' },
  { type_id: 'vr', type_name: 'VR' },
  { type_id: 'avtalk', type_name: 'AV解说' },
  { type_id: 'masem', type_name: '马赛姆' },
  { type_id: 'plantsvscunts', type_name: '猎奇' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
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

// 取页：强制拿原始文本（responseType:'text' + 恒等 transform，防 axios 自动解析）。
async function getHtml(url, extraHeaders, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: Object.assign(headers(), extraHeaders || {}),
      timeout: timeoutMs || 20000, responseType: 'text', transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

function pl3wrap(u) {
  return PL3 + u;
}

// ---------- Dean Edwards packer 反混淆（无 eval，纯字符串替换） ----------
// 站内两种方言：
//   v1：eval(function(p,a,c,k,e,d){while(c--)...}('PAYLOAD',BASE,COUNT,'k...'.split('|')))
//   v2：eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};...}("PAYLOAD",BASE,COUNT,'k...'.split('|'))
// 解开后是 source/source842/source1280 或 f/d/b 三变量赋值（见文件头）。
function unpackDeanEdwards(html) {
  const out = [];
  const pats = [
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'\\])*)',(\d+),(\d+),'((?:\\.|[^'\\])*)'\.split\('\|'\)/g,
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\("((?:\\.|[^"\\])*)",(\d+),(\d+),['"]((?:\\.|[^'"\\])*)['"]\.split\(['"]\|['"]\)/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(html))) {
      let p = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const a = parseInt(m[2], 10);
      const k = m[4].split('|');
      let c = parseInt(m[3], 10);
      while (c--) {
        if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
      }
      out.push(p);
    }
  }
  return out;
}

// 从解开的 packer 代码里取播放源三变量（source 系优先，f/d/b 为回退变量）。
function extractPackedSources(html) {
  const vars = {};
  for (const code of unpackDeanEdwards(html)) {
    const re = /([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(code))) {
      if (/^https?:\/\//i.test(m[2])) vars[m[1]] = m[2];
    }
  }
  return {
    master: vars.source || vars.f || '',
    v842: vars.source842 || vars.d || '',
    v1280: vars.source1280 || vars.b || '',
  };
}

// 无 packer 条目的下载按钮直链 MP4（<a href="...mp4">；preview.mp4 与
// DPlayer 缩略图 sprite 不在 <a> 里，不会误取）。
function extractDownloadMp4s(html) {
  const out = [];
  const seen = new Set();
  const dec = decodeHtml(html);
  const re = /<a[^>]+href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*>/gi;
  let m;
  while ((m = re.exec(dec))) {
    const u = m[1].replace(/&amp;/g, '&');
    if (/preview\.mp4/i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function mp4Label(u) {
  const m = String(u).match(/\/(\d{3,4})p\.mp4/i);
  if (m) return m[1] + 'p';
  if (/fullhd/i.test(u)) return '1080p';
  return '原画';
}

// 变体地址里取档位（如 /720p/、/1280x720/、/842x480/）。
function variantLabelFromPath(u) {
  let m = String(u).match(/\/(\d{3,4})p\//i);
  if (m) return m[1] + 'p';
  m = String(u).match(/\/(\d{3,4})x(\d{3,4})\//i);
  if (m) return Math.min(parseInt(m[1], 10), parseInt(m[2], 10)) + 'p';
  return '原画';
}

// 主播单解析：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行是变体地址；
// 无 RESOLUTION 时按 BANDWIDTH 不猜档位、返回空（调用方单线兜底）。
function parseMaster(text, base) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const inf = /#EXT-X-STREAM-INF:([^\n]*)/.exec(lines[i]);
    if (!inf) continue;
    let j = i + 1, uri = '';
    while (j < lines.length) {
      const s = t(lines[j]);
      if (s && s.charAt(0) !== '#') { uri = s; break; }
      j++;
    }
    if (!uri) continue;
    const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
    if (!rm) continue;
    const label = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10)) + 'p';
    if (seen.has(label)) continue;
    seen.add(label);
    let abs = uri;
    if (!/^https?:\/\//i.test(uri)) {
      const b = base.replace(/\/[^\/]*$/, '/');
      abs = b + uri.replace(/^\//, '');
    }
    out.push({ label, url: abs });
  }
  out.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  return out;
}

// 取主播单（走 pl3 代理；pl3 偶发 500，重试一次）。
async function fetchMasterVariants(master, durl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const txt = await getHtml(pl3wrap(master), { Referer: durl }, 20000);
    if (txt && txt.indexOf('#EXTM3U') >= 0) return parseMaster(txt, master);
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

function parsePagecount(html, page) {
  if (!html) return page;
  const m = html.match(/id="price-currency">\s*\/\s*([\d,]+)/);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (n > 0) return Math.max(n, page);
  }
  const m2 = html.match(/totalPages:\s*(\d+)/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n > 0) return Math.max(n, page);
  }
  const nums = [...html.matchAll(/[?&]page=(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => n > 0 && n < 1000000);
  return nums.length ? Math.max(...nums, page) : page;
}

function listUrl(id, sub, page) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  let base = '';
  if (id === 'new') base = '/new';
  else if (id === 'chinese-subtitle') base = '/chinese-subtitle';
  else if (id === 'madou') base = '/madou';
  else if (id === 'kinostream') base = '/kinostream';
  else if (id === 'timestudio') base = '/TIMESTUDIO';
  else if (id === 'anime') base = '/anime';
  else if (id === 'vr') base = '/VR';
  else if (id === 'avtalk') base = '/avtalk';
  else if (id === 'masem') base = '/masem';
  else if (id === 'plantsvscunts') base = '/PLANTSVSCUNTS';
  else if (id === 'genres') base = '/genres/' + encodeURIComponent(sub || GENRE_CARDS[0].v);
  else if (id === 'uncensored') base = '/' + (sub || 'uncensored-leak');
  else if (id === 'amateur') base = '/' + (sub || 'siro');
  else if (id === 'asian') base = '/' + (sub || 'madou');
  else return '';
  return HOST + base + (p > 1 ? '?page=' + p : '');
}

// 列表解析：按 <div class="thumbnail group"> 切块（列表页每卡一个，首页
// 亦然；Alpine 模板块的锚是 :href/:data-src，无字面 href 与 http 封面，
// 自然排除）；标题锚 class 含 text-secondary（属性间可含换行），封面取
// data-src 优先于 src，时长取卡片内第一个 H:MM(:SS)；按 href 去重。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  // 卡片锚点: 列表页每卡包在 <div class="item-wrapper"> 里, 首页则直接是
  // grid 下的 thumbnail div; 统一按 thumbnail div 切块。
  const chunks = String(html).split(/<div[^>]*class="thumbnail group"/);
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    // 字面 <a href= (模板用 :href, 必须排除)。
    const hm = c.match(/<a href="(\/[^"]+)"[^>]*>/);
    if (!hm) continue;
    const href = decodeHtml(hm[1]);
    if (!/^\/[A-Za-z0-9][A-Za-z0-9\-._]*$/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    let title = '';
    const tm = c.match(/<a[^>]+class="[^"]*text-secondary[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>/i);
    if (tm) title = decodeHtml(tm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) {
      const am = c.match(/<img[^>]+alt="([^"]*)"/i);
      if (am) title = decodeHtml(am[1]);
    }
    if (!title) title = href.slice(1);
    if (/^\{\{|\bitem\.(title|dvd_id)\b/.test(title)) continue;
    let cover = '';
    // 封面必须是字面 http(s) URL (模板 :data-src 是 JS 表达式, src 是
    // data: 占位图, 都必须排除)。
    const dm = c.match(/<img[^>]+data-src="(https?:\/\/[^"]+)"/i);
    const sm = c.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    if (dm) cover = decodeHtml(dm[1]);
    else if (sm) cover = decodeHtml(sm[1]);
    if (!cover) continue;
    let remarks = '';
    const rm = c.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (rm) remarks = rm[1];
    out.push({ vod_id: HOST + href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]*)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*-\s*AV77 AV.*$/i, '').trim();
  return fallback || '';
}

function extractCover(html) {
  const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (m) return decodeHtml(m[1]);
  return '';
}

function extractDesc(html) {
  const m = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (m) return decodeHtml(m[1]);
  return '';
}

async function init() {
  return {};
}

async function home() {
  const html = await getHtml(HOST + '/');
  return {
    class: CLASSES,
    filters: {
      genres: [{ key: 'sub', name: '類型', value: GENRE_CARDS }],
      uncensored: [{ key: 'sub', name: '無碼影片', value: UNCENSORED_CARDS }],
      amateur: [{ key: 'sub', name: '素人', value: AMATEUR_CARDS }],
      asian: [{ key: 'sub', name: '亞洲AV', value: ASIAN_CARDS }],
    },
    list: parseList(html).slice(0, 30),
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'new');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  // 筛选值本身定路径 (与当前顶级无关, 123AV 同款): 题材 -> /genres/<名>,
  // 無碼/素人/亞洲值 -> /<值>; 未命中时回落 listUrl 按顶级解释。
  let url = '';
  if (sub) {
    if (GENRE_CARDS.some((c) => c.v === sub)) url = HOST + '/genres/' + encodeURIComponent(sub);
    else if (UNCENSORED_CARDS.some((c) => c.v === sub) || AMATEUR_CARDS.some((c) => c.v === sub) || ASIAN_CARDS.some((c) => c.v === sub)) url = HOST + '/' + sub;
  }
  if (!url) url = listUrl(id, sub, page);
  else if (page > 1) url += '?page=' + page;
  if (!url) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html, page),
    limit: list.length || PAGE_SIZE,
    total: 0,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = absUrl(durl);
  const html = await getHtml(durl);
  if (!html) return { list: [] };
  const name = extractTitle(html, durl);
  const pic = extractCover(html);
  const content = extractDesc(html);

  // 播放线：packer 源优先，下载 MP4 兜底；无源则出空线（不编造）。
  // packer 也可能直接给 MP4 (如猎奇类 f/mp4 变量 = pl2 包的 .mp4):
  // MP4 直出原链接, 不当 m3u8 取主播单、不二次包 pl3。
  // 出线统一附 @详情 URL 后缀, 供 play() 取字幕键 (与 detail 预热键一致)。
  const srcs = extractPackedSources(html);
  let lines = [];
  const isMp4 = (u) => /\.mp4(\?|#|$)/i.test(String(u || ''));
  if (srcs.master && isMp4(srcs.master)) {
    lines.push(mp4Label(srcs.master) + '$' + srcs.master + '@' + durl);
  } else if (srcs.master) {
    if (/player\.xxnet999\.com/i.test(srcs.master)) {
      // xxnet999 直播（媒体播单或 smil 主播单），站内即直出主播单地址。
      lines.push('原画$' + srcs.master + '@' + durl);
    } else {
      // surrit / slv / krevonix 主播单：走 pl3 取一次，按实测档位出线。
      const variants = await fetchMasterVariants(srcs.master, durl);
      if (variants.length) {
        for (const v of variants) lines.push(v.label + '$' + v.url + '@' + durl);
      } else {
        const single = srcs.v1280 || srcs.v842 || '';
        if (single) {
          if (isMp4(single)) lines.push(mp4Label(single) + '$' + single + '@' + durl);
          else lines.push(variantLabelFromPath(single) + '$' + pl3wrap(single) + '@' + durl);
        } else lines.push('原画$' + pl3wrap(srcs.master) + '@' + durl);
      }
    }
  }
  if (!lines.length) {
    for (const u of extractDownloadMp4s(html)) lines.push(mp4Label(u) + '$' + u + '@' + durl);
  }
  const vod = {
    vod_id: durl,
    vod_name: name || durl,
    vod_pic: pic,
    vod_content: content,
    vod_play_from: NAME,
    vod_play_url: lines.join('#'),
  };
  subRegister(raw, vod);
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(Array.isArray(body.id) ? body.id[0] : body.id);
  if (!id) return { parse: 0, url: '' };
  // id 是 "720p$<地址>@<详情 URL>" 形式：取 $ 后面的完整地址。
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  // 字幕键用裸详情 URL（与 detail 预热键一致，sextb v7 教训：播单地址作键
  // 时预热永远命中不了，点播每次重跑 6s 搜索）。
  let durl = '';
  const am = id.match(/@((?:https?:\/\/)?av77\.com\/[^@\s]+)$/i);
  if (am) {
    durl = /^https?:\/\//i.test(am[1]) ? am[1] : HOST + am[1];
    id = id.slice(0, am.index).trim();
  }
  if (!durl) durl = id;
  const subsP = subSearchAll(subNormKey(durl)).catch(() => []);
  const url = /^https?:\/\//i.test(id) ? id : '';
  if (!url) return { parse: 0, url: '' };
  return subAttach({
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  }, subsP);
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/search/' + encodeURIComponent(wd);
  if (page > 1) url += '?page=' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html, page),
    limit: list.length || PAGE_SIZE,
    total: 0,
    list,
  };
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。
const SUB_UA = (typeof UA !== 'undefined' && UA) ? UA : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function subCleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。
async function subHttp(url, headers, timeoutMs) {
  try {
    const r = await req.request({
      method: 'GET',
      url,
      headers: headers || {},
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const text = typeof r.data === 'string' ? r.data : (r.data == null ? '' : String(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。
function subRegister(detailIds, vod) {
  try {
    if (!vod || !vod.vod_name) return;
    const name = String(vod.vod_name);
    const keys = new Set();
    for (const i of (Array.isArray(detailIds) ? detailIds : [detailIds])) {
      if (i) keys.add(String(i));
    }
    if (vod.vod_id) keys.add(String(vod.vod_id));
    const eps = [];
    for (const grp of String(vod.vod_play_url || '').split('$$$')) {
      for (const seg of grp.split('#')) {
        const k = seg.indexOf('$');
        if (k >= 0) {
          const ep = seg.slice(k + 1);
          if (ep) { keys.add(ep); eps.push(ep); }
        }
      }
    }
    for (const k of keys) subCacheName(k, name);
    // v7: 预热键必须与 play() 的 subSearchAll 键一致（裸详情 URL）。
    // 旧版用 eps[0]（形如 F4$<durl>@F4），play 侧先剥 $ 前缀与 @hint
    // 再查，键永远对不上 → 预热白做，每次点播都重跑最多 6s 的字幕
    // 搜索，play() 在 App 超时内回不来。vod_id 即 play 侧的裸 durl。
    const warmKey = vod.vod_id ? String(vod.vod_id) : (eps[0] || '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/av77\.com\/([^/?#]+)/) || [])[1] || '';
  return slug ? subCleanText(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
    /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  return '';
}

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
function subCtx(durl) {
  const title = (subNameCache.get(durl) || subSlugTitle(durl) || '').trim();
  const code = subExtractCode(title) || subExtractCode(String(durl || ''));
  const compact = code ? code.replace(/[-_ ]/g, '') : '';
  let titlePart = '';
  if (code && title) {
    titlePart = title
      .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), ' ')
      .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, ' ')
      .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, ' ')
      .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (titlePart === code || titlePart === compact) titlePart = '';
  }
  return { title, code, compact, titlePart };
}

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
function subMatchOf(durl, ctx) {
  const text = ((ctx.title || '') + ' ' + String(durl || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return {
    text,
    loose: text.replace(/[-_\s.]/g, ''),
    title,
    titleLoose: title.replace(/[-_\s.]/g, ''),
  };
}

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
function subFmtOf(name, ext, url) {
  const hay = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  if (/\.(zip|rar|7z)(\?|#|$)/.test(hay)) return '';
  const fromName = String(name || '').toLowerCase().match(/\.(srt|vtt|ass|ssa)$/);
  if (fromName) return fromName[1];
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (/^(srt|vtt|ass|ssa)$/.test(e)) return e;
  const fromUrl = String(url || '').match(SUB_TEXT_RE);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return '';
}

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
      { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 3000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    return j.data;
  })();
  ocache.set(key, p);
  return p;
}

// oracle 条目归一 (组件 normalizeResult 的字段口径)
function subNormItem(it) {
  const name = String(it.name || it.Name || it.title || it.Title || it.filename || it.FileName || '字幕');
  const langs = Array.isArray(it.languages) ? it.languages.join(',')
    : (Array.isArray(it.Languages) ? it.Languages.join(',') : String(it.langs || it.Langs || it.language || ''));
  return {
    name,
    langs,
    ext: String(it.ext || it.Ext || it.format || it.Format || ''),
    url: String(it.url || it.Url || ''),
    cid: Boolean(it.cid_match ?? it.CidMatch),
    down: Number(it.down_count || it.DownCount || it.downloads || it.Downloads || 0) || 0,
    score: Number(it.score || it.Score || 0) || 0,
    fp: Number(it.fingerprintf_score || it.fingerprint_score || it.FingerprintScore || it.fingerprintfScore || 0) || 0,
    duration: Number(it.duration || it.Duration || 0) || 0,
    size: Number(it.file_size || it.FileSize || it.size || it.Size || 0) || 0,
  };
}

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
function subRelevant(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  if (ctx.code) {
    if (text.includes(ctx.code.toLowerCase())) return true;
    if (ctx.compact && loose.includes(ctx.compact.toLowerCase())) return true;
  }
  if (!match.text) return false;
  return text.includes(match.text) || loose.includes(match.loose)
    || (match.title ? (text.includes(match.title) || loose.includes(match.titleLoose)) : false)
    || match.text.includes(text);
}

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
function subScoreItem(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  let s = (it.cid ? 100000 : 0) + it.down / 10000;
  if (ctx.code && (text.includes(ctx.code.toLowerCase()) || (ctx.compact && loose.includes(ctx.compact.toLowerCase())))) s += 25000;
  s += Math.max(0, it.score) + Math.max(0, it.fp);
  if (it.duration > 0) s += 50;
  if (it.size > 0) s += Math.min(it.size / 1024 / 1024, 20);
  if (match.title && (text.includes(match.title) || loose.includes(match.titleLoose))) s += 1000;
  if (ctx.code) s += 500;
  if (text.includes('sub') || text.includes('subtitle') || text.includes('字幕')) s += 300;
  return s;
}

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
async function subSlotOracle(keys, src, tier, ctx, match, ocache, bag) {
  let pool = null;
  for (const k of keys) {
    const list = await subOracle(k, ocache);
    if (list && list.length) { pool = list; break; }
  }
  if (!pool) return;
  const items = [];
  for (const raw of pool) {
    if (!raw) continue;
    const it = subNormItem(raw);
    if (!it.url) continue;
    const fmt = subFmtOf(it.name, it.ext, it.url);
    if (!fmt) continue;
    items.push({ name: it.name, langs: it.langs, ext: it.ext, url: it.url, fmt, norm: it });
  }
  if (!items.length) return;
  const finalItems = items.filter((it) => subRelevant(it, ctx, match));
  for (const it of finalItems) {
    const lang = subLangOf(it.name, it.langs);
    bag.push({ src, tier, name: subDispName(it.name, ctx.code), url: it.url, fmt: it.fmt, lang: lang.tag, langRank: lang.rank, score: subScoreItem(it.norm, ctx, match), dur: it.norm.duration });
  }
}

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
  if (r.status !== 200 || !r.body) return;
  const pages = [];
  const seen = new Set();
  for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pages.push(m[1]);
    if (pages.length >= 3) break;
  }
  await Promise.all(pages.map(async (p) => {
    const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
    if (pr.status !== 200 || !pr.body) return;
    for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
      let nm = m[1].split('/').pop() || '字幕';
      try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
      if (!subRelevant({ name: nm, langs: '', ext: '' }, ctx, match)) continue;
      const lang = subLangOf(nm, '');
      const fmt = (nm.match(/\.(srt|vtt|ass)$/i) || [])[1].toLowerCase();
      bag.push({ src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], fmt, lang: lang.tag, langRank: lang.rank, score: 0 });
    }
  }));
}

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
function subDurSec(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  return s > 0 ? s : 0;
}
function subDurStr(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
function subMerge(items) {
  const sorted = items.slice().sort((a, b) =>
    (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  const seenUrl = new Set();
  const seenName = new Set();
  const perTier = {};
  const out = [];
  for (const it of sorted) {
    if (out.length >= 10) break;
    if (seenUrl.has(it.url)) continue;
    const nameKey = (it.lang || '') + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '') + '|' + (subDurSec(it.dur) || 'nodur');
    if (seenName.has(nameKey)) continue;
    if ((perTier[it.tier] || 0) >= 8) continue;
    seenUrl.add(it.url);
    seenName.add(nameKey);
    perTier[it.tier] = (perTier[it.tier] || 0) + 1;
    const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
    const dur = subDurStr(it.dur);
    out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName + (dur ? '·' + dur : ''), url: it.url, format: it.fmt });
  }
  return out;
}

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

async function subSearchAll(durl) {
  const hit = subResultCache.get(durl);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(durl)) return subInflight.get(durl);
  const p = (async () => {
    const ctx = subCtx(durl);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(durl, ctx);
      const bag = [];
      const ocache = new Map();
      const jobs = [
        subSlotOracle(subKeysX(ctx), '迅雷', 0, ctx, match, ocache, bag),
        subSlotOracle(subKeysXL(ctx), '迅雷看看', 1, ctx, match, ocache, bag),
        subFromSubtitleCat(ctx, match, bag),
      ].map((jp) => Promise.resolve(jp).catch(() => {}));
      const all = Promise.allSettled(jobs);
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
      await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
      subs = subMerge(bag);
      if (subs.length) {
        subResultCache.set(durl, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(durl, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(durl, p);
  try { return await p; } finally { subInflight.delete(durl); }
}

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
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
