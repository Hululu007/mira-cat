import req from '../../util/req.js';

// Chaturbate (py_chaturbate) —— 名称暂用站方品牌「Chaturbate」, 用户可改
// 站点: https://chaturbate.com (成人直播平台)。只收录游客可看的公开直播间:
//       站内列表接口本身就是游客视图 (默认只回 current_show='public' 且无密码房的房间),
//       本源再做一层同样的过滤兜底; 私密秀/隐藏票秀/密码房不收, 不伪造任何凭证。
// 列表: GET /api/ts/roomlist/room-list/?limit=90&offset={(页-1)*90} (站方前端自己的接口, 无需登录/签名)
//       筛选参数 (取自站方 roomlist 前端代码 + 逐个实测): genders=f|m|c|t (t 返回 gender='s' 的跨性别房),
//       regions=NA|SA|AS|ER|O, hashtags={标签} (逗号分隔), from_age/to_age (站方年龄段映射:
//       18-21→18/22, 20-30→20/31, 30-50→30/51, 成熟→50/100), new_cams=1, gaming=1, exhib=1,
//       keywords={关键词} (搜索用, 匹配用户名/标题)。48 个分类于 2026-10-21 逐个实测有在线房:
//       标签类逐个查过 total_count (68~1446, 实时浮动), 其余大类均数百至数千。
// 封面: 列表自带 img = https://thumb.live.mmcdn.com/riw/{username}.jpg?{时间戳} (房间快照, 无头直取 200
//       image/jpeg 已实测), 真实 https 直链, 不经本地代理 (App 图片加载走不了 js2p 本地地址, 既有教训)。
// 详情/播放取数 (第二版): GET /api/chatvideocontext/{username}/ —— 站方房间上下文 JSON (约 5KB,
//       实测 200~270ms), 含 room_status/room_title/num_viewers/hls_source, 与房间页内嵌
//       initialRoomDossier 同源同值 (hls 仅边缘节点不同)。第一版抓整页 HTML (约 195KB,
//       dossier 在 88% 偏移处) 取数慢, 第二版改走此接口, 房间页解析保留作兜底;
//       不存在的用户名接口回 404、下线房 room_status='offline', 守卫语义不变。
// 播放 (第二版, 针对真机反馈"加载慢 + 分辨率低"):
//       主列表 (llhls.m3u8) 是多档 LL-HLS: 变体按 240p→1080p 升序排列 (360/540/720/1080,
//       1080p 档分片实拉码率与标注 BANDWIDTH 吻合, 是真高清), 且音视频分离 —— 视频变体经
//       AUDIO 组引用独立的音频列表 (audio_aac_96/128), 视频媒体列表本身不含音频。
//       第一版直返主列表, 播放器自选档位会从低档起播/停在低档 (真机表现为分辨率低)。
//       第二版 play 返回本地一跳代理 /proxy/master 的地址 (js2p://_WEB_ 形态, 同仓
//       avhub/celebjihad 先例): 代理拉主列表后只保留最高档变体 (按高度→码率) + 其音频组,
//       正文 URI 全部改写为 mmcdn 的 https 绝对地址 (不嵌本地地址, 吸取 StripChat 教训),
//       播放器无低档可选、直接锁最高清; 代理拉取失败时 302 跳回原始主列表 (退回第一版行为)。
//       守卫不变: room_status 必须 'public' 且 hls_source 非空才返 (hidden 房 hls_source 为空)。
//       流是 LL-HLS + fMP4 (EXT-X-PART 低延迟分片), 媒体列表/分片仍由播放器直连 mmcdn,
//       明文无加密、无需 Worker 代办。主列表 token 75s 后复拉仍 200 (实测), 代理内缓存 60s。
// 抓取策略（2026-11-04 重构，见文件头“列表取数”一节）：列表/上下文只走 req 两腿——
//       Worker 优先、直连兜底；App 内没有全局 fetch，fetch/jina 腿是死代码，已删。
// 抓取策略（2026-11-04 round2 补丁，见 fetchJson）：Worker 腿补浏览器 UA + Referer
//       （消除 axios 指纹变量）；响应体形状校验，200 但非列表/上下文结构时视为该腿
//       失败、继续走下一腿（原先会静默回空且不再试直连）。超时维持 8s/8s 不变。
// 搜索: 站方 roomlist 的 keywords 参数即站内搜索 (实测部分匹配用户名, total 上限 500), 直接复用。

// 2026-11-04 round3（用户确认用自己的 affiliate 码 ezKE2）：列表源改走官方
// affiliate API（chaturbate.com/affiliates/api/onlinerooms/?format=json&wm=ezKE2）。
// 原因：旧 room-list API 在设备上两腿皆死（Worker 腿手机侧拒绝、直连腿 bot 墙）；
// affiliate 接口是给联盟方服务器拉数据的 feed，VM 实测 200 + 约 8600 房。
// 关键差异：该接口忽略 gender/limit/offset/tag 参数、恒回全量（约 11MB），故本
// 蜘蛛一次拉取后内存缓存 120s、本地按性别/地区/标签/年纪/新人/关键词过滤分页；
// 列表只留 current_show=public 的房（private/hidden/away 播不了）；地区按国家码
// 映到 AS/NA/SA/ER/O（无国家码的房不进地区分类）；游戏/展示两类该 feed 无字段，
// 已从分类里去掉（空分类不如没有）；搜索只匹配用户名 + 房间标题。
// 详情/播放不动：仍走 ctx API（Worker 优先 + 直连兜底）取 hls_source + 本地裁档代理。
// 注意：wm=ezKE2 是用户自己的 affiliate 跟踪码（用户 23:23 确认使用），会出现在公开仓库蜘蛛文件里。
const KEY = 'py_chaturbate';
const NAME = 'Chaturbate';
const HOST = 'https://chaturbate.com';
const CTX_API = HOST + '/api/chatvideocontext/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = HOST + '/';
const PAGE_SIZE = 90;
const TIMEOUT = 8000;
const CTX_TIMEOUT = 20000; // 2026-11-05: 手机到 Worker 再到 CB 的往返慢于 VM，详情腿 8s 易超时，提到 20s（与 affiliate 腿一致）；直连腿仍 8s（已知被墙，不必久等）。

// 列表取数（2026-11-04 重构，根因见下）：
//   第 1 腿：用户自有 list Worker（chaturbate.li768435813.workers.dev，只放行 /api/ 路径；
//     2026-11-04 VM 实测 room-list 与 chatvideocontext 均 200 + 真 JSON，Safari UA 亦通；
//     该域名已是已部署生效的真地址，不要再当占位符替换）。
//   第 2 腿：req 直连 chaturbate.com（仅作 Worker 挂掉时的兜底）。
//   为什么 Worker 必须放第一腿：站方对 App 内裸 axios（无 Cookie、无浏览器指纹）做 bot 检查，
//     手机 Safari 能出真 JSON、App 内 req 过不了；旧版直连放第一腿且超时 12s，直连一旦 hang 住，
//     App 的单次调用时限内根本走不到 Worker 腿，列表恒空。Worker 优先则健康时 1~2s 即回。
//   为什么删 fetch/jina 腿：App 内没有全局 fetch，这两腿在 App 内是死代码；且它们会让 VM 测试
//     走 jina 通过、掩盖 App 真实失败（旧版“VM 通过、App 空”就是这么来的）。
//   两腿均为 req，超时各 8s，总预算 16s。模式参照同仓 py_javplayer（site-fetch Worker 优先，
//     再 jina、再直连；本源因 App 无 fetch，jina 腿不适用，故只有两腿）。
const LIST_WORKER = 'https://chaturbate.li768435813.workers.dev/?u=';

// 分类: type_id 编码 —— all | g:{gender} | r:{region} | gr:{gender}:{region} |
//       new | gaming | exhib | age:{from}:{to} | tag:{hashtag}
// 标签计数为 2026-10-21 实测 total_count (见文件头)
const CATS = [
  { type_id: 'all', type_name: '推荐' },
  { type_id: 'g:f', type_name: '女生' },
  { type_id: 'g:m', type_name: '男生' },
  { type_id: 'g:c', type_name: '情侣' },
  { type_id: 'g:t', type_name: '跨性别' },
  { type_id: 'r:AS', type_name: '亚洲' },
  { type_id: 'r:NA', type_name: '北美' },
  { type_id: 'r:SA', type_name: '南美' },
  { type_id: 'r:ER', type_name: '欧洲·俄罗斯' },
  { type_id: 'r:O', type_name: '其他地区' },
  { type_id: 'gr:f:AS', type_name: '亚洲女生' },
  { type_id: 'new', type_name: '新人' },
  { type_id: 'age:18:22', type_name: '18-21岁' },
  { type_id: 'age:20:31', type_name: '20-30岁' },
  { type_id: 'age:30:51', type_name: '30-50岁' },
  { type_id: 'age:50:100', type_name: '成熟50+' },
  { type_id: 'tag:lovense', type_name: '标签·互动玩具' }, // 1446
  { type_id: 'tag:bigboobs', type_name: '标签·巨乳' }, // 1219
  { type_id: 'tag:squirt', type_name: '标签·潮吹' }, // 1407
  { type_id: 'tag:asian', type_name: '标签·亚洲' }, // 597
  { type_id: 'tag:anal', type_name: '标签·肛交' }, // 1290
  { type_id: 'tag:bigass', type_name: '标签·大屁股' }, // 1406
  { type_id: 'tag:skinny', type_name: '标签·瘦' }, // 715
  { type_id: 'tag:natural', type_name: '标签·天然' }, // 583
  { type_id: 'tag:feet', type_name: '标签·恋足' }, // 712
  { type_id: 'tag:latina', type_name: '标签·拉丁' }, // 1219
  { type_id: 'tag:milf', type_name: '标签·熟女' }, // 534
  { type_id: 'tag:smalltits', type_name: '标签·小胸' }, // 543
  { type_id: 'tag:blonde', type_name: '标签·金发' }, // 287
  { type_id: 'tag:cum', type_name: '标签·射精' }, // 713
  { type_id: 'tag:bigcock', type_name: '标签·大屌' }, // 619
  { type_id: 'tag:hairy', type_name: '标签·多毛' }, // 436
  { type_id: 'tag:deepthroat', type_name: '标签·深喉' }, // 382
  { type_id: 'tag:petite', type_name: '标签·娇小' }, // 301
  { type_id: 'tag:bigtits', type_name: '标签·大胸' }, // 219
  { type_id: 'tag:fuckmachine', type_name: '标签·炮机' }, // 377
  { type_id: 'tag:brunette', type_name: '标签·棕发' }, // 104
  { type_id: 'tag:ebony', type_name: '标签·黑珍珠' }, // 595
  { type_id: 'tag:redhead', type_name: '标签·红发' }, // 149
  { type_id: 'tag:mature', type_name: '标签·熟龄' }, // 368
  { type_id: 'tag:muscle', type_name: '标签·肌肉' }, // 237
  { type_id: 'tag:goth', type_name: '标签·哥特' }, // 104
  { type_id: 'tag:cosplay', type_name: '标签·角色扮演' }, // 68
  { type_id: 'tag:bdsm', type_name: '标签·BDSM' }, // 123
  { type_id: 'tag:twink', type_name: '标签·小鲜肉' }, // 115
  { type_id: 'tag:blowjob', type_name: '标签·口交' }, // 202
];

function t(v) { return String(v == null ? '' : v).trim(); }

// 纯文本取数（仅 req；App 内无 fetch，fetch/jina 分支已删）。
// 仅用于详情的房间页 HTML 兜底（主通道是 ctx API）；房间页不在 Worker 放行范围
// （非 /api/ 路径回 400），故不走 Worker。
async function fetchText(url, timeout = TIMEOUT) {
  try {
    const { data, status } = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': REFERER },
      timeout,
    });
    if (status === 200 && data != null) return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) { /* ignore */ }
  return '';
}

// 响应体形状校验（round2）：只有房间列表（含 rooms 数组）或房间上下文
// （含 room_status/hls_source）才算有效回包。Worker/直连若回 200 但 body 是
// 错误 JSON（如上游失败时的 {"error": ...}），原先会被当结果返回、列表静默
// 为空且不再试下一腿；现在视为该腿失败。空 rooms 数组是合法回包（该分类
// 确无在线房），不视为失败。
function validJsonBody(d) {
  if (!d || typeof d !== 'object') return false;
  if (Array.isArray(d.rooms)) return true;
  if ('room_status' in d || 'hls_source' in d) return true;
  return false;
}

// 列表/上下文 JSON 取数：Worker 优先（8s），直连兜底（8s）；两腿均为 req。
// round2：Worker 腿补浏览器 UA + Referer（原先只发 Accept，axios 默认带 axios/x
//   UA；而站方边缘对浏览器/axios 指纹区别对待已在直连腿上证实；VM 实测浏览器 UA
//   走 Worker 亦 200 + 真 JSON，无回归风险）；两腿均做形状校验，形状不对即换腿。
//   超时不缩短：无 App 外层时限证据，缩短 Worker 超时会丢慢网下本可成功的回包。
async function fetchJson(url) {
  try {
    const { data, status } = await req.get(LIST_WORKER + encodeURIComponent(url), {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER },
      timeout: CTX_TIMEOUT,
    });
    if (status === 200 && data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (validJsonBody(parsed)) return parsed;
    }
  } catch (e) { /* 换直连腿 */ }
  try {
    const { data, status } = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER },
      timeout: TIMEOUT,
    });
    if (status === 200 && data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (validJsonBody(parsed)) return parsed;
    }
  } catch (e) { /* 两腿皆败 */ }
  return null;
}

// ---------- 列表 ----------

function roomToVod(r) {
  const marks = [];
  if (r.is_new) marks.push('新人');
  if (r.is_hd) marks.push('高清');
  const remarks = `${r.num_users || 0}人观看${marks.length ? ' · ' + marks.join(' · ') : ''}`;
  return {
    vod_id: t(r.username),
    vod_name: t(r.username),
    vod_pic: t(r.image_url),
    vod_remarks: remarks,
  };
}

// ---------- affiliate 列表（round3） ----------
const AFF_API = 'https://chaturbate.com/affiliates/api/onlinerooms/?format=json&wm=ezKE2';
const AFF_TIMEOUT = 20000;
const AFF_CACHE_TTL = 120000;
let affCache = null; // { at, rooms } —— 全量约 11MB，一次拉取后缓存，分页不再重复拉
// 国家码 -> 地区分类（标准大洲归属；无国家码的房不进地区分类）
const REGION_OF = {
  BD: 'AS', CN: 'AS', HK: 'AS', IN: 'AS', JP: 'AS', KR: 'AS', KZ: 'AS', KG: 'AS',
  MY: 'AS', NP: 'AS', PH: 'AS', PK: 'AS', TH: 'AS', VN: 'AS',
  CA: 'NA', CR: 'NA', DO: 'NA', HN: 'NA', HT: 'NA', MX: 'NA', US: 'NA',
  AR: 'SA', BR: 'SA', CL: 'SA', CO: 'SA', EC: 'SA', PE: 'SA', VE: 'SA',
  AM: 'ER', AT: 'ER', BE: 'ER', BG: 'ER', CH: 'ER', CZ: 'ER', DE: 'ER', ES: 'ER',
  FI: 'ER', FR: 'ER', GB: 'ER', HU: 'ER', IE: 'ER', IS: 'ER', IT: 'ER', MD: 'ER',
  NL: 'ER', NO: 'ER', PL: 'ER', PT: 'ER', RO: 'ER', RS: 'ER', SK: 'ER', TR: 'ER',
  UA: 'ER',
  AU: 'O', EG: 'O', KE: 'O', LS: 'O', MG: 'O', NG: 'O', ZA: 'O',
};

// 拉全量 affiliate 房间（只留公开房 + 展示必需字段）；失败时用过期缓存顶一下，
// 实在没有才回空。affiliate 接口不做 bot 墙、直连即可，不走 list Worker。
async function fetchAffRooms() {
  const now = Date.now();
  if (affCache && now - affCache.at < AFF_CACHE_TTL) return affCache.rooms;
  try {
    const { data, status } = await req.get(AFF_API, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER },
      timeout: AFF_TIMEOUT,
    });
    const arr = typeof data === 'string' ? JSON.parse(data) : data;
    if (status === 200 && Array.isArray(arr)) {
      const rooms = arr
        .filter(r => r && r.username && r.current_show === 'public')
        .map(r => ({
          username: r.username,
          gender: r.gender || '',
          tags: Array.isArray(r.tags) ? r.tags : [],
          country: r.country || '',
          image_url: r.image_url || '',
          room_subject: r.room_subject || '',
          num_users: r.num_users || 0,
          is_hd: !!r.is_hd,
          is_new: !!r.is_new,
          age: (typeof r.age === 'number' ? r.age : null),
        }));
      affCache = { at: now, rooms };
      return rooms;
    }
  } catch (e) { /* fall through to stale cache */ }
  return affCache ? affCache.rooms : [];
}

function affFilter(rooms, params) {
  const g = params.genders || '';
  const rg = params.regions || '';
  const tag = params.hashtags || '';
  const fromAge = params.from_age ? parseInt(params.from_age, 10) : null;
  const toAge = params.to_age ? parseInt(params.to_age, 10) : null;
  const kw = params.keywords ? String(params.keywords).toLowerCase() : '';
  return rooms.filter(r => {
    if (g) {
      const want = g === 't' ? 's' : g; // affiliate 里跨性别记为 s
      if (r.gender !== want) return false;
    }
    if (rg && REGION_OF[r.country] !== rg) return false;
    if (tag && !r.tags.includes(tag)) return false;
    if (params.new_cams && !r.is_new) return false;
    if (fromAge != null && (r.age == null || r.age < fromAge)) return false;
    if (toAge != null && (r.age == null || r.age > toAge)) return false;
    if (kw) {
      const hay = (r.username + ' ' + (r.room_subject || '')).toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// params: 已解码的筛选键值 (genders/regions/hashtags/from_age/to_age/new_cams/keywords)；
// gaming/exhib 该 feed 无字段，如实回空。
async function getRoomsPage(params, page) {
  const p = params || {};
  if (p.gaming || p.exhib) return { list: [], total: 0 };
  const rooms = await fetchAffRooms();
  const filtered = affFilter(rooms, p);
  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const list = filtered.slice(start, start + PAGE_SIZE).map(roomToVod);
  return { list, total };
}

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

// 取房间播放信息 {room_status, room_title, num_viewers, hls_source};
// 主通道: /api/chatvideocontext/{username}/ JSON (约 5KB, 快);
// 兜底: 房间页内嵌 initialRoomDossier (约 195KB HTML, 慢)。
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
  const html = await fetchText(`${HOST}/${encodeURIComponent(username)}/`, TIMEOUT);
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

function cleanId(raw) {
  const s = t(raw);
  return s.includes('$') ? s.split('$').pop() : s;
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
  const vod = {
    vod_id: username,
    vod_name: username,
    vod_pic: `https://thumb.live.mmcdn.com/riw/${encodeURIComponent(username)}.jpg`,
    type_name: '直播',
    vod_remarks: remarks,
    vod_content: content,
    vod_play_from: NAME,
    vod_play_url: '直播$' + username,
  };
  return { list: [vod] };
}

// ---------- 主列表锁定最高档 (本地一跳代理) ----------

function b64url(s) {
  return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 本地代理地址 (js2p://_WEB_ 为 App 动态地址 scheme, 同 avhub/celebjihad 先例)
function proxyUrl(reqLike, path, targetUrl) {
  try {
    const server = reqLike?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}`;
  } catch (e) { return ''; }
}

function absUrl(u, base) {
  try { return new URL(u, base).toString(); } catch (e) { return u; }
}

// 把主列表裁到最高档: 只保留最佳变体 (高度优先, 其次码率) + 它引用的音频组,
// 所有 URI 改写为以主列表地址为基准的绝对地址。正文不含任何本地地址。
function filterMaster(raw, baseUrl) {
  const lines = String(raw).split(/\r?\n/);
  const head = [];
  const mediaByGroup = new Map();
  const variants = [];
  let pendingInf = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const g = /GROUP-ID="([^"]+)"/.exec(line);
      if (g) {
        if (!mediaByGroup.has(g[1])) mediaByGroup.set(g[1], []);
        mediaByGroup.get(g[1]).push(line);
      }
      continue;
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) { pendingInf = line; continue; }
    if (line.startsWith('#')) {
      if (line === '#EXTM3U' || line.startsWith('#EXT-X-VERSION') || line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) head.push(line);
      continue;
    }
    // 普通行 = 变体 URI (跟在 STREAM-INF 后)
    if (pendingInf) {
      const res = /RESOLUTION=(\d+)x(\d+)/.exec(pendingInf);
      const bw = /BANDWIDTH=(\d+)/.exec(pendingInf);
      const audio = /AUDIO="([^"]+)"/.exec(pendingInf);
      variants.push({
        inf: pendingInf,
        uri: line,
        h: res ? parseInt(res[2], 10) : 0,
        bw: bw ? parseInt(bw[1], 10) : 0,
        audio: audio ? audio[1] : '',
      });
      pendingInf = null;
    }
  }
  if (!variants.length) return '';
  variants.sort((a, b) => (b.h - a.h) || (b.bw - a.bw));
  const top = variants[0];
  const out = ['#EXTM3U'];
  for (const h of head) { if (h !== '#EXTM3U') out.push(h); }
  if (top.audio && mediaByGroup.has(top.audio)) {
    for (const ml of mediaByGroup.get(top.audio)) {
      out.push(ml.replace(/URI="([^"]+)"/, (mm, u) => `URI="${absUrl(u, baseUrl)}"`));
    }
  }
  out.push(top.inf);
  out.push(absUrl(top.uri, baseUrl));
  return out.join('\n') + '\n';
}

// 主列表拉取（仅 req；mmcdn 无年龄门；不走 jina 以免改写文本）
async function fetchPlaylist(url, timeout = TIMEOUT) {
  try {
    const { data, status } = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': REFERER },
      timeout,
    });
    if (status === 200 && data != null) return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) { /* ignore */ }
  return '';
}

const masterCache = new Map(); // url -> { text, exp }
const MASTER_CACHE_TTL = 60000;

// GET /proxy/master?u={b64url 主列表地址} —— 返回裁到最高档的主列表;
// 拉取/裁剪失败时 302 跳回原始主列表, 播放器退回自选档行为 (不劣于第一版)。
async function masterProxy(request, reply) {
  const q = request?.query || {};
  if (!q.u) { reply.code(400).send('missing u'); return; }
  let target = '';
  try { target = unb64url(q.u); } catch (e) { reply.code(400).send('bad u'); return; }
  let host = '';
  try { host = new URL(target).hostname; } catch (e) { /* ignore */ }
  if (!/^https:\/\//.test(target) || !(host === 'live.mmcdn.com' || host.endsWith('.live.mmcdn.com'))) {
    reply.code(400).send('bad u'); return;
  }
  const nowMs = Date.now();
  const hit = masterCache.get(target);
  if (hit && hit.exp > nowMs) {
    reply.header('Content-Type', 'application/vnd.apple.mpegurl');
    reply.header('Cache-Control', 'no-cache');
    reply.send(hit.text);
    return;
  }
  const raw = await fetchPlaylist(target);
  const filtered = raw && raw.includes('#EXT-X-STREAM-INF') ? filterMaster(raw, target) : '';
  if (!filtered) { reply.redirect(target); return; }
  if (masterCache.size > 64) masterCache.delete(masterCache.keys().next().value);
  masterCache.set(target, { text: filtered, exp: nowMs + MASTER_CACHE_TTL });
  reply.header('Content-Type', 'application/vnd.apple.mpegurl');
  reply.header('Cache-Control', 'no-cache');
  reply.send(filtered);
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const username = cleanId(body.id);
  if (!username) return { parse: 0, url: '' };
  const d = await getDossier(username);
  // 只有公开房才有游客流; hidden/private/away 等状态 hls_source 为空, 如实空返
  if (!d || d.room_status !== 'public' || !t(d.hls_source)) return { parse: 0, url: '' };
  const master = t(d.hls_source);
  // 直返主列表会让播放器从低档起播; 改走本地代理裁到最高档。代理地址构造失败时退回直返。
  const url = proxyUrl(reqIn, '/proxy/master', master) || master;
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
      // 主列表裁档代理 (GET): 只处理 m3u8 文本, 媒体列表/分片保持 mmcdn 直连
      fastify.get('/proxy/master', masterProxy);
    },
  };
}
