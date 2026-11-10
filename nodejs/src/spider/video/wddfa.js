// wddfa (18J.TODAY, https://wddfa.18jtoday10m20.buzz) -> CatPawOpen spider
// MacCMS 站: 详情页 -> 播放页 player_data JSON 直给 m3u8 (encrypt:0/trysee:0/points:0, 无 VIP 墙)
// 单档 720p (m3u8 只有一个 2000kb 变体), 封面直链无防盗链
// 注意: 真站是域名根路径, /luckily/ 只是落地页 (根 / 也是落地页, 首页最新取 /luckily/)
// 分类页: /vodtype/<id>.html (第1页), /vodtype/<id>-<N>.html (翻页)
// 搜索: /vodsearch/-------------.html?wd=<关键词> (搜索结果链接带 /index.php 前缀)
import req from '../../util/req.js';

const KEY = 'py_wddfa';
const NAME = 'wddfa';
const HOST = 'https://wddfa.18jtoday10m20.buzz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 分类: 顶级 3 个 (国产/日本/AI短剧) + 子分类去重后 153 个 (同名只留最小 id, 共 156 个)
// 236 个原始分类里 43 个名字重复, 已按名字去重
const CLASSES = [
  { type_id: 'home', type_name: '首页最新' },
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
  { type_id: '58', type_name: '日本无码' },
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
  { type_id: '176', type_name: '翹臀美尻' },
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
  { type_id: '351', type_name: '无码专区' },
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

async function getHtml(url) {
  try {
    const { data } = await req.get(url, { headers: headers(), timeout: 20000 });
    const html = String(data || '');
    if (html) return html;
  } catch (e) { /* fall through to fetch */ }
  try {
    if (typeof fetch === 'function') {
      const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
    }
  } catch (e) { /* ignore */ }
  return '';
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
