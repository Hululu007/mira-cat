// 蜜桃视频 - CatPawOpen 格式
// 2026-11-10 重新加回：之前蜜桃不在 mira-cat 包里（router 无注册），用户手机上看到的
// 是旧包残留源，故“加载不出内容”。本站点 honeypeach.cc，后端 API 需先握手：
// 设备号请求 /api/handshake，若服务端下发挑战 (need_chal)，先解一道 FNV-1a PoW
// 换回 sid/skey，再用 HMAC-SHA256 对规范串签名调业务接口。
// 逻辑与 lailai-rex 的 mitao_rex 1.0.5 同源（只读参考），Node 侧用内置 crypto
// 做 SHA-256/HMAC，PoW 用纯 JS FNV-1a。
// 视频分类数据实际来自 missav，播放走已部署的 Worker 代理只取 720p
// (1080p 多为 AV1 编码，iOS 播不了)；其余分类走站内 /api/play。
import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_mitao';
const NAME = '蜜桃视频';
const BASE = 'https://honeypeach.cc';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const MISSAV_WORKER = 'https://missav-emby.li768435813.workers.dev';
// 2026-11-10：握手代理 Worker（只转发 /api/handshake，两步握手走同一固定出口，
// 手机走 VPN 出口轮换时直接握手会被拒导致加载不出任何内容；Worker 已部署验证通过）
// 失败时回落直连。
const HS_WORKER = 'https://mitao-handshake.li768435813.workers.dev';
const PAGE_SIZE = 20;

function t(v) {
  return String(v == null ? '' : v).trim();
}

function randomText(n) {
  const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < n; i++) out += pool.charAt(Math.floor(Math.random() * pool.length));
  return out;
}

function makeDeviceId() {
  return randomText(12) + Date.now().toString(16);
}

// ---------- SHA-256 / HMAC-SHA256（Node 内置 crypto） ----------
function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function hmacSha256Hex(keyHex, text) {
  return crypto.createHmac('sha256', Buffer.from(String(keyHex || ''), 'hex')).update(String(text), 'utf8').digest('hex');
}

// ---------- PoW：FNV-1a 32 位迭代（与站方 hpsign.js 一致） ----------
function fnv1a(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex8(n) {
  let h = (n >>> 0).toString(16);
  while (h.length < 8) h = '0' + h;
  return h.slice(-8);
}

function powDigest(challenge, nonceText) {
  let cur = fnv1a(challenge + ':' + nonceText);
  for (let round = 0; round < 4; round++) cur = fnv1a(hex8(cur) + challenge);
  return hex8(cur);
}

function solvePow(challenge, bits) {
  let prefix = '';
  for (let i = 0; i < (bits >> 2); i++) prefix += '0';
  for (let n = 0; n < 20000000; n++) {
    const nonceText = n.toString(16);
    if (powDigest(challenge, nonceText).indexOf(prefix) === 0) return challenge + '.' + nonceText;
  }
  return '';
}

// ---------- HTTP 与会话 ----------
const session = { dev: '', sid: '', skey: '', exp: 0 };

function resetSession(newDevice) {
  if (newDevice) session.dev = makeDeviceId();
  session.sid = '';
  session.skey = '';
  session.exp = 0;
}

async function httpGetJson(url, headers) {
  const res = await req.get(url, { headers, timeout: 20000 });
  const body = res && res.data !== undefined ? res.data : res;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  return body || {};
}

async function handshakeOnce() {
  if (!session.dev) session.dev = makeDeviceId();
  const url = BASE + '/api/handshake?dev=' + encodeURIComponent(session.dev);
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  let data = await hsGet(url, headers);
  if (data && data.need_chal) {
    const token = solvePow(t(data.need_chal), parseInt(data.bits || '16', 10) || 16);
    if (!token) return false;
    data = await hsGet(url + '&c=' + encodeURIComponent(token), headers);
  }
  if (data && data.sid && data.skey) {
    session.sid = t(data.sid);
    session.skey = t(data.skey);
    session.exp = parseInt(data.exp || '0', 10) || 0;
    return true;
  }
  return false;
}

// 握手请求先走代理 Worker（固定出口），Worker 失败时回落直连
async function hsGet(url, headers) {
  if (HS_WORKER) {
    try {
      const w = await httpGetJson(HS_WORKER + '/?u=' + encodeURIComponent(url), headers);
      if (w && (w.need_chal || w.sid)) return w;
    } catch (e) {}
  }
  return httpGetJson(url, headers);
}

async function ensureSession() {
  const nowSec = Math.floor(Date.now() / 1000);
  if (session.sid && session.skey && nowSec < session.exp - 60) return;
  // 服务端偶发拒收 PoW 或挑战，换设备号最多重试 2 次（避免每次调用空烧太久）
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) resetSession(true);
    if (await handshakeOnce()) return;
  }
  throw new Error('蜜桃握手失败');
}

function looksRateLimited(status, body) {
  if (status === 429 || (body && body.code === 429)) return true;
  const msg = t(body && (body.err || body.msg)).toLowerCase();
  if (!msg) return false;
  const marks = ['rl_sid', 'rl_dev', 'rl_ip', 'rate', 'limit', 'toomany', 'busy'];
  for (const m of marks) if (msg.indexOf(m) !== -1) return true;
  return false;
}

async function signedGet(path, query) {
  await ensureSession();
  async function attempt() {
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomText(8) + Date.now().toString(16);
    const canonical = ['GET', path, query, sha256Hex(''), ts, nonce, session.sid].join('\n');
    const signature = hmacSha256Hex(session.skey, canonical);
    const url = BASE + path + (query ? '?' + query : '');
    const res = await req.get(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'X-Hp-Sid': session.sid,
        'X-Hp-Ts': ts,
        'X-Hp-Nonce': nonce,
        'X-Hp-Sign': signature,
        Referer: BASE + '/',
      },
      timeout: 20000,
    });
    const body = res && res.data !== undefined ? res.data : res;
    return { status: (res && res.status != null) ? res.status : 200, body: typeof body === 'string' ? (function () { try { return JSON.parse(body); } catch (e) { return {}; } })() : (body || {}) };
  }
  let r = await attempt();
  if (r.status === 401 || (r.body && r.body.code === 401)) {
    resetSession(false);
    await ensureSession();
    r = await attempt();
  }
  if (looksRateLimited(r.status, r.body)) {
    resetSession(true);
    await ensureSession();
    r = await attempt();
  }
  return r.body;
}

// ---------- 列表 ----------
// type_id 编码：key|cat|src|sub（与 REX 的 catTriple 一致）
function splitCat(raw) {
  const parts = t(raw).split('|');
  return { cat: parts[0] || '', src: parts[1] || '', sub: parts[2] || '' };
}

function coverOf(item) {
  const u = t(item && (item.cover_n || item.cover || ''));
  if (!u) return '';
  if (u.indexOf('://') !== -1) return u;
  return u.charAt(0) === '/' ? BASE + u : u;
}

async function fetchModule(key, catTriple, page) {
  const c = splitCat(catTriple);
  let query = 'key=' + encodeURIComponent(key) +
    '&cat=' + encodeURIComponent(c.cat) +
    '&page=' + (parseInt(page, 10) || 1);
  if (c.src) query += '&src=' + encodeURIComponent(c.src);
  if (c.sub) query += '&sub=' + encodeURIComponent(c.sub);
  const data = await signedGet('/api/module', query);
  const rows = (data && data.list) || [];
  return rows.map((item) => {
    if (!item || item.id == null) return null;
    const title = t(item.title || item.id);
    // vod_id 编码：key|id|src|sub|title（detail/play 用）
    const vid = [key, t(item.id), t(item.src || c.src || ''), t(c.sub || ''), title].join('|');
    return {
      vod_id: vid,
      vod_name: title,
      vod_pic: coverOf(item),
      vod_remarks: t(item.remark || item.desc || ''),
    };
  }).filter(Boolean);
}

function splitVid(raw) {
  const parts = t(raw).split('|');
  return { k: parts[0] || '', i: parts[1] || '', s: parts[2] || '', u: parts[3] || '', t: parts.slice(4).join('|') || '' };
}

async function home() {
  // 2026-11-10：用户令分类加回 24 个（视频 13 + 短剧 7 + 擦边/动漫/黑料/国产 4）；
  // 原来猫源里的蜜桃（三级片那个）不在当前包里，删旧重导后即消失，不用在代码里删
  return {
    class: [
      { type_id: 'video|new|missav|', type_name: '最近更新' },
      { type_id: 'video|release|missav|', type_name: '新作上市' },
      { type_id: 'video|chinese-subtitle|missav|', type_name: '中文字幕' },
      { type_id: 'video|madou|missav|', type_name: '麻豆传媒' },
      { type_id: 'video|uncensored-leak|missav|', type_name: '无码流出' },
      { type_id: 'video|monthly-hot|missav|', type_name: '热门视频' },
      { type_id: 'video|fc2|missav|', type_name: 'FC2' },
      { type_id: 'video|heyzo|missav|', type_name: 'HEYZO' },
      { type_id: 'video|tokyohot|missav|', type_name: '东京热' },
      { type_id: 'video|1pondo|missav|', type_name: '一本道' },
      { type_id: 'video|caribbeancom|missav|', type_name: '加勒比' },
      { type_id: 'video|today-hot|missav|', type_name: '今日热门' },
      { type_id: 'video|weekly-hot|missav|', type_name: '本周热门' },
      { type_id: 'duanju|tuijian|huangguo|0', type_name: '短剧推荐' },
      { type_id: 'duanju|all|huangguo|0', type_name: '短剧精选' },
      { type_id: 'duanju|chiguo|huangguo|0', type_name: '赤果短剧' },
      { type_id: 'duanju|zhenren|huangguo|0', type_name: '真人短剧' },
      { type_id: 'duanju|duanju|huangguo|0', type_name: 'AI成人短剧' },
      { type_id: 'duanju|manju|huangguo|0', type_name: 'AI成人漫剧' },
      { type_id: 'duanju|rank|huangguo|0', type_name: '短剧排行' },
      { type_id: 'caibian|0|huangdou|0', type_name: '擦边短剧' },
      { type_id: 'shortv|all|dongman|0', type_name: '蜜桃动漫' },
      { type_id: 'heiliao|0|huangdou|0', type_name: '黑料吃瓜' },
      { type_id: 'guochan|||', type_name: '国产精品' },
    ],
    filters: {},
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.id || 'video|new|missav|');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const parts = tid.split('|');
  const key = parts[0] || 'video';
  const catTriple = parts.slice(1).join('|');
  let list = [];
  try {
    list = await fetchModule(key, catTriple, page);
  } catch (e) {
    list = [];
  }
  return { list, page, pagecount: page + (list.length ? 1 : 0), limit: PAGE_SIZE, total: 999 };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { list: [], page, pagecount: page, limit: PAGE_SIZE, total: 0 };
  const keys = ['video', 'duanju', 'shortv', 'guochan', 'caibian'];
  const merged = [];
  const seen = {};
  for (const key of keys) {
    try {
      const data = await signedGet('/api/search',
        'key=' + encodeURIComponent(key) + '&kw=' + encodeURIComponent(wd) + '&page=' + page);
      const rows = (data && data.list) || [];
      for (const item of rows) {
        if (!item || item.id == null) continue;
        const title = t(item.title || item.id);
        const vid = [key, t(item.id), '', '', title].join('|');
        if (seen[vid]) continue;
        seen[vid] = 1;
        merged.push({ vod_id: vid, vod_name: title, vod_pic: coverOf(item), vod_remarks: t(item.remark || item.desc || '') });
      }
    } catch (e) {}
  }
  return { list: merged, page, pagecount: page + (merged.length ? 1 : 0), limit: PAGE_SIZE, total: merged.length };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of (ids || []).filter(Boolean)) {
    const info = splitVid(raw);
    if (!info.k || !info.i) continue;
    const queryParts = [];
    if (info.s) queryParts.push('src=' + encodeURIComponent(info.s));
    if (info.u) queryParts.push('sub=' + encodeURIComponent(info.u));
    let data = {};
    try {
      data = await signedGet(
        '/api/detail/' + encodeURIComponent(info.k) + '/' + encodeURIComponent(info.i),
        queryParts.join('&')
      );
    } catch (e) {
      data = {};
    }
    const d = (data && data.detail) || {};
    const title = info.t || t(d.title) || info.i;
    const cover = coverOf(d);
    const remarks = d.ep_count ? '共' + d.ep_count + '集' : t(d.date || '');
    const desc = [remarks, t(d.desc || '')].filter(Boolean).join('\n');
    // 2026-11-10：跟随站方“跨源同名择优”改派（det.dup.auto 时用 best_id/best_src，
    // 否则选集/播放按原源去取会集号错位或取不到地址；实测有 dup 的短剧走 best 源才能播）
    let effId = info.i;
    let effSrc = info.s;
    if (d.dup && d.dup.auto) {
      if (d.dup.best_id) effId = t(d.dup.best_id);
      if (d.dup.best_src) effSrc = t(d.dup.best_src);
    }
    const episodes = (d.episodes && d.episodes.length) ? d.episodes : [{ ep: 1, name: '正片' }];
    const playUrls = episodes.map((epInfo, idx) => {
      const epNo = t(epInfo.ep != null ? epInfo.ep : idx + 1);
      let epName = '';
      if (episodes.length === 1) epName = '正片';
      else {
        epName = t(epInfo.name || '').replace(/[$#]/g, ' ');
        if (!epName || epName === '正片' || epName === '播放') epName = '第' + epNo + '集';
      }
      if (epInfo.lock) epName += '[预告10s]';
      // play id 编码：key|effId|effSrc|sub|ep（用改派后的有效 id/src）
      const pid = [info.k, effId, effSrc, info.u, epNo].join('|');
      return epName + '$' + pid;
    });
    list.push({
      vod_id: raw,
      vod_name: title,
      vod_pic: cover,
      vod_content: desc,
      vod_remarks: remarks,
      vod_play_from: NAME,
      vod_play_url: playUrls.join('#'),
    });
  }
  return { list };
}

function extractFanhao(text) {
  const m = t(text).match(/([a-zA-Z]{2,6})-?(\d{2,6})/);
  return m ? (m[1] + '-' + m[2]).toLowerCase() : '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const parts = id.split('|');
  const k = parts[0] || '';
  const vid = parts[1] || '';
  const s = parts[2] || '';
  const u = parts[3] || '';
  const ep = parts[4] || '1';
  if (!k || !vid) return { parse: 0, url: '' };
  const headers = { 'User-Agent': UA, Referer: BASE + '/' };

  // missav 来源：只给 Worker 代理的 720p 一条线
  if (k === 'video' || s === 'missav') {
    const code = extractFanhao(vid) || extractFanhao(parts.slice(5).join('|'));
    if (code) {
      return { parse: 0, url: MISSAV_WORKER + '/missav?code=' + encodeURIComponent(code), header: headers };
    }
  }

  // 其余分类走站内播放接口
  const queryParts = [];
  if (s) queryParts.push('src=' + encodeURIComponent(s));
  if (u) queryParts.push('sub=' + encodeURIComponent(u));
  try {
    const data = await signedGet(
      '/api/play/' + encodeURIComponent(k) + '/' + encodeURIComponent(vid) + '/' + encodeURIComponent(ep),
      queryParts.join('&')
    );
    const playData = (data && data.play) || {};
    if (!playData.locked) {
      if (playData.src) {
        let u2 = t(playData.src);
        if (u2.indexOf('://') === -1) u2 = u2.charAt(0) === '/' ? BASE + u2 : BASE + '/' + u2;
        return { parse: 0, url: u2, header: headers };
      }
      if (playData.src_proxy) {
        let u2 = t(playData.src_proxy);
        if (u2.indexOf('://') === -1) u2 = u2.charAt(0) === '/' ? BASE + u2 : BASE + '/' + u2;
        return { parse: 0, url: u2, header: headers };
      }
    }
  } catch (e) {}

  // 最终兜底：能提番号就给 missav 页面
  const fallbackCode = extractFanhao(vid);
  if (fallbackCode) {
    return { parse: 0, url: 'https://missav.fans/cn/' + encodeURIComponent(fallbackCode), header: { 'User-Agent': UA, Referer: 'https://missav.fans/' } };
  }
  return { parse: 0, url: '' };
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
