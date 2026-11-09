import req from '../../util/req.js';

const KEY = 'py_91duanju';
const NAME = '91成人短剧';
// 2026-10-29 诊断坐实：旧域名 301 迁到 91crdjai.com（详情/播放页同理），
// 蜘蛛全靠请求库跟随 301 才工作；App 内任一环节不跟随就会拿到 167 字节 301 页而播不了。
// 故 HOST 直接改为新域名（headers/detail/play 的 Referer 与拼 URL 均派生自 HOST，无需逐处改）。
const HOST = 'https://91crdjai.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;
// 封面为 AES-128-CBC 加密存储（与 818/八卦同一套密钥），需走用户自建解密 Worker
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev';
// 2026-11-10：取页/API 中转 Worker（Cloudflare 边缘代取 91 站页面与接口）。
// 站方走 Cloudflare，设备侧（VPN 出口）直连会被拦/返回空页，表现为“暂无数据”
// 与“载入失败：网络…”；Worker 先行、失败回落直连。Worker 需用户部署
// （duanju91-fetch.li768435813.workers.dev），未部署前行为与原来一致。
const FETCH_WORKER = 'https://duanju91-fetch.li768435813.workers.dev';
// 播放代理 Worker（用户已部署 dj-hls：/up 暂存清单、/p 取清单、/s 代拉分片密钥）。
// 2026-11-10：播放改走 dj-hls 为首选——Railway 中转（/hls）在用户手机上能打开
// 清单但直接卡住、一秒都播不了；dj-hls 全程走 Cloudflare，不走 Railway。
const DJ_WORKER = 'https://dj-hls.li768435813.workers.dev';

function t(v) {
  return String(v == null ? '' : v).trim();
}

function proxyCover(url) {
  const u = t(url);
  if (!u || !u.startsWith('http')) return u;
  // Worker 需在白名单中放行 pic.drleao.cn 才能解密出图
  return `${IMG_PROXY}/img?url=${encodeURIComponent(u)}`;
}

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

async function fetchHtml(url, referer) {
  // 2026-11-10：先走 Worker（Cloudflare 边缘代取），拿到真页面才用；
  // Worker 未部署时请求会落到 Cloudflare 错误页（404 但正文近 20KB），
  // 故必须校验内容是真站页（有链接、非错误标题），否则回落直连。
  if (FETCH_WORKER) {
    try {
      const { data } = await req.get(FETCH_WORKER + '/?u=' + encodeURIComponent(url), { headers: headers(referer), timeout: 20000 });
      const html = String(data || '');
      if (isRealPage(html)) return html;
    } catch (e) {}
  }
  try {
    const { data } = await req.get(url, { headers: headers(referer), timeout: 20000 });
    return String(data || '');
  } catch (e) {
    return '';
  }
}

// 校验 Worker 回来的内容是不是真站页（而非 Cloudflare 错误页）
function isRealPage(text) {
  if (!text || text.length < 100) return false;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') {
      if (typeof j.type === 'string' && j.type.includes('developers.cloudflare.com')) return false;
      if (j.status != null || j.data != null || j.items != null) return true;
      return false;
    }
  } catch (e) {}
  if (text.length < 500) return false;
  if (/error code:/i.test(text)) return false;
  if (/Just a moment/i.test(text)) return false;
  const tm = text.match(/<title>([\s\S]*?)<\/title>/i);
  const title = tm ? tm[1].trim() : '';
  if (/^(Page not found|Attention Required|Error)/i.test(title)) return false;
  if (text.indexOf('<a ') < 0 && text.indexOf('<a>') < 0) return false;
  return true;
}

// POST JSON：先走 Worker，失败回落直连（供 play() 的 playback 接口用）
async function postJson(url, postHeaders) {
  if (FETCH_WORKER) {
    try {
      const { data } = await req.post(FETCH_WORKER + '/?u=' + encodeURIComponent(url), {}, { headers: postHeaders, timeout: 15000 });
      const raw = String(data || '');
      if (isRealPage(raw)) {
        const j = typeof data === 'string' ? JSON.parse(data) : data;
        if (j && typeof j === 'object') return j;
      }
    } catch (e) {}
  }
  try {
    const { data } = await req.post(url, {}, { headers: postHeaders, timeout: 15000 });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    return null;
  }
}

// 2026-10-29：HLS 中转（与黄果同因：站方自带播放器在用户手机浏览器里也报
// “资源加载失败”，91 还明说“留言您所在地区”——即 yd-hls / tp*.drleao.cn 对用户
// 所在地区不给资源）。播放时先向用户自建的 javsb-relay 服务（Railway）要一份中转版 m3u8
// （服务在 Railway 抓流、字节原样转发、不解密），中转可用就走中转，
// 中转未部署或同样不可用时回落直连，行为不比原来差。
const RELAY = 'https://javsb-relay-production.up.railway.app/';
async function relayM3u8(m3u8Url) {
  if (!/\.m3u8/i.test(m3u8Url)) return '';
  try {
    const relayUrl = RELAY + 'hls?url=' + encodeURIComponent(m3u8Url);
    const { data } = await req.get(relayUrl, { headers: headers(''), timeout: 15000 });
    if (String(data || '').includes('#EXTM3U')) return relayUrl;
  } catch (e) {}
  return '';
}

// 清单内分片/密钥地址改写到 dj-hls /s 中转
function rewritePlaylistToDj(text, playlistUrl) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (const line of lines) {
    const tr = line.trim();
    if (!tr) { out.push(line); continue; }
    if (tr.charAt(0) === '#') {
      out.push(line.replace(/URI="([^"]+)"/g, (mm, u) => {
        let abs = u;
        try { abs = new URL(u, playlistUrl).href; } catch (e) {}
        return 'URI="' + DJ_WORKER + '/s?u=' + encodeURIComponent(abs) + '"';
      }));
      continue;
    }
    let abs2 = tr;
    try { abs2 = new URL(tr, playlistUrl).href; } catch (e) {}
    out.push(DJ_WORKER + '/s?u=' + encodeURIComponent(abs2));
  }
  return out.join('\n');
}

// dj-hls 代理线：手机侧取清单 → 改写分片/密钥到 dj-hls /s → POST /up 暂存 →
// 回读校验后返回 /p/ 地址；失败返回 ''（调用方回落 Railway 中转/直连）
async function djHlsLine(m3u8Url, referer) {
  try {
    const { data } = await req.get(m3u8Url, { headers: { 'User-Agent': UA, Referer: referer || HOST + '/' }, timeout: 15000 });
    const text = String(data || '');
    if (!text.includes('#EXTM3U')) return '';
    const rewritten = rewritePlaylistToDj(text, m3u8Url);
    for (let attempt = 0; attempt < 2; attempt++) {
      let relay = '';
      try {
        const up = await req.post(DJ_WORKER + '/up', rewritten, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'User-Agent': UA }, timeout: 15000 });
        const upBody = String(up.data || '');
        let parsed = null;
        try { parsed = JSON.parse(upBody); } catch (e) {}
        relay = parsed && parsed.url ? String(parsed.url) : '';
      } catch (e) {}
      if (!relay.startsWith(DJ_WORKER + '/p/')) return '';
      try {
        const chk = await req.get(relay, { headers: { 'User-Agent': UA }, timeout: 10000 });
        if (String(chk.data || '').includes('#EXTM3U')) return relay;
      } catch (e) {}
    }
  } catch (e) {}
  return '';
}

function isVideoFormat(url) {
  const low = String(url || '').toLowerCase();
  return ['.m3u8', '.mp4', '.flv', '.ts'].some((k) => low.includes(k));
}

// 匹配 class 含 card 的 <a> 卡片
function parseList(html) {
  const items = [];
  if (!html) return items;
  const seen = {};
  const cardRe = /<a[^>]*\bclass\s*=\s*["'][^"']*\bcard\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRe.exec(html))) {
    const tag = m[0];
    const block = m[1];
    const hm = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hm) continue;
    const href = t(hm[1]);
    let p = href;
    try {
      const u = new URL(href, HOST);
      p = u.pathname;
    } catch (e) {}
    const seg = p.split('/').filter(Boolean);
    if (seg.length < 2) continue;
    const channel = seg[0];
    const vid = seg[1];
    if (seen[vid]) continue;

    let title = '';
    for (const attr of ['data-track-item-name', 'alt', 'title']) {
      const tm = (tag + block).match(new RegExp(attr + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
      if (tm && t(tm[1])) {
        title = t(tm[1]);
        break;
      }
    }
    if (!title) {
      const tm = block.match(/<span[^>]*class="[^"]*p-title[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      if (tm) title = t(tm[1].replace(/<[^>]+>/g, ''));
    }
    if (!title) title = vid;

    let cover = '';
    for (const attr of ['data-original', 'data-src', 'data-echo', 'data-url']) {
      const im = block.match(new RegExp(attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i'));
      if (im) {
        cover = t(im[1]);
        break;
      }
    }
    if (!cover) {
      // 注意：用 (?<![\w-]) 避免匹配到 data-src/data-preview-src 等
      const im = block.match(/<img[^>]*?(?<![\w-])src\s*=\s*["']([^"']+)["']/i);
      if (im) cover = t(im[1]);
    }
    const low = cover.toLowerCase();
    if (['data:', 'load.gif', 'loading.gif', 'placeholder'].some((b) => low.includes(b))) cover = '';
    if (cover.startsWith('//')) cover = 'https:' + cover;
    else if (cover.startsWith('/')) cover = HOST + cover;

    let remarks = '';
    const rm = block.match(/<span[^>]*class="[^"]*(?:badge|eps-flag)[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    if (rm) remarks = t(rm[1].replace(/<[^>]+>/g, ''));

    seen[vid] = 1;
    items.push({
      vod_id: channel + '|' + p,
      vod_name: title,
      vod_pic: proxyCover(cover),
      vod_remarks: remarks,
    });
  }
  return items;
}

async function home() {
  return {
    class: [
      { type_id: 'duanju', type_name: '成人短剧' },
      { type_id: 'manju', type_name: '成人漫剧' },
      { type_id: 'zhenrenju', type_name: '真人剧' },
      { type_id: 'shipin', type_name: '成人视频' },
      { type_id: 'manhua', type_name: '成人漫画' },
      { type_id: 'xiaoshuo', type_name: '成人小说' },
      { type_id: 'paihang', type_name: '热播榜' },
      { type_id: 'biaoqian', type_name: '标签榜' },
      { type_id: 'biaoqian/ntr', type_name: 'NTR' },
      { type_id: 'biaoqian/fancha', type_name: '反差' },
      { type_id: 'biaoqian/cabian', type_name: '擦边' },
    ],
    filters: {},
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.id || 'duanju');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const url = page > 1 ? `${HOST}/${tid}/page/${page}/` : `${HOST}/${tid}/`;
  const html = await fetchHtml(url, HOST + '/');
  const list = parseList(html);
  let pagecount = page + (list.length ? 1 : 0);
  let mx = 1;
  const re = /\/page\/(\d+)\//g;
  let mm;
  while ((mm = re.exec(html))) {
    const v = parseInt(mm[1], 10);
    if (v > mx) mx = v;
  }
  if (mx > 1) pagecount = mx;
  return { list, page, pagecount, limit: PAGE_SIZE, total: 999 };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { list: [], page, pagecount: page, limit: PAGE_SIZE, total: 0 };
  let url = `${HOST}/search/?q=${encodeURIComponent(wd)}`;
  if (page > 1) url += `&page=${page}`;
  const html = await fetchHtml(url);
  const list = parseList(html);
  return { list, page, pagecount: page + (list.length ? 1 : 0), limit: PAGE_SIZE, total: list.length };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of (ids || []).filter(Boolean)) {
    const rawStr = t(raw);
    let channel = '';
    let path = rawStr;
    if (rawStr.includes('|')) {
      const parts = rawStr.split('|');
      channel = parts[0];
      path = parts.slice(1).join('|');
    }
    const url = path.startsWith('http') ? path : HOST + path;
    const html = await fetchHtml(url, HOST + '/');
    if (!html) continue;

    let title = '';
    let tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (tm) title = t(tm[1].replace(/<[^>]+>/g, ''));
    if (!title) {
      tm = html.match(/<title>([\s\S]*?)<\/title>/);
      if (tm) title = t(tm[1].split(/[-_|]/)[0]);
    }

    let pic = '';
    for (const attr of ['data-original', 'data-src', 'data-echo', 'data-url']) {
      const pm = html.match(new RegExp(attr + '\\s*=\\s*["\']([^"\']+\\.(?:jpg|jpeg|png|webp)[^"\']*)["\']', 'i'));
      if (pm) {
        pic = t(pm[1]);
        break;
      }
    }
    if (!pic) {
      const pm = html.match(/<meta[^>]+og:image[^>]+content=["']([^"']+)["']/i);
      if (pm) pic = t(pm[1]);
    }
    if (pic.startsWith('//')) pic = 'https:' + pic;
    else if (pic.startsWith('/')) pic = HOST + pic;

    let intro = '';
    for (const pat of [
      /<meta[^>]+og:description[^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ]) {
      const im = html.match(pat);
      if (im && t(im[1])) {
        intro = t(im[1]);
        break;
      }
    }

    // 播放列表：集数链接
    const playUrls = [];
    const seen = {};
    const basePath = path.replace(/\/$/, '');
    const epRe = /href=["']([^"']+)["'][^>]*>\s*(\d+)\s*</g;
    let em;
    while ((em = epRe.exec(html))) {
      let href = t(em[1]);
      const epNo = t(em[2]);
      if (basePath && href.includes(basePath)) {
        if (href.startsWith('/')) href = HOST + href;
        if (seen[href]) continue;
        seen[href] = 1;
        playUrls.push(`第${epNo}集$${href}`);
      }
    }
    if (!playUrls.length) {
      const pmRe = /href=["']([^"']*(?:\/play\/|-\d+-\d+\.html)[^"']*)["']/g;
      while ((em = pmRe.exec(html))) {
        let href = t(em[1]);
        if (href.startsWith('/')) href = HOST + href;
        else if (!href.startsWith('http')) continue;
        if (seen[href]) continue;
        seen[href] = 1;
        playUrls.push(`播放$${href}`);
      }
    }

    list.push({
      vod_id: rawStr,
      vod_name: title,
      vod_pic: proxyCover(pic),
      vod_content: intro,
      vod_remarks: playUrls.length ? `共${playUrls.length}集` : '',
      vod_play_from: playUrls.length ? NAME : '',
      vod_play_url: playUrls.join('#'),
    });
  }
  return { list };
}

// 解析出最终可播地址：duanju91-fetch Worker 直播改写首选（全程 Cloudflare，
// 现取现改、不需暂存；Railway 中转在用户手机上能打开清单但直接卡住，
// dj-hls /up+/p/ 暂存回 404 均不可靠）→ Railway 中转 → 直连
// 2026-11-10：Worker 地址用 /playlist.m3u8?u= 形式（路径带 .m3u8 后缀，
// 部分播放器按扩展名认类型；Worker 忽略路径，只认 ?u= 参数）。
async function bestPlayUrl(m3u8Url, referer) {
  if (/\.m3u8/i.test(m3u8Url) && FETCH_WORKER) {
    return FETCH_WORKER + '/playlist.m3u8?u=' + encodeURIComponent(m3u8Url);
  }
  if (/\.m3u8/i.test(m3u8Url)) {
    const dj = await djHlsLine(m3u8Url, referer);
    if (dj) return dj;
  }
  const relay = await relayM3u8(m3u8Url);
  return relay || m3u8Url;
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const raw = t(body.id);
  if (!raw) return { parse: 1, url: raw };
  if (isVideoFormat(raw)) {
    const url = await bestPlayUrl(raw, HOST + '/');
    return { parse: 0, url, header: { 'User-Agent': UA, Referer: HOST + '/' } };
  }
  // 2026-11-10 修“视频加载失败”：详情页 "current" 的 src 为空，真 m3u8 只在
  // POST /api/videos/{seriesId}/episodes/{ep}/playback 里（streams.main），
  // 匿名即可调用；先走 API，失败再回落原来的 HTML 抓取。
  const apiM = raw.match(/\/duanju\/(\d+)-[^/]+\/(\d+)\/?/);
  if (apiM) {
    const apiUrl = HOST + '/api/videos/' + apiM[1] + '/episodes/' + apiM[2] + '/playback';
    const j = await postJson(apiUrl, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
      Referer: raw.startsWith('http') ? raw : HOST + '/',
    });
    const main = j && j.status === 1 && j.data && j.data.streams && j.data.streams.main;
    if (main) {
      let m3u8Url = String(main).replace(/\\u0026/g, '&');
      if (m3u8Url.startsWith('//')) m3u8Url = 'https:' + m3u8Url;
      const url = await bestPlayUrl(m3u8Url, raw);
      return { parse: 0, url, header: { 'User-Agent': UA, Referer: raw } };
    }
  }
  const html = await fetchHtml(raw, HOST + '/');
  if (!html) return { parse: 1, url: raw };

  let m3u8Url = '';
  let m = html.match(/"current"\s*:\s*\{[^{}]*"src"\s*:\s*"([^"]+)"/);
  if (m) m3u8Url = m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
  if (!m3u8Url) {
    for (const v of ['player_aaaa', 'player_data']) {
      const vm = html.match(new RegExp(v + '\\s*=\\s*(\\{[^;]*\\})'));
      if (vm) {
        try {
          const data = JSON.parse(vm[1]);
          m3u8Url = data.url || data.link || '';
          if (m3u8Url) break;
        } catch (e) {}
      }
    }
  }
  if (!m3u8Url) {
    const um = html.match(/(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)[^\s"'<>\\]*)/);
    if (um) m3u8Url = um[1];
  }
  if (m3u8Url) {
    if (m3u8Url.startsWith('//')) m3u8Url = 'https:' + m3u8Url;
    else if (m3u8Url.startsWith('/')) m3u8Url = HOST + m3u8Url;
    const url = await bestPlayUrl(m3u8Url, raw);
    return { parse: 0, url, header: { 'User-Agent': UA, Referer: raw } };
  }
  return { parse: 1, url: raw, header: { 'User-Agent': UA, Referer: HOST + '/' } };
}

export default function spider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
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
