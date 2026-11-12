// 4KPorno (https://www.4kporno.xxx) -> CatPawOpen spider
// KVS 站。探查 2026-11-13（VM）：列表 24 条/页，p1/p2 零重叠；分类页 361 个
// 真实分类（站方原文中文名，见下方 SUBS）；详情页 <source> 直给三档 mp4
// （2160p/720p/480p，H.264，实测 206）；get_file 地址稳定、无需 cookie，
// 播放时由播放器跟随 302 到 fpvcdn 签名地址。字幕：不接（欧美站无番号）。
import req from '../../util/req.js';

const KEY = 'py_4kporno';
const NAME = '4KPorno';
const HOST = 'https://www.4kporno.xxx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const SEARCH_SIZE = 24;

// 播放无需额外鉴权（无 cookie 也能 206），缓存留空占位，与另两站同款 play() 共用。
const playAuthCache = new Map();

const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'popular', type_name: '最热' },
  { type_id: 'top', type_name: '评分最高' },
  { type_id: 'categories', type_name: '全部类别' },
];

// 361 个真实分类：/zh/categories/ 单页全量抓取（2026-11-13），站方原文中文名，
// 不编造。筛选卡片呈现，不平铺。
const SUBS = [{"n":"18岁","v":"18-years-old"},{"n":"19岁","v":"19-years-old"},{"n":"50+","v":"50"},{"n":"60+","v":"60"},{"n":"69","v":"69"},{"n":"CFNM","v":"cfnm"},{"n":"Emo","v":"emo"},{"n":"FFF+","v":"fff"},{"n":"FFFMM","v":"fffmm"},{"n":"FFM","v":"ffm"},{"n":"Gangbang","v":"gangbang"},{"n":"GILF","v":"gilf"},{"n":"HD","v":"hd"},{"n":"JOI（手淫指导）","v":"joi-jerk-off-instructions"},{"n":"MILF","v":"milf"},{"n":"MMF (2男1女)","v":"mmf"},{"n":"MMFF (2 男 2 女)","v":"mmff"},{"n":"MMMF (3 男 2 女)","v":"mmmf"},{"n":"PAWG（丰满大白屁股白人女孩","v":"pawg"},{"n":"POV (视点","v":"pov"},{"n":"VR色情","v":"vr-virtual-reality"},{"n":"タブー","v":"taboo"},{"n":"丁字裤","v":"thong"},{"n":"万圣节","v":"halloween"},{"n":"三人行","v":"threesome"},{"n":"上下同插式","v":"spit-roast"},{"n":"丝袜","v":"stockings"},{"n":"中国人","v":"chinese"},{"n":"中奶","v":"medium-tits"},{"n":"丹麦的","v":"danish"},{"n":"乌克兰","v":"ukrainian"},{"n":"乳交","v":"titty-fuck"},{"n":"乳头","v":"nipples"},{"n":"乳房上的精液","v":"cum-on-tits"},{"n":"亚洲的","v":"asian"},{"n":"交换","v":"swap"},{"n":"人妖","v":"shemale"},{"n":"从屄到嘴","v":"pussy-to-mouth"},{"n":"伊朗的","v":"iranian"},{"n":"传教士式","v":"missionary"},{"n":"伪娘3P","v":"shemale-threesome"},{"n":"伪娘性交","v":"shemale-fuck-shemale"},{"n":"伴侣展示","v":"candaulism"},{"n":"体内射精","v":"creampie"},{"n":"体罚","v":"corporal-punishment"},{"n":"体育运动","v":"sport"},{"n":"作呕","v":"gagging"},{"n":"侍奉崇拜","v":"worship"},{"n":"侏儒","v":"midget"},{"n":"俄罗斯的","v":"russian"},{"n":"保加利亚的","v":"bulgarian"},{"n":"保姆","v":"babysitter"},{"n":"修整过的屄","v":"trimmed"},{"n":"假阳具","v":"dildo"},{"n":"健身","v":"fitness"},{"n":"健身房","v":"gym"},{"n":"偷窥","v":"voyeur"},{"n":"免费使用","v":"freeuse"},{"n":"公共场合","v":"public"},{"n":"军人","v":"military"},{"n":"出租车","v":"taxi"},{"n":"出轨","v":"cheating"},{"n":"分享","v":"share"},{"n":"制服","v":"uniform"},{"n":"剃毛","v":"shaving"},{"n":"剃过毛的","v":"shaved"},{"n":"办公室","v":"office"},{"n":"加拿大的","v":"canadian"},{"n":"动画成人视频","v":"animation"},{"n":"勺子性姿势","v":"spooning"},{"n":"匈牙利","v":"hungarian"},{"n":"医学的","v":"medical"},{"n":"医生","v":"doctor"},{"n":"半老徐娘","v":"cougar"},{"n":"卡住","v":"stuck"},{"n":"印度的","v":"indian"},{"n":"原始视频","v":"raw"},{"n":"双口活","v":"double-blowjob"},{"n":"双性恋者","v":"bisexual"},{"n":"双插入","v":"double-penetration"},{"n":"双胞胎","v":"twins"},{"n":"双重肛交","v":"double-anal"},{"n":"反向女牛仔","v":"reverse-cowgirl"},{"n":"受到惩罚","v":"punished"},{"n":"口中精液","v":"cum-in-mouth"},{"n":"口传精液","v":"cum-swapping"},{"n":"口活","v":"blowjob"},{"n":"古典","v":"vintage"},{"n":"吊带","v":"suspenders"},{"n":"同父异母","v":"stepfamily"},{"n":"名人","v":"celebrity"},{"n":"吞精","v":"cum-swallowing"},{"n":"吸球","v":"ball-sucking"},{"n":"呼吸游戏","v":"breath-play"},{"n":"哥伦比亚的","v":"colombian"},{"n":"哥特次文化","v":"goth"},{"n":"哭泣","v":"crying"},{"n":"哺乳期","v":"lactating"},{"n":"啦啦队","v":"cheerleader"},{"n":"四人行","v":"foursome"},{"n":"土耳其的","v":"turkish"},{"n":"圣帕特里克节","v":"st-patrick-s-day"},{"n":"圣诞","v":"christmas"},{"n":"地中海","v":"mediterranean"},{"n":"坐脸","v":"face-sitting"},{"n":"培养家庭幻想","v":"step-fantasy"},{"n":"墨西哥的","v":"mexican"},{"n":"声学亲密感","v":"acoustic-intimacy"},{"n":"处女","v":"vergin"},{"n":"多人颜射","v":"bukkake"},{"n":"多毛","v":"hairy"},{"n":"多毛的屄","v":"hairy-pussy"},{"n":"大乳头","v":"big-nipples"},{"n":"大乳晕","v":"big-areolas"},{"n":"大屁股","v":"big-ass"},{"n":"大屌","v":"big-cock"},{"n":"大美女","v":"bbw"},{"n":"大黑屌","v":"bbc-big-black-cock"},{"n":"天主教徒","v":"catholic"},{"n":"天然的大乳房","v":"big-natural-tits"},{"n":"夫妇","v":"couple"},{"n":"奇闻趣事","v":"gonzo"},{"n":"女佣","v":"maid"},{"n":"女同性恋统治","v":"lesdom"},{"n":"女同性恋者","v":"lesbian"},{"n":"女同性恋者三人行","v":"lesbian-in-threesome"},{"n":"女同磨镜","v":"scissoring"},{"n":"女大学生","v":"college-girl"},{"n":"女学生","v":"schoolgirl"},{"n":"女性内裤","v":"panties"},{"n":"女性高潮","v":"female-orgasm"},{"n":"女斗色情片","v":"cat-fights"},{"n":"女朋友","v":"girlfriend"},{"n":"女牛仔","v":"cowgirl"},{"n":"女用貼身內衣褲","v":"lingerie"},{"n":"奴隶","v":"slave"},{"n":"奶奶","v":"granny"},{"n":"妇科考试","v":"gyno-exam"},{"n":"妈妈","v":"mom"},{"n":"妻子","v":"wife"},{"n":"孕妇","v":"pregnant"},{"n":"学校","v":"school"},{"n":"安全套使用","v":"condom"},{"n":"宗教的","v":"religious"},{"n":"家庭主妇","v":"housewife"},{"n":"寻欢洞","v":"gloryhole"},{"n":"射在阴道上","v":"cum-on-pussy"},{"n":"射精","v":"cumshot"},{"n":"小乳房","v":"small-tits"},{"n":"小便","v":"pissing"},{"n":"少女深喉强制口交","v":"facefucking"},{"n":"尿尿","v":"peeing"},{"n":"屄双插","v":"double-pussy"},{"n":"巡警","v":"cop"},{"n":"巨乳","v":"big-tits"},{"n":"巴西的","v":"brazilian"},{"n":"希腊的","v":"greek"},{"n":"幕后花絮","v":"behind-the-scenes"},{"n":"年轻人","v":"young"},{"n":"微型","v":"petite"},{"n":"德国的","v":"german"},{"n":"性玩偶","v":"sex-doll"},{"n":"性玩具","v":"sex-toys"},{"n":"性虐待","v":"bdsm"},{"n":"恋物","v":"fetish"},{"n":"恋足","v":"foot-fetish"},{"n":"恐怖","v":"horror"},{"n":"情人节","v":"valentine-s-day"},{"n":"情色","v":"softcore"},{"n":"意大利的","v":"italian"},{"n":"感恩","v":"thanksgiving"},{"n":"戏仿","v":"parody"},{"n":"成熟","v":"mature"},{"n":"户外","v":"outdoor"},{"n":"手交","v":"handjob"},{"n":"打屁股","v":"spanking"},{"n":"打蛋蛋","v":"ball-busting"},{"n":"扮装","v":"cosplay"},{"n":"护士","v":"nurse"},{"n":"抹油的","v":"oiled"},{"n":"抽烟","v":"smoking"},{"n":"拉美裔女人","v":"latina"},{"n":"拳交","v":"fisting"},{"n":"指法","v":"fingering"},{"n":"按摩","v":"massage"},{"n":"振动器","v":"vibrator"},{"n":"捆绑","v":"tied-up"},{"n":"换伴","v":"swinger"},{"n":"换衣室","v":"changing-room"},{"n":"捷克的","v":"czech"},{"n":"掀裙","v":"upskirt"},{"n":"接吻","v":"kissing"},{"n":"接机","v":"pick-up"},{"n":"摄像头","v":"webcam"},{"n":"摔跤","v":"wrestling"},{"n":"摩门教徒","v":"mormon"},{"n":"改善身体","v":"enhanced-body"},{"n":"斗争","v":"fight"},{"n":"旅馆","v":"hostel"},{"n":"日本成人视频审查","v":"jav-censored"},{"n":"日本成人视频未经审查","v":"jav-uncensored"},{"n":"日本的","v":"japanese"},{"n":"晒成褐色的","v":"tanned"},{"n":"晒日线","v":"tan-lines"},{"n":"暨玩","v":"cumplay"},{"n":"最好的朋友","v":"best-friend"},{"n":"机器性交","v":"fucking-machine"},{"n":"束缚","v":"bondage"},{"n":"束缚","v":"restraints"},{"n":"枯瘦","v":"skinny"},{"n":"柔韧","v":"flexible"},{"n":"欧洲假期","v":"european-vacation"},{"n":"欧洲的","v":"european"},{"n":"比基尼","v":"bikini"},{"n":"毛茸茸的布什","v":"hairy-bush"},{"n":"氨纶","v":"spandex"},{"n":"汇编","v":"compilation"},{"n":"汽车","v":"car"},{"n":"法国的","v":"french"},{"n":"泡泡臀","v":"bubble-butt"},{"n":"波兰的","v":"polish"},{"n":"泰国的","v":"thai"},{"n":"泳池","v":"pool"},{"n":"洞口张开","v":"gaping"},{"n":"浅黑肤色的女人","v":"brunette"},{"n":"浓密的阴毛","v":"bush"},{"n":"浴室","v":"bathroom"},{"n":"海滩","v":"beach"},{"n":"淋浴","v":"shower"},{"n":"深喉","v":"deepthroat"},{"n":"湿的","v":"wet"},{"n":"滴蜡","v":"wax"},{"n":"潮吹","v":"squirt"},{"n":"澳洲的","v":"australian"},{"n":"激情","v":"passionate"},{"n":"父亲节","v":"fathers-day"},{"n":"爷爷","v":"grandpa"},{"n":"牙套","v":"braces"},{"n":"牧师","v":"priest"},{"n":"特写","v":"close-up"},{"n":"狗交式性爱","v":"doggystyle"},{"n":"独家的","v":"exclusive"},{"n":"独自","v":"solo"},{"n":"玩电","v":"electricity-play"},{"n":"玩睾丸","v":"ball-play"},{"n":"现实","v":"reality"},{"n":"瑜伽","v":"yoga"},{"n":"男性统治","v":"maledom"},{"n":"白皙的皮肤","v":"fair-skin"},{"n":"监狱","v":"prison"},{"n":"眼镜","v":"glasses"},{"n":"短发","v":"short-hair"},{"n":"硬核性交","v":"hardcore"},{"n":"秘书","v":"secretary"},{"n":"穆斯林","v":"hijab"},{"n":"立陶宛语","v":"lithuanian"},{"n":"第一次","v":"first-time-sex"},{"n":"第一次在色情","v":"first-time-porn"},{"n":"笼中调教","v":"cage"},{"n":"粗暴的性行为","v":"rough-sex"},{"n":"精神控制","v":"mind-control"},{"n":"素人","v":"amateur"},{"n":"红头发","v":"redhead"},{"n":"纹身","v":"tattoo"},{"n":"统治","v":"domination"},{"n":"继兄弟","v":"stepbrother"},{"n":"继女","v":"stepdaughter"},{"n":"继妹","v":"stepsister"},{"n":"继子","v":"stepson"},{"n":"继母","v":"stepmom"},{"n":"继父","v":"stepdad"},{"n":"绳索悬挂","v":"rope-suspension"},{"n":"绿帽侠","v":"cuckold"},{"n":"网眼布","v":"fishnet"},{"n":"美丽的屁股","v":"beautifu-ass"},{"n":"美丽的性爱","v":"beautiful-sex"},{"n":"美国独立日","v":"4th-of-july"},{"n":"美女","v":"babe"},{"n":"美妇","v":"beautiful"},{"n":"羞辱","v":"humiliation"},{"n":"群交","v":"orgy"},{"n":"老师","v":"teacher"},{"n":"老年人和年轻人","v":"old-and-young"},{"n":"肌肉型","v":"muscular"},{"n":"肛交","v":"anal"},{"n":"肛交后口交","v":"ass-to-mouth"},{"n":"肛内射精","v":"anal-creampie"},{"n":"肛塞","v":"buttplug"},{"n":"肛门指交","v":"ass-fingering"},{"n":"肛门游戏","v":"anal-play"},{"n":"肛门第一次","v":"first-anal"},{"n":"育种材料","v":"breeding-material"},{"n":"肿胀的乳头","v":"puffy-nipples"},{"n":"胶乳","v":"latex"},{"n":"胸罩","v":"bra"},{"n":"脚","v":"feet"},{"n":"脚趾吸吮","v":"toe-sucking"},{"n":"脱衣舞","v":"striptease"},{"n":"腰带式假阳具","v":"strap-on"},{"n":"自慰","v":"masturbation"},{"n":"自然卷发","v":"curly"},{"n":"自然胸部","v":"natural-tits"},{"n":"舔屄","v":"pussy-licking"},{"n":"舔手指","v":"finger-licking"},{"n":"舔睾丸","v":"ball-licking"},{"n":"舔肛门","v":"rimming"},{"n":"舔肛门","v":"ass-licking"},{"n":"色情明星","v":"pornstar"},{"n":"芭蕾舞女演员","v":"ballerina"},{"n":"苍白","v":"pale"},{"n":"英国的","v":"british"},{"n":"荷兰语","v":"dutch"},{"n":"葡萄牙的","v":"portuguese"},{"n":"蒙眼","v":"blindfold"},{"n":"蓝眼睛","v":"blue-eyes"},{"n":"袜子","v":"socks"},{"n":"裙子","v":"skirt"},{"n":"裸体主义者","v":"nudist"},{"n":"西班牙的","v":"spanish"},{"n":"观看","v":"watching"},{"n":"角色扮演","v":"role-play"},{"n":"触手幻想","v":"tentacles"},{"n":"警察","v":"police"},{"n":"试镜","v":"casting"},{"n":"诱惑","v":"seduced"},{"n":"调教","v":"femdom"},{"n":"超级瘦","v":"super-skinny"},{"n":"越南的","v":"vietnamese"},{"n":"足交","v":"footjob"},{"n":"跨性别干男人","v":"shemale-fuck-guy"},{"n":"跨种族","v":"interracial"},{"n":"身体打孔","v":"piercing"},{"n":"运动员","v":"athletic"},{"n":"运动球","v":"sportsball"},{"n":"连裤袜","v":"pantyhose"},{"n":"连裤袜","v":"party"},{"n":"迷你裙","v":"miniskirt"},{"n":"邋遢","v":"sloppy"},{"n":"酒店","v":"hotel"},{"n":"采访","v":"interview"},{"n":"野外露出","v":"exhibitionist"},{"n":"金发","v":"blonde"},{"n":"钱","v":"money"},{"n":"银发熟女","v":"gray-hair"},{"n":"长发","v":"long-hair"},{"n":"间谍相机","v":"spycam"},{"n":"阿姆斯特丹","v":"amsterdam"},{"n":"阿拉伯的","v":"arab"},{"n":"集体性交","v":"group-sex"},{"n":"青少年","v":"teen"},{"n":"非洲的","v":"african"},{"n":"面试","v":"audition"},{"n":"鞭打惩戒","v":"flogging"},{"n":"韩国的","v":"korean"},{"n":"颜射","v":"facial"},{"n":"骆驼趾","v":"cameltoe"},{"n":"骑马式","v":"riding"},{"n":"高个子女孩","v":"tall-girls"},{"n":"高跟鞋","v":"high-heels"},{"n":"黑人","v":"ebony"},{"n":"黑皮肤","v":"black"}];
const FILTERS = {
  categories: [{ key: 'sub', name: '类别', value: SUBS }],
};

function effCat(tid, sub) {
  if (tid === 'categories') {
    if (sub && SUBS.some((s) => s.v === sub)) return sub;
    return SUBS[0].v;
  }
  return tid;
}

function listUrl(eff, page) {
  let base;
  if (eff === 'latest') base = HOST + '/zh/latest-updates/';
  else if (eff === 'popular') base = HOST + '/zh/most-popular/';
  else if (eff === 'top') base = HOST + '/zh/top-rated/';
  else base = HOST + '/zh/categories/' + eff + '/';
  return page > 1 ? base + page + '/' : base;
}

function searchUrl(wd, page) {
  const base = HOST + '/zh/search/' + encodeURIComponent(wd) + '/';
  return page > 1 ? base + page + '/' : base;
}

// 列表：每条一个 <div class="item">；详情链接与标题在 thumb 锚点上
// （item-info 里会再出现一次同链接，seen 去重）；封面取 data-src，
// 无 data-src 时取 src（须排除占位 gif）；时长在 span.duration 里
// （"完整视频 36:51"，去前缀只留时长）。
function parseList(html) {
  const out = [];
  const seen = new Set();
  if (!html) return out;
  const re = /<a[^>]+href="(https:\/\/www\.4kporno\.xxx\/zh\/videos\/\d+\/[^"]+\/)"[^>]*title="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const title = decodeHtml(m[2]);
    const tail = html.slice(m.index, m.index + 2500);
    let pic = '';
    const dm = tail.match(/data-src="(https?:\/\/[^"]+)"/i);
    if (dm) pic = dm[1];
    else {
      const sm = tail.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
      if (sm && sm[1].indexOf('data:image') !== 0) pic = sm[1];
    }
    let remarks = '';
    const um = tail.match(/<span class="duration">\s*([^<]+?)\s*<\/span>/i);
    if (um) remarks = t(um[1]).replace(/^完整视频\s*/, '');
    out.push({ vod_id: href, vod_name: title || href, vod_pic: pic, vod_remarks: remarks });
  }
  return out;
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  let url = t(raw);
  if (!url) return { list: [] };
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const html = await getHtml(url);
  if (!html) return { list: [] };
  let name = '';
  const og = html.match(/property="og:title"[^>]*content="([^"]+)"/i)
    || html.match(/content="([^"]+)"[^>]*property="og:title"/i)
    || html.match(/property='og:title'[^>]*content='([^']+)'/i);
  if (og) {
    name = decodeHtml(og[1])
      .replace(/\s*4K\s*[^\w\u4e00-\u9fa5]*免费完整视频[\s\S]*$/, '')
      .replace(/\s*-\s*4KPorno\.XXX\s*$/i, '').trim();
  }
  if (!name) {
    const hm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (hm) name = decodeHtml(hm[1].replace(/<[^>]*>/g, ' '));
  }
  let pic = '';
  const pm = html.match(/property="og:image"[^>]*content="([^"]+)"/i)
    || html.match(/content="([^"]+)"[^>]*property="og:image"/i)
    || html.match(/property='og:image'[^>]*content='([^']+)'/i);
  if (pm) pic = absUrl(pm[1]);
  // 播放：<source src='..._<档>m.mp4/' label="<档>p">，有几档出几档，绝不硬编。
  const quals = [];
  const seen = new Set();
  const re = /<source[^>]+src='([^']+\.mp4[^']*)'[^>]*label="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = t(m[2]);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    quals.push({ label, url: m[1].replace(/&amp;/g, '&') });
  }
  quals.sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
  const playUrl = quals.map((q) => q.label + '$' + q.url).join('#');
  return {
    list: [{
      vod_id: url,
      vod_name: name || url,
      vod_pic: pic,
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

function t(v) {
  return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
  return t(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } });
}

function absUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return HOST + u;
  return HOST + '/' + u;
}

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer || HOST + '/',
  };
}

// 取页：强制拿原始文本（axios 在站方回 JSON 时会自动解析成对象，
// String(data) 得 "[object Object]"；responseType:'text' + 恒等
// transformResponse 可防住）。同时回 set-cookie（anysex 的播放地址
// 必须带详情页会话 cookie 才能取到 200，无 cookie 一律 410）。
async function getPage(url, referer) {
  try {
    const r = await req.get(url, { headers: headers(referer), timeout: 20000, responseType: 'text', transformResponse: [(d) => d] });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    let cookies = [];
    if (r && r.headers) {
      const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
      if (Array.isArray(sc)) cookies = sc;
      else if (typeof r.headers.getSetCookie === 'function') {
        try { cookies = r.headers.getSetCookie(); } catch (e) { /* 忽略 */ }
      }
    }
    return { html, cookies };
  } catch (e) {
    return { html: '', cookies: [] };
  }
}

async function getHtml(url, referer) {
  const p = await getPage(url, referer);
  return p.html;
}

function cookieHeader(cookies) {
  return (cookies || []).map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
}

// 页数：优先取分页块里的最大页码（KVS 分页含末页链接，4kporno/anysex
// 有 class="last" 末页、yesporn 窗口内含末页码）；取不到时按本页自证：
// 短页即末页、满页报 page+1（总数整除页容时会多报一页，App 要一次
// 空页即收尾，与 javass/丝瓜同款）。
function pagecountFromHtml(html, page, list, pageSize) {
  let max = 0;
  const pi = html.indexOf('pagination');
  if (pi >= 0) {
    const blk = html.slice(pi, pi + 6000);
    const end = blk.indexOf('</ul>');
    const seg = end >= 0 ? blk.slice(0, end) : blk;
    const re = /<a[^>]*>\s*(\d+)\s*<\/a>/g;
    let m;
    while ((m = re.exec(seg))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
    // 末页链接的文本常是 Last/»，页码只在 href 里（/…/<N>/），一并取最大值。
    const re2 = /href="[^"]*\/(\d+)\/"/g;
    while ((m = re2.exec(seg))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  if (max >= page) return max;
  return list.length < pageSize ? page : page + 1;
}

async function init() {
  return {};
}

async function home() {
  return { class: CLASSES, filters: FILTERS };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const tid = String(body.id || body.tid || CLASSES[0].type_id);
  const extend = body.filters || body.extend || {};
  const eff = effCat(tid, String(extend.sub || ''));
  const html = await getHtml(listUrl(eff, page));
  const list = parseList(html);
  return { page, pagecount: pagecountFromHtml(html, page, list, PAGE_SIZE), list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const html = await getHtml(searchUrl(wd, page));
  const list = parseList(html);
  return { page, pagecount: pagecountFromHtml(html, page, list, SEARCH_SIZE), list };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const m = id.match(/\$?(https?:\/\/[^\s$#]+)/);
  const url = m ? m[1] : (/^https?:\/\//i.test(id) ? id : '');
  if (!url) return { parse: 0, url: '' };
  const result = { parse: 0, url, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const hit = playAuthCache.get(url);
  if (hit) {
    if (hit.referer) result.header.Referer = hit.referer;
    if (hit.cookie) result.header.Cookie = hit.cookie;
  }
  return result;
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

