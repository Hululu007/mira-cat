import req from '../../util/req.js';

// 24JAV https://www4.24-jav.com/ —— WordPress 站（泰语界面，日语 AV）
// 帖子 = /<番号小写>/（如 /adn-814/）；播放 = 详情页 mee 播放器 iframe 的 token 拼确定性 master 链
//   https://<mee18player.com|meeplayer.com>/hlsr2/<40位hex>/master（VM 实测 4 个标题均直接返回 1080p 单档 master 播单，
//   无需调 player 的 /api/video + /api/resolve；该 API 在 VM 侧数次调用后回 403 Forbidden，属上游限流，
//   master 直链不受影响）。播单 variant 段为 .jpg 后缀分片（站方自家播放器同样如此），属 HLS 正常形态。
// 【2026-11-07 播放不可 seek 病因，已实证】播单本身是完整 VOD（#EXT-X-PLAYLIST-TYPE:VOD、#EXT-X-ENDLIST、
//   MEDIA-SEQUENCE 0/1、从 seg0000/index0 起、无 #EXT-X-START 偏移），不是 live 窗口、不是起始地址问题；
//   但每个分片都是 PNG 包裹的 TS：固定 545 字节 PNG 头（200x200 占位图）+ 188 对齐的真 TS（实测 4017/4017
//   同步命中，剥掉 PNG 头后 ffprobe 得 h264+aac）。分片以 image/jpeg 下发、.jpg 后缀。严格 HLS 内核见分片首字节
//   不是 TS 便建不起 VOD 时间轴：能播但不从头播、无法快进后退（Mira）；更严的内核直接播不了（REX 侧“貌似播放不了”）。
//   ?x=.ts 后缀无用（字节不变、仍是 PNG 头，实测 200 同长同字节）。修法（仿 porncgw 字节透传代理）：
//   detail/play 一律给本地 /proxy/ 地址，代理实时拉清单改写（master 的 variant 行与音频 URI、媒体清单的分片行
//   全部指回代理），分片字节透传时剥掉 PNG 头、以 video/mp2t 回给播放器；分片仍直连 CDN 取数，只在本地去头，
//   不经第三方中转。分片行末尾另加 .ts 后缀（过 ffmpeg 分片后缀白名单，代理入口先剥后缀再解码）。
//   【2026-11-07 19:45 真机回归】上一版推上后用户真机仍“播放时解析不出地址、无法播放”——旧版直链
//   （https://mee18player.com/.../master 或 .../480/index）此前在 Mira 上能播，回归点在代理地址形态，
//   不是前缀：实测 request.server.prefix=/spider/py_24jav/3、address().dynamic=js2p://_WEB_，前缀无错。
//   上一版两处偏离 Ero/JavFeed/ffm3u8 先例：①播单地址是路径段形式 /proxy/<b64>/<b64>，不含 m3u8 标记
//   （先例一律 /proxy/m3u8?u=&r= 或 /proxy/hls/<id>/.m3u8）；②改写后的清单行是无 scheme 的裸路径
//   /spider/py_24jav/3/proxy/...，播放器须以 js2p://_WEB_ 为基址解析，严格内核解析不出地址。
//   本版照 Ero/JavFeed 先例改：播放地址改查询串形式 /proxy/m3u8?u=&r=；清单改写行一律用请求 Host 拼
//   完整 http://127.0.0.1:<port>/spider/py_24jav/3/... 绝对地址，不再依赖播放器解析基址。
//   路径段形式 /proxy/<b64>/<b64>[.ts] 的路由保留兼容（已发出的旧播放地址仍能进代理，且同样受益于新 selfBase）。
//   代理拉取失败 302 回源地址，不比旧行为更差。
//   代理拉取失败 302 回源地址，不比旧行为更差。
//   另：1080p 档音视频分离（master 含 EXT-X-MEDIA 音频轨，视频分片纯视频、音频分片纯 AAC），旧版 detail 只给
//   variant 单链会丢音频；现 detail 一律给 master 链，由播放器自行取 variant + 音频轨。
// 分类：首页实测 70 个 /genre/<slug>/ + 菜单/归档实测的 /category/subthai|uncensored|censored/
//   （uncensored 即站方自有的“无码”分区；无码流出/无码破解/减码无独立 slug，不硬编，见 NOTES.md；
//   大屁股无对应 genre，'back' 为背后位而非臀部向，不作近义顶替）
// 搜索：/?s=<关键词>（站方 SearchAction 结构，实测 ADN-814 / MIRD 均回帖子）
// 翻页：归档 /page/<N>/（首页 /page/<N>/、分类与 genre 同理）
// 字幕：与模板同一套 Layer A（迅雷 > 迅雷看看 > SubtitleCat），仅番号条目接芯；单码率 1080p，不编假档位。
// 2026-11-14 无码修复：无码首页 24 条实测 19 条 upload18、5 条 mee；无码详情页多为 upload18 播放器
//   （无 mee iframe），旧版只认 mee 故 19 条全无线路。新增 upload18 路：详情页取
//   https://upload18.com/play/index/<slug>，播放时现取 window.PLAYER_CONFIG.m3u8（helvid.com 直链，
//   取法照 javmobile 已验过的 resolveUpload18，手机 UA 取页，token 约 30 分钟，播放时现取不缓存）。
//   分辨率说明（实测，不编档位）：mee master 只有 1080p 一档；helvid 播单是单档媒体清单（无 STREAM-INF，
//   alternate720 为空）。两路都只有一档，无法做分辨率选择；各给一条“正片/1080p”线。
const HOST = 'https://www4.24-jav.com';
const KEY = 'py_24jav';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const UA_MOB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const U18_REFERER = 'https://upload18.com/';

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  return s;
}

// 站方偶发 Cloudflare 520（实测搜索与分类页均有 transient 520），取数最多 3 次重试。
async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        timeout: 20000,
      });
      if (r.status && r.status !== 200) continue;
      const body = typeof r.data === 'string' ? r.data : '';
      if (body) return body;
    } catch (e) { /* retry */ }
  }
  return '';
}

async function getText(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': HOST + '/' },
        timeout: 15000,
      });
      if (r.status === 200 && typeof r.data === 'string' && r.data) return r.data;
    } catch (e) { /* retry */ }
  }
  return '';
}

// 列表卡片：<article class="box"> 内 <a class="tip" href="/<slug>/" title="番号 + 泰语标题"> + <img src>
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<article class="box"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const block = m[0];
    const aM = block.match(/<a[^>]+class="tip"[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i)
      || block.match(/<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"/i);
    if (!aM) continue;
    const href = aM[1].trim();
    if (!href.startsWith('/') && !href.startsWith(HOST)) continue;
    const path = href.startsWith(HOST) ? href.slice(HOST.length) : href;
    if (seen.has(path)) continue;
    seen.add(path);
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    const qM = block.match(/<span class="quality[^"]*">([^<]+)<\/span>/i);
    out.push({
      vod_id: path,
      vod_name: cleanLabel(aM[2]) || path.replace(/\//g, ''),
      vod_pic: imgM ? normUrl(imgM[1].trim()) : '',
      vod_remarks: qM ? cleanLabel(qM[1]) : '',
    });
  }
  return out;
}

// 详情页 mee 播放器 iframe：https://<mee18player.com|meeplayer.com>/play/<40位hex>
// （2026-11-05 实测 token 为 40 位 hex，旧口径称 32 位 md5，只取前 32 位拼 master 会 404；
//   另有同款 meeplayer.com，master 按 iframe 的 host 拼。）
function extractMeeMd5(html) {
  const m = String(html || '').match(/https?:\/\/(mee18player\.com|meeplayer\.com)\/play\/([a-f0-9]{32,64})/i);
  if (!m) return null;
  return { host: m[1].toLowerCase(), token: m[2].toLowerCase() };
}

function masterUrl(mee) {
  return 'https://' + (mee && mee.host ? mee.host : 'mee18player.com') + '/hlsr2/' + mee.token + '/master';
}

// 无码路：详情页 upload18 iframe（无 mee iframe 时走这路）。
function extractUpload18(html) {
  const m = String(html || '').match(/https?:\/\/(?:www\.)?upload18\.com\/play\/index\/([^"'\s<>]+)/i);
  if (!m) return '';
  return 'https://upload18.com/play/index/' + m[1].replace(/\/$/, '');
}

async function getTextWithUa(url, ua, referer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': ua, 'Referer': referer },
        timeout: 15000,
      });
      if (r.status === 200 && typeof r.data === 'string' && r.data) return r.data;
    } catch (e) { /* retry */ }
  }
  return '';
}

// upload18 播放页 -> window.PLAYER_CONFIG.m3u8（helvid.com 直链，单档媒体清单）。
// 必须用手机 UA 取页（helvid 按 UA 签发 token，d=apple）；token 约 30 分钟，播放时现取。
async function resolveUpload18(embedUrl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = await getTextWithUa(embedUrl, UA_MOB, HOST + '/');
    if (!html || html.indexOf('window.PLAYER_CONFIG') < 0) continue;
    // 直取 m3u8 字段（不依赖 JSON 键顺序；PLAYER_CONFIG 内嵌对象时 JSON.parse 会截断）。
    // 注意：页内 JSON 把 & 写成 \u0026、/ 写成 \/，直接取串必须先解码，否则查询串全并进 e= 致 404。
    let url = '';
    const direct = html.match(/"m3u8"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (direct) url = direct[1].replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
    if (!url) {
      const cfgM = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});/);
      if (cfgM) { try { url = String(JSON.parse(cfgM[1]).m3u8 || '').replace(/\\\//g, '/'); } catch (e) { /* ignore */ } }
    }
    if (/^https?:\/\/[^/]*helvid\.com\/m\//.test(url)) return url;
    if (/^https?:\/\//.test(url) && url.indexOf('.m3u8') >= 0) return url;
  }
  return '';
}

// 解析 master 播单的 STREAM-INF 档位（RESOLUTION + 下一行 variant URL）；失败返回空数组。
function parseMasterVariants(masterText) {
  const lines = String(masterText || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const inf = lines[i].match(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)/);
    if (inf && lines[i + 1] && lines[i + 1].trim() && !lines[i + 1].startsWith('#')) {
      out.push({ label: inf[2] + 'p', url: lines[i + 1].trim() });
    }
  }
  return out;
}

// ---------------- 播单/分片本地代理（2026-11-07：剥 PNG 头，修不可 seek；2026-11-07 晚：照 Ero/JavFeed 先例改地址形态） ----------------
// 病因见文件头：分片 = 545 字节 PNG 头 + 真 TS。播放器直触原地址建不起时间轴。
// 代理只做两件事：清单改写（子清单/音频轨/分片行全部指回代理）、分片字节透传时剥头。
// 地址用 Ero/JavFeed 同款查询串形式 {dynamic}{prefix}/proxy/m3u8?u={b64 目标}&r={b64 referer}，
// 改写后的行用请求 Host 拼完整 http:// 绝对地址（同 Ero/JavFeed 的 m3u8Proxy），播放器无需以 js2p:// 为基址解析。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 Ero/JavFeed 先例：查询串形式 /proxy/m3u8?u=&r=）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

async function fetchBytes(url, referer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
        timeout: 30000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (r.status >= 200 && r.status < 300 && r.data) return Buffer.from(r.data);
    } catch (e) { /* 重试，落空走 302 降级 */ }
  }
  return null;
}

// 剥掉分片开头的 PNG 占位头：找首个 188 对齐的 TS 同步点（0x47 连续三次隔 188 出现），
// 其前全部字节丢弃；已是纯 TS（首字节 0x47）或找不到同步点时原样返回，不比旧行为更差。
function stripPngPrefix(buf) {
  if (!buf || !buf.length) return buf;
  if (buf[0] === 0x47) return buf;
  for (let off = 0; off + 376 < buf.length; off++) {
    if (buf[off] === 0x47 && buf[off + 188] === 0x47 && buf[off + 376] === 0x47) {
      return buf.subarray(off);
    }
  }
  return buf;
}

// 改写清单正文：# 行的 URI="..."（音频轨）与非 # 行（variant/分片）一律改指回本地代理。
// selfBase 是完整 http:// 绝对基址（同 Ero/JavFeed：取请求 Host 拼 http://<host>/spider/py_24jav/3），
// 改写后的行不再是裸 /spider/... 路径，播放器无需以 js2p:// 为基址解析。
// 注意：ffmpeg 系严格内核按分片 URL 的后缀白名单（allowed_segment_extensions）放行分片，
// 代理地址本身无后缀会被拒（实测 "is not in allowed_segment_extensions"），故媒体清单的分片行
// 走路径段形式并在末尾加 .ts 后缀（b64url 字母表无 '.'，后缀无歧义；代理入口先剥后缀再解码）；
// master 的 variant 行与音频 URI 行是子播单、不进分片白名单检查，走查询串形式 /proxy/m3u8?u=&r=（同 Ero 先例）。
function rewrite24javM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = String(raw).includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            return `URI="${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}"`;
          } catch (e) { return all; }
        });
      }
      return line;
    }
    try {
      const abs = new URL(s, playlistUrl).toString();
      if (isMaster) return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
      return `${selfBase}/proxy/${b64url(abs)}/${b64url(referer || '-')}.ts`;
    } catch (e) { return line; }
  });
  return out.join('\n');
}

// 代理入口（两种地址格式都接受）：
// 主格式（本版 detail/play 发出）：/proxy/m3u8?u={b64url}&r={b64url}，同 Ero/JavFeed 先例；
// 兼容格式（上一版已发出的播放地址）：/proxy/{b64url 目标}/{b64url referer}，无查询串，分片行另带 .ts 后缀。
// 取回的文本是 #EXTM3U 即按清单改写；否则按分片字节透传并剥 PNG 头（支持 Range，便于拖动）。
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  if (!uEnc) {
    const wild = request?.params && request.params['*'];
    let segs = [];
    if (wild) segs = String(wild).split('/').filter(Boolean);
    else {
      const rawPath = String((request?.raw && request.raw.url) || request?.url || '').split('?')[0];
      const pi = rawPath.indexOf('/proxy/');
      if (pi >= 0) segs = rawPath.slice(pi + 7).split('/').filter(Boolean);
    }
    // 分片行带 .ts 后缀（过 ffmpeg 分片后缀白名单）；b64url 无 '.'，剥后缀无歧义。
    if (segs.length && segs[segs.length - 1].endsWith('.ts')) {
      segs[segs.length - 1] = segs[segs.length - 1].slice(0, -3);
    }
    if (segs.length) { uEnc = segs[0]; rEnc = segs[1] || ''; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  // 改写基址：同 Ero/JavFeed，用请求 Host 拼完整 http:// 绝对地址；上一版用裸 /spider/... 路径是
  // 2026-11-07 19:45 真机“解析不出地址”的病根（播放器须以 js2p:// 为基址解析裸路径）。
  // 无 Host 时退回 proxyUrl 拼出的 js2p:// 形式（与上一版行为一致，不比旧行为更差）。
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  try {
    const buf = await fetchBytes(target, referer);
    if (!buf || !buf.length) { reply.redirect(target); return; }
    const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
    if (head.trimStart().startsWith('#EXTM3U')) {
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.send(rewrite24javM3u8(buf.toString('utf8'), target, selfBase, referer));
      return;
    }
    const ts = stripPngPrefix(buf);
    const range = request?.headers && request.headers.range;
    const m = range ? String(range).match(/bytes=(\d+)-(\d*)/) : null;
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Accept-Ranges', 'bytes');
    if (m) {
      const start = Math.min(parseInt(m[1], 10) || 0, ts.length);
      const end = m[2] ? Math.min(parseInt(m[2], 10), ts.length - 1) : ts.length - 1;
      if (start <= end) {
        reply.code(206);
        reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + ts.length);
        reply.send(ts.subarray(start, end + 1));
        return;
      }
    }
    reply.send(ts);
  } catch (e) {
    try { reply.redirect(target); } catch (e2) { /* 已发送则忽略 */ }
  }
}

async function reqRaw(url, headers, timeoutMs) {
  try {
    let r;
    if (typeof req === 'function') {
      r = await req({ method: 'GET', url, headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5 });
    } else {
      r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    }
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
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
  const slug = (String(durl || '').match(/\/([a-z0-9-]+)\/?$/) || [])[1] || '';
  return slug || '';
}

function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}-\d{2,8}[A-Z]?\b/,
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
// ---------------- 分类（全部取自站方实测：菜单 + 首页 genre 云 + 归档页标题） ----------------
const GENRES = [
  ['3p', '三人行'], ['abuse', '虐待'], ['affair', '出轨'], ['back', '背后位'],
  ['bath', '洗浴'], ['beautiful-girl', '美少女'], ['big-tits', '巨乳'], ['blowjob', '口交'],
  ['bukkake', '颜射'], ['busty-fetish', '巨乳癖'], ['cervix', '宫颈'], ['cowgirl', '女上位'],
  ['creampie', '中出'], ['cuckold', '绿帽'], ['cum', '射精'], ['cunnilingus', '舔阴'],
  ['debut-production', '出道作'], ['dirty-talk', '淫语'], ['drama', '剧情'], ['elder-male', '大叔'],
  ['facials', '面部射精'], ['female-teacher', '女教师'], ['footjob', '足交'], ['gal', '辣妹'],
  ['glasses', '眼镜'], ['hot-spring', '温泉'], ['how-to', '教学'], ['huge-cocks', '巨根'],
  ['humiliation', '羞辱'], ['incest', '乱伦'], ['instructor', '教官'], ['kiss', '接吻'],
  ['lesbian', '女同'], ['lesbian-kiss', '女同接吻'], ['lotion', '乳液'], ['lotion-oil', '精油'],
  ['m-girl', 'M女'], ['male-squirting', '男潮'], ['married', '已婚'], ['married-woman', '人妻'],
  ['mature', '熟女'], ['mini', '娇小'], ['mother', '母亲'], ['muscle', '肌肉'],
  ['nasty', '下流'], ['nurse', '护士'], ['ol', '白领'], ['older-sister', '姐姐'],
  ['orgasm', '高潮'], ['orgy', '群交'], ['original-collaboration', '原创合作'], ['other-asian', '其他亚洲'],
  ['outdoors', '户外'], ['pantyhose', '连裤袜'], ['pov', '第一视角'], ['restraint', '束缚'],
  ['school-swimsuit', '学校泳装'], ['schoolgirls', '女学生'], ['shaved', '白虎'], ['slender', '苗条'],
  ['slut', '淫娃'], ['solowork', '单体作品'], ['squirting', '潮吹'], ['sun-tan', '晒痕'],
  ['sweat', '汗水'], ['swimsuit', '泳装'], ['titty-fuck', '乳交'], ['toy', '玩具'],
  ['urination', '排尿'], ['vibe', '振动棒'],
];

async function home() {
  const classes = [
    { type_id: 'home', type_name: '最新' },
    { type_id: 'category/subthai', type_name: '泰语字幕' },
    { type_id: 'category/uncensored', type_name: '无码' },
    { type_id: 'category/censored', type_name: '有码' },
  ];
  for (const [slug, name] of GENRES) classes.push({ type_id: 'genre/' + slug, type_name: name });
  let list = [];
  try { list = parseCards(await getHtml('/')).slice(0, 24); } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

function archivePath(id, page) {
  if (id === 'home' || !id) return page > 1 ? '/page/' + page + '/' : '/';
  return page > 1 ? '/' + id + '/page/' + page + '/' : '/' + id + '/';
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || 'home');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const path = archivePath(id, page);
  const html = await getHtml(path);
  const list = parseCards(html);
  const nextMarker = id === 'home' || !id ? '/page/' + (page + 1) + '/' : '/' + id + '/page/' + (page + 1) + '/';
  const hasNext = html.includes(nextMarker);
  return { page, pagecount: hasNext ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/?s=' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: parseCards(html) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  const h1M = html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '精彩视频';
  if (h1M) mainTitle = cleanLabel(h1M[1]) || mainTitle;
  else if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*-\s*24-Jav\.com.*$/i, '').trim() || mainTitle;
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM) posterPic = normUrl(ogM[1].trim());
  if (!posterPic) {
    const im = html.match(/<img[^>]+class="[^"]*entry-image[^"]*"[^>]+src="([^"]+)"/i);
    if (im) posterPic = normUrl(im[1].trim());
  }
  const mee = extractMeeMd5(html);
  let playUrl = '';
  if (!mee) {
    // 无码路：upload18 播放器。只记 embed 地址，播放时 play() 现取 m3u8（token 约 30 分钟）。
    const embed = extractUpload18(html);
    if (embed) playUrl = '正片$' + durl + '@@u18:' + embed;
  }
  if (mee) {
    // 读 master 播单只为取档位名作标签；播放地址一律给 master 走本地代理（代理内再拆 variant + 音频轨，
    // 1080p 音视频分离的片子才有声音；分片 PNG 头由代理剥掉，播放器才能建 VOD 时间轴、从头播、可拖动）。
    const master = masterUrl(mee);
    const variants = parseMasterVariants(await getText(master));
    const label = variants.length ? variants[0].label : '正片';
    const proxied = proxyUrl(reqIn, '/proxy/m3u8', master, durl);
    playUrl = label + '$' + durl + '@@' + (proxied || master);
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: mee ? '1080p' : '',
      vod_content: '24JAV',
      vod_play_from: '24JAV',
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) {
    // 自愈：重取详情页再提 md5 拼 master；仍无则走网页兜底，绝不返回 parse:0 空 url。
    if (durl) {
      const mee = extractMeeMd5(await getHtml(durl.startsWith('http') ? durl.slice(HOST.length) : durl));
      if (mee) target = masterUrl(mee);
    }
    if (!target) return { parse: 1, url: durl || HOST + '/' };
  }
  // 无码 upload18 路：现取 m3u8（token 约 30 分钟，绝不复用详情时的旧地址）；失败回网页兜底，绝不回空 url。
  if (target.indexOf('u18:') === 0) {
    const m3u8 = await resolveUpload18(target.slice(4));
    if (m3u8) {
      const uTitle = subNameCache.get(durl) || '';
      const uCode = subExtractCode(uTitle) || subExtractCode(durl);
      const uSubsP = uCode ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
      const uResult = { parse: 0, url: m3u8, header: { 'User-Agent': UA_MOB, 'Referer': U18_REFERER } };
      const uSubs = await uSubsP;
      if (uSubs && uSubs.length) uResult.subs = uSubs;
      return uResult;
    }
    return { parse: 1, url: durl || HOST + '/' };
  }
  // 旧缓存的详情可能仍带 mee 直链：统一包一层本地代理再出（已是代理地址的不重复包）。
  if (target.indexOf('/proxy/') < 0 && /mee(18)?player\.com/i.test(target)) {
    const proxied = proxyUrl(reqIn, '/proxy/m3u8', target, durl || HOST + '/');
    if (proxied) target = proxied;
  }
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_24jav', name: '24JAV', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.get('/proxy/*', m3u8Proxy);
      fastify.get('/proxy/m3u8', m3u8Proxy);
      fastify.post('/search', search);
    },
  };
}
