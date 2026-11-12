// Javass (https://javass.love) -> CatPawOpen spider
// WordPress 视频站：首页 60 条/页（共 102 页），分类/标签 20 条/页，搜索 /?s= 20 条/页。
// 播放源（2026-11-12 全分类扫查：32 分类、217 部详情抽样；Bunny 原生 132、Lulu 53、
//   hgcloud 18、upns 10、playmogo 1、Bunny 嵌套 0、取页失败 3；无播放线 82/217 = 37.8%）：
//   1. Bunny 原生：video-js data-settings 直给 b-cdn.net playlist.m3u8，主播单含 480p/720p/1080p/1440p/2160p
//      多档（每片 3-4 档不等，以主播单实测为准），直取 200、无 UA 校验 —— 可播，多清晰度。
//   2. Bunny 嵌套：iframe.mediadelivery.net 嵌套页里含同一 b-cdn.net 播单 —— 可播，多清晰度
//      （本次抽样 217 部里为 0，稀有；另有 home 探查中见到 1 部 mediadelivery，链路保留）。
//   3. Lulu 系嵌套（luluvido/luluvdo/lulust）：嵌套页含 Dean Edwards packed JS，解出 tnmr.org
//      签名 master.m3u8（单变体 720p，token 每次取嵌套页现生、8 小时有效、无 IP 成分），
//      但 CDN 全程只认浏览器 UA（媒体 UA 在 master/变体/密钥/分片四级全部 403）——
//      已修：蜘蛛现解签名 master，播放走自建 Cloudflare Worker javass-hls 中转
//      （Worker 内用浏览器 UA 取数并改写播单，视频流量走 Cloudflare、不走 Railway），
//      出线为单档 720p（只列真实档位，绝不硬编）。
//      坑：tnmr.org 的 WAF 遇 Accept-Language: zh-CN 一律 403（UA+Referer 200，
//      再加 Accept-Language 即 403）；蜘蛛取 master 必须用 getMediaText（不带
//      Accept-Language），用 getHtml 取必 403、详情不出线（2026-11-12 实测坐实）。
//      Worker 上游只带 UA+Referer，不带 Accept-Language，同样原因。
//   4. hgcloud 嵌套：修不了（证据见下）。嵌套页仅 452 字节空壳（Loading + /main.js?v=1.1.9），
//      main.js 71,214 字节 obfuscator.io 混淆（582 项字符串表 + RC4 解码 + 字符串切分 +
//      反调试循环）；Node vm + DOM stub + 真实 fetch 跑 15 秒：零网络请求、零 DOM 写、
//      未注册任何监听器，只见反调试定时器循环解码同一批约 146 个碎片（约 400 次）；
//      播放器初始化依赖真实浏览器环境，无法在蜘蛛里复现；可猜的 API 端点
//      （/dl、/api/file、/d）一律回同一空壳或 522；站方根域名还间歇 522。
//      结论：无可用播放地址，不列线。
//   5. upns.online 嵌套：修不了。嵌套页 JS 逻辑为取 hash 作 file1 调 /api/public/resolve?file1=
//      取 {url} 后跳转；12 个不同 hash 全部回 {"ok":false,"error":"not found"} HTTP 404
//      （换 cookie、换 Referer、重取新鲜 hash 均同），嵌套页无 cookie；详情页除 upns iframe
//      外无第二播放源、无 m3u8/mp4 链接。结论：解析器后端记录已清空/过期，不列线。
//   6. playmogo（DoodStream）：修不了。嵌套页点播放渲染 Cloudflare Turnstile 真人验证墙，
//      按底线不绕真人验证墙，不列线。
//   修后可播约 86%（Bunny 两路 62.2% + Lulu 24.4%）；剩余 13.4%（hgcloud 8.3% + upns 4.6% +
//   playmogo 0.5%）为站方死嵌套，点开仍无集数，非蜘蛛问题。
// 封面直链（javass.love/wp-content/uploads）实测 200 无防盗链，无需代理；站方直连 200 无墙。
// Highlighted 翻页：站方该分类真实只有 24 部（p1 20 条 + p2 4 条，p3 为空，实测）；
//   pagecount 只看本页（见 localPagecount）：分类/标签短页即末页，p1 报 2、p2 报 2，
//   App 在 p2 后干净收尾；首页取页内 /page/N/ 链接最大值。不再多取一次下一页验证。
// Lulu 嵌套页 host 轮换：同一 file_code 在 luluvido/luluvdo/lulust 三 host 间尝试，
//   详情页含双 iframe 时以文档顺序第一个 Lulu iframe 为主播放器（hgcloud 若在描述区，
//   其 iframe 在 post-content 之后，不会被误取）。
import req from '../../util/req.js';

const KEY = 'py_javass';
const NAME = 'Javass';
const HOST = 'https://javass.love';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 本站 Bunny 拉流区（原生与嵌套多片实测一致，仅作嵌套页取不到播单时的兜底拼接用）
const BUNNY_VZ = 'https://vz-9f2ab8d8-84b.b-cdn.net';
// Lulu 系播放中转：自建 Cloudflare Worker javass-hls（部署名 javass-hls，
//   根回 "javass hls ok"，代码见 javass-worker.js；视频流量走 Cloudflare、不走 Railway）。
//   蜘蛛只把签名 master 地址交给 Worker，播放器全程只见 Worker 自身地址。
const JAVASS_HLS = 'https://javass-hls.li768435813.workers.dev';
const JAVASS_RELAY_KEY = 'lai-hls-1';
const LULU_HOSTS = ['luluvido.com', 'luluvdo.com', 'lulust.com'];

// 分类 32 个：首页最新 + 6 个站内顶级分类（/categories/ 下全部；站方拼写是 jav-censured，
// jav-censored 是 404 死 slug）+ 25 个标签（首页 p1 出现 >=3 次的有意义标签）。
// 子分类从属关系：25 个标签均为站内 video_tag，与顶级分类平级归档、无父子从属；mira-cat 无层级分类，
// 故全部平铺，仅以“标签·”前缀放在顶级分类之后。
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '4k', type_name: '4K' },
  { type_id: 'english-subtitled', type_name: 'English Subtitled' },
  { type_id: 'highlighted', type_name: 'Highlighted' },
  { type_id: 'jav-censured', type_name: 'Censured' },
  { type_id: 'jav-uncensored', type_name: 'Uncensored' },
  { type_id: 'vr', type_name: 'VR' },
  { type_id: 'tag:jav-big-ass', type_name: '标签·jav-big-ass' },
  { type_id: 'tag:big-ass-japanese-porn', type_name: '标签·big-ass-japanese-porn' },
  { type_id: 'tag:amateur', type_name: '标签·amateur' },
  { type_id: 'tag:creampie', type_name: '标签·creampie' },
  { type_id: 'tag:big-tits', type_name: '标签·big-tits' },
  { type_id: 'tag:big-ass-cowgirl', type_name: '标签·big-ass-cowgirl' },
  { type_id: 'tag:huge-butt', type_name: '标签·huge-butt' },
  { type_id: 'tag:big-ass', type_name: '标签·big-ass' },
  { type_id: 'tag:big-butt-pawg', type_name: '标签·big-butt-pawg' },
  { type_id: 'tag:asian-big-ass', type_name: '标签·asian-big-ass' },
  { type_id: 'tag:cowgirl', type_name: '标签·cowgirl' },
  { type_id: 'tag:big-ass-pantyhose', type_name: '标签·big-ass-pantyhose' },
  { type_id: 'tag:doggystyle', type_name: '标签·doggystyle' },
  { type_id: 'tag:japanese-big-ass', type_name: '标签·japanese-big-ass' },
  { type_id: 'tag:jav-big-butt', type_name: '标签·jav-big-butt' },
  { type_id: 'tag:oiled', type_name: '标签·oiled' },
  { type_id: 'tag:subbed', type_name: '标签·subbed' },
  { type_id: 'tag:voluptuous-ass', type_name: '标签·voluptuous-ass' },
  { type_id: 'tag:big-ass-nurse', type_name: '标签·big-ass-nurse' },
  { type_id: 'tag:deepthroat', type_name: '标签·deepthroat' },
  { type_id: 'tag:dildo-riding', type_name: '标签·dildo-riding' },
  { type_id: 'tag:pounding', type_name: '标签·pounding' },
  { type_id: 'tag:retsu-dao', type_name: '标签·retsu-dao' },
  { type_id: 'tag:sacananoco', type_name: '标签·sacananoco' },
  { type_id: 'tag:waka-misono', type_name: '标签·waka-misono' },
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

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

// 取页：强制拿原始文本（rdd22 教训：站方回 JSON 时 axios 会自动解析成对象，
// String(data) 得 "[object Object]"；responseType:'text' + transformResponse 恒等可防住）。
async function getHtml(url) {
  try {
    const r = await req.get(url, { headers: headers(), timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

// 取播单类地址：只带浏览器 UA + Referer，不带 Accept-Language（tnmr.org 的 WAF 遇
// Accept-Language: zh-CN 一律回 403；2026-11-12 实测：UA+Referer 200，
// 再加 Accept-Language 即 403）。Lulu 签名 master 必须走这个取，否则 parseMaster
// 拿到 403 页、解析不出档位、详情不出线。
async function getMediaText(url, referer) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
      timeout: 20000, responseType: 'text', transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') {
    return page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
  }
  if (cat.indexOf('tag:') === 0) {
    const slug = cat.slice(4);
    return page <= 1 ? HOST + '/video_tag/' + slug + '/' : HOST + '/video_tag/' + slug + '/page/' + page + '/';
  }
  return page <= 1 ? HOST + '/categories/' + cat + '/' : HOST + '/categories/' + cat + '/page/' + page + '/';
}

// 列表解析：每条一个 <article>；封面在 .post-thumbnail 的 background-image 里，
// 标题与详情链接在 <a class="post-permalink" title="..." href=".../video/<id>/">，时长在 .video-length。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1];
    const am = body.match(/<a[^>]+class="[^"]*post-permalink[^"]*"[^>]+title="([^"]+)"[^>]+href="([^"]+)"[^>]*>/i)
      || body.match(/<a[^>]+title="([^"]+)"[^>]+href="([^"]+)"[^>]*class="[^"]*post-permalink[^"]*"[^>]*>/i)
      || body.match(/<a[^>]+href="(https?:\/\/javass\.love\/video\/[^"\/]+\/)"[^>]*title="([^"]+)"[^>]*>/i);
    let href = '', title = '';
    if (am) {
      if (/^https?:\/\//i.test(am[1])) { href = am[1]; title = am[2]; }
      else { title = am[1]; href = am[2]; }
    }
    if (!href || !/\/video\/[A-Za-z0-9]+\/$/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const cm = body.match(/background-image:\s*url\(([^)]+)\)/i);
    let cover = cm ? absUrl(cm[1].replace(/["']/g, '').trim()) : '';
    if (!cover) {
      // 多数条目用 <img class="wp-post-image">（分类页全部、首页大部），取 src（560x315 档够封面用）
      const im = body.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i)
        || body.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"[^>]*>/i)
        || body.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      if (im) cover = absUrl(im[1]);
    }
    title = decodeHtml(title);
    if (!title) {
      const hm = body.match(/<h2[^>]*>\s*<a[^>]*>([^<]{2,200})<\/a>/i);
      if (hm) title = decodeHtml(hm[1]);
    }
    if (!title) title = href;
    let remarks = '';
    const dm = body.match(/class="[^"]*video-length[^"]*"[^>]*>\s*([^<]{1,12})\s*</i);
    if (dm) remarks = t(dm[1]);
    out.push({ vod_id: href, vod_name: title, vod_pic: cover, vod_remarks: remarks });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[—–-]\s*JAV ASS LOVER.*$/i, '').trim();
  m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1]).replace(/\s*[—–-]\s*JAV ASS LOVER.*$/i, '').trim();
  return fallback || '';
}

function extractCover(html) {
  let m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

// 主播单解析：每档取文件夹名作档位（480p/720p/1080p/1440p/2160p），
// 无文件夹名时按 RESOLUTION 最小边就近取标准档；返回按档位从高到低排好的 [{label, url}]。
function parseMaster(text, base) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  const STD = [240, 360, 480, 720, 1080, 1440, 2160];
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
    let label = '';
    const fm = uri.match(/^([0-9]+p)\//i);
    if (fm) label = fm[1].toLowerCase();
    else {
      const rm = /RESOLUTION=(\d+)x(\d+)/i.exec(inf[1]);
      if (rm) {
        const mn = Math.min(parseInt(rm[1], 10), parseInt(rm[2], 10));
        let best = STD[0], bd = 1e9;
        for (const s of STD) { const d = Math.abs(s - mn); if (d < bd) { bd = d; best = s; } }
        label = best + 'p';
      }
    }
    if (!label || seen.has(label)) continue;
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

// Bunny 原生：video-js data-settings JSON 里的 sources[0].src 即主播单地址。
function extractBunnyMaster(html) {
  const m = html.match(/data-settings="([^"]{0,6000})"/i);
  if (!m) return '';
  let s = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  s = s.replace(/\\\//g, '/');
  const sm = s.match(/"sources"\s*:\s*\[\s*\{\s*"src"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
  if (sm) return sm[1].replace(/\\\//g, '/');
  return '';
}

// Bunny 嵌套：取第一个 iframe.mediadelivery.net 嵌套地址，嵌套页里直含 b-cdn.net 播单。
// 嵌套页取不到时，用嵌套地址里的 guid + 本站拉流区拼一个（多片实测同一拉流区）。
function extractMediadeliveryEmbed(html) {
  const iframes = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/gi) || [];
  for (const tag of iframes) {
    const um = tag.match(/src="([^"]+)"/i);
    if (um && /iframe\.mediadelivery\.net\/embed\//i.test(um[1])) return um[1].replace(/&amp;/g, '&');
  }
  return '';
}

async function resolveMediadelivery(embedUrl) {
  const page = await getHtml(embedUrl);
  const m = page.match(/https?:\/\/[a-z0-9\-]+\.b-cdn\.net\/[a-f0-9\-]+\/playlist\.m3u8/i);
  if (m) return m[0];
  const gm = embedUrl.match(/\/embed\/\d+\/([a-f0-9\-]{36})/i);
  if (gm) return BUNNY_VZ + '/' + gm[1] + '/playlist.m3u8';
  return '';
}


// ---------- Lulu 系嵌套（Dean Edwards packed JS 现解 + javass-hls 中转） ----------
// base64url 编解码（猫源沙箱有 Buffer，走 Buffer；无 Buffer 时走 TextEncoder+btoa 兜底）。
function b64urlEncode(s) {
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { /* 走兜底 */ }
  const bytes = new TextEncoder().encode(String(s));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// 详情页取第一个 Lulu iframe（文档顺序第一个即主播放器；描述区的 hgcloud iframe 在后，不误取）。
function extractLuluEmbed(html) {
  const iframes = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/gi) || [];
  for (const tag of iframes) {
    const um = tag.match(/src="([^"]+)"/i);
    if (um && /lulu(?:vido|vdo|st)\.com\/e\//i.test(um[1])) return um[1].replace(/&amp;/g, '&');
  }
  return '';
}

// Dean Edwards packer 简化版反混淆（无 eval，纯字符串替换；Lulu 嵌套页实测结构）：
//   eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}
//     ('PAYLOAD',36,291,'kw1|kw2|...'.split('|')))
// 解开后含 jwplayer(...).setup({sources:[{file:"https://<sub>.tnmr.org/.../master.m3u8?t=...&s=...&e=28800&..."}]})。
function unpackDeanEdwards(html) {
  const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
  if (!m) return '';
  let p = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const a = parseInt(m[2], 10);
  const k = m[4].split('|');
  let c = parseInt(m[3], 10);
  while (c--) {
    if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
  }
  return p;
}

// 取 Lulu 签名 master：同一 file_code 在三 host 间按顺序尝试，解 packed JS 得 tnmr.org 签名播单。
// 嵌套页取数用浏览器 UA + 详情页 Referer（Lulu 嵌套页本身不校验 UA，但保持一致）。
async function resolveLulu(embedUrl, referer) {
  const cm = String(embedUrl || '').match(/\/e\/([A-Za-z0-9]+)/);
  if (!cm) return '';
  const code = cm[1];
  const firstHost = (String(embedUrl).match(/https?:\/\/([^\/]+)/) || [])[1] || '';
  const hosts = [];
  if (firstHost) hosts.push(firstHost);
  for (const h of LULU_HOSTS) if (hosts.indexOf(h) < 0) hosts.push(h);
  for (const host of hosts) {
    let page = '';
    try {
      const r = await req.get('https://' + host + '/e/' + code, {
        headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        timeout: 15000, responseType: 'text', transformResponse: [(d) => d],
      });
      const data = r && r.data;
      page = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    } catch (e) { page = ''; }
    if (!page) continue;
    const unpacked = unpackDeanEdwards(page);
    if (!unpacked) continue;
    const um = unpacked.match(/https?:\/\/[a-z0-9\-.]+\.tnmr\.org\/[^\s"'\\]+\.m3u8[^\s"'\\]*/i);
    if (um) return um[0];
  }
  return '';
}

// Lulu 签名 master 走 Worker /p/ 路由；ctx 带 Referer 与密钥（与 javass-worker.js 的 RELAY_KEY 一致）。
function luluWorkerUrl(master) {
  // ctx 必须带 ua（蜘蛛的 UA 常量，Chrome 131）：Worker 默认 UA 是 Chrome 128，
  // tnmr.org 的 WAF 拦 Chrome 128（Worker 用默认 UA 取 master 一律 502），
  // Chrome 131 则 200（2026-11-12 实测：128→502、131→200；iPhone Safari UA 也 502）。
  const ctx = b64urlEncode(JSON.stringify({ r: HOST + '/', k: JAVASS_RELAY_KEY, ua: UA }));
  return JAVASS_HLS + '/p/' + b64urlEncode(master) + '/' + ctx;
}

// ---------- pagecount（本页自证法，修 Highlighted 翻页） ----------
// 旧取页验证法（当前页非空时再取下一页验证）已废弃：它让每次分类请求都多一次
//   取页，耗时翻倍；更糟的是下一页取回 200 但解析 0 条时（截断/抖动/空页）会把
//   pagecount 报成 page，App 从此不再给翻页——手机上 Highlighted 正是这么坏的
//   （p1 出 20 条、p2 的 4 条永远翻不出来；VM 侧取页次次成功，复现不了）。
// 新逻辑只看本页，无二次取页、无状态、无缓存，分两路：
//   分类/标签：站方 widget 自报 posts_per_page=20，解析条数与 raw 条数一致，
//     短页即末页（条数 < 20 报 page，满 20 报 page+1）；满页恰为末页的极少数
//     情况（总数整除 20）会多报一页，App 要一次空页即收尾，与丝瓜/黄视频同款。
//   首页：每页解析条数不固定（实测 47/48/36/26），不能用条数判断；改取页内
//     /page/N/ 链接的最大值（WP 分页链接含末页号，p1/p2/p25/p50/p75/p101/p102
//     七页实测均为 102），无链接则报 page。
const PAGE_SIZE = 20;  // 分类/标签：widget posts_per_page=20（实测）
function localPagecount(id, page, html, list) {
  if (id === 'home' || id === '') {
    let max = page;
    const re = /href="[^"]*\/page\/(\d+)\/?[^"]*"/g;
    let m;
    while ((m = re.exec(html))) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    return max;
  }
  return list.length < PAGE_SIZE ? page : page + 1;
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
  return { page, pagecount: localPagecount(id, page, html, list), list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let url = t(raw);
  if (!url) return { list: [] };
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const html = await getHtml(url);
  if (!html) return { list: [] };
  const name = extractTitle(html, url);
  const pic = extractCover(html);
  let content = '';
  const dm = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)/i);
  if (dm) content = decodeHtml(dm[1]);

  // 播放线：Bunny 两路取真实档位；Lulu 系现解签名 master 走 javass-hls Worker 出单档 720p
  //   （master 需先实取一次确认档位，取不到不列线）；hgcloud/upns/playmogo 不列线（见文件头）。
  let master = extractBunnyMaster(html);
  if (!master) {
    const embed = extractMediadeliveryEmbed(html);
    if (embed) master = await resolveMediadelivery(embed);
  }
  const eps = [];
  if (master) {
    const masterText = await getHtml(master);
    const variants = parseMaster(masterText, master);
    if (variants.length) {
      for (const v of variants) eps.push(v.label + '$' + v.url);
    } else {
      eps.push('原画$' + master);
    }
  }
  if (!eps.length) {
    const luluEmbed = extractLuluEmbed(html);
    if (luluEmbed) {
      const luluMaster = await resolveLulu(luluEmbed, url);
      if (luluMaster) {
        // 实取 master 确认档位（Lulu 单变体，实测为 1280x720）；取不到则不列线。
        // 注意：必须用 getMediaText（不带 Accept-Language），getHtml 会被 tnmr 403。
        const luluText = await getMediaText(luluMaster, url);
        const luluVariants = parseMaster(luluText, luluMaster);
        if (luluVariants.length) {
          // Lulu master 只有一个变体（实测 720p）；出线只列这一档，Worker 地址指向 master，
          // 播放器在改写后的 master 里只见到这一个变体。绝不把同一地址按档位重复列。
          eps.push(luluVariants[0].label + '$' + luluWorkerUrl(luluMaster));
        }
      }
    }
  }
  const playUrl = eps.join('#');
  // 字幕：片名带番号才接（subExtractCode 能抠出号才登记+预热），不带不接。
  if (eps.length && subExtractCode(name)) {
    for (const e of eps) {
      const u = e.split('$').pop();
      if (u) subCacheName(u, name);
    }
    subCacheName(url, name);
    subWarm(eps[0].split('$').pop());
  }
  return {
    list: [{
      vod_id: url,
      vod_name: name || url,
      vod_pic: pic,
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const m = id.match(/\$?(https?:\/\/[^\s$#]+)/);
  const url = m ? m[1] : (/^https?:\/\//i.test(id) ? id : '');
  if (!url) return { parse: 0, url: '' };
  // 字幕：只在 detail 登记过（即片名带番号）的地址上查；无登记不带 subs 键。
  const subs = subNameCache.has(url) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/?s=' + encodeURIComponent(wd);
  if (page > 1) url = HOST + '/page/' + page + '/?s=' + encodeURIComponent(wd);
  const html = await getHtml(url);
  const list = parseList(html);
  return { page, pagecount: list.length ? page + 1 : page, list };
}


// ---------- 字幕聚合 companion helpers（core 本身不含，见 /tmp/sp_py_javtiful.js） ----------
// reqRaw：框架 req，2xx 才回 body，永不抛错；clean：去标签/空白（core 的 subSlugTitle 用到）。
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function reqRaw(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof r.data === 'string' ? r.data : (r.data === null || r.data === undefined ? '' : JSON.stringify(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// ---------------- 字幕聚合 (与 32 个带芯猫源同一套 Layer A，2026-11-02 定版) ----------------
// 槽位：迅雷（键序 [番号, 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 键序逐个查、首中即停；命中后严过滤（须含番号或片名全文，无回退）；
// 合并序 = 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；
// 全局上限 10、单槽软上限 8；总预算 6s、失败全静默；无结果时 play 不带 subs 键。
// 时长后缀：oracle 给毫秒（>100000 除 1000），无时长不显示、不编造；
// 去重键 = 语言 + 小写名（去扩展名）+ 秒（无时长记 nodur），同名同时长才算重复。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

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

function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

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

function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

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

function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await reqRaw('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
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

async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await reqRaw('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 5000);
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
    const pr = await reqRaw('https://subtitlecat.com/' + p, { 'User-Agent': UA, Referer: 'https://subtitlecat.com/' }, 4000);
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

const subInflight = new Map();

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

function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
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
