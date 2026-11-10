// 悟空传媒 (https://qcfit2u1.chuanqi74.sbs) -> CatPawOpen spider
// MacCMS 站: /play/<id>.html 详情页 -> /v-p/<id>-<线>-1.html 播放页, player_data JSON 直给 m3u8 (encrypt:0, trysee:0, 无 VIP 墙)
// 注意: 站前有一道门 (gate 页, 空标题 + #xkEnter 按钮): 首次 GET 只回 5KB gate 页, JS 里含 var token='...',
// 设 Cookie xk_gate=<token> 再 GET 才能看到真站; token 每次取 gate 页时刷新, 有效 24 小时。getHtml 内自动过门,
// cookie 缓存在模块变量 gateCookie, 失效 (再次命中 gate 页) 时重新取 token。切勿请求站内统计像素 (wkyl188.shoujiduoduo.cc)。
// 单档: 每片只有一条 m3u8 (直出 media playlist, 无 STREAM-INF 变体; 个别是单变体 master, 如 852x480 一档),
// 站方只给一条流, 无分辨率可选, 不编档位; 每片通常只有 1 条播放线 (HD高清1线, 少数只有 2线), 详情现解每条线的直链。
// 分片是 .jpg 后缀伪装的 TS (个别 AES-128), iOS 原生 HLS 可播; m3u8 直取无需 Referer; 封面直链无防盗链。
// 分类: 首页最新 + 4 个排行 + 40 个视频分类 + 88 个标签 (标签名与分类重名 9 个, 故标签类名前加 “标签·” 区分)。
// 小说图片 8 个是文章/图片类 (无视频), 不进分类。
// 分类页: /vod/<id>.html (第1页), /vod/<id>-<N>.html (翻页); 标签: /tag/<id>.html, /tag/<id>-<N>.html;
// 排行: /label/rank.html (总浏览) /rankweek.html (周) /rankmonth.html (月) /rankscore.html (评分), 均单页;
// 搜索: /sou/-.html?wd=<关键词> (第1页), /sou/<关键词>-<N>.html (翻页)。
import req from '../../util/req.js';

const KEY = 'py_wukong';
const NAME = '悟空传媒';
// 域名可能随跳转门轮换, 改这里一处即可; 不要猜备用域名
const HOST = 'https://qcfit2u1.chuanqi74.sbs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// gate cookie 缓存 (模块常驻, 跨调用复用; 有效 24 小时)
let gateCookie = '';

const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: 'rank', type_name: '排行榜' },
  { type_id: 'rankweek', type_name: '周排行' },
  { type_id: 'rankmonth', type_name: '月排行' },
  { type_id: 'rankscore', type_name: '高分排行' },
  { type_id: '1', type_name: '国产' },
  { type_id: '6', type_name: '自拍' },
  { type_id: '8', type_name: '强奸' },
  { type_id: '9', type_name: '传媒' },
  { type_id: '12', type_name: '偷拍' },
  { type_id: '2', type_name: '网红' },
  { type_id: '3', type_name: '萝莉' },
  { type_id: '14', type_name: '吃瓜' },
  { type_id: '16', type_name: '人兽' },
  { type_id: '5', type_name: '探花' },
  { type_id: '4', type_name: '大秀' },
  { type_id: '17', type_name: '人妖' },
  { type_id: '20', type_name: '喷水' },
  { type_id: '22', type_name: '性虐' },
  { type_id: '24', type_name: '无码' },
  { type_id: '26', type_name: '欧美' },
  { type_id: '27', type_name: '动漫' },
  { type_id: '41', type_name: 'Cosplay' },
  { type_id: '18', type_name: 'OnlyFans' },
  { type_id: '10', type_name: '反差婊' },
  { type_id: '15', type_name: '大学生' },
  { type_id: '11', type_name: '网爆门' },
  { type_id: '13', type_name: '福利姬' },
  { type_id: '38', type_name: '瑜伽裤' },
  { type_id: '40', type_name: '多人群P' },
  { type_id: '23', type_name: 'AI换脸' },
  { type_id: '28', type_name: '三级片' },
  { type_id: '29', type_name: 'AV解说' },
  { type_id: '25', type_name: '中文字幕' },
  { type_id: '39', type_name: '兽耳系列' },
  { type_id: '37', type_name: '学生下海' },
  { type_id: '36', type_name: '淫荡儿媳' },
  { type_id: '35', type_name: '夫妻交换' },
  { type_id: '34', type_name: '野外车震' },
  { type_id: '33', type_name: '猛干嫂子' },
  { type_id: '32', type_name: '狂操小姨' },
  { type_id: '31', type_name: '禁忌母子' },
  { type_id: '30', type_name: '兄弟姐妹' },
  { type_id: '7', type_name: '家族乱伦' },
  { type_id: '50', type_name: '魔改AI短剧' },
  { type_id: 'tag239', type_name: '标签·骚' },
  { type_id: 'tag971', type_name: '标签·极品' },
  { type_id: 'tag14', type_name: '标签·内射' },
  { type_id: 'tag131', type_name: '标签·巨乳' },
  { type_id: 'tag233', type_name: '标签·高潮' },
  { type_id: 'tag990', type_name: '标签·爆操' },
  { type_id: 'tag162', type_name: '标签·诱惑' },
  { type_id: 'tag126', type_name: '标签·人妻' },
  { type_id: 'tag973', type_name: '标签·女神' },
  { type_id: 'tag217', type_name: '标签·流出' },
  { type_id: 'tag194', type_name: '标签·自慰' },
  { type_id: 'tag15', type_name: '标签·中出' },
  { type_id: 'tag165', type_name: '标签·调教' },
  { type_id: 'tag794', type_name: '标签·美少女' },
  { type_id: 'tag1015', type_name: '标签·乱伦' },
  { type_id: 'tag243', type_name: '标签·反差' },
  { type_id: 'tag136', type_name: '标签·黑丝' },
  { type_id: 'tag245', type_name: '标签·清纯' },
  { type_id: 'tag3', type_name: '标签·无码' },
  { type_id: 'tag996', type_name: '标签·母狗' },
  { type_id: 'tag976', type_name: '标签·网红' },
  { type_id: 'tag252', type_name: '标签·酒店' },
  { type_id: 'tag218', type_name: '标签·泄密' },
  { type_id: 'tag125', type_name: '标签·少妇' },
  { type_id: 'tag12', type_name: '标签·口交' },
  { type_id: 'tag987', type_name: '标签·无套' },
  { type_id: 'tag75', type_name: '标签·后入' },
  { type_id: 'tag1450', type_name: '标签·抽插' },
  { type_id: 'tag207', type_name: '标签·露脸' },
  { type_id: 'tag278', type_name: '标签·自拍' },
  { type_id: 'tag450', type_name: '标签·中出し' },
  { type_id: 'tag970', type_name: '标签·高颜值' },
  { type_id: 'tag396', type_name: '标签·OL' },
  { type_id: 'tag240', type_name: '标签·骚货' },
  { type_id: 'tag140', type_name: '标签·制服' },
  { type_id: 'tag118', type_name: '标签·探花' },
  { type_id: 'tag76', type_name: '标签·骑乘' },
  { type_id: 'tag273', type_name: '标签·字幕' },
  { type_id: 'tag948', type_name: '标签·中文' },
  { type_id: 'tag957', type_name: '标签·福利' },
  { type_id: 'tag226', type_name: '标签·白虎' },
  { type_id: 'tag119', type_name: '标签·约炮' },
  { type_id: 'tag489', type_name: '标签·偷拍' },
  { type_id: 'tag1212', type_name: '标签·情趣' },
  { type_id: 'tag2', type_name: '标签·中文字幕' },
  { type_id: 'tag968', type_name: '标签·私拍' },
  { type_id: 'tag964', type_name: '标签·曝光' },
  { type_id: 'tag160', type_name: '标签·偷情' },
  { type_id: 'tag7', type_name: '标签·破解' },
  { type_id: 'tag231', type_name: '标签·喷水' },
  { type_id: 'tag1455', type_name: '标签·狂操' },
  { type_id: 'tag163', type_name: '标签·勾引' },
  { type_id: 'tag129', type_name: '标签·御姐' },
  { type_id: 'tag90', type_name: '标签·直播' },
  { type_id: 'tag994', type_name: '标签·大奶' },
  { type_id: 'tag222', type_name: '标签·合集' },
  { type_id: 'tag71', type_name: '标签·深喉' },
  { type_id: 'tag19', type_name: '标签·3P' },
  { type_id: 'tag512', type_name: '标签·淫乱' },
  { type_id: 'tag228', type_name: '标签·粉嫩' },
  { type_id: 'tag980', type_name: '标签·抖音' },
  { type_id: 'tag135', type_name: '标签·长腿' },
  { type_id: 'tag1499', type_name: '标签·淫水' },
  { type_id: 'tag132', type_name: '标签·爆乳' },
  { type_id: 'tag282', type_name: '标签·素人' },
  { type_id: 'tag978', type_name: '标签·主播' },
  { type_id: 'tag998', type_name: '标签·尤物' },
  { type_id: 'tag124', type_name: '标签·学生妹' },
  { type_id: 'tag238', type_name: '标签·饥渴' },
  { type_id: 'tag244', type_name: '标签·反差婊' },
  { type_id: 'tag133', type_name: '标签·美乳' },
  { type_id: 'tag1003', type_name: '标签·大学生' },
  { type_id: 'tag8', type_name: '标签·高清' },
  { type_id: 'tag60', type_name: '标签·按摩' },
  { type_id: 'tag13', type_name: '标签·颜射' },
  { type_id: 'tag974', type_name: '标签·嫩妹' },
  { type_id: 'tag128', type_name: '标签·熟女' },
  { type_id: 'tag1501', type_name: '标签·精液' },
  { type_id: 'tag410', type_name: '标签·CA' },
  { type_id: 'tag446', type_name: '标签·丝袜' },
  { type_id: 'tag37', type_name: '标签·痴女' },
  { type_id: 'tag70', type_name: '标签·口爆' },
  { type_id: 'tag235', type_name: '标签·浪叫' },
  { type_id: 'tag237', type_name: '标签·主动' },
  { type_id: 'tag387', type_name: '标签·眼镜' },
  { type_id: 'tag610', type_name: '标签·系列' },
  { type_id: 'tag183', type_name: '标签·双飞' },
  { type_id: 'tag1814', type_name: '标签·角' },
];

function headers() {
  const h = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
  if (gateCookie) h['Cookie'] = gateCookie;
  return h;
}

function isGatePage(html) {
  return !!html && html.indexOf('xkEnter') !== -1 && /var token='[^']+'/.test(html);
}

function extractGateToken(html) {
  const m = html.match(/var token='([^']+)'/);
  return m ? m[1] : '';
}

async function rawGet(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    return String(data || '');
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 过门取页: 先 GET; 若回 gate 页 (含 xkEnter + var token), 取 token 设 Cookie 再 GET 一次,
 * cookie 缓存到 gateCookie 供后续调用复用; 若某次调用又命中 gate 页 (cookie 过期), 重新取 token。
 */
async function getHtml(url) {
  let html = await rawGet(url);
  if (isGatePage(html)) {
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url);
    }
  }
  if (isGatePage(html)) {
    // cookie 可能已过期: 重新取一次 token 再试
    const tok = extractGateToken(html);
    if (tok) {
      gateCookie = 'xk_gate=' + tok;
      html = await rawGet(url);
    }
  }
  return isGatePage(html) ? '' : html;
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function listUrl(cat, page) {
  page = Math.max(1, parseInt(page, 10) || 1);
  cat = t(cat) || 'home';
  if (cat === 'home' || cat === '') return HOST + '/';
  if (cat === 'rank' || cat === 'rankweek' || cat === 'rankmonth' || cat === 'rankscore') {
    return HOST + '/label/' + cat + '.html';
  }
  if (cat.indexOf('tag') === 0) {
    const tid = cat.slice(3);
    if (page <= 1) return HOST + '/tag/' + tid + '.html';
    return HOST + '/tag/' + tid + '-' + page + '.html';
  }
  if (page <= 1) return HOST + '/vod/' + cat + '.html';
  return HOST + '/vod/' + cat + '-' + page + '.html';
}

/**
 * 列表解析: 卡片结构 (首页/分类/标签/排行/搜索通用)
 * <div class="card">
 *   <a class="pic" href="/play/<id>.html" title="<标题>" style="background-image:url(<封面>)">
 *     <span class="badge-score">6.0</span><span class="badge">HD</span></a>
 *   <a class="title" href="/play/<id>.html" title="<标题>"><标题></a>
 *   <div class="sub"><span class="sub-hits">1.1K观看</span><span class="sub-up">6赞</span></div>
 * </div>
 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a\s+class="pic"\s+href="\/play\/(\d+)\.html"\s+title="([^"]+)"\s+style="background-image:url\(([^)]+)\)">([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const inner = m[4] || '';
    const score = (inner.match(/badge-score">([^<]+)</) || [])[1] || '';
    const badge = (inner.match(/badge">([^<]+)</) || [])[1] || '';
    // 备注: 分类徽标 + 评分, 如 "网爆门 6.0分"; 无徽标时只留评分
    let remarks = '';
    if (badge) remarks = badge;
    if (score) remarks = (remarks ? remarks + ' ' : '') + score + '分';
    out.push({
      vod_id: id,
      vod_name: decodeHtml(m[2]) || ('视频 ' + id),
      vod_pic: absUrl(m[3]),
      vod_remarks: remarks,
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1[^>]*>([^<]{2,300})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1].split(/[-|_｜]/)[0]);
  return fallback || '';
}

function extractCover(html, title) {
  // 详情页海报: <div class="poster"><img src="..." alt="<标题>">
  let m = html.match(/<div class="poster">[\s\S]*?<img[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"/i);
  if (m) return absUrl(m[1]);
  m = html.match(/<div class="poster">[\s\S]*?<img[^>]*?alt="([^"]*)"[^>]*?src="([^"]+)"/i);
  if (m) return absUrl(m[2]);
  const imgs = [];
  const re = /<img[^>]*?(?:data-src|src)="([^"]+)"[^>]*?alt="([^"]*)"/gi;
  while ((m = re.exec(html)) !== null) {
    imgs.push({ src: m[1], alt: decodeHtml(m[2]) });
  }
  if (title) {
    const hit = imgs.find(x => x.alt && x.alt === title);
    if (hit) return absUrl(hit.src);
  }
  if (imgs.length) return absUrl(imgs[0].src);
  return '';
}

/** 播放页 player_data JSON: var player_data={"url":"...m3u8","encrypt":0,"trysee":0,"points":0,"from":"fqm3u8",...} (结尾无分号, 直接 </script>) */
function extractPlayerData(html) {
  const m = html.match(/var\s+player_data\s*=\s*(\{[^{}]*\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

/** 解出直链: encrypt 0=明文, 1=unescape, 2=base64 (MacCMS 标准; 本站实测全为 0, 另两种只作兜底) */
function decodePlayUrl(pd) {
  if (!pd || !pd.url) return '';
  let url = String(pd.url).trim();
  const enc = Number(pd.encrypt) || 0;
  try {
    if (enc === 1) url = unescape(url);
    else if (enc === 2) url = Buffer.from(url, 'base64').toString('utf-8');
  } catch (e) { /* keep raw */ }
  return url;
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
  // 首页最新与 4 个排行均单页, 无翻页
  if ((id === 'home' || id === '' || id === 'rank' || id === 'rankweek' || id === 'rankmonth' || id === 'rankscore') && page > 1) {
    return { page, pagecount: 1, limit: 0, total: 0, list: [] };
  }
  const html = await getHtml(listUrl(id, page));
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const vid = String(raw || '').match(/play\/(\d+)/)?.[1]
    || String(raw || '').replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };

  const html = await getHtml(HOST + '/play/' + vid + '.html');
  if (!html) return { list: [] };

  const name = extractTitle(html, vid);
  const pic = extractCover(html, name);
  const typeM = html.match(/类型：([^<]{1,30})</);
  const descM = html.match(/<div class="article-content">([\s\S]{0,2000}?)<\/div>/i);
  const tagsM = html.match(/<div class="vod-tags">([\s\S]*?)<\/div>/i);
  const tagList = [];
  if (tagsM) {
    const tre = />([^<>]{1,20})<\/a>/g;
    let tx;
    while ((tx = tre.exec(tagsM[1])) !== null) tagList.push(decodeHtml(tx[1]));
  }
  const desc = descM ? decodeHtml(descM[1]).replace(/\s+/g, ' ') : '';
  const content = (tagList.length ? '标签：' + tagList.join(' / ') + '\n' : '') + desc;

  // 本片播放线: <a class="line-play" href="/v-p/<id>-<线>-1.html">HD高清1线</a> (通常只有 1 条)
  const lines = [];
  const seenLine = new Set();
  const lre = /class="line-play"\s+href="\/v-p\/\d+-(\d+)-1\.html"[^>]*>([^<]+)</g;
  let lm;
  while ((lm = lre.exec(html)) !== null) {
    const key = lm[1];
    if (seenLine.has(key)) continue;
    seenLine.add(key);
    lines.push({ line: lm[1], label: decodeHtml(lm[2]) || ('线路' + lm[1]) });
  }
  if (!lines.length) lines.push({ line: '1', label: 'HD高清' });

  // 每条线现解直链 (空 url 的线跳过, 如 306427 的 1线为空、只有 2线有地址)
  const eps = [];
  const seenUrl = new Set();
  for (const ln of lines) {
    const playHtml = await getHtml(HOST + '/v-p/' + vid + '-' + ln.line + '-1.html');
    const pd = extractPlayerData(playHtml || '');
    const url = decodePlayUrl(pd);
    if (!url || !/^https?:\/\//i.test(url) || seenUrl.has(url)) continue;
    seenUrl.add(url);
    eps.push(ln.label + '$' + url);
  }
  if (!eps.length) return { list: [] };

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: pic,
      vod_type: typeM ? decodeHtml(typeM[1]) : '',
      vod_remarks: tagList.join(' '),
      vod_content: content,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url;
  if (page <= 1) url = HOST + '/sou/-.html?wd=' + encodeURIComponent(wd);
  else url = HOST + '/sou/' + encodeURIComponent(wd) + '-' + page + '.html';
  const html = await getHtml(url);
  const list = parseList(html);
  return {
    page,
    pagecount: 999,
    limit: list.length || 20,
    total: 999 * 20,
    list,
  };
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
