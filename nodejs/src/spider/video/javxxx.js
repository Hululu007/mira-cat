// javxxx.me — MiraPlayer 猫源蜘蛛（完整版，未并入仓库，仅供审阅/测试）
// 结论：能写。播放链路已全程实测打通（见 javxxx_attack.md）。
// 链路：详情页 data-ts-live/data-ts-id
//   → dex(tsId, tsLive, '_0x48107a') 得 token
//   → POST https://www.javxxx.me/api/play/ {sources, ep:1, ver:2}
//   → dex(tsId, resp.data, 'undefined') 得 embed 地址
//   → 取 embed 页 data-config
//   → seed = b64(path+query).slice(6,22)，dex(seed, config, '_0x59a0e4') 得 {src,img,vtt}
//   → b64解 src 得 [{file: streamtape mp4, type:'mp4', label:'auto'}]
// 注意：
//  - 最终是 streamtape 单个 mp4 文件（单档，无多清晰度，不要硬编 1080p/720p）。
//  - streamtape 链接带 ip 绑定 + 约 19.5 小时过期，必须在 play() 里现取现播，
//    不要在 detail() 里提前解好缓存（detail 只存详情页地址）。
//  - 主 embed 失败时按 reserve 备用地址顺序重试（lo: de/nl/cf/nl3/de3/fr）。
//  - /api/play/ 从 VM 实测 HTTP 200（与 bestjavporn 的 POST 全死不同），
//    但最终 streamtape 取片在 VM 因出口 IP 与请求 IP 不一致被拒（500），
//    手机上 App 内同一 IP 走完全程，预期可播，须真机验证。
//  - v2（2026-11-11）：站方质询收紧后直连重试已无意义，取数改多腿并行竞速
//    （Worker + 直连 + fetch + jina，见 getHtml/fetchPage），主腿是待部署的
//    javxxx-fetch Worker（代码见 javxxx-fetch-worker.js，用户自行部署）；
//    Worker 未部署时行为与 v1 一致（直连重试），部署后无需重推即生效。
//  - v3（2026-11-11）：v2 的并行竞速在手机上翻车——jina 腿常比 Worker 腿先赢，
//    mdToListHtml 把 Markdown 转出假条目（封面文件名当标题、语言旗当封面、
//    封面地址当详情地址），列表 1-4 条全假、点开播不了、最新全空。改两段式：
//    HTML 腿先行竞速、全部落败才走 jina 兜底；mdToListHtml 加严校验（详情地址
//    只认 javxxx.me 的 /video/<slug>/、标题/封面白名单），垃圾宁可返回空；
//    parseList 封面改显式取 data-lazy-src（站方新上懒加载，主 img src 是
//    data: 空占位）。解析、dex 链、字幕芯未动。
import req from '../../util/req.js';

const KEY = 'py_javxxx';
const NAME = 'JavXXX';
const HOST = 'https://www.javxxx.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 分类：站内导航原样。vXX 前缀是站方规范地址（/category/<slug>/ 会 301 到它）。
// home=最新；其余 9 个为视频分类。/pornstars/ 与 /studios/ 为人物/厂商索引，结构不同，暂不做。
const CLASSES = [
  { type_id: 'home', type_name: '最新' },
  { type_id: 'censored', type_name: '有碼' },
  { type_id: 'uncensored', type_name: '無碼' },
  { type_id: 'uncensored-leaked', type_name: '無碼流出' },
  { type_id: 'decensored', type_name: '破解' },
  { type_id: 'chinese-subtitle', type_name: '中字' },
  { type_id: 'english-subtitle', type_name: '英字' },
  { type_id: 'subtitle-indonesia', type_name: '印尼字幕' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'fc2-ppv', type_name: 'FC2' },
];
// 分类到站内 vXX 地址（导航原样）
const VPATH = {
  'censored': 'v35', 'uncensored': 'v9', 'uncensored-leaked': 'v10',
  'decensored': 'v17', 'chinese-subtitle': 'v21', 'english-subtitle': 'v18',
  'subtitle-indonesia': 'v7', 'amateur': 'v31', 'fc2-ppv': 'v36',
};

function headers(referer) {
  return {
    'User-Agent': UA,
    'Referer': referer || (HOST + '/'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Cloudflare 托管质询页特征：命中即算该腿失败（不抢赢、不污染结果）。
function isChallengePage(body) {
  const s = String(body || '');
  return !s || s.length < 800 || s.includes('Just a moment') ||
    s.includes('Attention Required') || s.includes('cf-challenge') ||
    s.includes('challenges.cloudflare.com');
}

// ---------- 取数：多腿并行竞速（2026-11-11 v2，照 JavRate v10 + pornhub-fetch 模式重构） ----------
// 背景：站方 2026-11-11 起把 Cloudflare 托管质询收紧，VM 侧直连基本全灭
// （403 "Just a moment" 或连接直接被掐断），手机端 App 的 req（axios 沙箱）
// 同样被指纹拦，列表全空。旧版“直连重试 6 次”在质询率 ~100% 时已无意义。
// 新版照抄两条已被证实有效的路子：
//  ① JavRate 猫源 v10：三腿并行竞速——Worker 腿 + 直连腿 + jina 腿，
//     先拿到真页者赢；另加两条全局 fetch 腿（直连 + Worker），赌 App 的
//     fetch 走与 REX Widget.http.get 相近的原生栈（REX 的 JavRate 能过
//     站方验证、猫源 req 被指纹拦，同源同理）。App 内无 fetch 时不加腿。
//  ② pornhub-fetch / duanju91-fetch：专用取页 Worker（CF 边缘代取），
//     列表/详情/播放接口全走它。Worker 未部署时该腿速败（404），行为与
//     旧版一致；部署后无需重推即生效。
// 腿清单（getHtml，列表用；jina 只作兜底，见 fetchPage 两段式）：
//   第一段 HTML 腿：
//   worker        req   FETCH_WORKER /f/<b64url>  15s
//   direct        req   直连（内部最多 3 次，1s 间隔）  12s/次
//   worker-fetch  fetch FETCH_WORKER /f/<b64url>  15s（有 fetch 才发）
//   direct-fetch  fetch 直连                      12s（有 fetch 才发）
//   第二段 jina 腿（仅 HTML 全败时）：
//   jina          req   https://r.jina.ai/<目标>   15s（回 Markdown，转列表 HTML）
//   jina-fetch    fetch 同上                       15s（有 fetch 才发）
// getHtmlOnly（详情/播放/embed 用，不走 jina）：jina 的 Markdown 丢掉了
// data-ts-live / data-ts-id / data-config 这些 HTML 属性，解不出播放地址，
// 故详情与播放链路只走 HTML 腿（Worker + 直连 + fetch），与 JavRate 的
// htmlOnly/mdOnly 分流同理。
// 质询页/空页/报错的腿只算失败、不抢赢；全部腿落败时立即回空，不烧满上限。
const FETCH_WORKER = 'https://javxxx-fetch.li768435813.workers.dev';
const JINA = 'https://r.jina.ai/';

function b64url(str) {
  try {
    return Buffer.from(String(str), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function viaWorker(url) { return FETCH_WORKER + '/f/' + b64url(url); }

// 硬定时器包装（照 JavRate v6）：不依赖 axios timeout 是否生效，超时即结算 fallback。
function withTimeout(p, ms, fallback) {
  var t;
  var to = new Promise(function (resolve) { t = setTimeout(function () { resolve(fallback); }, ms); });
  return Promise.race([Promise.resolve(p).finally(function () { clearTimeout(t); }), to]);
}

// 先成功者赢：任一 job 返回真值即结算；全部失败/超时返回 null。
function firstSuccess(jobs, ms) {
  return new Promise(function (resolve) {
    var done = false;
    var settled = 0;
    var total = jobs.length;
    var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
    var onSettled = function () {
      settled += 1;
      if (!done && settled >= total) { done = true; clearTimeout(timer); resolve(null); }
    };
    if (total === 0) { done = true; clearTimeout(timer); resolve(null); return; }
    for (var i = 0; i < jobs.length; i++) {
      Promise.resolve(jobs[i]).then(function (v) {
        if (done) return;
        if (v) { done = true; clearTimeout(timer); resolve(v); return; }
        onSettled();
      }).catch(onSettled);
    }
  });
}

function isJinaMd(body) {
  return typeof body === 'string' && body.length > 200 && body.indexOf('Markdown Content:') >= 0;
}

// jina Markdown → 列表 HTML（只供 parseList 用）。v3 严校验（2026-11-11，
// v2 教训：jina 腿在手机上先赢，mdToListHtml 把 Markdown 转出假条目）：
//  ① 条目地址必须是 javxxx.me 的 /video/<slug>/ 详情页——封面图地址
//     （pics.pornfhd.com /s/digital/video/...、i?.wp.com pics.dmm.co.jp）
//     路径里也含 /video/，旧版正则只看路径含不含 /video/、不分 host，
//     把封面地址当成详情地址，点开播不了；
//  ② 标题必须是真标题：丢文件名（*.jpg 等）、丢 JSON/标记泄漏（含 {、}、
//     "、data:image、http、](、![）、丢纯标签开头（English Subtitle /
//     Uncensored Leaked…）、丢纯日期时长、丢超长（>200 字）；
//  ③ 封面只认真封面 host（pics.pornfhd.com、i0-i3.wp.com、pics.dmm.co.jp、
//     javxxx.me），语言旗标图（qtranslate/flags/）、data:、404.png 一律丢弃；
//  ④ 任一校验失败即丢该条，宁缺毋滥——垃圾 Markdown 宁可返回空。
// 注意标题里常含 [English Subtitle] 这类方括号，匹配必须用非贪婪 + URL 锚点，
// 不能用 [^\]]+（会在第一个 ] 处断掉、丢条目）。
function mdTitleOk(t) {
  var s = String(t || '');
  if (!s || s.length < 3 || s.length > 200) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|mp4|m3u8)(\?|#|$)/i.test(s)) return false;
  if (/[{}\"]/.test(s)) return false;
  if (/data:image|https?:\/\/|\]\[|!\[|\]\(/.test(s)) return false;
  if (/^(English Subtitle|Chinese Subtitle|Uncensored Leak(ed)?|Japanese Subtitle|Indonesian? Subtitle|Subtitle Indonesia)\b/i.test(s)) return false;
  if (/^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  return true;
}
function mdPicOk(p) {
  var s = String(p || '');
  if (!s || /^data:/i.test(s)) return false;
  if (/qtranslate|\/flags?\//i.test(s)) return false;
  if (/404\.png/i.test(s)) return false;
  try {
    var h = new URL(s).hostname.toLowerCase();
    if (h === 'pics.pornfhd.com' || h === 'pics.dmm.co.jp') return true;
    if (/^i[0-3]\.wp\.com$/.test(h)) return true;
    if (h === 'javxxx.me' || h === 'www.javxxx.me' || h === 'video.javxxx.me') return true;
    return false;
  } catch (e) { return false; }
}
function mdVideoUrl(u) {
  // 只认 javxxx.me 的 /video/<slug>/ 详情页；其它 host（封面图站等）一律不要。
  var s = String(u || '').split('?')[0].split('#')[0];
  if (!s) return '';
  var full = s.indexOf('http') === 0 ? s : HOST + s;
  try {
    var uu = new URL(full);
    var h = uu.hostname.toLowerCase();
    if (h !== 'javxxx.me' && h !== 'www.javxxx.me') return '';
    if (!/^\/video\/[^\/]+\/?$/.test(uu.pathname)) return '';
    return 'https://www.javxxx.me' + uu.pathname;
  } catch (e) { return ''; }
}
function mdToListHtml(md) {
  var text = String(md || '');
  var items = [];
  var seen = new Set();
  var m, u;
  var re1 = /\[!\[([\s\S]*?)\]\(([^)]+)\)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
  while ((m = re1.exec(text)) !== null) {
    u = mdVideoUrl(m[3]);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    items.push({ url: u, title: cleanText(m[1] || '').replace(/\\([\[\]])/g, '$1'), pic: m[2] || '', pos: m.index });
  }
  var re2 = /\[([\s\S]*?)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
  while ((m = re2.exec(text)) !== null) {
    u = mdVideoUrl(m[2]);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    items.push({ url: u, title: cleanText(m[1] || '').replace(/\\([\[\]])/g, '$1'), pic: '', pos: m.index });
  }
  if (!items.length) return '';
  // 封面：取每条链接之前最近的一张独立图片（位置最接近且在链接之前），只认真封面
  var imgs = [];
  var re3 = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  while ((m = re3.exec(text)) !== null) {
    if (mdPicOk(m[1])) imgs.push({ src: m[1], pos: m.index });
  }
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!mdTitleOk(it.title)) continue;
    var pic = mdPicOk(it.pic) ? it.pic : '';
    if (!pic) {
      var best = null;
      for (var j = 0; j < imgs.length; j++) {
        if (imgs[j].pos < it.pos && (!best || imgs[j].pos > best.pos)) best = imgs[j];
      }
      if (best) pic = best.src;
    }
    out.push('<div class="thumb-block"><a href="' + it.url + '" title="' + String(it.title || '').replace(/"/g, '') + '"><img src="' + pic + '"></a></div>');
  }
  return out.join('\n');
}

// 单条腿：返回 { body, kind }（kind: 'html' | 'md'）或 null（失败）。
// kind=md 的腿只在第二段（allowMd）才发，见 fetchPage。
async function runLeg(leg, hdrs) {
  try {
    var body = '';
    var status = 0;
    if (leg.transport === 'fetch') {
      var ctrl = null;
      var abortTimer = null;
      try {
        if (typeof AbortController === 'function') ctrl = new AbortController();
      } catch (e) { ctrl = null; }
      var aborted = new Promise(function (resolve) {
        abortTimer = setTimeout(function () {
          try { if (ctrl) ctrl.abort(); } catch (e) {}
          resolve(null);
        }, leg.ms);
      });
      try {
        var r = await Promise.race([
          fetch(leg.u, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined }),
          aborted,
        ]);
        if (!r) return null;
        status = r.status;
        body = await withTimeout(r.text(), leg.ms, '');
      } finally { clearTimeout(abortTimer); }
    } else {
      var r2 = await withTimeout(req.get(leg.u, { headers: hdrs, timeout: leg.ms }), leg.ms, null);
      if (!r2) return null;
      status = r2.status || 0;
      body = (r2 && r2.data != null) ? String(r2.data) : '';
    }
    if (!body) return null;
    if (leg.kind === 'md') {
      if (!isJinaMd(body)) return null;
      if (status !== 200) return null;
      return { body: body, kind: 'md' };
    }
    if (isChallengePage(body)) return null;
    if (status !== 200) return null;
    return { body: body, kind: 'html' };
  } catch (e) { return null; }
}

// 直连腿（带重试）：单次质询率高，内部最多 3 次、1s 间隔；
// 其它腿先赢时本腿的后续重试自然被 firstSuccess 丢弃。
async function runDirectLeg(url, hdrs) {
  for (var i = 0; i < 3; i++) {
    var got = await runLeg({ via: 'direct', ms: 12000, kind: 'html', u: url, transport: 'req' }, hdrs);
    if (got) return got;
    if (i < 2) await sleep(1000);
  }
  return null;
}

// 取页两段式（v3，2026-11-11）：先竞速 HTML 腿，全部落败才走 jina 腿。
// v2 的教训：jina 与 HTML 腿并行竞速时，手机上 jina 常先赢（移动 IP 信誉好、
// Worker 腿两跳较慢），mdToListHtml 把 Markdown 转出的假条目（封面文件名当
// 标题、语言旗当封面、封面地址当详情地址）抢先返回，列表全是假条目、点开播不了。
// v3 改为 HTML 腿先行、jina 只作兜底；且 mdToListHtml 已加严校验（见该函数），
// 垃圾 Markdown 宁可返回空、也不出假条目。
async function fetchPage(url, referer, allowMd) {
  var hdrs = headers(referer);
  var hasFetch = (typeof fetch === 'function');
  // 第一段：HTML 腿竞速（Worker + 直连 + fetch）
  var htmlLegs = [
    { via: 'worker', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'req' },
  ];
  if (hasFetch) {
    htmlLegs.push({ via: 'worker-fetch', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'fetch' });
    htmlLegs.push({ via: 'direct-fetch', ms: 12000, kind: 'html', u: url, transport: 'fetch' });
  }
  var htmlJobs = htmlLegs.map(function (leg) { return runLeg(leg, hdrs); });
  htmlJobs.push(runDirectLeg(url, hdrs));
  var won = await firstSuccess(htmlJobs, 15000);
  if (won) return won.body;
  // 第二段：HTML 全败且允许时才走 jina 腿（只给列表用；详情/播放不用，见 getHtmlOnly）
  if (!allowMd) return '';
  var mdLegs = [
    { via: 'jina', ms: 15000, kind: 'md', u: JINA + url, transport: 'req' },
  ];
  if (hasFetch) {
    mdLegs.push({ via: 'jina-fetch', ms: 15000, kind: 'md', u: JINA + url, transport: 'fetch' });
  }
  var mdJobs = mdLegs.map(function (leg) { return runLeg(leg, hdrs); });
  var wonMd = await firstSuccess(mdJobs, 15000);
  if (!wonMd) return '';
  return mdToListHtml(wonMd.body);
}

// 列表用（首页/分类/搜索）：HTML 腿先行、全部落败才走 jina 兜底（见 fetchPage）。
async function getHtml(url, referer) {
  return fetchPage(url, referer, true);
}

// 详情/播放/embed 用：只走 HTML 腿（jina 的 Markdown 没有 data-* 属性，解不出播放地址）。
async function getHtmlOnly(url, referer) {
  return fetchPage(url, referer, false);
}

// POST /api/play/ 多腿竞速：Worker POST 腿 + 直连 POST 腿（+ fetch 腿，有 fetch 才发）。
// Worker 未部署时 Worker 腿速败；直连被质询时回挑战页、JSON 解析失败即算失败。
function parsePlayResp(r) {
  if (!r) return null;
  var data = r.data;
  var obj = {};
  if (typeof data === 'string') {
    try { obj = JSON.parse(data); } catch (e) { return null; }
  } else if (data && typeof data === 'object') obj = data;
  else return null;
  if (obj && obj.status === true && obj.data) return obj;
  if (obj && obj.data) return obj;
  return null;
}

async function postForm(url, form, referer) {
  var qs = new URLSearchParams(form).toString();
  var hdrs = { ...headers(referer), 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' };
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.post(viaWorker(url), qs, { headers: hdrs, timeout: 15000 }), 15000, null);
      return parsePlayResp(r);
    } catch (e) { return null; }
  })());
  jobs.push((async function () {
    for (var i = 0; i < 3; i++) {
      try {
        var r2 = await req.post(url, qs, { headers: hdrs, timeout: 12000 });
        var o = parsePlayResp(r2);
        if (o) return o;
      } catch (e) {}
      if (i < 2) await sleep(1000);
    }
    return null;
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 15000);
        try {
          var r3 = await fetch(viaWorker(url), { method: 'POST', headers: hdrs, body: qs, signal: ctrl ? ctrl.signal : undefined });
          var t3 = await r3.text();
          return parsePlayResp({ data: t3 });
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
    jobs.push((async function () {
      try {
        var ctrl2 = null;
        try { if (typeof AbortController === 'function') ctrl2 = new AbortController(); } catch (e) {}
        var timer2 = setTimeout(function () { try { if (ctrl2) ctrl2.abort(); } catch (e) {} }, 12000);
        try {
          var r4 = await fetch(url, { method: 'POST', headers: hdrs, body: qs, signal: ctrl2 ? ctrl2.signal : undefined });
          var t4 = await r4.text();
          return parsePlayResp({ data: t4 });
        } finally { clearTimeout(timer2); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, 20000);
  return won || {};
}

function absUrl(u) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

function cleanText(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// ---------- pornfhd dex：RC4 + base64 两层 ----------
// dex(seed, data, suffix)：
//   key = reverse(b64encode(seed + suffix))
//   mid = RC4(key, b64decode(data))        // mid 本身是一段 base64 文本
//   return b64decode(mid)                  // 还原出明文
// 三处用法（实测确认）：
//   token  = dex(tsId, data-ts-live, '_0x48107a')
//   embed  = dex(tsId, resp.data, 'undefined')   // suffix 字面量就是 'undefined'
//   config = dex(seed, data-config, '_0x59a0e4') // seed = b64(path+query).slice(6,22)
function b64enc(str) { return Buffer.from(String(str), 'utf8').toString('base64'); }
function b64decBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64');
}
function rc4(key, data) {
  var S = [], i, j = 0, a = 0, t;
  for (i = 0; i < 256; i++) S[i] = i;
  for (i = 0; i < 256; i++) { j = (j + S[i] + key.charCodeAt(i % key.length)) & 255; t = S[i]; S[i] = S[j]; S[j] = t; }
  var out = Buffer.alloc(data.length);
  j = 0;
  for (var n = 0; n < data.length; n++) {
    a = (a + 1) & 255; j = (j + S[a]) & 255; t = S[a]; S[a] = S[j]; S[j] = t;
    out[n] = data[n] ^ S[(S[a] + S[j]) & 255];
  }
  return out;
}
function dex(seed, data, suffix) {
  try {
    var key = b64enc(String(seed) + suffix).split('').reverse().join('');
    var mid = rc4(key, b64decBytes(data)).toString('latin1');
    return b64decBytes(mid).toString('latin1');
  } catch (e) { return ''; }
}

// 从 embed 地址取 path+query（seed 用），兼容 //video.javxxx.me 与 hugstream.xyz 等备用域
function embedPathQuery(embedUrl) {
  var u = String(embedUrl || '');
  var m = u.match(/^https?:\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i) || u.match(/^\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i);
  if (m) return m[1];
  try {
    var uu = new URL(u.startsWith('//') ? 'https:' + u : u);
    return uu.pathname + uu.search;
  } catch (e) { return ''; }
}

// 解一个 embed 页，返回 streamtape mp4 地址（失败返回 ''）
async function resolveEmbed(embedUrl, referer) {
  try {
    var full = absUrl(embedUrl);
    var html = await getHtmlOnly(full, referer);
    if (!html) return '';
    var cm = html.match(/data-config="([^"]+)"/);
    if (!cm) return '';
    var pq = embedPathQuery(full);
    if (!pq) return '';
    var seed = b64enc(pq).slice(6, 22);
    var cfgJson = dex(seed, cm[1], '_0x59a0e4');
    if (!cfgJson) return '';
    var cfg;
    try { cfg = JSON.parse(cfgJson); } catch (e) { return ''; }
    if (!cfg || !cfg.src) return '';
    var srcJson = b64decBytes(cfg.src).toString('latin1');
    var sources;
    try { sources = JSON.parse(srcJson); } catch (e) { return ''; }
    if (!Array.isArray(sources)) return '';
    for (var i = 0; i < sources.length; i++) {
      var f = sources[i] && (sources[i].file || sources[i].src || '');
      // 注意：streamtape 直链是 get_video?id=...&stream=1，URL 里没有 .mp4 后缀，
      // 不能用 /\.mp4/ 过滤；config 的 sources 只含真实视频文件，直接认 http(s) 地址即可。
      if (f && /^https?:\/\//i.test(f)) return f;
    }
    return '';
  } catch (e) { return ''; }
}

// 详情页 → 最终播放地址（现取现播；主 embed 不行则按 reserve 顺序重试）
async function resolvePlay(detailUrl) {
  var html = await getHtmlOnly(detailUrl);
  if (!html) return '';
  var live = (html.match(/data-ts-live="([^"]+)"/) || [])[1] || '';
  var tid = (html.match(/data-ts-id="([^"]+)"/) || [])[1] || '';
  if (!live || !tid) return '';
  var token = dex(tid, live, '_0x48107a');
  if (!token) return '';
  var resp = await postForm(HOST + '/api/play/', { sources: token, ep: '1', ver: '2' }, detailUrl);
  if (!resp || resp.status !== true || !resp.data) return '';
  var embeds = [];
  var main = dex(tid, resp.data, 'undefined');
  if (main) embeds.push(main);
  // 备用：reserve 是加密 JSON 数组 [{data, lo}]，每项 data 同样用 dex(tid, data, 'undefined') 解
  try {
    var reserveJson = dex(tid, resp.reserve || '', 'undefined');
    var reserve = JSON.parse(reserveJson);
    if (Array.isArray(reserve)) {
      for (var i = 0; i < reserve.length; i++) {
        if (reserve[i] && reserve[i].data) {
          var e = dex(tid, reserve[i].data, 'undefined');
          if (e && embeds.indexOf(e) === -1) embeds.push(e);
        }
      }
    }
  } catch (e) {}
  for (var j = 0; j < embeds.length; j++) {
    var file = await resolveEmbed(embeds[j], detailUrl);
    if (file) return { url: file, referer: absUrl(embeds[j]) };
  }
  return '';
}

function parseList(html) {
  var videos = [];
  var seen = new Set();
  if (!html) return videos;
  // 卡片：<div class="... thumb-block ..."> ... <a href="/video/xxx/" title="..."><img src="..."> ... <span class="duration">..</span> <span class="release">..</span>
  var blocks = html.split('thumb-block');
  for (var i = 1; i < blocks.length; i++) {
    var b = blocks[i].slice(0, 2500);
    var lm = b.match(/<a[^>]+href="(https?:\/\/[^"]*\/video\/[^"]+|\/video\/[^"]+)"[^>]*title="([^"]*)"/i)
      || b.match(/<a[^>]+href="(https?:\/\/[^"]*\/video\/[^"]+|\/video\/[^"]+)"/i);
    if (!lm) continue;
    var vodId = absUrl(lm[1].split('?')[0]);
    if (seen.has(vodId)) continue;
    seen.add(vodId);
    var name = cleanText(lm[2] || '');
    if (!name) {
      var tm = b.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      name = tm ? cleanText(tm[1].replace(/<[^>]+>/g, '')) : '';
    }
    if (!name) name = vodId.replace(/\/$/, '').split('/').pop();
    var pic = '';
    // 封面：站方 2026-11-11 起用懒加载，主 img 的 src 是 data:image/svg+xml
    // 空占位，真地址在 data-lazy-src（pics.pornfhd.com）/ noscript 兜底 /
    // data-wpsrc（i?.wp.com）；按此顺序显式取，绝不取 data: 占位与 404.png。
    // （旧版靠 <img[^>]+src= 的贪婪回溯恰好落到 data-lazy-src 上，换个属性
    // 顺序就取错，v3 改显式。）
    var pm = b.match(/data-lazy-src="(https?:\/\/[^"]+)"/i)
      || b.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i)
      || b.match(/data-wpsrc="(https?:\/\/[^"]+)"/i)
      || b.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    if (pm) pic = pm[1];
    if (pic && /\/404\.png$/i.test(pic)) pic = '';
    if (pic) pic = absUrl(pic);
    var remarks = '';
    var dm = b.match(/<span class="duration"[^>]*>([\s\S]*?)<\/span>/i);
    if (dm) remarks = cleanText(dm[1].replace(/<[^>]+>/g, ''));
    var hd = b.match(/<span class="hd-video"[^>]*>([\s\S]*?)<\/span>/i);
    if (hd) {
      var label = cleanText(hd[1]);
      remarks = remarks ? (label + ' · ' + remarks) : label;
    }
    videos.push({ vod_id: vodId, vod_name: name.substring(0, 120) || '未知', vod_pic: pic, vod_remarks: remarks });
  }
  return videos;
}

async function init(reqIn) { return {}; }
async function home(reqIn) { return { class: CLASSES, filters: {} }; }
async function homeVod(reqIn) {
  var html = await getHtml(HOST + '/');
  return { list: parseList(html).slice(0, 12) };
}
async function category(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var tid = String(body.tid || body.id || 'home');
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  var url;
  if (tid === 'home') {
    url = page > 1 ? HOST + '/page/' + page + '/' : HOST + '/';
  } else {
    var v = VPATH[tid] || '';
    // 第 1 页用站方规范 vXX 地址；翻页用站内实际生成的 /category/<slug>/page/N/（会 301 到 vXX 版）
    url = page > 1
      ? HOST + '/category/' + tid + '/page/' + page + '/'
      : HOST + '/' + v + '/category/' + tid + '/';
  }
  var html = await getHtml(url);
  var list = parseList(html);
  return { page: page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: 999, list: list };
}
async function detail(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var vid = String(body.id || '').trim();
  if (!vid) return { list: [] };
  var html = await getHtmlOnly(vid);
  var name = '';
  var tm = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    || html.match(/<title>([\s\S]*?)<\/title>/i);
  if (tm) name = cleanText(tm[1]).replace(/\s*-\s*JAVXXX\.Me\s*$/i, '').substring(0, 120);
  var pic = '';
  var pm = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (pm) pic = pm[1];
  var desc = '';
  var dm = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  if (dm) desc = cleanText(dm[1]);
  // 只存详情页地址；play() 里现取现播（token 约 19.5 小时过期且绑 IP，不能提前解好）
  // 字幕：token-key 登记——detail 只存详情页地址 vid，play 按 vid 查名（javsaga 同款 subRegister/subAttach 模式）；
  // 直链分支（id 已是 streamtape/m3u8 地址）查不到缓存是正常的，与 javtiful 一致。
  if (name) { subCacheName(vid, name); subWarm(vid); }
  return {
    list: [{
      vod_id: vid,
      vod_name: name || 'JavXXX',
      vod_pic: pic,
      vod_content: desc,
      vod_play_from: NAME,
      vod_play_url: '播放$' + vid,
    }],
  };
}
async function play(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var id = String(body.id || '').trim();
  if (id.indexOf('$') !== -1) id = id.split('$').pop().trim();
  // 字幕：按 vid（detail 地址）早启动搜索，与 resolvePlay 并行跑；直链分支查不到缓存时 subs 为空，不挂 subs 键
  var subsP = subSearchAll(subNormKey(id)).catch(() => []);
  // 已是直链（m3u8/mp4，或 streamtape 的 get_video 直链，URL 里无 .mp4 后缀）则直接播
  if (/\.(m3u8|mp4)(\?|$)/i.test(id) || /streamtape\.(com|net)\/get_video/i.test(id)) {
    return subAttach({ parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } }, subsP);
  }
  try {
    var r = await resolvePlay(id);
    if (r && r.url) {
      return subAttach({ parse: 0, url: r.url, header: { 'User-Agent': UA, 'Referer': r.referer || (HOST + '/') } }, subsP);
    }
  } catch (e) {}
  return subAttach({ parse: 1, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } }, subsP);
}
async function search(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var wd = String(body.wd || '').trim();
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page: page, pagecount: 1, limit: 20, total: 0, list: [] };
  // 站内搜索：/?s=<kw> 301 到 /search/<kw>/；直接用后者
  var url = page > 1
    ? HOST + '/search/' + encodeURIComponent(wd) + '/page/' + page + '/'
    : HOST + '/search/' + encodeURIComponent(wd) + '/';
  var html = await getHtml(url);
  var list = parseList(html);
  return { page: page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: 999, list: list };
}

// ---------------- 字幕聚合接线（2026-11-11） ----------------
// reqRaw + clean：字幕芯（subcore.js，2026-11-02 定版）需要的两个伴生 helpers，芯本身不含；
// 与已接芯的 py_javtiful 同款。芯原文逐字粘贴在后，未改一字。
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
function clean(s) { return cleanText(String(s || '').replace(/<[^>]*>/g, ' ')); }

// subNormKey / subAttach：javsaga 同款 token-key 模式——play 入参剥掉 "集名$" 前缀后按 vid 查名；
// 仅当结果带 url 且字幕命中时才挂 subs 键。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
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

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/homeVod', homeVod);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
