import req from '../../util/req.js';

// 蘑菇视频 https://moguds.cc —— 视频站（由用户提供的 upload-2.js 移植）
// 2026-11-07 重建：站方分类体系已整体重排（旧 cate68～cate288 全线失效，站方返回空模板页；
//   旧 cate3～cate67 大批改名错位），按 2026-11-07 实测 live map 重建为 7 大区 60 细分；
//   另修 CDN：d1uy7itup9paqh.cloudfront.net 分发已死（TLS 握手即断，同 VM 上其他 cloudfront
//   分发正常；站方 cdn_lines 现为 dfdf + mkdscvxr3w34.sxtmo.com，已无 cloudfront），
//   封面与播单改回 dfdf 主线、sxtmo 备选，不再改写为 cloudfront；
//   播单内分片走 d3s00p19cjdhyv.cloudfront.net（实测 206 通），播单本身只负责指路；
//   详情页仍走 window.__ARCHIVE_PLAYER__.rawPath + CDN 基址。
// 2026-11-07 返工（播放断点）：用户真机 19:45 复测——列表/分类/封面全通（均走
//   moguds.cc + dfdf.tjacq.com），唯独播放不行。VM 实测定性：播单、分片、密钥三腿
//   在 VM 上全通（任意头组合均 200），且 openssl 以播单内 key+IV 解密首分片得
//   到合法 TS（188 对齐 0x47 同步 10918/10919），内容本身无问题；断点在播单把
//   播放器指到第三个域 d3s00p19cjdhyv.cloudfront.net 取分片——该腿在手机上从
//   未验证过，而本站自己的 d1uy7 cloudfront 分发已死在先，同类腿不可信。
//   实测 dfdf / sxtmo 两线与 cloudfront 分片逐字节相同（同一 .ts 路径三域
//   同内容）、密钥三域相同且全片共用同一 key+IV，故改写播单即可：分片改指
//   播单自身 origin（dfdf），相对密钥 URI 补成绝对地址，播放器全程只跟
//   已验证的 dfdf 说话；分片不经过代理透传（字节无需改动，与 24JAV 剥 PNG
//   头不同），代理只改写 7KB 清单文本。play() 给本地 /proxy/m3u8 地址
//   （Ero/JavFeed 同款，前缀取 reqIn?.server 动态值，绝不写死），取不到
//   时回落原直链；代理拉不到有效清单时 302 回原地址，不比旧行为更差。
// 2026-11-07 返工二轮（播放仍失败）：同轮同包里 24JAV 的本地代理在手机上通了，
//   蘑菇的没通。找不同点：v1 只改写清单文本，分片与密钥仍由播放器直连 dfdf；
//   24JAV 是全程字节代理，播放器只跟蜘蛛说话。v2 照 24JAV 先例改：清单改写行
//   一律指回本地代理（完整 http:// 绝对地址），分片字节经代理透传（支持 Range），
//   密钥（16 字节）同样走代理取回；播放器不再直连 dfdf / cloudfront。
//   mogu-fetch Worker 的 /f 只放行 moguds.cc（实测 dfdf 回 400 bad target），
//   代理取数只能走直连 req.get（同 24JAV）。
// 分类：7 大区作顶级分类，各区细分走筛选卡片 filters.sub；6 个分组父类
//   （cate13/22/36/47/55/59）站方本身无内容，不列为细分，默认取各组首个有内容的子类。
// 列表：<a href="/video/\d+/"> 卡片，封面 data-src 走 dfdf.tjacq.com（实测 200）
// 详情：__ARCHIVE_PLAYER__.rawPath 组直链（首选 dfdf，备选 sxtmo）；播放直链 parse:0
// 字幕：详情预热 + 播放带 subs（与 32 个带芯猫源同一套聚合芯：迅雷/迅雷看看/SubtitleCat 三槽，带时长显示与名字+时长去重）
// 清晰度：站方每片只给一条单码率播单（实测无多档切换机制），故不设假清晰度选单
const KEY = 'py_mogu';
const HOST = 'https://moguds.cc';
const CDN = 'https://dfdf.tjacq.com';
const ALT_CDN = 'https://mkdscvxr3w34.sxtmo.com'; // 站方 cdn_lines 第二线；d1uy7 cloudfront 分发已死（2026-11-07 实测 TLS 断），不再使用
// 取数 Worker（2026-11-05 待用户部署：https://mogu-fetch.li768435813.workers.dev，根回 mogu fetch ok；
// 未部署前 Worker 腿取数失败即回落，行为与现在一致）。直连优先，Worker 只作 CF 挑战/拦截时的兜底。
const FETCH_WORKER = 'https://mogu-fetch.li768435813.workers.dev';
// 纯 JS b64url（与 REX 版同一实现；App 内 Buffer 可用，但与 REX 共用一份更稳）
const B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64url(s) {
  const bytes = [];
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(192 | (c >> 6), 128 | (c & 63)); }
    else if (c < 55296 || c >= 57344) { bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    else {
      i++;
      const c2 = str.charCodeAt(i);
      const cp = 65536 + (((c & 1023) << 10) | (c2 & 1023));
      bytes.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64T[b0 >> 2] + B64T[((b0 & 3) << 4) | (b1 >> 4)] + (i + 1 < bytes.length ? B64T[((b1 & 15) << 2) | (b2 >> 6)] : '=') + (i + 2 < bytes.length ? B64T[b2 & 63] : '=');
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function viaWorker(url) {
  return FETCH_WORKER.replace(/\/+$/, '') + '/f/' + b64url(url);
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ZONES = [
  { id: "zone_featured", name: "🔥今日精选", default: "route_home_featured", subs: [{ n: "今日推荐", v: "route_home_featured" }, { n: "X映画原创热播", v: "cate3" }, { n: "X站免费精选内容", v: "cate4" }, { n: "观看热榜", v: "cate5" }, { n: "逆天乱伦", v: "cate6" }, { n: "绿帽龟奴", v: "cate7" }, { n: "走马探花", v: "cate8" }, { n: "网曝黑料大瓜", v: "cate9" }, { n: "明星 AI 换脸", v: "cate10" }, { n: "网红主播激情大秀", v: "cate11" }, { n: "爆款收藏", v: "cate12" }] },
  { id: "zone_media", name: "🎬传媒原创", default: "cate14", subs: [{ n: "🎬素人自摄", v: "cate14" }, { n: "💿麻豆热剧", v: "cate15" }, { n: "🍬糖心系列", v: "cate16" }, { n: "🍮果冻精选", v: "cate17" }, { n: "👼天使映画", v: "cate18" }, { n: "🌈天美热作", v: "cate19" }, { n: "✨星空夜欲", v: "cate20" }, { n: "🍑蜜桃诱惑", v: "cate21" }] },
  { id: "zone_creator", name: "💃网黄", default: "cate23", subs: [{ n: "综合网黄", v: "cate23" }, { n: "桥本香菜", v: "cate24" }, { n: "小水水", v: "cate25" }, { n: "刘玥", v: "cate26" }, { n: "Ellie", v: "cate27" }, { n: "米菲兔", v: "cate28" }, { n: "辛尤里", v: "cate29" }, { n: "唐伯虎", v: "cate30" }, { n: "饼干姐姐", v: "cate31" }, { n: "吴梦梦", v: "cate32" }, { n: "台北娜娜", v: "cate33" }, { n: "玩偶姐姐", v: "cate34" }, { n: "柚子猫", v: "cate35" }] },
  { id: "zone_asia", name: "🌸日韩", default: "cate37", subs: [{ n: "精选推荐", v: "cate37" }, { n: "FC2  无码", v: "cate38" }, { n: "淫妻母狗", v: "cate39" }, { n: "中文字幕", v: "cate40" }, { n: "素人AV", v: "cate41" }, { n: "JK制服", v: "cate42" }, { n: "口爆内射", v: "cate43" }, { n: "师生乱欲", v: "cate44" }, { n: "御姐足交", v: "cate45" }, { n: "家庭禁忌", v: "cate46" }] },
  { id: "zone_west", name: "🗽欧美", default: "cate48", subs: [{ n: "欧美综合", v: "cate48" }, { n: "欧美辣妹", v: "cate49" }, { n: "欧美巨乳", v: "cate50" }, { n: "欧美熟女", v: "cate51" }, { n: "欧美SM", v: "cate52" }, { n: "欧美足控", v: "cate53" }, { n: "捷克木屋", v: "cate54" }] },
  { id: "zone_anime", name: "🎞️动漫", default: "cate56", subs: [{ n: "综合动漫", v: "cate56" }, { n: "MMD-热舞系列", v: "cate57" }, { n: "MMD-纯爱3D", v: "cate58" }] },
  { id: "zone_teach", name: "📚性爱教学", default: "cate60", subs: [{ n: "王竹子的SM教学频道", v: "cate60" }, { n: "中指通一下", v: "cate61" }, { n: "Misa.米砂", v: "cate62" }, { n: "小哥哥艾理", v: "cate63" }, { n: "verzz 异物梗色", v: "cate64" }, { n: "薇傲的性趣", v: "cate65" }, { n: "一三蜜桃说 Dr.Yishan", v: "cate66" }, { n: "Carrie雨千", v: "cate67" }] }
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

// 站方 data-original/data-src 常写成 https:/dfdf...（单斜杠）；图与播单在 dfdf 与 sxtmo
// 两线内容逐字节相同，只修 scheme、不改域名（2026-11-07：d1uy7 cloudfront 分发已死，
// 再改写过去封面与播单全断；分片域名以播单内为准，不由这里改写）
function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  // 站方 cdn_lines 常写 https:/dfdf（单斜杠）或 https:///（三斜杠），一律压成标准 https://
  s = s.replace(/^(https?:)\/*/, '$1//');
  s = s.replace(/^(https?:)\/([^/])/, '$1//$2');
  if (s.startsWith('dfdf.tjacq.com/')) s = 'https://' + s;
  if (s.startsWith('mkdscvxr3w34.sxtmo.com/')) s = 'https://' + s;
  return s;
}

function pickPlayBase(bases) {
  const list = Array.isArray(bases) ? bases : [];
  const dfdf = list.find((b) => b.includes('dfdf.tjacq.com'));
  if (dfdf) return dfdf;
  return list[0] || ALT_CDN;
}

function isChallengeHtml(html) {
  const s = String(html || '');
  if (s.length < 200) return false;
  return s.includes('Just a moment') || s.includes('cf-browser-verification')
    || s.includes('Attention Required') || s.includes('__CF$cv$params')
    || s.includes('challenge-platform') || s.includes('cf-challenge')
    || s.includes('developers.cloudflare.com');
}

async function fetchHtmlOnce(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: timeoutMs || 20000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  const direct = await fetchHtmlOnce(url, 20000);
  if (direct && !isChallengeHtml(direct)) return direct;
  // 直连空回或被 CF 挑战页拦截时走 Worker 兜底（Worker 未部署则仍为空，与现在一致）
  const via = await fetchHtmlOnce(viaWorker(url), 20000);
  if (via && !isChallengeHtml(via)) return via;
  return direct && !isChallengeHtml(direct) ? direct : '';
}

// 字幕聚合芯的取数原语：统一回 {status, body}；设备 axios 走配置调用
// （responseType text 保证 JSON 原文不被提前解析），本机桩走 req.get。
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

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim();
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
        vod_pic: pic ? normUrl(pic.startsWith('http') ? pic : absUrl(pic, host)) : '',
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
        const b = normUrl(String((it && it.cdnLine) || '').replace(/\/+$/, ''));
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

// 2026-11-05 站方详情页改版：#article-videos 已消失，播放器改由
// window.__ARCHIVE_PLAYER__ = {"rawPath":"\/video\/<日期>\/<id>\/<hash>.m3u8",
//   "vttFile":"","posterImg":"https:\/dfdf...\/image\/...","cdnLine":"https:\/dfdf.tjacq.com",...}
// 提供播单相对路径；rawPath 接 CDN 基址（优先 cdn_lines 的 dfdf 线）即为播单。
function unescJsonStr(s) {
  return String(s || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

function extractArchivePlayer(html) {
  const out = { rawPath: '', cdnLine: '', posterImg: '', vttFile: '' };
  const m = String(html || '').match(/window\.__ARCHIVE_PLAYER__\s*=\s*\{/);
  if (!m) return out;
  const seg = String(html || '').slice(m.index, m.index + 4000);
  const rp = seg.match(/"rawPath"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (rp) out.rawPath = unescJsonStr(rp[1]);
  const cl = seg.match(/"cdnLine"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (cl) out.cdnLine = unescJsonStr(cl[1]);
  const pi = seg.match(/"posterImg"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (pi) out.posterImg = unescJsonStr(pi[1]);
  const vf = seg.match(/"vttFile"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (vf) out.vttFile = unescJsonStr(vf[1]);
  return out;
}

function archivePlayUrl(html) {
  const ap = extractArchivePlayer(html);
  if (!ap.rawPath) return '';
  let raw = ap.rawPath.trim();
  if (!raw) return '';
  if (raw.startsWith('http')) return normUrl(raw);
  if (raw.startsWith('//')) return normUrl('https:' + raw);
  const bases = parseCdnLines(html);
  let base = pickPlayBase(bases);
  if (ap.cdnLine) base = normUrl(ap.cdnLine);
  if (!base) base = ALT_CDN;
  return normUrl(base.replace(/\/+$/, '') + (raw.startsWith('/') ? raw : '/' + raw));
}

// ---------- 播放清单代理 v2（同 24JAV 已验证形态；2026-11-07 返工二轮） ----------
// v1 只改写清单文本，分片与密钥仍由播放器直连 dfdf；24JAV 同轮同包已证：
// 播放器直连上游 CDN 的腿在手机上不可靠，只有全程走蜘蛛代理的形态通。
// v2 照 24JAV 先例改：清单改写行一律指回本地代理（完整 http:// 绝对地址），
// 分片字节经代理透传（支持 Range，便于拖动）；密钥（16 字节）同样走代理取回。
// 播放器全程只跟蜘蛛说话，不再直连 dfdf / cloudfront。取不到时 302 回原地址。
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
// 构造本地代理地址（js2p://_WEB_ 为 App 动态地址 scheme，同 Ero/24JAV 先例；
// 前缀取 reqIn?.server 动态值，绝不写死）
function proxyUrl(reqIn, path, targetUrl, referer) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    return `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
  } catch (e) { return ''; }
}
// 取字节（清单/分片/密钥通用）：30s 超时、2 次尝试；失败返回 null，走 302 降级
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
// 改写清单正文：# 行的 URI="..."（密钥）与 master 的 variant 行走查询串形式
// /proxy/m3u8?u=&r=；媒体清单的分片行走路径段形式 /proxy/<b64>/<b64>.ts（末尾
// 加 .ts 后缀过 ffmpeg 分片后缀白名单；b64url 字母表无 '.'，代理入口先剥后缀
// 再解码，无歧义）。selfBase 是完整 http:// 绝对基址（取请求 Host 拼），
// 改写后的行不再是裸路径/上游直链，播放器无需以 js2p:// 为基址解析、也无需直连上游。
function rewriteM3u8(raw, playlistUrl, selfBase, referer) {
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
// 主格式（detail/play 发出）：/proxy/m3u8?u={b64url}&r={b64url}；
// 分片格式（改写后的媒体清单分片行）：/proxy/{b64url 目标}/{b64url referer}.ts。
// 取回的文本是 #EXTM3U 即按清单改写；否则按字节透传：查询串形式来的是密钥
// （16 字节）回 application/octet-stream，路径段形式来的是分片回 video/mp2t
// （支持 Range，便于拖动）。
async function m3u8Proxy(request, reply) {
  const q = request?.query || {};
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  let viaPath = false;
  if (!uEnc) {
    const wild = request?.params && request.params['*'];
    let segs = [];
    if (wild) segs = String(wild).split('/').filter(Boolean);
    else {
      const rawPath = String((request?.raw && request.raw.url) || request?.url || '').split('?')[0];
      const pi = rawPath.indexOf('/proxy/');
      if (pi >= 0) segs = rawPath.slice(pi + 7).split('/').filter(Boolean);
    }
    if (segs.length && segs[segs.length - 1].endsWith('.ts')) {
      segs[segs.length - 1] = segs[segs.length - 1].slice(0, -3);
    }
    if (segs.length) { uEnc = segs[0]; rEnc = segs[1] || ''; viaPath = true; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  // 改写基址：同 24JAV，用请求 Host 拼完整 http:// 绝对地址；无 Host 时退回
  // proxyUrl 拼出的 js2p:// 形式（不比旧行为更差）。
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  const buf = await fetchBytes(target, referer);
  if (!buf || !buf.length) { reply.redirect(target); return; }
  const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
  if (head.trimStart().startsWith('#EXTM3U')) {
    reply.header('Content-Type', 'application/vnd.apple.mpegurl');
    reply.header('Cache-Control', 'no-cache');
    reply.send(rewriteM3u8(buf.toString('utf8'), target, selfBase, referer));
    return;
  }
  // 非清单内容：路径段形式来的是分片；查询串形式来的是密钥（16 字节）。
  const range = request?.headers && request.headers.range;
  const m = range ? String(range).match(/bytes=(\d+)-(\d*)/) : null;
  if (viaPath) {
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Accept-Ranges', 'bytes');
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
      if (start < buf.length && start <= end) {
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        reply.send(buf.subarray(start, end + 1));
        return;
      }
    }
    reply.send(buf);
    return;
  }
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.send(buf);
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
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  subWarm(durl); // 字幕预热：与下方取播单并行跑，点播时 play 直接命中缓存/在途
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '高清视频';
  if (tM) mainTitle = tM[1].trim().replace(/\s*[-_]\s*蘑菇视频\s*$/i, '').trim() || '高清视频';
  if (mainTitle) subCacheName(durl, mainTitle); // 字幕搜索键优先用真片名
  // 新版详情优先走 __ARCHIVE_PLAYER__；旧解析（article-videos / 播放变量 / 裸 m3u8）留作兜底
  let playUrl = archivePlayUrl(html);
  if (!playUrl) {
    const stream = extractPlayStream(html);
    if (stream.viaDataUrl) {
      playUrl = stream.url;
    } else if (stream.url) {
      playUrl = stream.url;
    }
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
      playUrl = pickPlayBase(bases).replace(/\/+$/, '') + (pth.startsWith('/') ? pth : '/' + pth);
    }
  }
  let posterPic = '';
  const ap0 = extractArchivePlayer(html);
  if (ap0.posterImg) posterPic = normUrl(ap0.posterImg);
  const dfdf = String(html || '').match(/dfdf\.tjacq\.com\/image\/[^\s"']+/g);
  if (dfdf && dfdf.length) posterPic = normUrl('https://' + dfdf[0]);
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = normUrl(ogM[1].trim());
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
      vod_play_url: playUrl ? ('正片$' + durl + '@@' + playUrl) : '',
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  // 新格式：详情页地址@@播单地址（供字幕搜索找回片名）；旧格式（纯播单）照常播、无字幕
  let durl = '';
  let target = id;
  const at = id.indexOf('@@');
  if (at >= 0) { durl = id.slice(0, at); target = id.slice(at + 2); }
  if (!target) return { parse: 0, url: '' };
  const subsP = durl ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  // 播单走本地代理改写（分片改指 dfdf，见文件头 2026-11-07 返工注）；代理地址
  // 取不到时回落原直链，不比旧行为更差
  const proxied = proxyUrl(reqIn, '/proxy/m3u8', target, durl);
  const result = { parse: 0, url: proxied || target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  const subs = await subsP;
  if (subs && subs.length) result.subs = subs; // 无字幕命中时不带此键，返回与接入前逐字段一致
  return result;
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: '蘑菇视频', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
      fastify.get('/proxy/*', m3u8Proxy);
      fastify.get('/proxy/m3u8', m3u8Proxy);
    },
  };
}
