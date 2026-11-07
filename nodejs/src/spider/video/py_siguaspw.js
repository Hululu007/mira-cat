import req from '../../util/req.js';

// 丝瓜视频 https://siguaspw.cc —— 与桃花视频同 CMS（/video/<19位数字>/ + data-url 播单 + cdn_lines）
// 分类：首页实测 228 个 /category/cateNN/（创作者/题材/厂牌/更多四组作分区 + 筛选卡片，分区按分类名语义归纳，cate ID 与名均取自首页）
// 2026-11-04 新增 8 个顶级分类（题材标签区已证实 cate，名与 ID 均取自首页实测；现有 5 类与 filters 结构不动）
// 列表翻页：/category/<cate>/<页码>/；详情 data-url 拼 cdn_lines 首条（站方默认，2026-11-07 实测 sxtmo 线播单/key/分片全链 200；旧首选 d1uy7itup9paqh 已不在 cdn_lines 里，d22 cloudfront 线分片 host 连不上）
// 播放：单码率媒体播单（AES-128），不设假多档；字幕按条目接（仅标题含番号的条目才接芯，多数中文标题无番号则不接）
// 2026-11-07 取页改走自家 site-fetch Worker 腿优先（用户手机网络到 siguaspw.cc 的 TLS 直接失败，
//   Safari 打不开、蜘蛛直连拿不到内容；Worker v4 白名单已加 siguaspw.cc，用户已部署）。
//   Worker 失败再回落直连；取页 Worker 只回文本，播放不经过它（播放走下面本地代理）。
// 2026-11-07 21:33 用户真机：列表/分类/内容/封面都出，就是无法播放。VM 实测播放链全通——
//   播单 200（319 分片）、KEY 200（16B）、首分片 200（3,325,168B，Range 206）；分片是 AES-128
//   密文（播单 KEY+IV 解密后为纯 TS，17686/17687 同步命中），字节本身无问题；dfdf 与 sxtmo
//   两线播单的分片 host 同为 d3s00p19cjdhyv.cloudfront.net，该域从未在手机上验证过，
//   同族 cloudfront 域 d1uy7 已死、d2ln4qgmi83wfi VM 侧连不上，故断点在手机到分片域这一腿。
//   修法（仿 24JAV/蘑菇 v2 本地字节代理）：detail/play 一律给本地 /proxy/m3u8?u=&r= 地址，
//   代理实时拉清单改写（KEY URI 与分片行全部指回代理），分片字节原样透传（AES 密文绝不改动、
//   不剥头），支持 Range；取不到时 302 回源。手机只与 App 自家服务通信，不再直触 cloudfront 域。
const HOST = 'https://siguaspw.cc';
const KEY = 'py_siguaspw';
const SITE_FETCH = 'https://site-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const ZONES = {"creator": [{"v": "cate4", "n": "精选Vlog"}, {"v": "cate5", "n": "SweetieYico-亦可姐姐"}, {"v": "cate6", "n": "Silky Suki 丝琪"}, {"v": "cate7", "n": "桃桃学姐（樱空桃桃）"}, {"v": "cate8", "n": "萌崽儿"}, {"v": "cate9", "n": "小水水"}, {"v": "cate10", "n": "Nicolove 妮可"}, {"v": "cate11", "n": "桥本香菜"}, {"v": "cate12", "n": "狐不妖"}, {"v": "cate13", "n": "辛尤里"}, {"v": "cate14", "n": "小欣奈"}, {"v": "cate15", "n": "饼干姐姐"}, {"v": "cate16", "n": "Nana_taipei"}, {"v": "cate17", "n": "玩偶姐姐"}, {"v": "cate18", "n": "苏小涵"}, {"v": "cate19", "n": "情深叉喔"}, {"v": "cate20", "n": "多亿"}, {"v": "cate21", "n": "御梦子"}, {"v": "cate22", "n": "退役御姐-林夕"}, {"v": "cate23", "n": "91兔兔"}, {"v": "cate24", "n": "Naomiii hub"}, {"v": "cate25", "n": "yuukoo"}, {"v": "cate26", "n": "Elle Lee"}, {"v": "cate27", "n": "Make性专家"}, {"v": "cate28", "n": "Yui"}, {"v": "cate29", "n": "小母狗优咪"}, {"v": "cate30", "n": "love姐"}, {"v": "cate31", "n": "苏畅"}, {"v": "cate32", "n": "小敏儿"}, {"v": "cate33", "n": "锅锅酱"}, {"v": "cate34", "n": "丝丝女神"}, {"v": "cate35", "n": "cola酱 唐可可"}, {"v": "cate36", "n": "鸡蛋饼"}, {"v": "cate37", "n": "黑椒盖饭"}, {"v": "cate38", "n": "泰国网黄obokozu"}, {"v": "cate39", "n": "Bigfan13yo"}, {"v": "cate40", "n": "Miss A"}, {"v": "cate41", "n": "日系少女地雷"}, {"v": "cate42", "n": "网红留学生-刘玥"}, {"v": "cate43", "n": "日本网黄-Yua"}, {"v": "cate44", "n": "谭晓彤"}, {"v": "cate45", "n": "长腿御姐Apple"}, {"v": "cate46", "n": "下面有根棒棒糖"}, {"v": "cate47", "n": "斯文禽兽"}, {"v": "cate48", "n": "小二先生"}, {"v": "cate49", "n": "唐伯虎"}, {"v": "cate50", "n": "小桃酱"}, {"v": "cate51", "n": "鸡教练"}, {"v": "cate52", "n": "粉色情人"}, {"v": "cate53", "n": "冉冉学姐"}, {"v": "cate54", "n": "二代CC"}, {"v": "cate55", "n": "捅主任"}, {"v": "cate56", "n": "台湾粉红兔"}, {"v": "cate57", "n": "涵菱"}, {"v": "cate58", "n": "荔枝"}, {"v": "cate59", "n": "京圈嫩模瑶瑶"}, {"v": "cate61", "n": "umate博主秀-原创中心"}, {"v": "cate62", "n": "爆款推荐-热播排行榜"}, {"v": "cate63", "n": "台妹-汐梦瑶"}, {"v": "cate64", "n": "懒懒猪儿-喜欢被抱、被操到哭"}, {"v": "cate65", "n": "诺诺-想成为你的专属宝贝!"}, {"v": "cate66", "n": "小巧芋艿taro"}, {"v": "cate67", "n": "阿朱"}, {"v": "cate68", "n": "糖心淑怡"}, {"v": "cate69", "n": "Couple love-原创"}, {"v": "cate70", "n": "羞羞兔"}, {"v": "cate71", "n": "草莓味的软糖呀"}, {"v": "cate72", "n": "台湾第一女优-吴梦梦"}, {"v": "cate73", "n": "小辣椒"}, {"v": "cate74", "n": "yuna"}, {"v": "cate75", "n": "鹤酱-鹤7"}, {"v": "cate76", "n": "Chloe"}, {"v": "cate77", "n": "爱丝袜的Vivian姐"}, {"v": "cate78", "n": "淫妻交换-绿帽老公"}, {"v": "cate79", "n": "艾希老师"}, {"v": "cate80", "n": "许木学长"}, {"v": "cate81", "n": "司雨"}, {"v": "cate82", "n": "蛇信子兔牙"}, {"v": "cate83", "n": "小阿俏"}, {"v": "cate84", "n": "橘子猫"}, {"v": "cate85", "n": "小余baby"}, {"v": "cate86", "n": "米胡桃"}, {"v": "cate87", "n": "国产D先生"}, {"v": "cate88", "n": "猫宝宝"}, {"v": "cate89", "n": "奶茶妹妹"}, {"v": "cate90", "n": "香菜公主"}, {"v": "cate91", "n": "甜心宝贝"}, {"v": "cate92", "n": "水冰月"}, {"v": "cate93", "n": "柚子猫"}, {"v": "cate94", "n": "小苏拉"}, {"v": "cate95", "n": "麻酥酥呦"}, {"v": "cate96", "n": "又又酱"}, {"v": "cate97", "n": "耀灵"}, {"v": "cate98", "n": "九尾狐狸又名-香草少女"}, {"v": "cate99", "n": "小巨"}, {"v": "cate100", "n": "小鸟酱"}, {"v": "cate101", "n": "八月未央"}, {"v": "cate102", "n": "来自喵星的岁酱"}, {"v": "cate103", "n": "果如cc"}, {"v": "cate105", "n": "海量片源-国产天花板-外网女菩萨"}, {"v": "cate106", "n": "反差婊-母狗界天花板"}, {"v": "cate107", "n": "精选萝莉，少女天花板"}, {"v": "cate108", "n": "私人定制-私拍流出"}, {"v": "cate109", "n": "原创短剧-剧情演绎"}, {"v": "cate110", "n": "安安老师-纯欲学姐"}, {"v": "cate111", "n": "米娜学姐"}, {"v": "cate112", "n": "酥酥"}, {"v": "cate113", "n": "91大神"}, {"v": "cate114", "n": "小晗wink"}, {"v": "cate115", "n": "骚御"}, {"v": "cate116", "n": "铃木君"}, {"v": "cate117", "n": "小恩"}, {"v": "cate118", "n": "芋圆"}, {"v": "cate119", "n": "樱狸子"}, {"v": "cate120", "n": "小爱神"}, {"v": "cate121", "n": "仙仙桃"}, {"v": "cate122", "n": "桃谷谷"}, {"v": "cate123", "n": "小晚酱"}, {"v": "cate124", "n": "骚萝baby"}, {"v": "cate125", "n": "软妹"}, {"v": "cate126", "n": "妮酱"}, {"v": "cate127", "n": "萌白酱"}, {"v": "cate128", "n": "可爱兔"}, {"v": "cate129", "n": "花菜"}, {"v": "cate130", "n": "白桃少女"}, {"v": "cate131", "n": "FC2"}, {"v": "cate132", "n": "小奶瓶"}, {"v": "cate134", "n": "嫩妹肏穴-粉嫩鲍鱼举着嫩妹操到射"}, {"v": "cate135", "n": "人妻-别人的老婆是最好的"}, {"v": "cate136", "n": "乱伦实录-伦理的流失 禁忌的快感"}, {"v": "cate137", "n": "网红集结地"}, {"v": "cate138", "n": "下海萝莉-生活不易萝莉卖艺"}, {"v": "cate139", "n": "台湾之光：跨界演出的女优们"}, {"v": "cate140", "n": "色播名场面"}, {"v": "cate141", "n": "探花档案-约炮大神实录"}, {"v": "cate142", "n": "情迷SM-意乱情迷SM调教"}, {"v": "cate143", "n": "吃瓜一线-网红明星的秘史"}, {"v": "cate144", "n": "下海主播-黄播的美女主播"}, {"v": "cate145", "n": "Cos女神堂-cosplay爱好聚集地"}, {"v": "cate146", "n": "台湾色情平台-SWag"}, {"v": "cate147", "n": "台湾嫩模-JVID"}], "tag": [{"v": "cate149", "n": "精选"}, {"v": "cate150", "n": "孕妇奶汁"}, {"v": "cate151", "n": "探花"}, {"v": "cate152", "n": "网红吃瓜"}, {"v": "cate153", "n": "出轨偷情"}, {"v": "cate154", "n": "自慰喷水"}, {"v": "cate155", "n": "成人综艺"}, {"v": "cate156", "n": "真爱男同"}, {"v": "cate157", "n": "明星换脸"}, {"v": "cate158", "n": "女女同性"}, {"v": "cate159", "n": "网红流出"}, {"v": "cate160", "n": "SM调教"}, {"v": "cate161", "n": "绿帽老公"}, {"v": "cate162", "n": "换妻淫趴"}, {"v": "cate163", "n": "户外露出"}, {"v": "cate164", "n": "大奶美乳"}, {"v": "cate165", "n": "媚黑母狗"}, {"v": "cate166", "n": "制服诱惑"}, {"v": "cate167", "n": "校园女神"}, {"v": "cate168", "n": "按摩会所"}, {"v": "cate169", "n": "直播"}, {"v": "cate170", "n": "勾引搭讪"}, {"v": "cate171", "n": "ASMR"}, {"v": "cate172", "n": "反差婊"}, {"v": "cate174", "n": "母子乱伦"}, {"v": "cate175", "n": "淫乱师生"}, {"v": "cate176", "n": "舅甥外侄"}, {"v": "cate177", "n": "女婿通奸"}, {"v": "cate178", "n": "公公儿媳"}, {"v": "cate179", "n": "淫乱兄妹"}, {"v": "cate180", "n": "家庭乱伦"}, {"v": "cate181", "n": "淫乱姐弟"}], "media": [{"v": "cate183", "n": "麻豆传媒"}, {"v": "cate184", "n": "爱豆传媒"}, {"v": "cate185", "n": "91制片厂"}, {"v": "cate186", "n": "皇家华人"}, {"v": "cate187", "n": "SA国际传媒"}, {"v": "cate188", "n": "蜜桃传媒"}, {"v": "cate189", "n": "天美传媒"}, {"v": "cate190", "n": "兔子先生"}, {"v": "cate191", "n": "果冻传媒"}, {"v": "cate192", "n": "乌托邦"}, {"v": "cate193", "n": "性视界"}, {"v": "cate194", "n": "星空传媒"}, {"v": "cate195", "n": "精东传媒"}, {"v": "cate196", "n": "香蕉视频"}], "more": [{"v": "cate198", "n": "全部"}, {"v": "cate199", "n": "家庭乱伦"}, {"v": "cate200", "n": "中文字幕"}, {"v": "cate201", "n": "波多野结衣"}, {"v": "cate202", "n": "河北彩花"}, {"v": "cate203", "n": "橘玛丽"}, {"v": "cate204", "n": "森泽佳奈"}, {"v": "cate205", "n": "无码破解"}, {"v": "cate206", "n": "JULIA"}, {"v": "cate207", "n": "希崎洁西卡"}, {"v": "cate208", "n": "七森莉莉"}, {"v": "cate209", "n": "三上悠亚"}, {"v": "cate210", "n": "桥本有菜"}, {"v": "cate211", "n": "松下纱荣子"}, {"v": "cate212", "n": "水果派解说"}, {"v": "cate214", "n": "全部"}, {"v": "cate215", "n": "Blacked RAW 黑人巨屌干超模"}, {"v": "cate216", "n": "DEEPER 激情性爱高清视频"}, {"v": "cate217", "n": "MILFY 独家4K 熟女超模 高清影片"}, {"v": "cate218", "n": "SLAYED 超模女同色情影片"}, {"v": "cate219", "n": "tushy 独家超模 高清肛交影片"}, {"v": "cate220", "n": "VIXEN 淫乱超模 群交 4K高清"}, {"v": "cate221", "n": "捷克搭讪 金钱的力量"}, {"v": "cate222", "n": "福利姬"}, {"v": "cate223", "n": "经典三级"}, {"v": "cate226", "n": "摄像破解"}, {"v": "cate227", "n": "裙底偷拍"}, {"v": "cate228", "n": "精品厕拍"}, {"v": "cate229", "n": "痴汉偷拍"}, {"v": "cate230", "n": "群交乱斗"}, {"v": "cate231", "n": "澡堂浴池"}, {"v": "cate232", "n": "街射涂鸦"}, {"v": "cate233", "n": "医院偷拍"}, {"v": "cate234", "n": "捷克幻想"}, {"v": "cate235", "n": "国产扫街"}, {"v": "cate237", "n": "1G老湿"}, {"v": "cate238", "n": "思春社"}, {"v": "cate239", "n": "王竹子"}, {"v": "cate240", "n": "独行者"}, {"v": "cate241", "n": "小哥哥艾理"}, {"v": "cate242", "n": "其它"}]};

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

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return host + u;
  return u;
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  return s;
}

// Worker 腿回的必须是真实 HTML（够长、非验证墙）；短体/验证页都算失败，走下一腿
function looksRealHtml(t) {
  return !!t && t.length > 2000 && !/Just a moment|Checking your browser|cf-challenge|__cf_chl|Attention Required|cf-wrapper|cf\.errors|Enable JavaScript and cookies/i.test(t);
}

// 取页：自家 site-fetch Worker 腿优先（12s）→ 直连回落（20s）；两腿都空才返回空。
// 播放用的播单/分片不经过这里（play 直接给 CDN 直链），Worker 只回文本。
async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  try {
    const r = await req.get(SITE_FETCH + '/?u=' + encodeURIComponent(url), {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 12000,
    });
    if (r.status === 200 && looksRealHtml(String(r.data || ''))) return String(r.data);
  } catch (e) { /* 回落直连 */ }
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 字幕芯取数原语（与 py_mogu 一致）：统一回 {status, body}
async function reqRaw(url, headers, timeoutMs) {
  try {
    let r;
    if (typeof req === 'function') {
      r = await req({ method: 'GET', url, headers: headers || {}, timeout: timeoutMs || 10000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5 });
    } else {
      r = await req.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
    }
    const body = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    return { status: r.status || 0, body, headers: r.headers || {}, err: null };
  } catch (e) {
    return { status: 0, body: '', headers: {}, err: e };
  }
}

// 本 CMS 卡片是“图链 + 文链”两个 <a> 共用同一 /video/<id>/，按 URL 合并图与标题
function extractPic(inner) {
  for (const attr of ['data-original', 'data-src', 'src']) {
    const m = inner.match(new RegExp(attr + "=['\"]([^'\"]+)['\"]", 'i'));
    if (m) {
      const cand = m[1].trim();
      if (cand && !['loading.jpg', 'loading.png', 'placeholder', 'default'].some((b) => cand.toLowerCase().includes(b))) return cand;
    }
  }
  return '';
}

function parseCards(html, host) {
  const byUrl = new Map();
  const re = /<a[^>]+href=["'](\/video\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const pic = extractPic(inner);
    if (pic && !it.vod_pic) it.vod_pic = normUrl(pic.startsWith('http') ? pic : absUrl(pic, host));
    const txt = cleanLabel(inner);
    if (txt && txt.length > 2 && !it.vod_name) it.vod_name = txt;
    const durM = inner.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (durM && !it.vod_remarks) it.vod_remarks = durM[1];
  }
  const out = [];
  for (const it of byUrl.values()) {
    if (it.vod_pic || it.vod_name) {
      if (!it.vod_name) it.vod_name = '精彩视频';
      out.push(it);
    }
  }
  return out;
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
  return bases;
}

// 2026-11-07：站方 cdn_lines 已轮换，d1uy7itup9paqh.cloudfront.net 不再出现；
// 实测：首条 sxtmo 线全链通（播单/key/分片均 200），d22 cloudfront 线播单 200 但其分片 host
// d2ln4qgmi83wfi.cloudfront.net 连不上（VM 侧 fetch+curl 共 0/5，空回复/连接重置），故首选站方
// 默认首条（站方 JS 同款默认 cdn_lines[0]），不再优先 cloudfront。
function pickPlayBase(bases) {
  const list = Array.isArray(bases) ? bases : [];
  return list[0] || '';
}

function extractDataUrl(html) {
  const m = String(html || '').match(/data-url=["']([^"']+)["']/i);
  if (!m) return '';
  return m[1].trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

// ---------------- 播单/分片本地代理（2026-11-07：修手机播不了；仿 24JAV/蘑菇 v2 形态） ----------------
// 病因见文件头：VM 侧播单/KEY/分片全通，分片是正常 AES-128 密文，解密即纯 TS；
// 唯一未在手机上验证过的腿是分片 host d3s00p19cjdhyv.cloudfront.net（同族域已有死例）。
// 代理只做两件事：清单改写（KEY URI、分片行全部指回代理）、分片字节原样透传（支持 Range）。
// 地址用 Ero/JavFeed 同款查询串形式 {dynamic}{prefix}/proxy/m3u8?u={b64 目标}&r={b64 referer}，
// 改写后的行用请求 Host 拼完整 http:// 绝对地址，不再依赖播放器解析 js2p:// 基址。
// 注意：分片是 AES 密文，绝不能像 24JAV 那样剥 PNG 头——密文里偶然出现的 0x47 三联会
// 误触发剥头、损坏密文；此处字节一律原样透传。KEY 是 16 字节二进制，按原样回传。
function b64url(s) {
  try {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}

function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 Ero/JavFeed 先例：查询串形式 /proxy/m3u8?u=&r=）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}

async function fetchBytes(url, referer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
        timeout: 30000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (r.status >= 200 && r.status < 300 && r.data) return Buffer.from(r.data);
    } catch (e) { /* 重试，落空走 302 降级 */ }
  }
  return null;
}

// 改写清单正文：# 行的 URI="..."（KEY）与非 # 行（variant/分片）一律改指回本地代理。
// selfBase 是完整 http:// 绝对基址（同 Ero/JavFeed：取请求 Host 拼 http://<host>/spider/py_siguaspw/3）。
// KEY URI 必须改写：原 URI 是相对路径 /keyhome/video.key，播单改走代理后若留相对路径，
// 播放器会以代理地址为基址解析、404，拿不到 KEY 便解不出任何分片。
// master 的 variant 行走查询串形式 /proxy/m3u8?u=&r=；媒体清单的分片行走路径段形式并在末尾加 .ts
// 后缀（过 ffmpeg 分片后缀白名单；b64url 字母表无 '.'，后缀无歧义；代理入口先剥后缀再解码）。
function rewriteSiguaspwM3u8(raw, playlistUrl, selfBase, referer) {
  const isMaster = String(raw).includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            return `URI="${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}"`;
          } catch (e) { return all; }
        });
      }
      return line;
    }
    try {
      const abs = new URL(s, playlistUrl).toString();
      if (isMaster) return `${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}`;
      return `${selfBase}/proxy/${b64url(abs)}/${b64url(referer || '-')}.ts`;
    } catch (e) { return line; }
  });
  return out.join('\n');
}

// 代理入口（两种地址格式都接受）：
// 主格式（本版 detail/play 发出）：/proxy/m3u8?u={b64url}&r={b64url}，同 Ero/JavFeed 先例；
// 路径段格式（媒体清单的分片行发出）：/proxy/{b64url 目标}/{b64url referer}.ts。
// 取回的文本是 #EXTM3U 即按清单改写；目标是 .key 即 16 字节密钥原样回传；
// 否则按分片字节原样透传（AES 密文，不剥头、不改字节，支持 Range，便于拖动）。
// 代理拉取失败 302 回源地址，不比旧行为更差。
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  if (!uEnc) {
    const wild = request?.params && request.params['*'];
    let segs = [];
    if (wild) segs = String(wild).split('/').filter(Boolean);
    else {
      const rawPath = String((request?.raw && request.raw.url) || request?.url || '').split('?')[0];
      const pi = rawPath.indexOf('/proxy/');
      if (pi >= 0) segs = rawPath.slice(pi + 7).split('/').filter(Boolean);
    }
    // 分片行带 .ts 后缀（过 ffmpeg 分片后缀白名单）；b64url 无 '.'，剥后缀无歧义。
    if (segs.length && segs[segs.length - 1].endsWith('.ts')) {
      segs[segs.length - 1] = segs[segs.length - 1].slice(0, -3);
    }
    if (segs.length) { uEnc = segs[0]; rEnc = segs[1] || ''; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  // 改写基址：同 Ero/JavFeed，用请求 Host 拼完整 http:// 绝对地址；上一版用裸 /spider/... 路径是
  // 24JAV 2026-11-07 19:45 真机“解析不出地址”的病根（播放器须以 js2p:// 为基址解析裸路径）。
  // 无 Host 时退回 proxyUrl 拼出的 js2p:// 形式（与上一版行为一致，不比旧行为更差）。
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  try {
    const buf = await fetchBytes(target, referer);
    if (!buf || !buf.length) { reply.redirect(target); return; }
    const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
    if (head.trimStart().startsWith('#EXTM3U')) {
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.send(rewriteSiguaspwM3u8(buf.toString('utf8'), target, selfBase, referer));
      return;
    }
    // KEY 文件（16 字节二进制）：原样回传，Content-Type 用 octet-stream，不当作分片处理。
    if (/\.key(\?|#|$)/i.test(target)) {
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.send(buf);
      return;
    }
    const range = request?.headers && request.headers.range;
    const m = range ? String(range).match(/bytes=(\d+)-(\d*)/) : null;
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Accept-Ranges', 'bytes');
    if (m) {
      const start = Math.min(parseInt(m[1], 10) || 0, buf.length);
      const end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
      if (start <= end) {
        reply.code(206);
        reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + buf.length);
        reply.send(buf.subarray(start, end + 1));
        return;
      }
    }
    reply.send(buf);
  } catch (e) {
    try { reply.redirect(target); } catch (e2) { /* 已发送则忽略 */ }
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
    /\b[A-Z]{2,10}-\d{2,8}[A-Z]?\b/,
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
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
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


const ZONE_META = [
  { id: 'zone_creator', name: '主播达人', key: 'creator' },
  { id: 'zone_tag', name: '题材标签', key: 'tag' },
  { id: 'zone_media', name: '传媒厂牌', key: 'media' },
  { id: 'zone_more', name: '更多精选', key: 'more' },
];

async function home() {
  const classes = [{ type_id: 'home', type_name: '首页推荐' }];
  for (const z of ZONE_META) classes.push({ type_id: z.id, type_name: z.name });
  // 2026-11-04 用户点名加的 2 个顶级分类（已证实 ID：无码破解 cate205、大奶美乳 cate164），放在主播达人后面。
  const USER_CLASSES = [
    { type_id: 'cate205', type_name: '无码破解' },
    { type_id: 'cate164', type_name: '大奶美乳' },
  ];
  classes.splice(2, 0, ...USER_CLASSES);
  // 2026-11-04 新增顶级分类：题材标签区已证实的 8 个 cate（名与 ID 均取自首页实测 ZONES.tag）。
  // 注意：用户点名的 无码流出 / 巨乳 / 大屁股 在数据里无完全对应名字，本轮未加（见报告），
  // 也不用同义词顶替；下面 8 个是已证实的题材标签，与原有 5 类、filters 互不干扰。
  // category() 的兜底分支（非 home、非 zone id 时直接以 type_id 作 cate）已覆盖这些类，无需改 category()。
  const EXTRA_CLASSES = [
    { type_id: 'cate151', type_name: '探花' },
    { type_id: 'cate153', type_name: '出轨偷情' },
    { type_id: 'cate158', type_name: '女女同性' },
    { type_id: 'cate160', type_name: 'SM调教' },
    { type_id: 'cate163', type_name: '户外露出' },
    { type_id: 'cate166', type_name: '制服诱惑' },
    { type_id: 'cate167', type_name: '校园女神' },
    { type_id: 'cate168', type_name: '按摩会所' },
  ];
  for (const c of EXTRA_CLASSES) classes.push(c);
  const filters = {};
  for (const z of ZONE_META) {
    const list = ZONES[z.key] || [];
    if (list.length) filters[z.id] = [{ key: 'sub', name: '细分分类', value: list.map((c) => ({ n: c.n, v: c.v })) }];
  }
  let list = [];
  try { list = parseCards(await getHtml('/'), HOST).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  if (zoneId === 'home' || !zoneId) {
    const html = await getHtml('/');
    return { page: 1, pagecount: 1, list: parseCards(html, HOST) };
  }
  const z = ZONE_META.find((x) => x.id === zoneId);
  const list0 = z ? (ZONES[z.key] || []) : [];
  const cate = String(extend.sub || '').trim() || (list0.length ? list0[0].v : zoneId);
  const path = page === 1 ? ('/category/' + cate + '/') : ('/category/' + cate + '/' + page + '/');
  const html = await getHtml(path);
  const list = parseCards(html, HOST);
  const next = html.includes('/category/' + cate + '/' + (page + 1) + '/');
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/search/' + encodeURIComponent(kw) + '/');
  return { page: 1, pagecount: 1, list: parseCards(html, HOST) };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '精彩视频';
  if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*-\s*丝瓜视频\s*$/i, '').trim() || '精彩视频';
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM) posterPic = normUrl(ogM[1].trim());
  if (!posterPic) {
    const cm = html.match(/https:\/\/[^\s"'<>]+\/image\/[^\s"'<>]+/);
    if (cm) posterPic = cm[0];
  }
  let playUrl = '';
  const dataUrl = extractDataUrl(html);
  if (dataUrl) {
    const bases = parseCdnLines(html);
    const base = pickPlayBase(bases);
    if (dataUrl.startsWith('http')) playUrl = dataUrl;
    else if (base) playUrl = base.replace(/\/+$/, '') + (dataUrl.startsWith('/') ? dataUrl : '/' + dataUrl);
    // 2026-11-07：播放走本地代理（手机到分片域 d3s00p19 cloudfront 未验证、疑似不通），
    // 播单/KEY/分片全部经代理，手机只与 App 自家服务通信；代理失败时播单内仍可 302 回源。
    if (playUrl) {
      const proxied = proxyUrl(reqIn, '/proxy/m3u8', playUrl, durl);
      if (proxied) playUrl = proxied;
    }
  }
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: 'HD',
      vod_content: '丝瓜视频',
      vod_play_from: '丝瓜视频',
      vod_play_url: playUrl ? ('正片$' + durl + '@@' + playUrl) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  // 旧缓存的详情可能仍带 CDN 直链：统一包一层本地代理再出（已是代理地址的不重复包）。
  if (target.indexOf('/proxy/') < 0 && /^https?:\/\//.test(target)) {
    const proxied = proxyUrl(reqIn, '/proxy/m3u8', target, durl || HOST + '/');
    if (proxied) target = proxied;
  }
  // 字幕按条目接：仅当标题或地址含番号才搜，否则不带 subs 键
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_siguaspw', name: '丝瓜视频', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.get('/proxy/*', m3u8Proxy);
      fastify.get('/proxy/m3u8', m3u8Proxy);
      fastify.post('/search', search);
    },
  };
}
