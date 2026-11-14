// wddfa (18J.TODAY, https://wddfa.18jtoday10m20.buzz, 备用 https://18j.today) -> CatPawOpen spider
// MacCMS 站: 详情页 -> 播放页 player_data JSON 直给 m3u8 (encrypt:0/trysee:0/points:0, 无 VIP 墙)
// 单档 720p (m3u8 只有一个 2000kb 变体), 封面直链无防盗链
// 注意: 真站是域名根路径, /luckily/ 只是落地页 (根 / 也是落地页, 首页最新取 /luckily/)
// 分类页: /vodtype/<id>.html (第1页), /vodtype/<id>-<N>.html (翻页)
// 搜索: /vodsearch/-------------.html?wd=<关键词> (搜索结果链接带 /index.php 前缀)
import req from '../../util/req.js';

const KEY = 'py_wddfa';
const NAME = 'wddfa';
const HOST = 'https://wddfa.18jtoday10m20.buzz';
// 备用域: 18j.today (站方自有入口, /luckily/ 首页 + 全站内容与主站一致, 已实测列表/详情/播放/搜索全通)
// 主域是 .buzz 镜像 (站方提示"收藏几个网址防止失效", 域名会轮换); 主域取不到时自动换备用域
const ALT_HOSTS = ['https://18j.today'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// 自家抓取中转（site-fetch Worker v5，需用户部署；未部署前回 400，自动回落）。
const FETCH_WORKER = 'https://site-fetch.li768435813.workers.dev';

// 分类: 顶级 3 个 (国产/日本/AI短剧) + 子分类去重后 153 个 (同名只留最小 id, 共 156 个)
// 236 个原始分类里 43 个名字重复, 已按名字去重
// 2026-11-11 用户要求无码/大屁股分类放首页最新后: 站内无"无码流出/无码破解/大屁股"原名,
//   最接近的真分类是 无码专区(351)/日本无码(58), 均已实测有内容可播, 故提到最前 (原位已删, 不重复)
//   (翹臀美尻(176)原也在此列, 后因其域名 bf1.qrtuv.com DNS 已死, 2026-11-11 用户令删除, 见下)
// 2026-11-11 用户令删翹臀美尻(176): 该分类全部内容在 bf1.qrtuv.com, 其 DNS 已死 (1.1.1.1/8.8.8.8 均 REFUSED),
//   封面与视频全死、站内无替代源, 故从分类列表硬删除, 重导后不再显示。
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
  { type_id: '351', type_name: '无码专区' },
  { type_id: '58', type_name: '日本无码' },
  { type_id: '1', type_name: '国产' },
  { type_id: '2', type_name: '日本' },
  { type_id: '321', type_name: 'AI短剧' },
  { type_id: '19', type_name: '日韩无码' },
  { type_id: '20', type_name: '强奸乱伦' },
  { type_id: '21', type_name: '欧美精品' },
  { type_id: '22', type_name: '人妻系列' },
  { type_id: '23', type_name: '中文字幕' },
  { type_id: '24', type_name: '动漫精品' },
  { type_id: '25', type_name: '日韩精品' },
  { type_id: '26', type_name: '伦理影片' },
  { type_id: '27', type_name: '制服诱惑' },
  { type_id: '28', type_name: '自拍偷拍' },
  { type_id: '29', type_name: '3P合辑' },
  { type_id: '30', type_name: 'AV明星' },
  { type_id: '31', type_name: '巨乳系列' },
  { type_id: '32', type_name: '颜射系列' },
  { type_id: '33', type_name: '口交视频' },
  { type_id: '34', type_name: '自慰系列' },
  { type_id: '35', type_name: '国产精品' },
  { type_id: '36', type_name: 'SM重味' },
  { type_id: '37', type_name: '教师学生' },
  { type_id: '38', type_name: '大秀视频' },
  { type_id: '50', type_name: '华语AV' },
  { type_id: '51', type_name: '黑料吃瓜' },
  { type_id: '52', type_name: '欧美' },
  { type_id: '53', type_name: '禁漫' },
  { type_id: '54', type_name: '学生' },
  { type_id: '55', type_name: '乱伦' },
  { type_id: '56', type_name: '探花' },
  { type_id: '57', type_name: '日本有码' },
  { type_id: '59', type_name: '主播网红' },
  { type_id: '60', type_name: '日本素人' },
  { type_id: '62', type_name: '精品推荐' },
  { type_id: '63', type_name: '国产色情' },
  { type_id: '64', type_name: '主播直播' },
  { type_id: '65', type_name: '亚洲无码' },
  { type_id: '67', type_name: '巨乳美乳' },
  { type_id: '68', type_name: '人妻熟女' },
  { type_id: '71', type_name: '萝莉少女' },
  { type_id: '72', type_name: '亚洲有码' },
  { type_id: '73', type_name: '伦理三级' },
  { type_id: '74', type_name: '成人动漫' },
  { type_id: '76', type_name: '制服丝袜' },
  { type_id: '77', type_name: '口交颜射' },
  { type_id: '78', type_name: '日本精品' },
  { type_id: '79', type_name: 'Cosplay' },
  { type_id: '80', type_name: '素人自拍' },
  { type_id: '81', type_name: '台湾辣妹' },
  { type_id: '82', type_name: '韩国御姐' },
  { type_id: '83', type_name: '唯美港姐' },
  { type_id: '87', type_name: '多人多P' },
  { type_id: '88', type_name: '91探花' },
  { type_id: '90', type_name: '野外露出' },
  { type_id: '94', type_name: '风情旗袍' },
  { type_id: '95', type_name: '兽耳系列' },
  { type_id: '98', type_name: '过膝袜' },
  { type_id: '99', type_name: '网曝门' },
  { type_id: '101', type_name: '恋腿狂魔' },
  { type_id: '103', type_name: '男同性恋' },
  { type_id: '152', type_name: '明星换脸' },
  { type_id: '153', type_name: 'AV解说' },
  { type_id: '155', type_name: '国产自拍' },
  { type_id: '162', type_name: '高清名优' },
  { type_id: '163', type_name: '三级伦理' },
  { type_id: '164', type_name: '网红主播' },
  { type_id: '165', type_name: '映画传媒' },
  { type_id: '167', type_name: '口爆颜射' },
  { type_id: '169', type_name: 'SM调教' },
  { type_id: '170', type_name: '美乳巨乳' },
  { type_id: '171', type_name: '短视频' },
  { type_id: '173', type_name: '女同性爱' },
  { type_id: '174', type_name: 'AI换脸' },
  { type_id: '175', type_name: '多人群交' },
  { type_id: '177', type_name: '丝袜美腿' },
  { type_id: '178', type_name: '精选独家' },
  { type_id: '179', type_name: '貧乳小奶' },
  { type_id: '275', type_name: '主播诱惑' },
  { type_id: '276', type_name: '探花约炮' },
  { type_id: '277', type_name: '偷拍偷窥' },
  { type_id: '278', type_name: '网曝吃瓜' },
  { type_id: '279', type_name: '抖阴短片' },
  { type_id: '280', type_name: '传媒剧情' },
  { type_id: '281', type_name: '日韩主播' },
  { type_id: '285', type_name: '换脸明星' },
  { type_id: '287', type_name: '女优明星' },
  { type_id: '288', type_name: '欧美激情' },
  { type_id: '289', type_name: '重口激情' },
  { type_id: '291', type_name: '剧情动漫' },
  { type_id: '293', type_name: '女同性恋' },
  { type_id: '294', type_name: 'VR视角' },
  { type_id: '297', type_name: '国产视频' },
  { type_id: '299', type_name: '国产传媒' },
  { type_id: '302', type_name: '欧美无码' },
  { type_id: '305', type_name: '国产主播' },
  { type_id: '306', type_name: '激情动漫' },
  { type_id: '308', type_name: '抖阴视频' },
  { type_id: '310', type_name: '网曝黑料' },
  { type_id: '315', type_name: '极品媚黑' },
  { type_id: '317', type_name: '网红头条' },
  { type_id: '318', type_name: '人妖系列' },
  { type_id: '319', type_name: '韩国主播' },
  { type_id: '348', type_name: '亚洲情色' },
  { type_id: '352', type_name: '欧美性爱' },
  { type_id: '353', type_name: '熟女人妻' },
  { type_id: '359', type_name: '卡通动画' },
  { type_id: '360', type_name: '视频伦理' },
  { type_id: '361', type_name: '少女萝莉' },
  { type_id: '362', type_name: '重口色情' },
  { type_id: '363', type_name: '人兽性交' },
  { type_id: '364', type_name: '福利姬' },
  { type_id: '367', type_name: '群交淫乱' },
  { type_id: '369', type_name: '偷拍自拍' },
  { type_id: '370', type_name: '卡通动漫' },
  { type_id: '374', type_name: '国产裸聊' },
  { type_id: '376', type_name: '国产盗摄' },
  { type_id: '381', type_name: '虚拟VR' },
  { type_id: '389', type_name: '探花系列' },
  { type_id: '393', type_name: '强制侵犯' },
  { type_id: '395', type_name: '绝色佳人' },
  { type_id: '396', type_name: '风俗泡泡浴' },
  { type_id: '397', type_name: '家庭乱伦' },
  { type_id: '399', type_name: '三级电影' },
  { type_id: '402', type_name: '绝顶潮吹' },
  { type_id: '403', type_name: '魔镜系列' },
  { type_id: '404', type_name: '时间停止' },
  { type_id: '405', type_name: '催眠洗脑' },
  { type_id: '406', type_name: '漫改系列' },
  { type_id: '408', type_name: '淫欲痴女' },
  { type_id: '412', type_name: 'TS专区' },
  { type_id: '419', type_name: '3D动漫' },
  { type_id: '421', type_name: '泰国风情' },
  { type_id: '422', type_name: 'OnlyFans' },
  { type_id: '424', type_name: '麻豆视频' },
  { type_id: '425', type_name: '91制片厂' },
  { type_id: '426', type_name: '天美传媒' },
  { type_id: '427', type_name: '蜜桃传媒' },
  { type_id: '428', type_name: '皇家华人' },
  { type_id: '429', type_name: '星空传媒' },
  { type_id: '430', type_name: '精东影业' },
  { type_id: '431', type_name: '大象传媒' },
  { type_id: '432', type_name: '91茄子' },
  { type_id: '433', type_name: '性视界传媒' },
  { type_id: '434', type_name: '兔子先生' },
  { type_id: '435', type_name: '杏吧原创' },
  { type_id: '436', type_name: '玩偶姐姐' },
  { type_id: '437', type_name: '香蕉传媒' },
  { type_id: '438', type_name: 'S国际传媒' },
  { type_id: '439', type_name: 'EDmosaic' },
  { type_id: '440', type_name: 'PsychPorn' },
  { type_id: '441', type_name: '糖心Vlog' },
  { type_id: '442', type_name: '葫芦影业' },
  { type_id: '443', type_name: '果冻传媒' },
];

function headers() {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': HOST + '/',
  };
}

async function fetchOnce(url) {
  // v5（2026-11-14）：单腿 20s + 20s = 最长 40s，App 等不到就先空了。
  // 改 8s 快败，让并行竞速尽快落定。
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 8000 });
    const html = String(data || '');
    if (html) return html;
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
}

// 2026-11-14 v2：列表空（用户报分类出、内容无）。站方本身正常（/luckily/ 实测
// 200、274KB、112 条，解析也通），断在手机侧直连取页。getHtml 加 jina 兜底
// 通道（r.jina.ai 取 /luckily/ 实测 200、112 条，无验证墙），直连失败时走 jina。
// 主站取不到 (超时/空回/域名失效) 时换备用域重试; 与 seniu 的 ALT_HOSTS 同款写法
// 先回非空者赢（直连挂起时不等它拖满超时，jina 快即可先赢）。
function raceNonEmpty(promises) {
  return new Promise((resolve) => {
    let done = 0, settled = false;
    const total = promises.length;
    if (!total) return resolve('');
    promises.forEach((p) => {
      Promise.resolve(p).then((v) => {
        if (settled) return;
        if (v) { settled = true; resolve(v); return; }
        done++;
        if (done >= total) { settled = true; resolve(''); }
      }).catch(() => {
        done++;
        if (!settled && done >= total) { settled = true; resolve(''); }
      });
    });
  });
}

async function getHtml(url) {
  // v5（2026-11-14）：v4 仍空。两点改动：① 单腿改 8s 快败（见 fetchOnce），
  // ② 备用域 18j.today 不再排队等（主域在手机网络上可能被拦，备用域走另
  // 一条路），与主域一起并行竞速：主域直连/jina/Worker + 备用域直连/jina/
  // Worker 六路，先回者赢。Worker 腿对 wddfa 目前回 502（CF 出口抓不到），
  // 但它回得快，不拖竞速。
  const jobs = [];
  const add = (u) => {
    jobs.push((async () => { try { return await fetchOnce(u); } catch (e) { return ''; } })());
    jobs.push((async () => { try { return await fetchOnce('https://r.jina.ai/' + u); } catch (e) { return ''; } })());
    jobs.push((async () => { try { return await fetchOnce(FETCH_WORKER + '/?u=' + encodeURIComponent(u)); } catch (e) { return ''; } })());
  };
  add(url);
  for (const alt of ALT_HOSTS) {
    const altUrl = url.replace(HOST, alt);
    if (altUrl !== url) add(altUrl);
  }
  return await raceNonEmpty(jobs);
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
  if (cat === 'home' || cat === '') {
    // 首页最新在 /luckily/ (根 / 只是落地页, 无分页)
    return HOST + '/luckily/';
  }
  if (page <= 1) return HOST + '/vodtype/' + cat + '.html';
  return HOST + '/vodtype/' + cat + '-' + page + '.html';
}

/**
 * 列表解析: 每条一个 img-box 锚点 (含封面 img + 添加日期)
 * <a href="/voddetail/<id>/" title="<标题>" class="img-box ...">
 *   <img class="lazy-image" data-src="<封面>" alt="<标题>" />
 *   <span class="item-auxiliary"><small>添加时间:</small><small>26-11-11</small></span>
 * </a>
 * 搜索页链接带 /index.php 前缀: /index.php/voddetail/<id>/
 */
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a\s+href="(?:\/index\.php)?\/voddetail\/(\d+)\/"[^>]*?title="([^"]+)"[^>]*?class="img-box[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const body = m[3] || '';
    const im = body.match(/data-src="([^"]+)"/i) || body.match(/src="([^"]+)"/i);
    if (!im) continue;
    seen.add(id);
    const title = decodeHtml(m[2]);
    const dm = body.match(/<small>(\d{2}-\d{2}-\d{2})<\/small>/);
    out.push({
      vod_id: id,
      vod_name: title || ('视频 ' + id),
      vod_pic: absUrl(im[1]),
      vod_remarks: dm ? dm[1] : '',
    });
  }
  return out;
}

function extractTitle(html, fallback) {
  let m = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m) return decodeHtml(m[1]);
  m = html.match(/<title>([^<]+)<\/title>/i);
  if (m) return decodeHtml(m[1].split(/[-|_｜]/)[0]);
  return fallback || '';
}

/** 详情页封面: alt 与标题一致的那张图 (即本片海报, 其余 lazy-image 都是推荐视频) */
function extractCover(html, title) {
  const imgs = [];
  const re = /<img[^>]*?(?:data-src|src)="([^"]+)"[^>]*?alt="([^"]*)"/gi;
  let m;
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

/** 播放页 player_data JSON: var player_data={"url":"...m3u8","encrypt":0,"trysee":0,"points":0,"from":"aosika",...} */
function extractPlayerData(html) {
  // player_data 是扁平 JSON, 结尾可能是 } 之后直接 </script> (无分号), 也可能有分号
  const m = html.match(/var\s+player_data\s*=\s*(\{[^{}]*\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
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
  // 首页最新无分页
  if ((id === 'home' || id === '') && page > 1) {
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
  const vid = String(raw || '').match(/voddetail\/(\d+)/)?.[1]
    || String(raw || '').replace(/[^0-9]/g, '');
  if (!vid) return { list: [] };

  const html = await getHtml(HOST + '/voddetail/' + vid + '/');
  if (!html) return { list: [] };

  const name = extractTitle(html, vid);
  const pic = extractCover(html, name);

  // 本片播放线: 详情页里与本 id 匹配的 /vodplay/<id>-<from>-<ep>/ (通常只有 -1-1 一条)
  const playPairs = [];
  const seenPair = new Set();
  const pre = new RegExp('vodplay\\/' + vid + '-(\\d+)-(\\d+)\\/', 'g');
  let pm;
  while ((pm = pre.exec(html)) !== null) {
    const key = pm[1] + '-' + pm[2];
    if (!seenPair.has(key)) {
      seenPair.add(key);
      playPairs.push([pm[1], pm[2]]);
    }
  }
  if (!playPairs.length) playPairs.push(['1', '1']);

  const eps = [];
  const seenUrl = new Set();
  for (const [from, ep] of playPairs) {
    const playHtml = await getHtml(HOST + '/vodplay/' + vid + '-' + from + '-' + ep + '/');
    const pd = extractPlayerData(playHtml || '');
    const url = pd && pd.url ? String(pd.url).trim() : '';
    if (!url || !/^https?:\/\//i.test(url) || seenUrl.has(url)) continue;
    seenUrl.add(url);
    let epName = '播放';
    if (playPairs.length > 1) {
      epName = (pd && pd.from ? String(pd.from) : '线路' + from).replace(/[$#]/g, '_');
    }
    if (pd && (Number(pd.trysee) > 0)) epName += '·试看';
    if (pd && (Number(pd.points) > 0)) epName += '·需积分';
    eps.push(epName + '$' + url);
  }
  if (!eps.length) return { list: [] };

  // 字幕：按每条播放地址 + vid 登记片名；后台逐条串行预热（不 await，不拖慢详情）
  const lineUrls = eps.map((e) => e.split('$').pop()).filter(Boolean);
  for (const u of lineUrls) subCacheName(u, name || vid);
  subCacheName(vid, name || vid);
  (async () => {
    for (const u of lineUrls) {
      try { await subSearchAll(u); } catch (e) {}
    }
  })().catch(() => {});

  return {
    list: [{
      vod_id: vid,
      vod_name: name || vid,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: eps.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const url = String(body.id || '');
  // 字幕：detail 预热过则命中缓存/在途；无命中不带 subs 键
  const subs = await subSearchAll(url).catch(() => []);
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = HOST + '/vodsearch/-------------.html?wd=' + encodeURIComponent(wd);
  if (page > 1) url += '&page=' + page;
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

// ---------- 字幕聚合 companion helpers（core 本身不含，抄自 javtiful 接线） ----------
// clean：去标签/空白（core 的 subSlugTitle 要用）；
// reqRaw：框架 req，2xx 才给正文，永不抛错（core 的 oracle / SubtitleCat 要用）。
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

// ===== BEGIN subcore.js（2026-11-02 定版，逐字粘贴，勿改） =====
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
// ===== END subcore.js =====
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
