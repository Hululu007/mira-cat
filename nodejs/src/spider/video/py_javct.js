// JavCT - CatPawOpen JS Spider（2026-10-30 新源）
// 站点：https://javct.net/（与 sextb 同模板 family，2026-10-30 用户提示 sextb
// 同款后经浏览器核实坐实）
// 结构（浏览器 + jina 实测）：
//  - 列表：卡片 <a href="/v/{slug}" class="card__play">，标题 card__title，
//    封面懒加载：src 是 default-cover.jpg 占位图，真实封面在 data-src
//    （https://cdn001.imggle.net/webp/poster/…，与 sextb 同款写法）。
//  - 分类（导航实测）：素人 /amateur，有码 /censored，无码 /uncensored，
//    字幕 /subtitle；各分类 Latest Update = 裸路径，New Releases =
//    ?sort=new-releases，Most Viewed = ?sort=most-viewed；
//    另有 /categories、/studios、/models 索引；LIVE SEX 是外链（chattb.net），不用。
//  - 详情：/v/{slug}；h1 = 番号 + 标题；元数据 Label / Studio / Model /
//    Categories / Running time / Release Date / Views；真实封面
//    cdn001.imggle.net/thumb/…jpg 与 /webp/poster/…webp。
//  - 播放（main.js 流程，浏览器实测）：服务器按钮
//    <button class="switch-source btn-player episode" data-source="{filmId}"
//    data-id="{episode}">F4</button>（默认激活 F4；另有 FL、US；
//    VIP 按钮 class 含 btn-player-vip，绝不碰）；页内全局
//    window.__pt / window.__pk（每页现值，play 时现取）；
//    点击 → POST /ajax/player，body {episode, filmId, pt}，头
//    X-Requested-With: XMLHttpRequest；返回 JSON，item.error 则失败，
//    嵌页 = item.player_enc ? xorDecrypt(item.player_enc, __pk)
//    : item.player；响应可能带 next_pt/next_pk（轮换链，蜘蛛只用首 POST）。
//  - 嵌页按 host 分流（与 sextb 同款，Worker 已部署且通用）：
//    F4（f4scdn/f4jav）→ sextb-hls Worker /f4?u={embed}&r={detail}；
//    其他 host → Worker /v?u={embed}&r={detail}。
//  - 本站给的是服务器选择（F4/FL/US），不是分辨率档，不编造清晰度。
//  - 站方有 WAF（VM 直连 403）：蜘蛛先 GET 首页暖会话再抓详情/ajax，
//    App 的 req 能否过墙、cookie 是否跨请求保持，均待真机验。
//  - xorDecrypt：main.js 原文已于 2026-10-30 经浏览器实测回传并逐字
//    对应：atob 解码后与 __pk 循环异或（密钥为空则只解码）；
//    猫源内 base64 走 Buffer（atob 不一定可用），其余逻辑与原文一致。
import req from '../../util/req.js';

const KEY = 'py_javct';
const NAME = 'JavCT';
const HOST = 'https://javct.net';
const WORKER = 'https://sextb-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

async function getText(url, referer) {
  try {
    const { data } = await req.get(url, { headers: H(referer), timeout: 15000 });
    return String(data || '');
  } catch { return ''; }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function b64Decode(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  try { return Buffer.from(t, 'base64').toString('latin1'); } catch { return ''; }
}

function xorStr(raw, key) {
  if (!key) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

function latin1ToUtf8(s) {
  try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; }
}

// xorDecrypt：main.js 原文（2026-10-30 浏览器实测回传，逐字对应）：
// 先 atob 解码，密钥为空则直接返回解码串；否则逐字符与 key 循环异或。
// 猫源运行环境 atob 不一定可用，故 base64 一律走 Buffer（已确认可用），
// 其余逻辑与原文完全一致；解出串再转 utf8 供后续正则取 iframe。
function xorDecrypt(enc, key) {
  if (!enc) return '';
  const decoded = b64Decode(enc);
  if (!key) return latin1ToUtf8(decoded);
  return latin1ToUtf8(xorStr(decoded, key));
}

function isF4Host(host) { return /f4scdn\.com|f4jav\.xyz/i.test(host || ''); }
function hostOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^\/]+)/i);
  return m ? m[1] : '';
}
function workerUrl(embed, durl) {
  const host = hostOf(embed);
  const path = isF4Host(host) ? '/f4' : '/v';
  return WORKER + path + '?u=' + encodeURIComponent(embed) + '&r=' + encodeURIComponent(durl);
}

function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]*href="(https:\/\/javct\.net\/v\/[a-z0-9\-]+|\/v\/[a-z0-9\-]+)"[^>]*class="[^"]*card__play[^"]*"[^>]*>([\s\S]{0,1500}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!/^https?:\/\//i.test(href)) href = HOST + href;
    if (seen.has(href)) continue;
    seen.add(href);
    // 封面不在 card__play 锚点内（锚点里只有一个播放图标），而是同 card__cover
    // 块里锚点前面的 <img class="lazy" data-src="imggle webp">；旧写法只在锚点
    // 内找 img，永远找不到，封面全空。改取锚点前 900 字内最后一个 img。
    let pic = '';
    const before = html.slice(Math.max(0, m.index - 900), m.index);
    const imgs = [...before.matchAll(/<img[^>]*>/gi)];
    const im = imgs.length ? imgs[imgs.length - 1][0] : null;
    if (im) {
      const dm = im.match(/data-src="([^"]+)"/i);
      const sm = im.match(/src="([^"]+)"/i);
      const cand = (dm && dm[1]) || (sm && sm[1]) || '';
      if (cand && !/default-cover/i.test(cand) && !/data:image/i.test(cand)) {
        pic = /^https?:\/\//i.test(cand) ? cand : HOST + (cand.startsWith('/') ? cand : '/' + cand);
      }
    }
    items.push({ vod_id: href, vod_name: '', vod_pic: pic, vod_remarks: '' });
    if (items.length >= 60) break;
  }
  // 标题与番号：card__title 块与卡片一一对应，按顺序补
  const titles = [...html.matchAll(/class="[^"]*card__title[^"]*"[^>]*>([\s\S]{0,500}?)<\/[^>]+>/gi)].map(x => stripTags(x[1]));
  const codes = [...html.matchAll(/<a[^>]*href="https:\/\/javct\.net\/v\/[a-z0-9\-]+"[^>]*>([A-Z0-9\-]{4,})<\/a>/gi)].map(x => x[1]);
  items.forEach((it, i) => {
    if (titles[i]) it.vod_name = titles[i];
    if (codes[i]) it.vod_remarks = codes[i];
    if (!it.vod_name) it.vod_name = it.vod_remarks || 'JavCT';
  });
  return items.filter(it => it.vod_name && it.vod_name.length >= 2);
}

// 2026-10-30 晚按用户令重排并扩充：无码第一、字幕第二、素人最后；
// 中间为站内 /categories 索引的真实题材分类（/category/{slug}，均已验有内容）。
const CATS = [
  { type_id: '/uncensored', type_name: '无码' },
  { type_id: '/subtitle', type_name: '字幕' },
  { type_id: '/censored', type_name: '有码' },
  { type_id: '/category/big-tits', type_name: '巨乳' },
  { type_id: '/category/big-asses', type_name: '大屁股' },
  { type_id: '/category/beautiful-girl', type_name: '美少女' },
  { type_id: '/category/cosplay', type_name: '角色扮演' },
  { type_id: '/category/married-woman', type_name: '人妻' },
  { type_id: '/category/mature-woman', type_name: '熟女' },
  { type_id: '/category/milf', type_name: '熟妇' },
  { type_id: '/category/school-girls', type_name: '校园' },
  { type_id: '/category/creampie', type_name: '中出' },
  { type_id: '/category/blowjob', type_name: '口交' },
  { type_id: '/category/drama', type_name: '剧情' },
  { type_id: '/category/lesbian', type_name: '女同' },
  { type_id: '/category/massage', type_name: '按摩' },
  { type_id: '/category/office-lady', type_name: 'OL' },
  { type_id: '/category/outdoor', type_name: '野外' },
  { type_id: '/category/anal', type_name: '肛交' },
  { type_id: '/category/bondage', type_name: '捆绑' },
  { type_id: '/category/orgy', type_name: '群交' },
  { type_id: '/amateur', type_name: '素人' },
];

async function warmSession() {
  await getText(HOST + '/', HOST + '/');
}

async function init() { return {}; }

async function home() {
  await warmSession();
  const html = await getText(HOST + '/', HOST + '/');
  return { class: CATS, filters: {}, list: parseCards(html) };
}

// 分页真相（2026-11-02 设备反馈 + jina 实测）：站方忽略 ?page=N（恒回第 1 页，
// 故旧逻辑全部分类无限重复）；真实分页是分类 token 路径 + /pg-N
// （如 /uncensored-c8lkazew/pg-2；token 各分类不同、跨请求稳定，须从第 1 页
// 分页链接现取；取不到则 page>1 如实返回空，绝不回第 1 页内容充数）。
function pagePrefix(html) {
  const m = String(html || '').match(/href=["']([^"']*?)\/pg-\d+["']/i);
  if (!m) return null;
  let p = m[1];
  if (!/^https?:\/\//i.test(p)) p = HOST + (p.startsWith('/') ? p : '/' + p);
  return p.replace(/\/+$/, '');
}
function lastPageNum(html) {
  let max = 0;
  const re = /\/pg-(\d+)/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(body.id || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid) tid = '/amateur';
  const base = (/^https?:\/\//i.test(tid) ? tid : HOST + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
  await warmSession();
  if (page === 1) {
    const html = await getText(base, HOST + '/');
    const list = parseCards(html);
    const last = lastPageNum(html);
    return { page, pagecount: last || 9999, limit: 90, total: list.length ? 999999 : 0, list };
  }
  const firstHtml = await getText(base, HOST + '/');
  const prefix = pagePrefix(firstHtml);
  if (!prefix) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const html = await getText(prefix + '/pg-' + page, HOST + '/');
  const list = parseCards(html);
  const last = lastPageNum(html);
  return { page, pagecount: list.length ? (last || 9999) : page, limit: 90, total: list.length ? 999999 : 0, list };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn?.body?.id) ? reqIn.body.id : [reqIn?.body?.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    let durl = String(raw).trim();
    if (!/^https?:\/\//i.test(durl)) durl = HOST + (durl.startsWith('/') ? durl : '/' + durl);
    await warmSession();
    const html = await getText(durl, HOST + '/');
    // jina 加工页会混入假 <h1>403 Forbidden</h1>，故 og:title 优先，
    // 其次 section__title，再次任意 h1，且跳过错误页标题
    const cands = [];
    const ogt = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogt) cands.push(ogt[1]);
    const sht = html.match(/<h1[^>]*class="[^"]*section__title[^"]*"[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (sht) cands.push(sht[1]);
    const h1t = html.match(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/i);
    if (h1t) cands.push(h1t[1]);
    let title = 'JavCT';
    for (const c of cands) {
      const t = stripTags(c);
      if (t && !/^(403|404|500|Forbidden|Not Found)/i.test(t)) { title = t; break; }
    }
    let pic = '';
    const ogm = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogm) pic = ogm[1];
    if (!pic) {
      const im = html.match(/https:\/\/cdn001\.imggle\.net\/[^"'\s<>]+/i);
      if (im) pic = im[0];
    }
    const filmM = html.match(/filmId\s*=\s*["']?(\d+)/i)
      || html.match(/data-source="(\d+)"/i);
    const filmId = filmM ? filmM[1] : '';
    const ptM = html.match(/window\.__pt\s*=\s*"([^"]+)"/i);
    const pkM = html.match(/window\.__pk\s*=\s*"([^"]+)"/i);
    const pt = ptM ? ptM[1] : '';
    const pk = pkM ? pkM[1] : '';
    const lines = [];
    const btnRe = /<button[^>]*class="[^"]*btn-player[^"]*"[^>]*>([\s\S]{0,80}?)<\/button>/gi;
    let bm;
    while ((bm = btnRe.exec(html)) !== null) {
      const tag = bm[0];
      if (/btn-player-vip/i.test(tag)) continue; // VIP 绝不碰
      const dm = tag.match(/data-id="(\d+)"/i);
      const sm = tag.match(/data-source="(\d+)"/i);
      const name = stripTags(bm[1]) || '播放';
      const episode = dm ? dm[1] : '';
      const fsrc = sm ? sm[1] : filmId;
      if (!episode || !fsrc) continue;
      lines.push(name + '$' + fsrc + '|' + episode + '|' + pt + '|' + pk + '|' + durl);
    }
    if (!lines.length) lines.push('网页播放$' + durl);
    // 字幕预热：按每条播放线登记片名。key 取每条播放线在 vod_play_url 里的
    // 完整串（filmId|episode|pt|pk|durl），与 play() 查字幕传的串完全一致；
    // 最终播放入口是 ajax 后才知的 Worker 中转地址，不拿它当 key。
    // 详情 URL 也登记一份兜底。后台逐条串行找字幕（不 await，不一拥而上）。
    const subKeys = lines.map((l) => l.split('$').pop());
    for (const k of subKeys) subCacheName(k, title);
    subCacheName(durl, title);
    (async () => {
      for (const k of subKeys) {
        try { await subSearchAll(k); } catch (e) {}
      }
    })().catch(() => {});
    list.push({ vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: lines.join('#') });
  }
  return { list };
}

async function play(reqIn) {
  let id = String(reqIn?.body?.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  if (/\.m3u8(\?|$)/i.test(id) || /\.mp4(\?|$)/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  // 服务器线：filmId|episode|pt|pk|durl
  const parts = id.split('|');
  if (parts.length < 5) {
    return { parse: 1, url: /^https?:\/\//i.test(id) ? id : HOST + '/', header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  const filmId = parts[0], episode = parts[1], pt = parts[2], pk = parts[3];
  const durl = parts.slice(4).join('|');
  let ajaxUrl = '';
  try { ajaxUrl = new URL(durl).origin + '/ajax/player'; } catch { return { parse: 0, url: '' }; }
  const body = 'episode=' + encodeURIComponent(episode) + '&filmId=' + encodeURIComponent(filmId) + '&pt=' + encodeURIComponent(pt);
  let json = null;
  try {
    const { data, status } = await req.post(ajaxUrl, body, {
      headers: {
        'User-Agent': UA,
        'Referer': durl,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    });
    if (status === 200 && data != null) {
      json = typeof data === 'string' ? JSON.parse(data) : data;
    }
  } catch {}
  if (!json || json.error) return { parse: 0, url: '' };
  let playerHtml = '';
  if (json.player_enc) playerHtml = xorDecrypt(json.player_enc, pk || '');
  else if (json.player) playerHtml = String(json.player);
  if (!playerHtml) return { parse: 0, url: '' };
  // 字幕：detail 预热过则命中缓存/在途；key 是入参复合串
  // （filmId|episode|pt|pk|durl），与 detail 登记的 key 完全一致。
  // 无结果不挂 subs 键，与未接入前逐字段一致。
  const subs = await subSearchAll(id).catch(() => []);
  const em = playerHtml.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"/i)
    || playerHtml.match(/<iframe[^>]+src="(\/\/[^"]+)"/i);
  if (em) {
    let embed = em[1];
    if (embed.startsWith('//')) embed = 'https:' + embed;
    const result = { parse: 0, url: workerUrl(embed, durl), header: { 'User-Agent': UA, 'Referer': durl } };
    if (subs && subs.length) result.subs = subs;
    return result;
  }
  const mm = playerHtml.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/i);
  if (mm) {
    const result = { parse: 0, url: mm[0], header: { 'User-Agent': UA, 'Referer': durl } };
    if (subs && subs.length) result.subs = subs;
    return result;
  }
  return { parse: 0, url: '' };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const base = HOST + '/search/' + encodeURIComponent(wd);
  const url = page === 1 ? base : base + '?page=' + page;
  await warmSession();
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: 9999, limit: 90, total: list.length, list };
}

// ---------- 字幕聚合（与猫源 27 源同款芯一致，仿 py_one.js 字幕聚合节） ----------
// 三槽：迅雷（键序 [番号， 紧凑番号]）> 迅雷看看（完整键序）> SubtitleCat；
// 两迅雷槽同走同一 oracle 接口、合并按 URL 去重、同条归高档位；合并序 =
// 档位 -> 语言（简中>繁中>双语>英文>日文>其他）-> 分数；全局上限 10、
// 单槽软上限 8。严过滤（条目须含番号或片名全文，无回退，宁缺毋滥）；
// 全程 req 主栈、逐请求超时 3s、总预算 6s、失败全静默、无命中不带 subs 键。
// 番号只从片名取，不从播放地址取（代理地址含 b64 串、CDN 域名都不可信）。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();
const subResultCache = new Map();
function subCacheName(url, name) {
  if (!url || !name) return;
  subNameCache.set(url, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
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
function subCtx(url) {
  const title = (subNameCache.get(url) || '').trim();
  const code = subExtractCode(title);
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
function subMatchOf(url, ctx) {
  const text = ((ctx.title || '') + ' ' + String(url || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return { text, loose: text.replace(/[-_\s.]/g, ''), title, titleLoose: title.replace(/[-_\s.]/g, '') };
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
const subInflight = new Map();
async function subSearchAll(url) {
  const hit = subResultCache.get(url);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(url)) return subInflight.get(url);
  const p = (async () => {
    const ctx = subCtx(url);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(url, ctx);
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
        subResultCache.set(url, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(url, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(url, p);
  try { return await p; } finally { subInflight.delete(url); }
}

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}

export default function createSpider() {
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
