import req from '../../util/req.js';

// 蘑菇视频 https://moguds.cc —— 视频站（由用户提供的 upload-2.js 移植）
// 分类：16 个大区作顶级分类，各区细分（cate3～cate288）走筛选卡片 filters.sub
// 列表：<a href="/video/\d+/"> 卡片，封面走 dfdf.tjacq.com（实测无 Referer 也 200，无需 @ 后缀）
// 详情：#article-videos data-url + cdn_lines 组直链（首选 dfdf，备选 cloudfront）；播放直链 parse:0
const HOST = 'https://moguds.cc';
const CDN = 'https://dfdf.tjacq.com';
const ALT_CDN = 'https://d1uy7itup9paqh.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ZONES = [
  { id: "zone_featured", name: "🔥今日精选", default: "route_home_featured", subs: [{ n: "今日推荐", v: "route_home_featured" }, { n: "顶级网黄", v: "cate3" }, { n: "福利姬", v: "cate4" }, { n: "传媒精选", v: "cate6" }, { n: "JVID", v: "cate7" }, { n: "锅锅酱", v: "cate8" }] },
  { id: "zone_theme", name: "💋热门主题", default: "cate9", subs: [{ n: "巨乳大奶", v: "cate9" }, { n: "抖音风", v: "cate10" }, { n: "樱花小猫", v: "cate12" }, { n: "反差女友", v: "cate13" }, { n: "调教性奴", v: "cate15" }, { n: "ASMR", v: "cate16" }, { n: "高潮自慰", v: "cate18" }, { n: "露出野战", v: "cate20" }, { n: "SWAG", v: "cate21" }, { n: "绿帽淫妻", v: "cate23" }, { n: "群交滥交", v: "cate24" }, { n: "风骚少妇", v: "cate25" }, { n: "AI女神", v: "cate27" }, { n: "风骚母狗", v: "cate28" }, { n: "断袖男同", v: "cate29" }, { n: "原创短剧", v: "cate30" }, { n: "足交口爆", v: "cate31" }, { n: "炮桶小屋", v: "cate32" }, { n: "无套内射", v: "cate33" }, { n: "黑鬼长屌", v: "cate34" }, { n: "女同百合", v: "cate35" }, { n: "伪娘人妖", v: "cate36" }] },
  { id: "zone_creator", name: "💃网红达人", default: "cate37", subs: [{ n: "吴梦梦", v: "cate37" }, { n: "网黄", v: "cate38" }, { n: "umate原创", v: "cate39" }, { n: "Naomii", v: "cate40" }, { n: "YuiPeach", v: "cate41" }, { n: "唐伯虎", v: "cate42" }, { n: "饼干姐姐", v: "cate43" }, { n: "台北娜娜", v: "cate44" }, { n: "MASKU", v: "cate45" }, { n: "Xreind", v: "cate46" }, { n: "小桃酱", v: "cate47" }, { n: "安安小晗", v: "cate48" }, { n: "柚子猫", v: "cate49" }, { n: "王梨奈", v: "cate50" }, { n: "辛尤里", v: "cate51" }, { n: "粉色情人", v: "cate52" }, { n: "阿朱", v: "cate53" }, { n: "奶咪", v: "cate54" }, { n: "有根棒棒", v: "cate55" }, { n: "不见星空", v: "cate56" }, { n: "Kitty", v: "cate57" }, { n: "妮可", v: "cate58" }, { n: "Cos女神", v: "cate59" }, { n: "玩偶姊姊", v: "cate60" }, { n: "司雨", v: "cate61" }, { n: "谭晓彤", v: "cate62" }, { n: "刘玥", v: "cate63" }, { n: "Vivian", v: "cate64" }, { n: "多乙", v: "cate65" }, { n: "朱可儿", v: "cate66" }, { n: "周大萌", v: "cate67" }] },
  { id: "zone_media", name: "🎬传媒厂牌", default: "cate69", subs: [{ n: "麻豆传媒", v: "cate69" }, { n: "蜜桃传媒", v: "cate70" }, { n: "葫芦影业", v: "cate71" }, { n: "香蕉视频", v: "cate72" }, { n: "兔子先生", v: "cate73" }, { n: "OnlyFans", v: "cate74" }, { n: "91制片厂", v: "cate75" }, { n: "ED Mosaic", v: "cate76" }, { n: "IBiZa Media", v: "cate77" }, { n: "SA国际传媒", v: "cate78" }, { n: "乌托邦", v: "cate79" }, { n: "大象传媒", v: "cate80" }, { n: "天美传媒", v: "cate81" }, { n: "扣扣传媒", v: "cate82" }, { n: "性视界", v: "cate83" }, { n: "星空传媒", v: "cate84" }, { n: "映秀传媒", v: "cate85" }, { n: "杏吧原版", v: "cate86" }, { n: "果冻传媒", v: "cate87" }, { n: "爱神传媒", v: "cate88" }, { n: "爱豆传媒", v: "cate89" }, { n: "精东影业", v: "cate90" }, { n: "糖心Vlog", v: "cate91" }, { n: "萝莉社", v: "cate92" }] },
  { id: "zone_cos", name: "🎀福利姬社", default: "cate94", subs: [{ n: "桥本香菜", v: "cate94" }, { n: "米菲兔", v: "cate95" }, { n: "捅主任", v: "cate96" }, { n: "npxvip", v: "cate97" }, { n: "Andm", v: "cate98" }, { n: "liburin", v: "cate99" }, { n: "谭晓彤", v: "cate100" }, { n: "小水水", v: "cate101" }, { n: "小鸟酱", v: "cate102" }, { n: "HAMAR", v: "cate103" }, { n: "铃木美子", v: "cate104" }, { n: "占星猫", v: "cate105" }, { n: "芋圆呀", v: "cate106" }, { n: "小丁妹妹", v: "cate107" }, { n: "米娜学姐", v: "cate108" }, { n: "米胡桃", v: "cate109" }, { n: "萌白酱", v: "cate110" }, { n: "麻酥酥", v: "cate111" }, { n: "白桃少女", v: "cate112" }, { n: "八月未央", v: "cate113" }] },
  { id: "zone_melon", name: "🍉黑料吃瓜", default: "cate115", subs: [{ n: "网红大瓜", v: "cate115" }, { n: "校园猛料", v: "cate116" }, { n: "大奶孕妇", v: "cate117" }, { n: "独家泄密", v: "cate118" }, { n: "热门吃瓜", v: "cate119" }, { n: "潜规则", v: "cate120" }, { n: "反差泄露", v: "cate121" }, { n: "裸贷风波", v: "cate122" }, { n: "轮奸呀", v: "cate123" }, { n: "饥渴新娘", v: "cate124" }, { n: "强奸醉奸", v: "cate125" }, { n: "迷奸", v: "cate126" }] },
  { id: "zone_pornhub", name: "🌐P站精选", default: "cate128", subs: [{ n: "AnnyWalker", v: "cate128" }, { n: "MilaAzul", v: "cate129" }, { n: "Comatozze", v: "cate130" }, { n: "Honey", v: "cate131" }, { n: "Luxury", v: "cate132" }, { n: "kittyxk", v: "cate133" }, { n: "JennyKitty", v: "cate134" }, { n: "LeoLulu", v: "cate135" }, { n: "PurpleB", v: "cate136" }, { n: "MilaLioness", v: "cate137" }, { n: "Pinklov", v: "cate138" }, { n: "PornForce", v: "cate139" }, { n: "Shinaryen", v: "cate140" }, { n: "EvaElfie", v: "cate141" }, { n: "Candy", v: "cate142" }, { n: "Kenzie", v: "cate143" }, { n: "CarlaCu", v: "cate144" }, { n: "webto", v: "cate145" }, { n: "SiaSib", v: "cate146" }] },
  { id: "zone_flower", name: "🔎探花寻芳", default: "cate148", subs: [{ n: "沈先生", v: "cate148" }, { n: "赵总寻花", v: "cate149" }, { n: "小天探花", v: "cate150" }, { n: "换妻探花", v: "cate151" }, { n: "七天探花", v: "cate152" }, { n: "千人斩", v: "cate153" }, { n: "午夜尋花", v: "cate154" }, { n: "91大神", v: "cate155" }, { n: "按摩会所", v: "cate156" }, { n: "韩国嫖妓", v: "cate157" }, { n: "陈先生", v: "cate158" }, { n: "太子寻花", v: "cate159" }, { n: "翼屌寻花", v: "cate160" }, { n: "小宝寻花", v: "cate161" }, { n: "文轩探花", v: "cate162" }] },
  { id: "zone_taboo", name: "🌪️逆天乱伦", default: "cate164", subs: [{ n: "兄妹情深", v: "cate164" }, { n: "最爱岳母", v: "cate165" }, { n: "淫荡儿媳", v: "cate166" }, { n: "淫乱父女", v: "cate167" }, { n: "照顾小侄女", v: "cate168" }, { n: "师生恋情", v: "cate169" }, { n: "母子情深", v: "cate170" }, { n: "姐弟爱恋", v: "cate171" }, { n: "调教嫂子", v: "cate172" }, { n: "照顾小姨子", v: "cate173" }] },
  { id: "zone_erotic", name: "🔞精品三级", default: "cate175", subs: [{ n: "韩国三级", v: "cate175" }, { n: "香港三级", v: "cate176" }, { n: "台湾三级", v: "cate177" }, { n: "欧洲情色", v: "cate178" }, { n: "俄乌色情", v: "cate179" }, { n: "越南菲律宾", v: "cate180" }, { n: "印度情色", v: "cate181" }, { n: "日本三级", v: "cate182" }, { n: "美国色情", v: "cate183" }, { n: "东南亚情色", v: "cate184" }] },
  { id: "zone_live", name: "📡火热直播", default: "cate186", subs: [{ n: "多人淫交", v: "cate186" }, { n: "车震直播", v: "cate187" }, { n: "日韩主播", v: "cate188" }, { n: "户外直播", v: "cate189" }, { n: "抖音网红", v: "cate190" }, { n: "主播勾引", v: "cate191" }, { n: "快手网红", v: "cate192" }, { n: "对着你", v: "cate193" }, { n: "AVOVE", v: "cate194" }, { n: "MISSWAEM", v: "cate195" }, { n: "妖骚蛇姬", v: "cate196" }, { n: "大啵啵", v: "cate197" }, { n: "虎牙辣妹", v: "cate198" }] },
  { id: "zone_uniform", name: "👗制服诱惑", default: "cate200", subs: [{ n: "古装诱惑", v: "cate200" }, { n: "萝莉塔", v: "cate201" }, { n: "空姐诱惑", v: "cate202" }, { n: "丝袜诱惑", v: "cate203" }, { n: "职场OL", v: "cate204" }, { n: "清涩校服", v: "cate205" }, { n: "三点泳装", v: "cate206" }, { n: "JK短裙", v: "cate207" }, { n: "女仆装", v: "cate208" }, { n: "护士打针", v: "cate209" }, { n: "国风旗袍", v: "cate210" }, { n: "体操运动", v: "cate211" }, { n: "其他制服", v: "cate212" }] },
  { id: "zone_asia", name: "🌸日韩精选", default: "cate214", subs: [{ n: "骑兵精选", v: "cate214" }, { n: "高清优质", v: "cate215" }, { n: "FC2高清", v: "cate216" }, { n: "VR视觉", v: "cate217" }, { n: "人妻巨乳", v: "cate218" }, { n: "少女制服", v: "cate219" }, { n: "药物迷奸", v: "cate220" }, { n: "强暴系列", v: "cate221" }, { n: "轮奸系列", v: "cate222" }, { n: "筱田佑", v: "cate223" }, { n: "森澤佳奈", v: "cate224" }, { n: "三上悠亜", v: "cate225" }, { n: "AkihoYoshizawa", v: "cate226" }, { n: "神宮寺奈緒", v: "cate227" }, { n: "藤森里穗", v: "cate228" }, { n: "松本一香", v: "cate229" }, { n: "乙爱丽丝", v: "cate230" }, { n: "沙月芽衣", v: "cate231" }, { n: "姬咲華", v: "cate232" }, { n: "AliceOtsu", v: "cate233" }, { n: "佐山愛", v: "cate234" }, { n: "水果解說", v: "cate235" }] },
  { id: "zone_west", name: "🗽欧美洋马", default: "cate237", subs: [{ n: "推荐观看", v: "cate237" }, { n: "颜值少女", v: "cate238" }, { n: "网红洋马", v: "cate239" }, { n: "CandyLove", v: "cate240" }, { n: "丝袜制服", v: "cate241" }, { n: "欧美剧情", v: "cate242" }, { n: "AngelX", v: "cate243" }, { n: "商场性交", v: "cate244" }, { n: "情色按摩", v: "cate245" }, { n: "捷克搭讪", v: "cate246" }, { n: "肤若凝脂", v: "cate247" }, { n: "SweetieFox", v: "cate248" }, { n: "Morgpie", v: "cate249" }, { n: "DianRider", v: "cate250" }, { n: "BadCuteGirl", v: "cate251" }, { n: "Ailish", v: "cate252" }, { n: "SamanthaFlair", v: "cate253" }, { n: "滥交群交", v: "cate254" }, { n: "巨乳少女", v: "cate255" }, { n: "黑人大屌", v: "cate256" }] },
  { id: "zone_variety", name: "🎭综艺娱乐", default: "cate258", subs: [{ n: "深夜保健室", v: "cate258" }, { n: "王竹子教学", v: "cate259" }, { n: "中指通一下", v: "cate260" }, { n: "Misa米砂", v: "cate261" }, { n: "小哥哥艾理", v: "cate262" }, { n: "Dr.She", v: "cate263" }, { n: "1G老湿", v: "cate264" }, { n: "两性知识", v: "cate265" }, { n: "麻豆综艺", v: "cate266" }, { n: "户外搭讪", v: "cate267" }, { n: "性愛大秀", v: "cate268" }, { n: "女优训练营", v: "cate269" }, { n: "情趣k歌房", v: "cate270" }, { n: "小鹏奇啪行", v: "cate271" }, { n: "性爱自修室", v: "cate272" }, { n: "女神体育祭", v: "cate273" }, { n: "屁孩日记", v: "cate274" }, { n: "薇傲的性趣", v: "cate275" }, { n: "一三蜜桃说", v: "cate276" }, { n: "Carrie雨千", v: "cate277" }] },
  { id: "zone_cinema", name: "📽️影视影院", default: "cate279", subs: [{ n: "喜剧片", v: "cate279" }, { n: "古装片", v: "cate280" }, { n: "武侠片", v: "cate281" }, { n: "枪战片", v: "cate282" }, { n: "灾难片", v: "cate283" }, { n: "冒险片", v: "cate284" }, { n: "犯罪片", v: "cate285" }, { n: "科幻片", v: "cate286" }, { n: "动作片", v: "cate287" }, { n: "恐怖片", v: "cate288" }] }
];
function filtersFor(zone) {
  if (!zone || !zone.subs || zone.subs.length <= 1) return [];
  return [{ key: 'sub', name: '细分分类', value: zone.subs.map((s) => ({ n: s.n, v: s.v })) }];
}

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/[$#]/g, '').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      if (cand && !['loading.jpg', 'loading.png', 'placeholder', 'default'].some((b) => cand.toLowerCase().includes(b))) {
        if (cand.startsWith('/')) return CDN + cand;
        return cand;
      }
    }
  }
  return '';
}

function parseCards(html, host) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href=["'](\/video\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    if (seen.has(vUrl)) continue;
    const pic = extractPic(inner);
    let title = '';
    const tM = inner.match(/(?:title=["']([^"']+)["']|alt=["']([^"']+)["']|<h\d[^>]*>([\s\S]*?)<\/h\d>)/i);
    if (tM) title = cleanLabel(tM[1] || tM[2] || tM[3] || '');
    if (!title) {
      const lines = cleanLabel(inner).split(/\s+/).filter((x) => x.length > 3);
      if (lines.length) title = lines[0];
    }
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (vUrl && (pic || title)) {
      seen.add(vUrl);
      items.push({
        vod_id: vUrl,
        vod_name: title || '蘑菇精彩视频',
        vod_pic: pic ? (pic.startsWith('http') ? pic : absUrl(pic, host)) : '',
        vod_remarks: durM ? durM[1] : '',
      });
    }
  }
  return items;
}

function parseCdnLines(html) {
  const bases = [];
  const m = String(html || '').match(/cdn_lines\s*=\s*'([^']+)'/);
  if (m) {
    try {
      const arr = JSON.parse(m[1].replace(/\\\//g, '/'));
      for (const it of arr || []) {
        const b = String((it && it.cdnLine) || '').replace(/\/+$/, '').replace(/^(https?:)\/([^\/])/, '$1//$2');
        if (b.startsWith('http') && !bases.includes(b)) bases.push(b);
      }
    } catch (e) { /* ignore */ }
  }
  if (!bases.includes(CDN)) bases.push(CDN);
  if (!bases.includes(ALT_CDN)) bases.push(ALT_CDN);
  return bases;
}

function cleanStreamUrl(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
  let m = clean.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return m[0];
  m = clean.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return m[0];
  return clean;
}

function extractPlayerVarUrl(html, varName) {
  const re = new RegExp('var\\s+' + varName + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
  const m = String(html || '').match(re);
  if (!m) return '';
  try {
    const obj = JSON.parse(m[1]);
    if (obj && obj.url) return cleanStreamUrl(String(obj.url));
  } catch (e) { /* ignore */ }
  const um = m[1].match(/["']url["']\s*:\s*["']([^"']*)["']/);
  if (um) return cleanStreamUrl(um[1]);
  return '';
}

function extractPlayStream(html) {
  let m = html.match(/id=["']article-videos["'][^>]*data-url=["']([^"']+)["']/i)
    || html.match(/data-url=["']([^"']+)["'][^>]*id=["']article-videos["']/i);
  if (m) {
    let cand = m[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    if (cand.startsWith('//')) cand = 'https:' + cand;
    else if (cand.startsWith('/')) cand = CDN + cand;
    else if (!cand.startsWith('http')) cand = CDN + '/' + cand;
    return { url: cand, viaDataUrl: true };
  }
  m = html.match(/(?:var\s+raw\s*=\s*|video_url\s*:\s*|url\s*:\s*)["'](https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*)["']/i);
  if (m) return { url: m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  m = html.match(/https?:\/\/[^\s"'$<>]+\.m3u8[^\s"'$<>]*/i);
  if (m) return { url: m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  m = html.match(/https?:\/\/[^\s"'$<>]+\.mp4[^\s"'$<>]*/i);
  if (m) return { url: m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'), viaDataUrl: false };
  return { url: '', viaDataUrl: false };
}

async function home() {
  const classes = ZONES.map((z) => ({ type_id: z.id, type_name: z.name }));
  const filters = {};
  for (const z of ZONES) {
    const f = filtersFor(z);
    if (f.length) filters[z.id] = f;
  }
  let list = [];
  try {
    list = parseCards(await getHtml('/'), HOST).slice(0, 20);
  } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '').replace(/\//g, '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  const zone = ZONES.find((x) => x.id === zoneId);
  let target = String(extend.sub || '').trim();
  if (!target) target = zone ? zone.default : zoneId;
  if (!target) target = zoneId;
  let path = '';
  if (target === 'route_home_featured') {
    path = page === 1 ? '/' : ('/page/' + page + '/');
  } else {
    path = page === 1 ? ('/category/' + target + '/') : ('/category/' + target + '/' + page + '/');
  }
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  let next = false;
  if (target === 'route_home_featured') next = html.includes('/page/' + (page + 1) + '/');
  else next = html.includes('/category/' + target + '/' + (page + 1) + '/');
  if (!next && list.length > 0) {
    const nums = [...html.matchAll(/\/category\/[a-z0-9]+\/(\d+)\//gi)].map((x) => parseInt(x[1], 10));
    if (nums.length && Math.max(...nums) > page) next = true;
  }
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!kw) return { list: [] };
  const path = page === 1 ? ('/search/' + encodeURIComponent(kw) + '/') : ('/search/' + encodeURIComponent(kw) + '/' + page + '/');
  const html = await getHtml(path);
  return { page, list: parseCards(html, HOST) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '高清视频';
  if (tM) mainTitle = tM[1].trim().replace(/\s*[-_]\s*蘑菇视频\s*$/i, '').trim() || '高清视频';
  const stream = extractPlayStream(html);
  let playUrl = '';
  if (stream.viaDataUrl) {
    playUrl = stream.url;
  } else if (stream.url) {
    playUrl = stream.url;
  }
  if (!playUrl) {
    const v = extractPlayerVarUrl(html, 'player_aaaa') || extractPlayerVarUrl(html, 'player_data');
    if (v) playUrl = v;
  }
  if (!playUrl) {
    const dm = html.match(/id=["']article-videos["'][^>]*data-url=["']([^"']+)["']/i)
      || html.match(/data-url=["']([^"']+)["'][^>]*id=["']article-videos["']/i);
    if (dm) {
      const bases = parseCdnLines(html);
      const pth = dm[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      playUrl = bases[0].replace(/\/+$/, '') + (pth.startsWith('/') ? pth : '/' + pth);
    }
  }
  let posterPic = '';
  const dfdf = String(html || '').match(/dfdf\.tjacq\.com\/image\/[^\s"']+/g);
  if (dfdf && dfdf.length) posterPic = 'https://' + dfdf[0];
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = ogM[1].trim();
  }
  if (!posterPic) {
    const selfCard = parseCards(html, HOST).find((c) => c.id === rawId);
    if (selfCard && selfCard.vod_pic) posterPic = selfCard.vod_pic;
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: 'HD超清',
      vod_content: '蘑菇视频',
      vod_play_from: '蘑菇视频',
      vod_play_url: playUrl ? ('正片$' + playUrl) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}

export default function createSpider() {
  return {
    meta: { key: 'py_mogu', name: '蘑菇视频', type: 3 },
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
