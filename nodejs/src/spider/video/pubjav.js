// pubjav.com - MiraPlayer 蜘蛛
// 站点：https://pubjav.com（Watch JAV Streaming Online, Free Japanese Porn）
// 列表：/movies（最新）、/movies?genre=censored|uncensored|amateur、
//   /genre/<slug>、/actor/<slug>、/studio/<slug>、/label/<slug>；详情 /play/<slug>。
// 播放链（VM 全链实测通）：详情页 filmId/__pt/__pk + F4 data-id
//   → POST /ajax/player（pt 必填，缺/错均 403 E_TOK_LEN/E_TOK_MISS）
//   → player_enc 用 __pk 做 base64+XOR 解密 → iframe f4scdn.com/e/<code>
//   → data-api → GET /api/play/<vid>?ab=0&n=1 → src（签名 master m3u8，300 秒有效）。
//   master 与分片均强制 Origin: https://f4scdn.com 才能 200（无 Origin 403；
//   播放器不把 play header 转发给分片请求，直出 m3u8 在真机上必死，sextb v1-v3 已证实）。
//   故播放走已部署的 sextb-hls Worker /f4 全链代理（Worker 内取 src + 注入 Origin 改写），
//   蜘蛛只返回 Worker 地址，不直接碰视频流；复用已部署 Worker，无需新部署。
// 分辨率：F4 编码实测均为单档 720p（3 部片 master 均只含 1280x720 一个变体），
//   详情按 master 实测档位出线，有多档就多线、单档就一线，绝不硬编。
// 封面：列表 cdn001.imggle.net webp 直读 200；详情 pics.dmm.co.jp 直读；均无需代理。
// 其他服务器：SW 为 JS 混淆加载页、DD 为 Turnstile 真人验证墙、
//   ST get_video 在 VM 上 500（IP 绑定，VM 无法验证），三者均未纳入播放线；只出已验通的 F4 线。
// 字幕：接定版 subcore.js（2026-11-02），按片名登记番号，后台预热，play 有命中才带 subs。
//   注意：播放地址每次现取签名不同，故字幕统一以详情页地址为键登记与查询。
import req from '../../util/req.js';

const KEY = 'py_pubjav';
const NAME = 'PubJav';
const HOST = 'https://pubjav.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// 已部署的 sextb-hls Worker（用户 Cloudflare 账号，v4），/f4 路由为通用 f4 embed 代理，
// 实测可用于 pubjav 的 f4 embed（返回改写后 master + /p 变体 + /s 分片，全链 200）。
const WORKER = 'https://sextb-hls.li768435813.workers.dev';

// 分类：顶级 4 个（首页最新/有码/无码/素人）；子级平铺在后，名前缀标明从属
// （类型 16 个全站类型、女优前 20、厂商前 20、厂牌前 15，均按站内人气顺序取前 N；
// 站内女优/厂商/厂牌各 300+，全量既无法逐个 harness 验、App 里也没法翻，故只取前 N；
// 导演未入（浏览价值低）。每个分类均须 harness 实测有内容才保留，见 test_pubjav.cjs。
const CLASSES = [
  // —— 顶级 ——
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'amateur', type_name: '素人' },
  // —— 子级：类型（/genres 全 16 个）——
  { type_id: '/genre/reducing-mosaic', type_name: '类型·Reducing Mosaic' },
  { type_id: '/genre/uncensored-leaked', type_name: '类型·Uncensored Leaked' },
  { type_id: '/genre/amateur', type_name: '类型·Amateur' },
  { type_id: '/genre/anal', type_name: '类型·Anal' },
  { type_id: '/genre/av-idol', type_name: '类型·AV Idol' },
  { type_id: '/genre/beautiful-girl', type_name: '类型·Beautiful Girl' },
  { type_id: '/genre/beautiful-pussy', type_name: '类型·Beautiful Pussy' },
  { type_id: '/genre/big-asses', type_name: '类型·Big Asses' },
  { type_id: '/genre/big-tits', type_name: '类型·Big Tits' },
  { type_id: '/genre/blowjob', type_name: '类型·Blowjob' },
  { type_id: '/genre/bondage', type_name: '类型·Bondage' },
  { type_id: '/genre/bukkake', type_name: '类型·Bukkake' },
  { type_id: '/genre/cheating-wife', type_name: '类型·Cheating Wife' },
  { type_id: '/genre/cosplay', type_name: '类型·Cosplay' },
  { type_id: '/genre/creampie', type_name: '类型·Creampie' },
  { type_id: '/genre/cumshot', type_name: '类型·Cumshot' },
  // —— 子级：女优（/actors 人气前 20）——
  { type_id: '/actor/yui-hatano', type_name: '女优·Yui Hatano' },
  { type_id: '/actor/yu-shinoda', type_name: '女优·Yu Shinoda' },
  { type_id: '/actor/hibiki-otsuki', type_name: '女优·Hibiki Otsuki' },
  { type_id: '/actor/mao-hamasaki', type_name: '女优·Mao Hamasaki' },
  { type_id: '/actor/kanako-iioka', type_name: '女优·Kanako Iioka' },
  { type_id: '/actor/ichika-matsumoto', type_name: '女优·Ichika Matsumoto' },
  { type_id: '/actor/julia', type_name: '女优·Julia' },
  { type_id: '/actor/asahi-mizuno', type_name: '女优·Asahi Mizuno' },
  { type_id: '/actor/akari-niimura', type_name: '女优·Akari Niimura' },
  { type_id: '/actor/mizuki-yayoi', type_name: '女优·Mizuki Yayoi' },
  { type_id: '/actor/aika', type_name: '女优·Aika' },
  { type_id: '/actor/kanako-ioka', type_name: '女优·Kanako Ioka' },
  { type_id: '/actor/waka-misono', type_name: '女优·Waka Misono' },
  { type_id: '/actor/reiko-kobayakawa', type_name: '女优·Reiko Kobayakawa' },
  { type_id: '/actor/kurea-hasumi', type_name: '女优·Kurea Hasumi' },
  { type_id: '/actor/himari-hanazawa', type_name: '女优·Himari Hanazawa' },
  { type_id: '/actor/yui-tenma', type_name: '女优·Yui Tenma' },
  { type_id: '/actor/mitsuki-nagisa', type_name: '女优·Mitsuki Nagisa' },
  { type_id: '/actor/yumi-kazama', type_name: '女优·Yumi Kazama' },
  { type_id: '/actor/rena-aoi', type_name: '女优·Rena Aoi' },
  // —— 子级：厂商（/studios 人气前 20）——
  { type_id: '/studio/fc2ppv', type_name: '厂商·FC2PPV' },
  { type_id: '/studio/madonna', type_name: '厂商·MADONNA' },
  { type_id: '/studio/moodyz', type_name: '厂商·MOODYZ' },
  { type_id: '/studio/s1-no-1-style', type_name: '厂商·S1 NO.1 STYLE' },
  { type_id: '/studio/sod-create', type_name: '厂商·SOD Create' },
  { type_id: '/studio/attackers', type_name: '厂商·Attackers' },
  { type_id: '/studio/prestige', type_name: '厂商·Prestige' },
  { type_id: '/studio/idea-pocket', type_name: '厂商·Idea Pocket' },
  { type_id: '/studio/k-m-produce', type_name: '厂商·K M Produce' },
  { type_id: '/studio/venus', type_name: '厂商·Venus' },
  { type_id: '/studio/fitch', type_name: '厂商·Fitch' },
  { type_id: '/studio/das-', type_name: '厂商·Das!!' },
  { type_id: '/studio/glory-quest', type_name: '厂商·Glory Quest' },
  { type_id: '/studio/hunter', type_name: '厂商·Hunter' },
  { type_id: '/studio/tameike-goro', type_name: '厂商·Tameike Goro' },
  { type_id: '/studio/center-village', type_name: '厂商·Center Village' },
  { type_id: '/studio/honnaka', type_name: '厂商·Honnaka' },
  { type_id: '/studio/premium', type_name: '厂商·Premium' },
  { type_id: '/studio/wanz-factory', type_name: '厂商·Wanz Factory' },
  { type_id: '/studio/doc', type_name: '厂商·Doc' },
  // —— 子级：厂牌（/labels 人气前 15）——
  { type_id: '/label/madonna', type_name: '厂牌·Madonna' },
  { type_id: '/label/s1-no-1-style', type_name: '厂牌·S1 NO.1 STYLE' },
  { type_id: '/label/moodyz-diva', type_name: '厂牌·MOODYZ DIVA' },
  { type_id: '/label/hhh-group', type_name: '厂牌·HHH Group' },
  { type_id: '/label/tissue', type_name: '厂牌·Tissue' },
  { type_id: '/label/glory-quest', type_name: '厂牌·GLORY QUEST' },
  { type_id: '/label/das', type_name: '厂牌·Das' },
  { type_id: '/label/sod-star', type_name: '厂牌·SOD star' },
  { type_id: '/label/honnaka', type_name: '厂牌·Honnaka' },
  { type_id: '/label/aleddin', type_name: '厂牌·ALEDDIN' },
  { type_id: '/label/oppai', type_name: '厂牌·OPPAI' },
  { type_id: '/label/tameike-goro-', type_name: '厂牌·Tameike Goro' },
  { type_id: '/label/fitch', type_name: '厂牌·Fitch' },
  { type_id: '/label/kawaii', type_name: '厂牌·Kawaii' },
  { type_id: '/label/wanz-factory', type_name: '厂牌·Wanz Factory' },
];

function t(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

// 取页：强制原始文本（站方回 HTML；rdd22 教训：axios 自动解析 JSON 会坏 String(data)）。
async function getHtml(url, headers, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: Object.assign({ 'User-Agent': UA, 'Referer': HOST + '/' }, headers || {}),
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

async function postForm(url, fields, headers, timeoutMs) {
  const body = Object.keys(fields || {}).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
  try {
    const r = await req.post(url, body, {
      headers: Object.assign({
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      }, headers || {}),
      timeout: timeoutMs || 10000,
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

// theme.script.min.js 的 xorDecrypt 原样移植（Buffer 版；App 内无 atob/TextDecoder）：
 // player_enc 是 base64，解出字节后逐字节 XOR key（__pk，循环），再按 UTF-8 还原。
function xorDecrypt(enc, key) {
  if (!enc || !key) return '';
  try {
    const buf = Buffer.from(String(enc), 'base64');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key.charCodeAt(i % key.length);
    return out.toString('utf8');
  } catch (e) {
    return '';
  }
}

// 列表页：/movies、/movies?genre=X、/genre/X、/actor/X、/studio/X、/label/X、/search/X
// 翻页：/movies/pg-N、/movies?genre=X&pg=N、其余 /pg-N 后缀（搜索页 302 跟随）。
function listUrl(id, page) {
  const p = Math.max(1, page || 1);
  let base;
  if (id === 'home' || id === '' || id == null) base = '/movies';
  else if (id === 'censored') base = '/movies?genre=censored';
  else if (id === 'uncensored') base = '/movies?genre=uncensored';
  else if (id === 'amateur') base = '/movies?genre=amateur';
  else base = String(id);
  if (p <= 1) return HOST + base;
  if (base.indexOf('?') >= 0) return HOST + base + '&pg=' + p;
  return HOST + base + '/pg-' + p;
}

// 列表解析：每条一个 <a href="/play/<slug>" title="<标题>"> 卡片，内含
//   <span class="mli-code">CODE</span>、<span class="mli-runtimes">分钟</span>、
//   <img data-original="封面 webp">（懒加载，src 是占位图，必须取 data-original）。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]*href="\/play\/([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!slug || seen.has(slug)) continue;
    const body = m[3] || '';
    const cm = body.match(/<span class="mli-code">([^<]*)<\/span>/i);
    const rm = body.match(/<span class="mli-runtimes">([^<]*)<\/span>/i);
    const im = body.match(/data-original="([^"]+)"/i) || body.match(/<img[^>]*src="(https?:\/\/[^"]+)"/i);
    const title = decodeHtml(t(m[2]));
    if (!title) continue;
    seen.add(slug);
    const code = cm ? t(cm[1]) : '';
    const mins = rm ? t(rm[1]) : '';
    out.push({
      vod_id: HOST + '/play/' + slug,
      vod_name: title,
      vod_pic: im ? absUrl(im[1]) : '',
      vod_remarks: (code ? code : '') + (mins ? (code ? ' · ' : '') + mins + '分钟' : ''),
    });
  }
  return out;
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
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const base = '/search/' + encodeURIComponent(wd);
  const url = page <= 1 ? HOST + base : HOST + base + '/pg-' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 24,
    total: 999 * 24,
    list,
  };
}

// 从详情页提取：filmId、__pt、__pk、F4 服务器的 data-id。
function extractPlayerInfo(html) {
  const out = { filmId: '', pt: '', pk: '', f4ep: '' };
  if (!html) return out;
  let m = html.match(/filmId\s*=\s*(\d+)/);
  if (m) out.filmId = m[1];
  m = html.match(/window\.__pt\s*=\s*"([^"]+)"/);
  if (m) out.pt = m[1];
  m = html.match(/window\.__pk\s*=\s*"([^"]+)"/);
  if (m) out.pk = m[1];
  // 服务器按钮：<button class="switch-source" data-source=".." data-id="..">F4</button>
  // （VIP 按钮 data-id 为负数，跳过；clickfakeplayer 无 data-id，不会命中。）
  const re = /data-source="(\d+)"\s+data-id="(-?\d+)"[^>]*>([\s\S]{0,120}?)<\/button>/g;
  let bm;
  while ((bm = re.exec(html)) !== null) {
    const name = t(decodeHtml(bm[3]).replace(/<[^>]*>/g, ' '));
    if (name === 'F4' && bm[2] && bm[2][0] !== '-') {
      out.f4ep = bm[2];
      if (!out.filmId) out.filmId = bm[1];
      break;
    }
  }
  return out;
}

// POST /ajax/player 拿 F4 embed 地址（player_enc XOR 解密）。
async function resolveF4Embed(durl, info) {
  if (!info || !info.filmId || !info.f4ep || !info.pt || !info.pk) return '';
  const resp = await postForm(HOST + '/ajax/player',
    { episode: info.f4ep, filmId: info.filmId, pt: info.pt },
    { 'Referer': durl }, 10000);
  if (!resp) return '';
  let playerEnc = '';
  try {
    const j = JSON.parse(resp);
    playerEnc = j && j.player_enc ? String(j.player_enc) : '';
  } catch (e) { return ''; }
  if (!playerEnc) return '';
  const playerHtml = xorDecrypt(playerEnc, info.pk);
  const m = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i);
  if (!m) return '';
  return m[1];
}

// Worker /f4 取 master 播单（Worker 内现取签名 src 并注入 Origin 改写）。
async function workerF4Master(embedUrl, durl) {
  const u = WORKER + '/f4?u=' + encodeURIComponent(embedUrl) + '&r=' + encodeURIComponent(durl);
  const txt = await getHtml(u, { 'Accept': 'application/vnd.apple.mpegurl,*/*' }, 20000);
  if (!txt || txt.indexOf('#EXTM3U') < 0) return '';
  return txt;
}

// 解析 master 里的变体：#EXT-X-STREAM-INF(RESOLUTION=WxH) 下一行是变体地址。
// 返回 [{ label: '720p', height: 720, url: '<绝对地址>' }]（label 按高取，如 720p/1080p）。
function parseVariants(master) {
  const out = [];
  if (!master) return out;
  const lines = String(master).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = t(lines[i]);
    if (s.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    const rm = s.match(/RESOLUTION=(\d+)x(\d+)/i);
    const height = rm ? parseInt(rm[2], 10) : 0;
    let url = '';
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const u = t(lines[j]);
      if (u && u[0] !== '#') { url = u; break; }
    }
    if (!url) continue;
    let label = height ? (height + 'p') : '';
    if (!label) {
      const lm = url.match(/\/(\d{3,4})p\//);
      if (lm) label = lm[1] + 'p';
    }
    if (!label) label = '原画';
    out.push({ label, height, url });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<title>([^<]*)<\/title>/i);
  if (m) return decodeHtml(t(m[1]));
  return fallback || '';
}

function extractCover(html) {
  // 详情页海报：img.cover（pics.dmm.co.jp），其次 og:image
  let m = html.match(/<img[^>]*class="cover"[^>]*src="([^"]+)"/i)
    || html.match(/<img[^>]*src="([^"]+)"[^>]*class="cover"/i);
  if (m) return absUrl(m[1]);
  m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (m) return absUrl(m[1]);
  return '';
}

function slugOf(durl) {
  const m = String(durl || '').match(/\/play\/([^/?#]+)/i);
  return m ? m[1] : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let durl = t(raw);
  if (!durl) return { list: [] };
  if (!/^https?:\/\//i.test(durl)) durl = absUrl(durl);
  const slug = slugOf(durl);
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  const name = extractTitle(html, slug);
  const pic = extractCover(html);

  // F4 链：详情页 → ajax/player → embed → Worker /f4 取 master → 按实测档位出线。
  let lines = [];
  const info = extractPlayerInfo(html);
  const embed = await resolveF4Embed(durl, info);
  if (embed) {
    const master = await workerF4Master(embed, durl);
    const variants = parseVariants(master);
    if (variants.length) {
      lines = variants.map((v) => v.label + '$f4:' + slug + ':' + v.label);
    }
  }
  // 兜底：链路当时没跑通也留一条 F4 线，play() 里现解（签名现取，不依赖详情时效）。
  if (!lines.length) lines = ['F4$f4:' + slug + ':auto'];

  const playUrl = lines.join('#');
  // 字幕：以详情页地址为键登记片名（播放地址每次现取签名不同，不能作键），后台预热。
  if (name) {
    subCacheName(durl, name);
    subWarm(durl);
  }
  return {
    list: [{
      vod_id: durl,
      vod_name: name || slug,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (!id) return { parse: 0, url: '' };
  // id 可能是 "720p$f4:<slug>:720p" 或 "F4$f4:<slug>:auto"，取 $ 后面的 token。
  if (id.indexOf('$') >= 0) id = id.split('$').pop().trim();
  const m = id.match(/^f4:([^:]+):(.+)$/);
  if (!m) return { parse: 0, url: '' };
  const slug = m[1];
  const want = m[2];
  const durl = HOST + '/play/' + slug;

  // 现取：详情页（新鲜 __pt/__pk）→ ajax/player → embed → Worker /f4 取 master。
  const html = await getHtml(durl);
  if (!html) return { parse: 0, url: '' };
  const info = extractPlayerInfo(html);
  const embed = await resolveF4Embed(durl, info);
  if (!embed) return { parse: 0, url: '' };
  const master = await workerF4Master(embed, durl);
  if (!master) return { parse: 0, url: '' };

  let url = WORKER + '/f4?u=' + encodeURIComponent(embed) + '&r=' + encodeURIComponent(durl);
  if (want && want !== 'auto') {
    const variants = parseVariants(master);
    const hit = variants.filter((v) => v.label === want)[0]
      || variants.filter((v) => String(v.height) === want.replace(/p$/i, ''))[0];
    if (hit && hit.url) url = hit.url;
  }
  // 字幕：与 detail 同键（详情页地址），detail 预热过则命中缓存/在途；无命中不带 subs 键。
  const subs = await subSearchAll(durl).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

// ---------- 字幕聚合 companion helpers（core 本身不含，抄自 chineseav.js） ----------
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
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
