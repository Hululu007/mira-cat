import req from '../../util/req.js';

// Chaturbate (py_chaturbate) —— 2026-11-05 全量重写，完全参照 lailai-rex
// lai_chaturbate 2.0.3（Worker v8），替换 2026-11-04 affiliate 版 + batch9 选单版。
// 旧版已删，不再保留；本文件即现行唯一版本。
//
// 参照点（逐项对齐 REX 2.0.3，文件内不再出现 affiliate/wm/帐号概念）：
// - 列表：站方 /api/ts/roomlist/room-list/ 游客视图，直接拉取（iPhone UA，
//   与 REX pageHeaders 一致）；只收 current_show='public' 且无密码房；
//   参数 limit=90、offset=(页-1)*90，筛选 genders/regions/hashtags/from_age/
//   to_age/new_cams/gaming/exhib/keywords 与 REX parseTid 同构。
// - 详情：主通道 /api/chatvideocontext/{username}/ JSON 直连，兜底房间页内嵌
//   initialRoomDossier（与 REX getDossier 一致）；不走任何 Worker 腿、不走
//   嵌入页腿（REX 2.0.3 亦无此腿）。
// - 播放：2026-11-05 用户纠正——播放保留分辨率选择，不跟 REX 的“只锁最高档”。
//   详情列：首条“直播·音画”(__av，/master + aw=1，REX 默认线，有声），
//   其后按主清单真实档位列“1080p/720p/…”(__h<高度>，走 /m 纯视频轨，
//   档位只枚举主清单里真实存在的 RESOLUTION，不编假档位）；
//   选档口径与 batch9 一致：取不高于所选高度的最高档，
//   所选高度低于最低档时取最低档。无档位/无音频时退回单个“直播”入口。
//   主清单现拉现解析（token 一次性，不缓存复用）；
//   有音频时音画线走 Worker /master + aw=1（配已部署 Worker v8，
//   2026-11-05 实测根回 v8；v7 及以前忽略 aw，行为不变）；
//   无音频时回落 Worker /m 纯视频轨；解析失败时退回直返 hls_source。
// - 分类：REX 48 个（精选 9 + 地区 5 + 年龄 4 + 标签 30；游戏/展示已加回，
//   room-list 本就有这两个字段，affiliate 时代因 feed 缺字段才去掉）。
// - 搜索：复用列表接口 keywords 参数（匹配用户名/标题），与 REX 一致。
//
// 诚实说明（与 REX 的一处不可迁移项）：REX 音画线用 playerType "system"
// （iOS 原生播放器）才实现音画同步；mira-cat 的 play 返回值没有 playerType
// 字段，播放器由 MiraPlayer 自身决定。故本重写只能保证“地址形态与 REX
// 2.0.3 完全一致”（双轨都经 Worker v8、aw=1），音画同步与否由真机 verdict
// 决定：若 MiraPlayer 处理 v8 音画线如系统播放器，则有声且同步；若仍如
// REX 的 App 播放器那样卡，则问题在 MiraPlayer 播放器本身，不在地址形态，
// 届时备线 /m（纯视频、已证顺）仍可用。本文件不做任何播放器层面的假定。

const KEY = 'py_chaturbate';
const NAME = 'Chaturbate';
const HOST = 'https://chaturbate.com';
const API = HOST + '/api/ts/roomlist/room-list/';
const CTX_API = HOST + '/api/chatvideocontext/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const REFERER = HOST + '/';
const PAGE_SIZE = 90;
const TIMEOUT = 8000;
const CTX_TIMEOUT = 30000; // 详情/主清单：手机慢网下往返常超 20s，沿用旧版 30s
const CB_WORKER = 'https://chaturbate-hls.li768435813.workers.dev'; // v8 已部署（2026-11-05 实测根回 v8）

// 分类：与 REX 2.0.3 模块顺序一致（精选/地区/年龄/标签，共 48 个）。
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

function cleanId(raw) {
  const s = t(raw);
  return s.includes('$') ? s.split('$').pop() : s;
}

function pageHeaders() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': REFERER,
  };
}

async function fetchJson(url, timeout = TIMEOUT) {
  try {
    const { data, status } = await req.get(url, { headers: pageHeaders(), timeout });
    if (status !== 200 || data == null) return null;
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch (e) { return null; }
    }
    return data;
  } catch (e) { return null; }
}

async function fetchText(url, timeout = TIMEOUT) {
  try {
    const { data, status } = await req.get(url, { headers: pageHeaders(), timeout });
    if (status !== 200 || data == null) return '';
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) { return ''; }
}

// type_id 解码（与 REX parseTid 一致）：all | g:{gender} | r:{region} |
// gr:{gender}:{region} | age:{from}:{to} | tag:{hashtag} | new | gaming | exhib
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

// 列表：room-list 直连（与 REX getRoomsPage 一致）；只收公开无密码房。
// total：接口若给 total_count/total 则用它；否则按“满页则还有下一页”估算，
// 保证 App 能翻页（估算 total 不影响当页内容）。
async function getRoomsPage(filter, page) {
  const offset = (page - 1) * PAGE_SIZE;
  const qs = ['limit=' + PAGE_SIZE, 'offset=' + offset];
  const f = filter || {};
  for (const k in f) {
    if (f[k] !== '' && f[k] != null) qs.push(k + '=' + encodeURIComponent(String(f[k])));
  }
  const d = await fetchJson(API + '?' + qs.join('&'));
  if (!d || !Array.isArray(d.rooms)) return { list: [], total: 0 };
  const list = [];
  for (const r of d.rooms) {
    if (r && r.username && r.current_show === 'public' && !r.has_password) list.push(roomToVod(r));
  }
  let total = parseInt(d.total_count || d.total, 10) || 0;
  if (!total) total = list.length === PAGE_SIZE ? page * PAGE_SIZE + 1 : (page - 1) * PAGE_SIZE + list.length;
  return { list, total };
}

// 取房间播放信息（与 REX getDossier 一致）：主通道 ctx JSON 直连，
// 兜底房间页内嵌 initialRoomDossier；无 Worker 腿、无嵌入页腿。
async function getDossier(username) {
  try {
    const j = await fetchJson(CTX_API + encodeURIComponent(username) + '/', CTX_TIMEOUT);
    if (j && typeof j === 'object' && ('room_status' in j || 'hls_source' in j)) {
      return {
        room_status: String(j.room_status || ''),
        room_title: String(j.room_title || ''),
        num_viewers: j.num_viewers || 0,
        hls_source: String(j.hls_source || ''),
      };
    }
  } catch (e) { /* 换兜底 */ }
  try {
    const html = await fetchText(HOST + '/' + encodeURIComponent(username) + '/', CTX_TIMEOUT);
    const m = html.match(/initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    const dd = JSON.parse(JSON.parse('"' + m[1] + '"'));
    return {
      room_status: String(dd.room_status || ''),
      room_title: String(dd.room_title || ''),
      num_viewers: dd.num_viewers || 0,
      hls_source: String(dd.hls_source || ''),
    };
  } catch (e) { return null; }
}

// 主清单内的相对 URI -> 绝对地址（chunklist 是根相对路径，自带 ?session=）。
function absEdge(u, masterUrl) {
  const s = String(u || '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const origin = (String(masterUrl).match(/^https?:\/\/[^/]+/i) || [''])[0];
  if (s.charAt(0) === '/') return origin + s;
  const dir = String(masterUrl).split('?')[0].replace(/[^/]*$/, '');
  return dir + s;
}

// 手机侧拉主清单，裁出最高 BANDWIDTH 一档视频 + 其 AUDIO 组默认音频
// （与 REX parseMaster 一致：按 BANDWIDTH 降序取顶；音频组内默认优先）。
// parseMasterText 为纯解析（供 detail 复用一次拉取的文本）；
// parseMaster 为拉取 + 解析（供 play 与桩测）。
// 返回 { vAbs, aAbs, inf } 或 null（任一步失败）。
function parseMasterText(text, hlsSource) {
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
  variants.sort((x, y) => y.bw - x.bw);
  const top = variants[0];
  let outAttrs = top.attrs;
  let aAbs = '';
  const ag = (outAttrs.match(/AUDIO="([^"]+)"/) || [])[1];
  if (ag) {
    let pick = null;
    for (const au of audios) {
      if (au.group !== ag) continue;
      if (au.def) { pick = au; break; }
      if (!pick) pick = au;
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

async function parseMaster(hlsSource) {
  const text = await fetchText(hlsSource, CTX_TIMEOUT);
  return parseMasterText(text, hlsSource);
}

// 从主列表文本里枚举真实档位高度（去重、降序）；无 RESOLUTION 时返回 []。
function masterHeights(raw) {
  const hs = new Set();
  for (const rawLine of String(raw || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
      if (res) { const h = parseInt(res[2], 10); if (h > 0) hs.add(h); }
    }
  }
  return Array.from(hs).sort((a, b) => b - a);
}

// 按高度选档（batch9 口径）：取不高于目标高度的最高档；
// 目标高度低于最低档时取最低档；无变体时返回 ''。
function pickVariantUrl(raw, baseUrl, targetH) {
  const lines = String(raw || '').split(/\r?\n/);
  const variants = [];
  let pendingInf = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-STREAM-INF:')) { pendingInf = line; continue; }
    if (line.startsWith('#')) continue;
    if (pendingInf) {
      const res = /RESOLUTION=(\d+)x(\d+)/.exec(pendingInf);
      const bw = /BANDWIDTH=(\d+)/.exec(pendingInf);
      variants.push({
        uri: line,
        h: res ? parseInt(res[2], 10) : 0,
        bw: bw ? parseInt(bw[1], 10) : 0,
      });
      pendingInf = null;
    }
  }
  if (!variants.length) return '';
  variants.sort((a, b) => (b.h - a.h) || (b.bw - a.bw));
  let top = variants[0];
  if (targetH) {
    const cand = variants.filter(v => v.h <= targetH);
    top = cand.length ? cand[0] : variants[variants.length - 1];
  }
  return absEdge(top.uri, baseUrl);
}

// 线路：纯视频轨 —— Worker /m 直出最高档视频媒体清单（无主清单、无音频轨）。
function videoOnlyUrl(info) {
  return CB_WORKER + '/m?u=' + encodeURIComponent(info.vAbs);
}

// 线路：音画双轨 —— Worker /master 单档主清单（视频 + 一路音频 rendition）。
// 传 aw=1，音频也经 /m（配 Worker v8；v7 及以前忽略 aw，行为不变）。
function avMasterUrl(info) {
  let url = CB_WORKER + '/master?v=' + encodeURIComponent(info.vAbs);
  if (info.aAbs) url += '&a=' + encodeURIComponent(info.aAbs);
  url += '&inf=' + encodeURIComponent(info.inf);
  url += '&aw=1';
  return url;
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

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const username = cleanId(body.id);
  const d = await getDossier(username);
  let title = username, remarks = '', content = `${username} 的 Chaturbate 公开直播间`;
  if (d) {
    title = t(d.room_title) || username;
    const live = d.room_status === 'public';
    remarks = live ? `直播中 · ${d.num_viewers || 0}人观看` : `当前状态: ${t(d.room_status) || '未知'}`;
    if (t(d.room_title)) content = t(d.room_title);
  } else {
    remarks = '房间已下线或不存在';
  }
  // 播放入口（用户 2026-11-05 纠正：保留分辨率选择，不跟 REX 只锁最高档）：
  // 首条“直播·音画”(__av，/master + aw=1，有声主线），其后按主清单真实档位
  // 列“1080p/720p/…”(__h<高度>，走 /m 纯视频轨）；无档位且无音频时退回
  // 单个“直播”入口。非直播房仍保留单个入口（沿用旧版行为；play 内守卫空返）。
  let playUrl = '直播$' + username;
  if (d && d.room_status === 'public' && t(d.hls_source)) {
    const masterText = await fetchText(t(d.hls_source), CTX_TIMEOUT);
    const heights = masterHeights(masterText);
    const info = parseMasterText(masterText, t(d.hls_source));
    const entries = [];
    if (info && info.aAbs) entries.push('直播·音画$' + username + '__av');
    for (const h of heights) entries.push(h + 'p$' + username + '__h' + h);
    playUrl = entries.length ? entries.join('#') : ('直播$' + username);
  }
  const vod = {
    vod_id: username,
    vod_name: username,
    vod_pic: `https://thumb.live.mmcdn.com/riw/${encodeURIComponent(username)}.jpg`,
    type_name: '直播',
    vod_remarks: remarks,
    vod_content: content,
    vod_play_from: NAME,
    vod_play_url: playUrl,
  };
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const rawId = cleanId(body.id);
  let username = rawId, avMode = false, hMode = 0;
  if (rawId.endsWith('__av')) { username = rawId.slice(0, -4); avMode = true; }
  else {
    const hm = rawId.match(/__h(\d+)$/);
    if (hm) { username = rawId.slice(0, -hm[0].length); hMode = parseInt(hm[1], 10) || 0; }
  }
  if (!username) return { parse: 0, url: '' };
  const d = await getDossier(username);
  // 只有公开房才有游客流；hidden/private/away 等状态 hls_source 为空，如实空返。
  if (!d || d.room_status !== 'public' || !t(d.hls_source)) return { parse: 0, url: '' };
  const master = t(d.hls_source);
  let url = master;
  if (hMode) {
    // 选档：现拉主清单、按高度挑档（batch9 口径），走 /m 纯视频轨；
    // 挑不到时退回 /m 最高档，再不行退回直返主清单。
    const text = await fetchText(master, CTX_TIMEOUT);
    let vUrl = pickVariantUrl(text, master, hMode);
    if (!vUrl) {
      try {
        const info0 = await parseMaster(master);
        if (info0) vUrl = info0.vAbs;
      } catch (e) { /* 兜底直连 */ }
    }
    url = vUrl ? (CB_WORKER + '/m?u=' + encodeURIComponent(vUrl)) : master;
  } else {
    // 现拉现解析（主清单 token 一次性，不缓存复用）；解析失败退回直返主清单。
    let info = null;
    try { info = await parseMaster(master); } catch (e) { /* 兜底直连 */ }
    if (info) {
      if (avMode) {
        url = info.aAbs ? avMasterUrl(info) : videoOnlyUrl(info);
      } else {
        url = videoOnlyUrl(info);
      }
    }
  }
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

// 仅供桩测用（App 只用 default，具名导出不影响打包）。
export { parseMaster, parseMasterText, parseTid, roomToVod, avMasterUrl, videoOnlyUrl, masterHeights, pickVariantUrl };
