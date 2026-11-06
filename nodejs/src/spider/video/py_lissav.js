import req from '../../util/req.js';

// LissAV https://lissav.vip —— MissAV 系 JAV 站，只做 asian 区（语言入口即用户点的 JP/CN 两项：ja / zh-CN）
// domestic 区走 /video/vid/ 另一套，播放未验，本蜘蛛不做
// 列表：固定榜单 + 两个 tag + 题材（100 个 genre 作筛选卡片）；翻页走 /page/N（站方忽略 ?page=）
// 2026-11-04 修：站方网络不稳定（VM 实测偶发 http 000 空回），getHtml 改为多 host 轮询 + 重试：lissav.vip → lissav.net（实测首页可出 48 条）；lissav.cc/.pro 只是 301 跳回 .vip，不作 fallback
// 2026-11-04 round2 提速：VM 实测 vip 13 次里 4 次死（30s 挂起/中途截断），.net 13/13 全通且最慢 2.7s；旧版 vip 优先顺序执行时，一次 vip 挂起就要等满 20s 超时才轮到 .net，单次列表/详情经常 20s+，两腿都挂时理论最坏 80s。
// 本轮改为双 host 并行竞速（先回有效数据者胜）+ 单次超时 20s → 8s + 仍保留 2 轮：健康时约 2s（哪边快用哪边，设备侧网络哪边快不可预知，竞速自适应），vip 挂起时 .net 约 2s 胜出不再等 20s，
// 最坏 2 轮 × 8s + 0.6s ≈ 16.6s（原 80s）；尝试总次数不变（4 次），可靠性不降反升（fetchStream 由 2 次增至 4 次）。竞速不用 Promise.any（老 JS 引擎未必支持），手写 firstValid。
// 2026-11-04 round3：竞速在设备上导致列表直接失败，已回退顺序执行 + 单次 12s（见 getHtml/fetchStream）。
// 2026-11-04 增：顶级分类新增 巨乳/大屁股/好屁股/美乳/巨乳偏好/屁股偏好（均为 /videos/genre/ 路径，VM 实测各 12 条，翻页 /page/N 同规律）
// 详情：/asian/{lang}/video/cid/<番号>；播放走站方自家播放器接口 /asian/{lang}/api/video/stream?video_uid=<uid>
// 播单：接口 playlist 两条（高清主源 + 480p），分集列出供手动选；480p 线 VM 实测 200 可播，主源 VM 侧 403（设备侧可能不同）
// 字幕：条目自带番号（cid 即番号），按条目接聚合芯（迅雷 > 迅雷看看 > SubtitleCat）
const HOST = 'https://lissav.vip';
const HOSTS = ['https://lissav.vip', 'https://lissav.net'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const LANGS = [{ n: '中文', v: 'zh-CN' }, { n: '日文', v: 'ja' }, { n: '英文', v: 'en' }, { n: '繁中', v: 'zh-HK' }];
const FIXED = [
  { id: 'new', name: '最新发布', path: '/videos/new-releases' },
  { id: 'recent', name: '最近更新', path: '/videos/recent' },
  { id: 'hot_today', name: '今日热门', path: '/videos/hot/today' },
  { id: 'hot_week', name: '本周热门', path: '/videos/hot/week' },
  { id: 'hot_month', name: '本月热门', path: '/videos/hot/month' },
  { id: 'tag_cn', name: '中文字幕', path: '/videos/tag/%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95' },
  { id: 'tag_leak', name: '无码流出', path: '/videos/tag/%E6%97%A0%E7%A0%81%E6%B5%81%E5%87%BA' },
  { id: 'genre_juru', name: '巨乳', path: '/videos/genre/%E5%B7%A8%E4%B9%B3' },
  { id: 'genre_dpg', name: '大屁股', path: '/videos/genre/%E5%A4%A7%E5%B1%81%E8%82%A1' },
  { id: 'genre_hpg', name: '好屁股', path: '/videos/genre/%E5%A5%BD%E5%B1%81%E8%82%A1' },
  { id: 'genre_meiru', name: '美乳', path: '/videos/genre/%E7%BE%8E%E4%B9%B3' },
  { id: 'genre_juru_pref', name: '巨乳偏好', path: '/videos/genre/%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD' },
  { id: 'genre_pg_pref', name: '屁股偏好', path: '/videos/genre/%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD' },
];
const GENRES = [{"v": "%E9%AB%98%E6%B8%85", "n": "高清"}, {"v": "%E5%8D%95%E4%BD%93%E4%BD%9C%E5%93%81", "n": "单体作品"}, {"v": "%E7%8B%AC%E5%AE%B6", "n": "独家"}, {"v": "%E4%B8%AD%E5%87%BA", "n": "中出"}, {"v": "%E5%B7%A8%E4%B9%B3", "n": "巨乳"}, {"v": "%E4%BA%BA%E5%A6%BB", "n": "人妻"}, {"v": "%E6%97%A0%E7%A0%81%E6%B5%81%E5%87%BA", "n": "无码流出"}, {"v": "%E7%B4%A0%E4%BA%BA", "n": "素人"}, {"v": "%E7%86%9F%E5%A5%B3", "n": "熟女"}, {"v": "%E7%BE%8E%E5%B0%91%E5%A5%B3", "n": "美少女"}, {"v": "%E5%8F%A3%E4%BA%A4", "n": "口交"}, {"v": "%E8%96%84%E6%A0%BC", "n": "薄格"}, {"v": "%E8%87%AA%E6%8B%8D", "n": "自拍"}, {"v": "%E7%97%B4%E5%A5%B3", "n": "痴女"}, {"v": "%E5%A4%9A%E4%BA%BA%E8%BF%90%E5%8A%A8", "n": "多人运动"}, {"v": "%E9%AA%91%E4%B9%98", "n": "骑乘"}, {"v": "%E8%8B%97%E6%9D%A1", "n": "苗条"}, {"v": "%E6%BD%AE%E5%90%B9", "n": "潮吹"}, {"v": "4K", "n": "4K"}, {"v": "NTR", "n": "NTR"}, {"v": "%E7%BE%8E%E4%B9%B3", "n": "美乳"}, {"v": "%E4%B9%B3%E4%BA%A4", "n": "乳交"}, {"v": "%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95", "n": "中文字幕"}, {"v": "%E5%A5%B3%E9%AB%98%E4%B8%AD%E7%94%9F", "n": "女高中生"}, {"v": "4%E5%B0%8F%E6%97%B6%E4%BB%A5%E4%B8%8A", "n": "4小时以上"}, {"v": "%E9%A2%9C%E5%B0%84", "n": "颜射"}, {"v": "%E6%B7%AB%E4%B9%B1", "n": "淫乱"}, {"v": "%E4%BC%81%E5%88%92", "n": "企划"}, {"v": "%E4%B8%9A%E9%A6%80", "n": "业馀"}, {"v": "%E5%89%A7%E6%83%85", "n": "剧情"}, {"v": "%E6%89%8B%E6%B7%AB", "n": "手淫"}, {"v": "%E9%A5%BC", "n": "饼"}, {"v": "%E4%B9%B1%E4%BC%A6", "n": "乱伦"}, {"v": "%E6%90%AD%E8%AE%AA", "n": "搭讪"}, {"v": "%E5%A6%84%E6%83%B3", "n": "妄想"}, {"v": "%E5%90%88%E9%9B%86", "n": "合集"}, {"v": "%E6%81%8B%E7%89%A9%E7%99%96", "n": "恋物癖"}, {"v": "%E5%A7%90%E5%A7%90", "n": "姐姐"}, {"v": "%E7%BA%AA%E5%BD%95%E7%89%87", "n": "纪录片"}, {"v": "%E4%BB%85%E9%80%81%E8%B4%A7", "n": "仅送货"}, {"v": "%E5%81%B7%E6%8B%8D", "n": "偷拍"}, {"v": "%E8%88%94%E9%98%B4", "n": "舔阴"}, {"v": "%E5%88%B6%E6%9C%8D", "n": "制服"}, {"v": "%E7%BE%9E%E8%BE%B1", "n": "羞辱"}, {"v": "%E8%A7%92%E8%89%B2%E6%89%AE%E6%BC%94", "n": "角色扮演"}, {"v": "%E5%89%83%E6%AF%9B", "n": "剃毛"}, {"v": "OL", "n": "OL"}, {"v": "%E4%B8%8D%E4%BC%A6", "n": "不伦"}, {"v": "%E5%A5%B3%E5%A4%A7%E5%AD%A6%E7%94%9F", "n": "女大学生"}, {"v": "%E8%87%AA%E6%85%B0", "n": "自慰"}, {"v": "%E8%BE%A3%E5%A6%B9", "n": "辣妹"}, {"v": "%E5%A4%A7%E5%B1%81%E8%82%A1", "n": "大屁股"}, {"v": "%E5%B0%8F%E5%8F%AA%E9%A9%AC", "n": "小只马"}, {"v": "%E6%8C%89%E6%91%A9%E6%A3%92", "n": "按摩棒"}, {"v": "%E6%8B%98%E6%9D%9F", "n": "拘束"}, {"v": "%E5%85%A8%E9%AB%98%E6%B8%85%20%28FHD%29", "n": "全高清 (FHD)"}, {"v": "%E7%BE%9E%E8%80%BB", "n": "羞耻"}, {"v": "%E5%A5%BD%E5%B1%81%E8%82%A1", "n": "好屁股"}, {"v": "%E5%87%BA%E9%81%93%E4%BD%9C", "n": "出道作"}, {"v": "%E7%BE%8E%E4%B8%BD%E7%9A%84%E8%83%B8%E9%83%A8", "n": "美丽的胸部"}, {"v": "S1%20NO.1%20STYLE", "n": "S1 NO.1 STYLE"}, {"v": "Madonna", "n": "Madonna"}, {"v": "%E6%8E%A5%E5%90%BB", "n": "接吻"}, {"v": "%E5%BC%BA%E5%88%B6%E5%8F%A3%E4%BA%A4", "n": "强制口交"}, {"v": "%E5%B1%81%E8%82%A1%E5%81%8F%E5%A5%BD", "n": "屁股偏好"}, {"v": "%E7%8E%A9%E5%85%B7", "n": "玩具"}, {"v": "%E4%B9%B1%E4%BA%A4", "n": "乱交"}, {"v": "%E5%A5%B3%E5%90%8C%E6%80%A7%E6%81%8B", "n": "女同性恋"}, {"v": "%E6%9C%AA%E7%BB%8F%E5%AE%A1%E6%9F%A5", "n": "未经审查"}, {"v": "%E6%B7%AB%E8%AF%AD", "n": "淫语"}, {"v": "%E5%A5%87%E9%97%BB%E8%B6%A3%E4%BA%8B", "n": "奇闻趣事"}, {"v": "%E8%82%9B%E9%97%A8", "n": "肛门"}, {"v": "%E9%A3%8E%E4%BF%97%E5%A8%98", "n": "风俗娘"}, {"v": "%E6%B3%B3%E8%A3%85", "n": "泳装"}, {"v": "----", "n": "----"}, {"v": "%E5%B7%B2%E5%A9%9A%E5%A5%B3%E4%BA%BA", "n": "已婚女人"}, {"v": "%E4%B8%BB%E8%A7%82%E8%A7%86%E8%A7%92", "n": "主观视角"}, {"v": "69", "n": "69"}, {"v": "%E4%B8%9D%E8%A2%9C", "n": "丝袜"}, {"v": "%E6%8D%86%E7%BB%91", "n": "捆绑"}, {"v": "%E5%90%B9", "n": "吹"}, {"v": "%E6%8C%89%E6%91%A9", "n": "按摩"}, {"v": "%E6%8C%89%E6%91%A9%E6%B2%B9", "n": "按摩油"}, {"v": "%E6%8C%87%E6%8F%92", "n": "指插"}, {"v": "%E5%90%84%E7%A7%8D%E8%81%8C%E4%B8%9A", "n": "各种职业"}, {"v": "%E6%A0%A1%E6%9C%8D", "n": "校服"}, {"v": "%E5%8E%9F%E6%9D%A5%E7%9A%84", "n": "原来的"}, {"v": "%E8%B4%AB%E4%B9%B3", "n": "贫乳"}, {"v": "%E8%B6%85%E8%96%84%E6%A0%BC", "n": "超薄格"}, {"v": "%E6%AF%8D%E4%BA%B2", "n": "母亲"}, {"v": "%E6%9E%81%E9%99%90%E9%AB%98%E6%BD%AE", "n": "极限高潮"}, {"v": "%E5%A7%90%E5%A6%B9", "n": "姐妹"}, {"v": "%E5%A5%B3%E6%95%99%E5%B8%88", "n": "女教师"}, {"v": "%E5%90%9E%E7%B2%BE", "n": "吞精"}, {"v": "%E5%B7%A8%E4%B9%B3%E5%81%8F%E5%A5%BD", "n": "巨乳偏好"}, {"v": "HHH%E3%82%B0%E3%83%AB%E3%83%BC%E3%83%97", "n": "HHHグループ"}, {"v": "%E5%B9%B4%E7%B3%95", "n": "年糕"}, {"v": "SM", "n": "SM"}, {"v": "%E3%83%86%E3%82%A3%E3%83%83%E3%82%B7%E3%83%A5", "n": "ティッシュ"}, {"v": "%E9%87%8E%E5%A4%96%E9%9C%B2%E5%87%BA", "n": "野外露出"}];

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

async function fetchHtmlOnce(url, referer, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      timeout: timeoutMs || 12000,
    });
    if (r.status && r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 2026-11-04 round3 回退：round2 的并行竞速在设备上导致列表直接失败（App 内 req 并发问题；
// fix6 的顺序执行在设备上是好的）；改回顺序执行（vip → net），单次超时 12s（比 fix6 的 20s 还是快，
// 尝试次数不变：每轮 2 host × 2 轮 = 4 次，最坏约 49s，原 80s）。
// 列表/详情抓取：站方偶发网络层失败（VM 实测 http 000）与 vip 挂起（VM 实测 13 次里 4 次 30s 死）；
// 顺序 host 轮询，两轮之间停 600ms；全部失败才回空。
async function getHtml(path) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  let cands = [url];
  for (const h of HOSTS) {
    if (url.startsWith(h + '/')) {
      const rest = url.slice(h.length);
      cands = HOSTS.map((hh) => hh + rest);
      break;
    }
  }
  for (let round = 0; round < 2; round++) {
    for (const u of cands) {
      const m = u.match(/^(https?:\/\/[^/]+)/);
      const referer = (m ? m[1] : HOST) + '/';
      const d = await fetchHtmlOnce(u, referer, 12000);
      if (d) return d;
    }
    if (round === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return '';
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
  const slug = (String(durl || '').match(/\/video\/cid\/([^/]+)\//) || [])[1] || '';
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


function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a class="streamit-video-card__media-link" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const href = m[1];
    const inner = m[2];
    const cm = href.match(/\/video\/cid\/([A-Za-z0-9_-]+)/);
    if (!cm) continue;
    const cid = cm[1];
    if (cid.includes('__') || seen.has(href)) continue;
    seen.add(href);
    const imgM = inner.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    const altM = inner.match(/alt="([^"]*)"/i);
    const pic = imgM ? imgM[1] : '';
    const title = altM ? cleanLabel(altM[1]) : cid;
    items.push({ vod_id: href, vod_name: title || cid, vod_pic: pic, vod_remarks: '' });
  }
  return items;
}

async function home() {
  const classes = FIXED.map((f) => ({ type_id: f.id, type_name: f.name }));
  classes.push({ type_id: 'genre', type_name: '题材分类' });
  const filters = {};
  const langGroup = { key: 'lang', name: '语言', value: LANGS.map((l) => ({ n: l.n, v: l.v })) };
  for (const c of classes) {
    const groups = [langGroup];
    if (c.type_id === 'genre') groups.push({ key: 'sub', name: '题材', value: GENRES.map((g) => ({ n: g.n, v: g.v })) });
    filters[c.type_id] = groups;
  }
  let list = [];
  try { list = parseCards(await getHtml('/asian/zh-CN')).slice(0, 20); } catch (e) { list = []; }
  return { class: classes, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const zoneId = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  const lang = LANGS.some((l) => l.v === extend.lang) ? extend.lang : 'zh-CN';
  let base = '';
  const f = FIXED.find((x) => x.id === zoneId);
  if (f) base = f.path;
  else if (zoneId === 'genre') {
    const sub = String(extend.sub || '');
    base = '/videos/genre/' + (sub || GENRES[0].v);
  } else base = '/videos/new-releases';
  const path = '/asian/' + lang + base + (page > 1 ? '/page/' + page : '');
  const html = await getHtml(path);
  const list = parseCards(html);
  const next = html.includes('/page/' + (page + 1) + '"');
  return { page, pagecount: next ? page + 1 : page, list };
}

async function search(reqIn) {
  // LissAV 站内搜索接口未证实，不编搜索地址
  return { list: [] };
}

async function fetchStreamOnce(host, lang, uid) {
  try {
    const r = await reqRaw(host + '/asian/' + lang + '/api/video/stream?video_uid=' + encodeURIComponent(uid),
      { 'User-Agent': UA, 'Referer': host + '/asian/' + lang + '/', 'Accept': 'application/json' }, 12000);
    if (r.status !== 200 || !r.body) return [];
    const j = JSON.parse(r.body);
    if (!j || !Array.isArray(j.playlist)) return [];
    const pl = j.playlist.filter((e) => e && e.url);
    return pl.length ? pl : [];
  } catch (e) { return []; }
}

// round3：顺序执行（vip → net）+ 2 轮，共 4 次尝试、单次 12s（round2 竞速在设备上失效，见 getHtml 处说明）
async function fetchStream(lang, uid) {
  if (!uid) return [];
  for (let round = 0; round < 2; round++) {
    for (const h of HOSTS) {
      const pl = await fetchStreamOnce(h, lang, uid);
      if (pl.length) return pl;
    }
    if (round === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return [];
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  const lang = (rawId.match(/\/asian\/([^/]+)\//) || [])[1] || 'zh-CN';
  const html = await getHtml(rawId);
  const tM = html.match(/<title>(.*?)<\/title>/i);
  let mainTitle = '';
  if (tM) mainTitle = cleanLabel(tM[1]).replace(/^LissAV\s*\|\s*/i, '').trim();
  const cid = (rawId.match(/\/video\/cid\/([^/]+)/) || [])[1] || '';
  if (!mainTitle) mainTitle = cid || 'LissAV 视频';
  subCacheName(durl, mainTitle);
  let posterPic = '';
  const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogM) posterPic = ogM[1].trim();
  const uidM = html.match(/var videoUid\s*=\s*"([^"]+)"/);
  const uid = uidM ? uidM[1] : '';
  let playUrl = '';
  if (uid) {
    const pl = await fetchStream(lang, uid);
    if (pl.length) {
      const eps = pl.map((e, i) => {
        let nm = '';
        if (i === 0) nm = '高清';
        else {
          const rm = String(e.url).match(/\/(\d+)x(\d+)\//);
          const pm = String(e.url).match(/\/(\d+)p\//);
          nm = rm ? rm[2] + 'p' : (pm ? pm[1] + 'p' : ('线路' + (i + 1)));
        }
        return nm + '$' + durl + '@@' + e.url;
      });
      playUrl = eps.join('#');
    }
  }
  if (!playUrl && uid) playUrl = '正片$' + durl + '@@UID:' + uid;
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: cid,
      vod_content: 'LissAV',
      vod_play_from: 'LissAV',
      vod_play_url: playUrl,
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
  if (target.startsWith('UID:')) {
    const uid = target.slice(4);
    const lang = (durl.match(/\/asian\/([^/]+)\//) || [])[1] || 'zh-CN';
    const pl = await fetchStream(lang, uid);
    if (pl.length) target = pl[0].url;
    else return { parse: 0, url: '' };
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
    meta: { key: 'py_lissav', name: 'LissAV', type: 3 },
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
