import req from '../../util/req.js';

// Chaturbate (py_chaturbate) —— 2026-11-05 从 REX lai_chaturbate 2.0.3 完全参照重写，替换旧版蜘蛛。
// 2026-11-05 用户令：任何节点都能播——取数加 Worker /api 兜底（直连先行、失败才走 Worker）。
//   分类、列表、详情、解析、播放地址形态与 REX 2.0.3 一一对应；无分辨率选单（REX 只锁最高档），无 jina 腿。
//   直连通时行为与纯 REX 版完全一致；直连失败（非 200/抛错/8s 未回，如非 LA 节点遇 Cloudflare 真人验证）
//   才走已部署 Worker v9 的 /api（白名单含 chaturbate.com/api/* 与 *.live.mmcdn.com，站方不弹 Worker 出口验证）。
//   App 内无全局 fetch，不用 fetch。
// 列表：GET /api/ts/roomlist/room-list/?limit=90&offset=(页-1)*90，筛选与 REX 一致
//   （genders/regions/hashtags/from_age/to_age/new_cams/gaming/exhib/keywords）。
// 详情：GET /api/chatvideocontext/{username}/（主）→ 房间页 initialRoomDossier（兜底）。
// 播放：play 内现拉现解析（dossier + 主清单，防主清单 session token 过期），双线：
//   音画双轨 = Worker /master（aw=1：音视频双轨均经 /m；配已部署 Worker v8）；纯视频轨 = Worker /m。
//   detail 只对公开房出线；非公开/下线房不出播放线（同 REX 不出 videoUrl），避免空地址无限转圈。
// 分类 48 个，与 REX 2.0.3 的精选/地区/年龄/标签完全一致（顺序亦一致）。
// 只收录 current_show='public' 且无密码的公开房；私密/票秀/密码房不收，不伪造任何凭证。

const KEY = 'py_chaturbate';
const NAME = 'Chaturbate';
const HOST = 'https://chaturbate.com';
const API = HOST + '/api/ts/roomlist/room-list/';
const CTX_API = HOST + '/api/chatvideocontext/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const REFERER = HOST + '/';
const PAGE_SIZE = 90;
const CB_WORKER = 'https://chaturbate-hls.li768435813.workers.dev';
const WORKER_API = CB_WORKER + '/api?u=';
const DIRECT_TIMEOUT_MS = 8000;

const CATS = [
  { type_id: 'all', type_name: '推荐' },
  { type_id: 'g:f', type_name: '女生' },
  { type_id: 'g:m', type_name: '男生' },
  { type_id: 'g:c', type_name: '情侣' },
  { type_id: 'g:t', type_name: '跨性别' },
  { type_id: 'gr:f:AS', type_name: '亚洲女生' },
  { type_id: 'new', type_name: '新人' },
  { type_id: 'gaming', type_name: '游戏' },
  { type_id: 'exhib', type_name: '展示' },
  { type_id: 'r:AS', type_name: '亚洲' },
  { type_id: 'r:NA', type_name: '北美' },
  { type_id: 'r:SA', type_name: '南美' },
  { type_id: 'r:ER', type_name: '欧洲·俄罗斯' },
  { type_id: 'r:O', type_name: '其他地区' },
  { type_id: 'age:18:22', type_name: '18-21岁' },
  { type_id: 'age:20:31', type_name: '20-30岁' },
  { type_id: 'age:30:51', type_name: '30-50岁' },
  { type_id: 'age:50:100', type_name: '成熟50+' },
  { type_id: 'tag:lovense', type_name: '标签·互动玩具' },
  { type_id: 'tag:bigboobs', type_name: '标签·巨乳' },
  { type_id: 'tag:squirt', type_name: '标签·潮吹' },
  { type_id: 'tag:asian', type_name: '标签·亚洲' },
  { type_id: 'tag:anal', type_name: '标签·肛交' },
  { type_id: 'tag:bigass', type_name: '标签·大屁股' },
  { type_id: 'tag:skinny', type_name: '标签·瘦' },
  { type_id: 'tag:natural', type_name: '标签·天然' },
  { type_id: 'tag:feet', type_name: '标签·恋足' },
  { type_id: 'tag:latina', type_name: '标签·拉丁' },
  { type_id: 'tag:milf', type_name: '标签·熟女' },
  { type_id: 'tag:smalltits', type_name: '标签·小胸' },
  { type_id: 'tag:blonde', type_name: '标签·金发' },
  { type_id: 'tag:cum', type_name: '标签·射精' },
  { type_id: 'tag:bigcock', type_name: '标签·大屌' },
  { type_id: 'tag:hairy', type_name: '标签·多毛' },
  { type_id: 'tag:deepthroat', type_name: '标签·深喉' },
  { type_id: 'tag:petite', type_name: '标签·娇小' },
  { type_id: 'tag:bigtits', type_name: '标签·大胸' },
  { type_id: 'tag:fuckmachine', type_name: '标签·炮机' },
  { type_id: 'tag:brunette', type_name: '标签·棕发' },
  { type_id: 'tag:ebony', type_name: '标签·黑珍珠' },
  { type_id: 'tag:redhead', type_name: '标签·红发' },
  { type_id: 'tag:mature', type_name: '标签·熟龄' },
  { type_id: 'tag:muscle', type_name: '标签·肌肉' },
  { type_id: 'tag:goth', type_name: '标签·哥特' },
  { type_id: 'tag:cosplay', type_name: '标签·角色扮演' },
  { type_id: 'tag:bdsm', type_name: '标签·BDSM' },
  { type_id: 'tag:twink', type_name: '标签·小鲜肉' },
  { type_id: 'tag:blowjob', type_name: '标签·口交' },
];

function t(v) { return String(v == null ? '' : v).trim(); }

function pageHeaders() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': REFERER,
  };
}

// 取文本：直连先行（与 REX 的直连一致），直连失败才走 Worker /api 兜底。
// 直连失败 = 非 200 / 抛错 / 8s 未回（如非 LA 节点遇 Cloudflare 真人验证，
// 直连拿到的是验证页而非 JSON）。直连通时不走 Worker，行为与纯 REX 版一致。
// （App 内 req 是 axios：非 2xx 默认抛错走 catch；本函数另验 status，双保险。）
async function fetchText(url) {
  const direct = (async () => {
    try {
      const r = await req.get(url, { headers: pageHeaders() });
      if (r && r.status === 200 && r.data != null) return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    } catch (e) { /* fall through to Worker */ }
    return '';
  })();
  const timeout = new Promise((resolve) => setTimeout(() => resolve(''), DIRECT_TIMEOUT_MS));
  const d = await Promise.race([direct, timeout]);
  if (d) return d;
  try {
    const r = await req.get(WORKER_API + encodeURIComponent(url), { headers: pageHeaders() });
    if (r && r.status === 200 && r.data != null) return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  } catch (e) { /* ignore */ }
  return '';
}

async function fetchJson(url) {
  const raw = await fetchText(url);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// ---------- 列表 ----------

function roomToVod(r) {
  const marks = [];
  if (r.is_new) marks.push('新人');
  if (r.is_gaming) marks.push('游戏');
  const remarks = `${r.num_users || 0}人观看${marks.length ? ' · ' + marks.join(' · ') : ''}`;
  return {
    vod_id: t(r.username),
    vod_name: t(r.username),
    vod_pic: t(r.img),
    vod_remarks: remarks,
  };
}

// params: 已解码的筛选键值 (genders/regions/hashtags/from_age/to_age/new_cams/gaming/exhib/keywords)
async function getRoomsPage(params, page) {
  const offset = (page - 1) * PAGE_SIZE;
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== '' && v != null) qs.set(k, String(v));
  }
  const d = await fetchJson(`${API}?${qs.toString()}`);
  if (!d || !Array.isArray(d.rooms)) return { list: [], total: 0 };
  const list = d.rooms
    .filter(r => r && r.username && r.current_show === 'public' && !r.has_password)
    .map(roomToVod);
  return { list, total: d.total_count || 0 };
}

// type_id 解码 (与 REX 一致): all | g:{gender} | r:{region} | gr:{gender}:{region} |
// new | gaming | exhib | age:{from}:{to} | tag:{hashtag}
function parseTid(tid) {
  const s = t(tid) || 'all';
  const p = s.split(':');
  switch (p[0]) {
    case 'g': return { genders: p[1] || 'f' };
    case 'r': return { regions: p[1] || 'AS' };
    case 'gr': return { genders: p[1] || 'f', regions: p[2] || 'AS' };
    case 'age': return { from_age: p[1] || '18', to_age: p[2] || '100' };
    case 'tag': return { hashtags: p.slice(1).join(':') };
    case 'new': return { new_cams: '1' };
    case 'gaming': return { gaming: '1' };
    case 'exhib': return { exhib: '1' };
    default: return {};
  }
}

async function init() {
  return {};
}

async function home() {
  const cls = CATS.map(c => ({ type_id: c.type_id, type_name: c.type_name }));
  const { list } = await getRoomsPage({}, 1);
  return { class: cls, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const params = parseTid(body.tid || body.id);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const { list, total } = await getRoomsPage(params, page);
  const pagecount = Math.max(1, Math.ceil((total || list.length) / PAGE_SIZE));
  return { page, pagecount, limit: PAGE_SIZE, total, list };
}

// ---------- 详情 / 播放 ----------

// 取房间播放信息 {room_status, room_title, num_viewers, hls_source}；
// 主通道: /api/chatvideocontext/{username}/ JSON（约 5KB，快）；
// 兜底: 房间页内嵌 initialRoomDossier（约 195KB HTML，慢；房间页不在 Worker 白名单内，
// 此路直连失败即空——但主通道 CTX 经 Worker 可通，故兜底很少被需要）。
// 房间不存在/已下线且无任何信息时返回 null。
async function getDossier(username) {
  const j = await fetchJson(CTX_API + encodeURIComponent(username) + '/');
  if (j && typeof j === 'object' && ('room_status' in j || 'hls_source' in j)) {
    return {
      room_status: t(j.room_status),
      room_title: t(j.room_title),
      num_viewers: j.num_viewers || 0,
      hls_source: t(j.hls_source),
    };
  }
  const html = await fetchText(`${HOST}/${encodeURIComponent(username)}/`);
  if (!html) return null;
  const m = html.match(/initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    const d = JSON.parse(JSON.parse('"' + m[1] + '"'));
    return {
      room_status: t(d.room_status),
      room_title: t(d.room_title),
      num_viewers: d.num_viewers || 0,
      hls_source: t(d.hls_source),
    };
  } catch (e) { return null; }
}

// 主清单内的相对 URI -> 绝对地址（chunklist 是根相对路径，自带 ?session=），与 REX 一致。
function absEdge(u, masterUrl) {
  const s = String(u || '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const origin = (String(masterUrl).match(/^https?:\/\/[^/]+/i) || [''])[0];
  if (s.charAt(0) === '/') return origin + s;
  const dir = String(masterUrl).split('?')[0].replace(/[^/]*$/, '');
  return dir + s;
}

// 手机侧拉主清单，裁出最高 BANDWIDTH 一档视频 + 其 AUDIO 组默认音频（与 REX 一致）。
// 返回 { vAbs, aAbs, inf } 或 null（任一步失败）。
async function parseMaster(hlsSource) {
  const text = await fetchText(hlsSource);
  if (!text || text.indexOf('#EXTM3U') !== 0) return null;
  const lines = text.split('\n');
  const audios = [];
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const L = String(lines[i]).replace(/\s+$/g, '');
    if (L.indexOf('#EXT-X-MEDIA:') === 0 && /TYPE=AUDIO/.test(L)) {
      const g = (L.match(/GROUP-ID="([^"]+)"/) || [])[1];
      const mu = (L.match(/URI="([^"]+)"/) || [])[1];
      if (g && mu) audios.push({ group: g, uri: mu, def: /DEFAULT=YES/.test(L) });
    } else if (L.indexOf('#EXT-X-STREAM-INF:') === 0) {
      const attrs = L.slice('#EXT-X-STREAM-INF:'.length);
      const uri = String(lines[i + 1] || '').replace(/\s+$/g, '');
      const bw = parseInt((attrs.match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
      if (uri) variants.push({ attrs, uri, bw });
    }
  }
  if (!variants.length) return null;
  variants.sort((a, b) => b.bw - a.bw);
  const top = variants[0];
  let outAttrs = top.attrs;
  let aAbs = '';
  const ag = (outAttrs.match(/AUDIO="([^"]+)"/) || [])[1];
  if (ag) {
    let pick = null;
    for (let k = 0; k < audios.length; k++) {
      if (audios[k].group !== ag) continue;
      if (audios[k].def) { pick = audios[k]; break; }
      if (!pick) pick = audios[k];
    }
    if (pick) aAbs = absEdge(pick.uri, hlsSource);
  }
  if (aAbs) {
    outAttrs = /AUDIO="[^"]*"/.test(outAttrs)
      ? outAttrs.replace(/AUDIO="[^"]*"/, 'AUDIO="aac"')
      : outAttrs + ',AUDIO="aac"';
  } else {
    outAttrs = outAttrs.replace(/,?AUDIO="[^"]*"/, '').replace(/^,/, '').replace(/,,+/g, ',');
  }
  return { vAbs: absEdge(top.uri, hlsSource), aAbs, inf: outAttrs };
}

// 纯视频轨 —— Worker /m 直出最高档视频媒体清单（无主清单/无音频轨）
function videoOnlyUrl(info) {
  return CB_WORKER + '/m?u=' + encodeURIComponent(info.vAbs);
}

// 音画双轨 —— Worker /master 单档主清单（视频 + 一路音频 rendition；aw=1：音频也经 /m）
function avMasterUrl(info) {
  let url = CB_WORKER + '/master?v=' + encodeURIComponent(info.vAbs);
  if (info.aAbs) url += '&a=' + encodeURIComponent(info.aAbs);
  url += '&inf=' + encodeURIComponent(info.inf);
  url += '&aw=1';
  return url;
}

function cleanId(raw) {
  const s = t(raw);
  return s.includes('$') ? s.split('$').pop() : s;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const username = cleanId(body.id);
  const cover = `https://thumb.live.mmcdn.com/riw/${encodeURIComponent(username)}.jpg`;
  const d = await getDossier(username);
  // 只有公开房才出线（同 REX）；非公开/下线房只回基本信息，不出播放线，避免空地址无限转圈。
  if (!d || d.room_status !== 'public' || !t(d.hls_source)) {
    return { list: [{
      vod_id: username,
      vod_name: username,
      vod_pic: cover,
      type_name: '直播',
      vod_remarks: d ? `当前状态: ${t(d.room_status) || '未知'}，未公开直播` : '房间已下线或不存在',
      vod_content: `${username} 的 Chaturbate 公开直播间`,
    }] };
  }
  const title = t(d.room_title) || username;
  return { list: [{
    vod_id: username,
    vod_name: title,
    vod_pic: cover,
    type_name: '直播',
    vod_remarks: `直播中 · ${d.num_viewers || 0}人观看`,
    vod_content: t(d.room_title) || `${username} 的 Chaturbate 公开直播间`,
    vod_play_from: '音画双轨$$$纯视频轨',
    vod_play_url: '直播$' + username + '$$$直播$vo_' + username,
  }] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const rawId = cleanId(body.id);
  const wantVo = rawId.startsWith('vo_');
  const username = wantVo ? rawId.slice(3) : rawId;
  if (!username) return { parse: 0, url: '' };
  // 现拉现解析：详情里的地址 session 约 45s 即死，播放时重拉才新鲜（同 REX 现拉现解析）。
  const d = await getDossier(username);
  // 只有公开房才有游客流；hidden/private/away 等状态 hls_source 为空，如实空返。
  if (!d || d.room_status !== 'public' || !t(d.hls_source)) return { parse: 0, url: '' };
  let info = null;
  try { info = await parseMaster(t(d.hls_source)); } catch (e) { /* 兜底直返主清单 */ }
  if (!info) {
    return { parse: 0, url: t(d.hls_source), header: { 'User-Agent': UA, 'Referer': REFERER } };
  }
  const url = wantVo ? videoOnlyUrl(info) : (info.aAbs ? avMasterUrl(info) : videoOnlyUrl(info));
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': REFERER },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
  const { list, total } = await getRoomsPage({ keywords: wd }, page);
  const pagecount = Math.max(1, Math.ceil((total || list.length) / PAGE_SIZE));
  return { page, pagecount, limit: PAGE_SIZE, total, list };
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
