// PODJAV — https://en.podjav.tv/
// WordPress 站：详情页 <video id="podjavPlayer" data-sources> 直接给
// master.m3u8（play.podjav.tv），播单真 m3u8、分片真 TS。
// 2026-11-28 VM 实测：首页 200；详情 DLDSS-587 的 master 200（单档 720p）、
// 720p 播单 200、分片 720p_000.ts 200 且首字节 0x47 真 TS；
// /jav/page/2/ 200（30 卡）；搜索 /?s=RM 200（30 卡）。
// 分类：/jav/ 全部 + /genre/<slug>/ 题材（/genre/ 页实测 60 个，筛选卡片）；
// 無碼 genre/uncensored 单列（本站无 -RM/LTX 专属分类，-RM 只在标题里）。
// 演员：/cast/ 页实测 24 人（按片量降序），筛选卡片；单人页无翻页
// （/page/2/ 404），parseCards 通用（Kitano Mina 19 卡、Meguri 12 卡实测）。
// 播放：详情取 master.m3u8、按 RESOLUTION 出档位（有几档出几档，不编造）；
// master 取不到时直接回 master 地址本身（播单可播，播放器自选档）。
// 字幕：片名含番号（DLDSS-587 等）才接字幕芯，无番号不接。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_podjav';
const NAME = 'PODJAV';
const HOST = 'https://en.podjav.tv';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 顶级分类：全部 + 無碼 + 题材 + 演员（题材/演员走筛选卡片，不平铺）
const CLASSES = [
  { type_id: 'jav', type_name: '全部' },
  { type_id: 'genre/uncensored', type_name: '無碼' },
  { type_id: 'genre', type_name: '题材' },
  { type_id: 'cast', type_name: '演员' },
];

// 题材筛选卡片（/genre/ 页实测，60 个；v 为相对路径）
const GENRE_FILTER = [
  { n: '虐待', v: 'genre/abuse' },
  { n: '绝顶', v: 'genre/acme' },
  { n: '出轨', v: 'genre/affair' },
  { n: '素人', v: 'genre/amateur' },
  { n: '肛交', v: 'genre/anal' },
  { n: '阿姨', v: 'genre/aunt' },
  { n: '美少女', v: 'genre/beautiful-girl' },
  { n: '巨乳', v: 'genre/big-tits' },
  { n: '黑人', v: 'genre/black-actor' },
  { n: '口交', v: 'genre/blow' },
  { n: '印尼', v: 'genre/bokep-indo' },
  { n: '日本', v: 'genre/bokep-jepang' },
  { n: '美乳', v: 'genre/breasts' },
  { n: '新娘', v: 'genre/bride' },
  { n: '丰满', v: 'genre/busty-fetish' },
  { n: '屁股', v: 'genre/butt' },
  { n: '女上位', v: 'genre/cowgirl' },
  { n: '中出', v: 'genre/creampie' },
  { n: '绿帽', v: 'genre/cuckold' },
  { n: '女儿', v: 'genre/daughter' },
  { n: '剧情', v: 'genre/drama' },
  { n: '药物', v: 'genre/drug' },
  { n: '老男', v: 'genre/elder-male' },
  { n: '女上司', v: 'genre/female-boss' },
  { n: '女教师', v: 'genre/female-teacher' },
  { n: '温泉', v: 'genre/hot-spring' },
  { n: '巨臀', v: 'genre/huge-butt' },
  { n: '巨根', v: 'genre/huge-cock' },
  { n: '羞辱', v: 'genre/humiliation' },
  { n: '乱伦', v: 'genre/incest' },
  { n: '日本AV', v: 'genre/japanese-av' },
  { n: '日本色情', v: 'genre/japanese-porn' },
  { n: '日本XXX', v: 'genre/japanese-xxx' },
  { n: 'JAV Guru', v: 'genre/jav-guru' },
  { n: 'JAV', v: 'genre/jav-porn' },
  { n: '接吻', v: 'genre/kiss' },
  { n: '人妻', v: 'genre/married-woman' },
  { n: '熟女', v: 'genre/mature-woman' },
  { n: '按摩', v: 'genre/message' },
  { n: '模特', v: 'genre/model' },
  { n: '母亲', v: 'genre/mother' },
  { n: '淫荡', v: 'genre/nasty' },
  { n: '护士', v: 'genre/nurse' },
  { n: '姐姐', v: 'genre/older-sister' },
  { n: '高潮', v: 'genre/orgasm' },
  { n: '免费色情', v: 'genre/porno-gratis' },
  { n: '强奸', v: 'genre/rape' },
  { n: '校服', v: 'genre/schoolgirl' },
  { n: '秘书', v: 'genre/secretary' },
  { n: '姐妹', v: 'genre/sister' },
  { n: '苗条', v: 'genre/slender' },
  { n: '荡妇', v: 'genre/slut' },
  { n: '泡泡浴', v: 'genre/soapland' },
  { n: '单体', v: 'genre/solowork' },
  { n: '继母', v: 'genre/step-mother' },
  { n: '汗', v: 'genre/sweat' },
  { n: '乳交', v: 'genre/titty-fuck' },
  { n: '無碼', v: 'genre/uncensored' },
  { n: 'XNXX JAV', v: 'genre/xnxx-jav' },
  { n: '少妇', v: 'genre/young-wife' },
];
const GENRE_DEFAULT = 'genre/big-tits';

// 演员筛选卡片（/cast/ 页实测，24 人，按站内片量降序；v 为相对路径）
const CAST_FILTER = [
  { n: 'Kitano Mina', v: 'cast/kitano-mina' },
  { n: 'Oda Mako', v: 'cast/oda-mako' },
  { n: 'Satsuki Nao', v: 'cast/satsuki-nao' },
  { n: 'Isshiki Momoko', v: 'cast/isshiki-momoko' },
  { n: 'Tsuji Honoka', v: 'cast/tsuji-honoka' },
  { n: 'Yoshine Yuria', v: 'cast/yoshine-yuria' },
  { n: 'Kamiki Rei', v: 'cast/kamiki-rei' },
  { n: 'Meguri', v: 'cast/meguri' },
  { n: 'Saegusa Chitose', v: 'cast/saegusa-chitose' },
  { n: 'Oshikawa Yuuri', v: 'cast/oshikawa-yuuri' },
  { n: 'Lioka Kanako', v: 'cast/lioka-kanako' },
  { n: 'Ayumi Ryou', v: 'cast/ayumi-ryou' },
  { n: 'Mary Tachibana', v: 'cast/mary-tachibana' },
  { n: 'Hatano Yui', v: 'cast/hatano-yui' },
  { n: 'Haruna Hana', v: 'cast/haruna-hana' },
  { n: 'Tsukada Shiori', v: 'cast/tsukada-shiori' },
  { n: 'Miu Shiramine', v: 'cast/miu-shiramine' },
  { n: 'Satsuki Mei', v: 'cast/satsuki-mei' },
  { n: 'Kazama Yumi', v: 'cast/kazama-yumi' },
  { n: 'Washio Mei', v: 'cast/washio-mei' },
  { n: 'Tomoda Maki', v: 'cast/tomoda-maki' },
  { n: 'Kusakabe Kana', v: 'cast/kusakabe-kana' },
  { n: 'Honjou Suzu', v: 'cast/honjou-suzu' },
  { n: 'Nanami Tina', v: 'cast/nanami-tina' },
];
const CAST_DEFAULT = 'cast/kitano-mina';

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const b = base || HOST;
  return b + (u.startsWith('/') ? u : '/' + u);
}

async function fetchHtml(url) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Referer: HOST + '/' },
      timeout: 20000,
    });
    const t = typeof r.data === 'string' ? r.data : '';
    if (!t || t.length < 1000) return '';
    return t;
  } catch (e) {
    return '';
  }
}

// 列表解析：<a href="/jav/<slug>/"> 包着 <div class="video-card">，
// 封面 img.thumb，标题 .card-title 或 data-title，评分/观看在 data-*。
function parseCards(html) {
  const list = [];
  if (!html) return list;
  const $ = cheerio.load(html);
  // .video-card 类就在 <a> 自己身上（data-title/data-views/data-date 都在 <a> 上）
  $('a.video-card[href*="/jav/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    if (!/\/jav\/[^/]+\/?$/.test(href)) return;
    const title = cleanText($a.find('.card-title').text()) || cleanText($a.attr('data-title')) || cleanText($a.attr('title'));
    if (!title) return;
    const cover = absUrl($a.find('img.thumb').attr('src') || $a.find('img').attr('src'));
    const rating = cleanText($a.attr('data-rating'));
    const views = cleanText($a.attr('data-views'));
    const remarks = [rating ? '⭐' + rating : '', views ? views + '次' : ''].filter(Boolean).join(' ');
    list.push({ vod_id: absUrl(href), vod_name: title, vod_pic: cover, vod_remarks: remarks });
  });
  // 去重（同页卡片可能重复出现）
  const seen = new Set();
  return list.filter((it) => {
    if (seen.has(it.vod_id)) return false;
    seen.add(it.vod_id);
    return true;
  });
}

function parsePagecount(html, curPage) {
  let max = curPage;
  if (html) {
    const re = /\/page\/(\d+)\/?/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// master.m3u8 解析档位：#EXT-X-STREAM-INF 后的相对地址 + RESOLUTION。
// 返回 [{res:'720p', url}]；不是 master（媒体播单）则返回 []。
function parseMasterVariants(masterText, masterUrl) {
  const out = [];
  if (!masterText || !masterText.includes('#EXTM3U')) return out;
  const lines = masterText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const resM = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const res = resM ? resM[2] + 'p' : '';
    let uri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const u = lines[j].trim();
      if (!u) continue;
      if (u.startsWith('#')) continue;
      uri = u;
      break;
    }
    if (!uri) continue;
    let abs = uri;
    try { abs = new URL(uri, masterUrl).href; } catch (e) { /* 保持原样 */ }
    if (res && !out.some((o) => o.res === res)) out.push({ res, url: abs });
  }
  const order = { '2160p': 0, '1080p': 1, '720p': 2, '480p': 3, '360p': 4 };
  out.sort((a, b) => (order[a.res] ?? 9) - (order[b.res] ?? 9));
  return out;
}

async function fetchText(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', Referer: HOST + '/' },
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) {
    return '';
  }
}

// 从详情页取 master.m3u8：优先 <video data-sources> JSON，兜底 JSON-LD contentUrl。
function extractMaster(html) {
  if (!html) return '';
  const ds = html.match(/data-sources="([^"]+)"/);
  if (ds) {
    const json = ds[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const m = json.match(/https?:\\?\/\\?\/[^"\\]+\.m3u8/);
    if (m) return m[0].replace(/\\\//g, '/');
  }
  const ld = html.match(/"contentUrl"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
  if (ld) return ld[1];
  const any = html.match(/https?:\/\/[^\s"'<>]+\.m3u8/);
  return any ? any[0] : '';
}

async function init() {
  return {};
}

async function home() {
  return {
    class: CLASSES,
    filters: {
      genre: [{ key: 'sub', name: '题材', value: GENRE_FILTER }],
      cast: [{ key: 'sub', name: '演员', value: CAST_FILTER }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  let tid = String(body.id || 'jav').trim();
  const extend = body.filters || body.extend || {};
  // 题材维：选中卡片取卡片地址，未选默认 GENRE_DEFAULT。
  // 演员维：同理，选中卡片取卡片地址，未选默认 CAST_DEFAULT。
  if (tid === 'genre') {
    const sub = String(extend.sub || '');
    tid = (sub && sub.startsWith('genre/')) ? sub : GENRE_DEFAULT;
  } else if (tid === 'cast') {
    const sub = String(extend.sub || '');
    tid = (sub && sub.startsWith('cast/')) ? sub : CAST_DEFAULT;
  }
  const path = '/' + tid.replace(/^\/+/, '').replace(/\/+$/, '');
  const url = page > 1 ? HOST + path + '/page/' + page + '/' : HOST + path + '/';
  const html = await fetchHtml(url);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 30, total: pagecount * 30, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (!id) return { list: [] };
  const detailUrl = absUrl(id);
  const html = await fetchHtml(detailUrl);
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  const name = cleanText($('meta[property="og:title"]').attr('content'))
    || cleanText($('h1').first().text())
    || cleanText($('title').text());
  let cover = absUrl($('meta[property="og:image"]').attr('content'));
  if (!cover) {
    const dp = html.match(/data-poster="([^"]+)"/);
    if (dp) cover = absUrl(dp[1]);
  }
  const content = cleanText($('meta[property="og:description"]').attr('content'));
  // 播放：取 master，解析档位；有几档出几档，绝不编造。
  const master = extractMaster(html);
  const eps = [];
  if (master) {
    const masterText = await fetchText(master, 10000);
    const variants = parseMasterVariants(masterText, master);
    if (variants.length) {
      for (const v of variants) {
        eps.push(v.res.replace('p', 'P') + '$' + detailUrl + '@@' + v.url);
      }
    } else {
      // 不是 master（或取失败）：直接回 master 地址本身，播放器自选档。
      eps.push('正片$' + detailUrl + '@@' + master);
    }
  }
  const vod = {
    vod_id: detailUrl,
    vod_name: name || detailUrl,
    vod_pic: cover,
    vod_content: content,
    vod_play_from: NAME,
    vod_play_url: eps.join('#'),
  };
  // 字幕：只有片名含可抽番号才预热（无番号不接）。
  const subUrls = eps.map((e) => e.split('@@').pop()).filter(Boolean);
  for (const u of subUrls) subCacheName(u, name);
  if (subUrls.length && subExtractCode(name)) {
    (async () => {
      for (const u of subUrls) {
        try { await subSearchAll(u); } catch (e) {}
      }
    })().catch(() => {});
  }
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop();
  if (!id) return { parse: 0, url: '' };
  let durl = '';
  let url = id;
  const at = id.indexOf('@@');
  if (at >= 0) {
    durl = id.slice(0, at);
    url = id.slice(at + 2);
  }
  if (!url) return { parse: 0, url: '' };
  const regTitle = subNameCache.get(url) || '';
  const subs = subExtractCode(regTitle) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, Referer: durl || HOST + '/', Origin: HOST },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 30, total: 0, list: [] };
  const url = page > 1
    ? HOST + '/?s=' + encodeURIComponent(wd) + '&paged=' + page
    : HOST + '/?s=' + encodeURIComponent(wd);
  const html = await fetchHtml(url);
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 30, total: pagecount * 30, list };
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。
const SUB_UA = (typeof UA !== 'undefined' && UA) ? UA : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function subCleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。
async function subHttp(url, headers, timeoutMs) {
  try {
    const r = await req.request({
      method: 'GET',
      url,
      headers: headers || {},
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const text = typeof r.data === 'string' ? r.data : (r.data == null ? '' : String(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。
function subRegister(detailIds, vod) {
  try {
    if (!vod || !vod.vod_name) return;
    const name = String(vod.vod_name);
    const keys = new Set();
    for (const i of (Array.isArray(detailIds) ? detailIds : [detailIds])) {
      if (i) keys.add(String(i));
    }
    if (vod.vod_id) keys.add(String(vod.vod_id));
    const eps = [];
    for (const grp of String(vod.vod_play_url || '').split('$$$')) {
      for (const seg of grp.split('#')) {
        const k = seg.indexOf('$');
        if (k >= 0) {
          const ep = seg.slice(k + 1);
          if (ep) { keys.add(ep); eps.push(ep); }
        }
      }
    }
    for (const k of keys) subCacheName(k, name);
    const warmKey = eps[0] || (vod.vod_id ? String(vod.vod_id) : '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? subCleanText(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
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

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
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

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
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

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
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

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
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

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
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

// oracle 条目归一 (组件 normalizeResult 的字段口径)
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

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
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

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
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

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
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

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
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
    const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
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

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
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

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

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
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
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

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
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
