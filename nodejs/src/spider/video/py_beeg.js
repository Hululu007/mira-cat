// Beeg (https://beeg.com) -> CatPawOpen spider
// 站点：Beeg 新版前端（externulls 栈），SPA 壳 + store API，无登录墙。
// API（2026-11-13 VM 实测通）：
//   列表：GET https://store.externulls.com/tag/videos/<slug>?limit=N&offset=M
//     （limit>=10 必填、offset 必填；返回数组，条目 file.id / file.data
//     里 cd_column=sf_name 为标题 / fl_duration 秒 / fl_width/fl_height；
//     未知 slug 回 [] 不 404，分类只列实测有量的 slug）。
//   详情：GET https://store.externulls.com/facts/file/<id>（同结构单条）。
//   封面：https://thumbs.externulls.com/videos/<id>/0.webp（实测 200）。
//   播放：GET https://store.externulls.com/video/play_url/<id> -> 模板串
//     key=.../data=.../media=hls4A/multi=<240p..1080p 五档>/_TPL_/<id>.mp4.m3u8；
//     https://video.beeg.com/<模板> 即 master m3u8（实测 200，5 档变体）；
//     变体播单 200、首分片 200（约 900KB）—— 全链 VM 实测通。
//     模板含 end= 有效期，play() 每次现取现解，不缓存地址。
//   搜索：站方搜索走 wss://search.externulls.com（WebSocket，蜘蛛无此通道）；
//     蜘蛛搜索改为标签 slug 匹配（关键词去空格小写后当 slug 查 tag/videos），
//     命中标签即出该标签内容，无命中回空列表。
//   首页无“最新”接口：站方首页是标签驱动（路由 /:slugs?，无 slug 时无默认
//     内容流），故不设虚构的“最新”分类；顶级只有标签与频道两维。
// 分类呈现（用户 2026-11-13 01:59 定）：顶级分类 + 筛选卡片（123AV 款），
//   子分类不平铺：热门标签（卡片）/ 热门频道（卡片）。
// 字幕：无番号，不接字幕芯。
import req from '../../util/req.js';

const KEY = 'py_beeg';
const NAME = 'Beeg';
const STORE = 'https://store.externulls.com';
const VIDEO = 'https://video.beeg.com';
const THUMBS = 'https://thumbs.externulls.com';
const SITE = 'https://beeg.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

// 标签卡片：候选 93 个 slug 经 /tag/videos 实测，79 个有量（14 个 0 条
// 已剔除：big-tits、big-ass、big-boobs、cowgirl、small-tits、huge-tits、
// anal-sex、pov-anal、teen-anal、big-cock、small-cock、swingers、
// anal-toys、butt-plug）；显示名取站方 /tag?slug= 的 tg_name。
const TAG_CARDS = [
  { n: "Anal", v: "anal" },
  { n: "Blowjob", v: "blowjob" },
  { n: "Lesbian", v: "lesbian" },
  { n: "Teen", v: "teen" },
  { n: "MILF", v: "milf" },
  { n: "Mature", v: "mature" },
  { n: "Amateur Girl", v: "amateur" },
  { n: "Hardcore", v: "hardcore" },
  { n: "3some", v: "threesome" },
  { n: "Brunette", v: "brunette" },
  { n: "Blonde", v: "blonde" },
  { n: "Asian", v: "asian" },
  { n: "Black Girl", v: "ebony" },
  { n: "Latina", v: "latina" },
  { n: "POV", v: "pov" },
  { n: "Creampie", v: "creampie" },
  { n: "Squirting", v: "squirting" },
  { n: "Bondage & Discipline", v: "bondage" },
  { n: "Fetish", v: "fetish" },
  { n: "Interracial", v: "interracial" },
  { n: "Redhead", v: "redhead" },
  { n: "Public", v: "public" },
  { n: "Masturbation", v: "masturbation" },
  { n: "Webcam", v: "webcam" },
  { n: "Tattoo", v: "tattoo" },
  { n: "Orgy", v: "orgy" },
  { n: "Deepthroat", v: "deepthroat" },
  { n: "Handjob", v: "handjob" },
  { n: "Doggy", v: "doggystyle" },
  { n: "Missionary", v: "missionary" },
  { n: "Babe", v: "babe" },
  { n: "Lingerie", v: "lingerie" },
  { n: "Stockings", v: "stockings" },
  { n: "Heels", v: "heels" },
  { n: "Massage", v: "massage" },
  { n: "Casting", v: "casting" },
  { n: "Mom", v: "stepmom" },
  { n: "Sister", v: "stepsister" },
  { n: "Cheating", v: "cheating" },
  { n: "Wife", v: "wife" },
  { n: "Girlfriend", v: "girlfriend" },
  { n: "Cumshot", v: "cumshot" },
  { n: "Facial", v: "facial" },
  { n: "DP", v: "dp" },
  { n: "Gangbang", v: "gangbang" },
  { n: "Fisting", v: "fisting" },
  { n: "Pegging", v: "pegging" },
  { n: "Strap-On", v: "strapon" },
  { n: "Voyeur", v: "voyeur" },
  { n: "Exhibitionist", v: "exhibitionist" },
  { n: "Outdoor", v: "outdoor" },
  { n: "Car", v: "car" },
  { n: "Office", v: "office" },
  { n: "Teacher", v: "teacher" },
  { n: "Nurse", v: "nurse" },
  { n: "Maid", v: "maid" },
  { n: "Cosplay", v: "cosplay" },
  { n: "Hentai", v: "hentai" },
  { n: "Cartoon", v: "cartoon" },
  { n: "3D-CGI", v: "3d" },
  { n: "VR", v: "vr" },
  { n: "Hairy", v: "hairy" },
  { n: "Shaved", v: "shaved" },
  { n: "Piercing", v: "piercing" },
  { n: "Solo", v: "solo" },
  { n: "Couple", v: "couple" },
  { n: "Group", v: "group" },
  { n: "Party", v: "party" },
  { n: "Cuckold", v: "cuckold" },
  { n: "FemDom", v: "femdom" },
  { n: "Dominant", v: "dominant" },
  { n: "Submissive", v: "submissive" },
  { n: "Spanking", v: "spanking" },
  { n: "Bukkake", v: "bukkake" },
  { n: "Swallowing", v: "swallow" },
  { n: "Rimjob", v: "rimming" },
  { n: "Toy", v: "toys" },
  { n: "Dildo", v: "dildo" },
  { n: "Vibrator", v: "vibrator" }
];

// 频道卡片：候选 62 个，/tag/videos 实测 46 个有量（16 个 0 条已剔除），
// 再按解析名 tg_name 去重 2 个（AnalVids、PornWorld），剩 44 个；
// 显示名为站方 /tag?slug= 的 tg_name（个别 slug 解析为别名，如
// Private->Homemade、DDFNetwork/LegalPorno->Porn World/Anal Vids）。
const STUDIO_CARDS = [
  { n: "Evil Angel", v: "evilangel" },
  { n: "21 Sextury", v: "21sextury" },
  { n: "Naughty America", v: "naughtyamerica" },
  { n: "Wicked", v: "wicked" },
  { n: "Vivid", v: "vivid" },
  { n: "Penthouse", v: "penthouse" },
  { n: "Homemade", v: "private" },
  { n: "Marc Dorcel", v: "marcdorcel" },
  { n: "Porn World", v: "ddfnetwork" },
  { n: "Babe", v: "babes" },
  { n: "Team Skeet", v: "teamskeet" },
  { n: "Nubiles", v: "nubiles" },
  { n: "Vixen", v: "vixen" },
  { n: "Tushy", v: "tushy" },
  { n: "Blacked", v: "blacked" },
  { n: "Deep", v: "deeper" },
  { n: "Jules Jordan", v: "julesjordan" },
  { n: "Manuel Ferrara", v: "manuelferrara" },
  { n: "Joy Mii", v: "joymii" },
  { n: "Met Art", v: "metart" },
  { n: "Sex Art", v: "sexart" },
  { n: "Erotica X", v: "eroticax" },
  { n: "New Sensations", v: "newsensations" },
  { n: "Elegant Angel", v: "elegantangel" },
  { n: "Zero Tolerance", v: "zerotolerance" },
  { n: "Devil's Film", v: "devilsfilm" },
  { n: "Girlfriends Films", v: "girlfriendsfilms" },
  { n: "Girlsway", v: "girlsway" },
  { n: "Mom-Daughter", v: "mommysgirl" },
  { n: "Pure Taboo", v: "puretaboo" },
  { n: "Bratty Sis", v: "brattysis" },
  { n: "Family Strokes", v: "familystrokes" },
  { n: "Siblings", v: "stepsiblings" },
  { n: "MILF", v: "mylf" },
  { n: "Public Agent", v: "publicagent" },
  { n: "X Confessions", v: "xconfessions" },
  { n: "Tricky Old Teacher", v: "trickyoldteacher" },
  { n: "Old-Young", v: "oldandyoung" },
  { n: "Mature NL", v: "maturenl" },
  { n: "Anilos", v: "anilos" },
  { n: "Karups", v: "karups" },
  { n: "Anal Vids", v: "legalporno" },
  { n: "Ass Traffic", v: "asstraffic" },
  { n: "Rocco Siffredi", v: "roccosiffredi" }
]
;

function t(v) {
  return String(v == null ? '' : v).trim();
}

function durStr(sec) {
  sec = Math.floor(Number(sec) || 0);
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

async function getJson(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'application/json,*/*' },
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  } catch (e) {
    return null;
  }
}

async function getText(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
      timeout: timeoutMs || 15000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    if (typeof data === 'string') return data;
    if (data) return JSON.stringify(data);
    return '';
  } catch (e) {
    return '';
  }
}

function titleOf(item) {
  const data = (item && item.file && Array.isArray(item.file.data)) ? item.file.data : [];
  for (const d of data) {
    if (d && d.cd_column === 'sf_name' && d.cd_value) return t(d.cd_value);
  }
  return '';
}

function itemToVod(item) {
  if (!item || !item.file || item.file.id == null) return null;
  const id = String(item.file.id);
  const title = titleOf(item) || ('Beeg ' + id);
  return {
    vod_id: id,
    vod_name: title,
    vod_pic: THUMBS + '/videos/' + id + '/0.webp',
    vod_remarks: durStr(item.file.fl_duration),
  };
}

async function listByTag(slug, page) {
  const offset = (page - 1) * PAGE_SIZE;
  const arr = await getJson(STORE + '/tag/videos/' + encodeURIComponent(slug)
    + '?limit=' + PAGE_SIZE + '&offset=' + offset);
  const items = Array.isArray(arr) ? arr : [];
  const list = items.map(itemToVod).filter(Boolean);
  return {
    page,
    pagecount: list.length < PAGE_SIZE ? page : page + 1,
    limit: list.length || PAGE_SIZE,
    total: 0,
    list,
  };
}

// master 解析：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行为变体地址。
// 变体地址三种形态都见过：//ip...（协议相对，补 https:）、
// /key=...（video.beeg.com 上的相对路径，补 VIDEO）、https://...（原样）。
// 按高度从高到低排。
function parseMaster(text) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = t(lines[i]);
    if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    const rm = s.match(/RESOLUTION=(\d+)x(\d+)/i);
    const height = rm ? parseInt(rm[2], 10) : 0;
    let url = '';
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const u = t(lines[j]);
      if (u && u.charAt(0) !== '#') { url = u; break; }
    }
    if (!url) continue;
    if (url.indexOf('//') === 0) url = 'https:' + url;
    else if (url.charAt(0) === '/') url = VIDEO + url;
    const label = height ? (height + 'p') : '原画';
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, height, url });
  }
  out.sort((a, b) => (b.height || 0) - (a.height || 0));
  return out;
}

// 取某片的变体表：play_url 模板 -> master 文本 -> 变体数组。
// 站方接口偶有瞬时空回（列表侧已见多例），模板/master 各重试一次。
async function fetchVariants(id) {
  for (let att = 0; att < 2; att++) {
    const tpl = await getText(STORE + '/video/play_url/' + encodeURIComponent(id));
    const template = t(tpl);
    if (template && template.indexOf('media=') >= 0) {
      const master = await getText(VIDEO + '/' + template);
      if (master.indexOf('#EXTM3U') >= 0) {
        const vs = parseMaster(master);
        if (vs.length) return vs;
      }
    }
    if (att === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return [];
}

async function init() {
  return {};
}

async function home() {
  return {
    class: [
      { type_id: 'tags', type_name: '热门标签' },
      { type_id: 'studios', type_name: '热门频道' },
    ],
    filters: {
      tags: [{ key: 'sub', name: '标签', value: TAG_CARDS }],
      studios: [{ key: 'sub', name: '频道', value: STUDIO_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'tags');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  if (id === 'tags') return listByTag(sub || TAG_CARDS[0].v, page);
  if (id === 'studios') return listByTag(sub || STUDIO_CARDS[0].v, page);
  return { page, pagecount: page, limit: 0, total: 0, list: [] };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const id = t(raw);
  if (!id) return { list: [] };
  const item = await getJson(STORE + '/facts/file/' + encodeURIComponent(id));
  if (!item || !item.file) return { list: [] };
  const vod = itemToVod(item);
  if (!vod) return { list: [] };
  const tags = Array.isArray(item.tags)
    ? item.tags.map((g) => t(g.tg_name)).filter(Boolean).slice(0, 12).join(' / ') : '';
  // 变体实测档位出线；取不到变体时留一条自动线，play() 里现解。
  const variants = await fetchVariants(id);
  const eps = variants.length
    ? variants.map((v) => v.label + '$beeg:' + id + ':' + v.label)
    : ['自动$beeg:' + id + ':auto'];
  return {
    list: [{
      vod_id: id,
      vod_name: vod.vod_name,
      vod_pic: vod.vod_pic,
      vod_content: tags,
      vod_remarks: vod.vod_remarks,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^beeg:([^:]+):(.+)$/);
  if (!m) {
    // 裸 m3u8 直链直接返；裸数字 id 当自动档解。
    if (/\.m3u8(\?|$)/i.test(id)) return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': SITE + '/' } };
    if (/^\d+$/.test(id)) return play({ body: { id: 'beeg:' + id + ':auto' } });
    return { parse: 0, url: '' };
  }
  const vid = m[1];
  const want = m[2];
  const variants = await fetchVariants(vid);
  if (!variants.length) return { parse: 0, url: '' };
  let hit = null;
  if (want && want !== 'auto') {
    hit = variants.filter((v) => v.label === want)[0]
      || variants.filter((v) => String(v.height) === String(want).replace(/p$/i, ''))[0];
  }
  if (!hit) hit = variants[0];
  return {
    parse: 0,
    url: hit.url,
    header: { 'User-Agent': UA, 'Referer': SITE + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  // 站方搜索为 WebSocket，蜘蛛无此通道；改为标签 slug 匹配：
  // 先试空格转连字符的 slug，无结果再试去掉分隔符的 slug。
  const base = wd.toLowerCase().replace(/[\s_]+/g, '-');
  let res = await listByTag(base, page);
  if (!res.list.length) {
    const stripped = base.replace(/-/g, '');
    if (stripped !== base) res = await listByTag(stripped, page);
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
