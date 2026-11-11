// 每日大赛 - CatPawOpen 格式
// 转换自 REX rex.mrds，站点 https://www.mrds66.com (WordPress)
// 2026-11-11 修：手机上全空（暂无数据），根因是手机直连疑似被 CloudFront 按出口/IP 指纹拦
// （VM 直连正常、站方标记与解析均未变）；修法为 fetchHtml 加 Worker 腿。
// 2026-11-11 夜：直连优先版手机仍全空（直连挂满超时烧掉 App 预算），改并行竞速，
// 解析/详情/播放/搜索未动。
import req from '../../util/req.js';

const KEY = 'py_mrds';
const NAME = '每日大赛';
const BASE = 'https://www.mrds66.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// 取页 Worker（Cloudflare 边缘代取，2026-11-11 修）：站方走 CloudFront，手机 App 的 req 直连
// 疑似按出口/IP 指纹被拦（VM 侧 curl/Node 直连正常、手机上全空；Jina 等数据中心出口能取到
// 真页，说明不是全站封禁）；直连失败或回非真页时走 Worker 兜底。
// 部署名 mrds-fetch，地址 https://mrds-fetch.li768435813.workers.dev/（需用户部署，
// 代码在 mrds-fetch-worker.js；根回 "mrds fetch ok" 即部署成功）。
// Worker 只取 HTML（列表/详情/搜索），不碰视频流；解析仍在蜘蛛里（parseArticles 已验通）。
const FETCH_WORKER = 'https://mrds-fetch.li768435813.workers.dev';
// 封面代理按域路由（2026-10-29 实测）：本站封面已全迁 pic.nihmcl.cn，原图为加密密文；
// bagua 代理对该域回 400 Invalid URL，51chigua 代理回 200 合法图片（png/jpeg/gif 均验）。
// 故 pic.*.cn 域固定走 51chigua，其余域沿用 bagua——两代理各擅长域不同，写死单一代理迟早再坏。
const IMG_PROXY_51 = 'https://51chigua.li768435813.workers.dev/img?url=';
const IMG_PROXY_BAGUA = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';

function proxyCover(url) {
  url = String(url || '').trim();
  if (!url) return '';
  if (url.indexOf('data:') === 0) return url;
  if (url.indexOf('51chigua.li768435813.workers.dev') >= 0 || url.indexOf('bagua-img-proxy') >= 0) return url;
  if (/^https?:\/\/pic\.[^\/]*\.cn\//i.test(url)) return IMG_PROXY_51 + encodeURIComponent(url);
  return IMG_PROXY_BAGUA + encodeURIComponent(url);
}

const CATS = [
  { type_id: 'latest', type_name: '最新更新' },
  { type_id: 'mrds', type_name: '每日大赛' },
  { type_id: 'ztds', type_name: '主题大赛' },
  { type_id: 'rstt', type_name: '热搜吃瓜' },
  { type_id: 'xazd', type_name: '校园学生' },
  { type_id: 'blyp', type_name: '必撸大赛' },
  { type_id: 'fctg', type_name: '反差泄密' },
  { type_id: 'mhds', type_name: '网红黑料' },
  { type_id: 'lqdp', type_name: '猎奇重口' },
  { type_id: 'jdsj', type_name: 'AV看片' },
  { type_id: 'mxwh', type_name: '明星大赛' },
  { type_id: 'smdh', type_name: '动漫之家' },
  { type_id: 'dypd', type_name: '影视国漫' },
  { type_id: 'mtds', type_name: 'cos写真' },
  { type_id: 'ysds', type_name: '声控ASMR' },
  { type_id: 'czds', type_name: '寸止挑战' },
  { type_id: 'hjds', type_name: '混剪PMV' },
  { type_id: 'tgds', type_name: '原创投稿' },
  { type_id: 'omjp', type_name: '欧美精品' },
  { type_id: 'qwcs', type_name: '全网参赛' },
  { type_id: 'aijc', type_name: 'AI剧场' },
];

function t(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

// 真页判定：列表/搜索页有 <article>，详情页有 data-config；
// 质询页/403 错误页/空页一律算失败（触发 Worker 兜底），绝不把假页当内容解析。
function looksReal(html) {
  const s = String(html || '');
  if (!s || s.length < 2000) return false;
  if (/Just a moment|Attention Required|Access Denied|cf-challenge|challenges\.cloudflare\.com/i.test(s)) return false;
  return /<article\b/i.test(s) || /data-config=/.test(s);
}

async function fetchViaReq(url, timeout) {
  try {
    const { data } = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
      timeout: timeout || 10000,
    });
    return String(data || '');
  } catch (e) {
    return '';
  }
}

async function fetchHtml(url) {
  // 2026-11-11 夜修：直连优先版推上去手机仍全空。直连在手机上被拦时不是快速失败，
  // 而是把连接挂满超时（直连 10 秒烧完 App 的等待预算），Worker 腿来不及跑完。
  // 改并行竞速（javrate v10 同款）：Worker 腿（已证实可用、约 2 秒）与直连腿同时跑，
  // 谁先拿到真页用谁，谁都不等谁；两腿都失败才回空。
  const workerUrl = FETCH_WORKER + '/f/?u=' + encodeURIComponent(url);
  return new Promise((resolve) => {
    let done = false;
    let pending = 2;
    let fallback = '';
    const finish = (html) => {
      if (done) return;
      if (looksReal(html)) { done = true; resolve(html); return; }
      if (html) fallback = html;
      if (--pending === 0) { done = true; resolve(fallback); }
    };
    fetchViaReq(workerUrl, 8000).then(finish, () => finish(''));
    fetchViaReq(url, 5000).then(finish, () => finish(''));
  });
}

function parseArticles(html) {
  const items = [];
  const seen = {};
  const re = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const lm = /<a[^>]*href="(\/archives\/\d+\/?)"[^>]*>/.exec(block);
    if (!lm) continue;
    const link = BASE + lm[1];
    if (seen[link]) continue;
    seen[link] = 1;
    let title = '';
    const hm = /<h2 class="post-card-title"[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
    if (hm) {
      const raw = hm[1];
      const cut = raw.search(/<div/i);
      title = t((cut >= 0 ? raw.slice(0, cut) : raw).replace(/<[^>]*>/g, ' '));
    }
    if (!title) continue;
    let cover = '';
    const cm = /loadBannerDirect\('([^']+)'/.exec(block);
    if (cm) cover = proxyCover(cm[1].replace(/([^:])\/{2,}/g, '$1/'));
    if (!cover) {
      // 兜底：loadBannerDirect 消失时取块内 img（data-src 优先），同样走按域路由
      const im = block.match(/<img[^>]*(?:data-src|src)\s*=\s*"([^"]+)"/i);
      if (im && /^https?:\/\//i.test(im[1]) && !/data:image/i.test(im[1])) cover = proxyCover(im[1]);
    }
    items.push({
      vod_id: link,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: '',
    });
  }
  return items;
}

async function home() {
  return { class: CATS };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || 'latest');
  const page = Math.max(1, parseInt(body.page) || 1);
  let url;
  if (id === 'latest') {
    url = page <= 1 ? BASE + '/' : BASE + '/page/' + page + '/';
  } else {
    url = page <= 1 ? BASE + '/category/' + id + '/' : BASE + '/category/' + id + '/' + page + '/';
  }
  try {
    const html = await fetchHtml(url);
    const list = parseArticles(html);
    return { page, pagecount: list.length ? page + 1 : page, list };
  } catch (e) {
    return { page, pagecount: page, list: [] };
  }
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = t(body.wd);
  const page = Math.max(1, parseInt(body.page) || 1);
  if (!kw) return { list: [] };
  const url = page <= 1
    ? BASE + '/search/' + encodeURIComponent(kw) + '/'
    : BASE + '/search/' + encodeURIComponent(kw) + '/' + page + '/';
  try {
    const html = await fetchHtml(url);
    return { page, pagecount: page, list: parseArticles(html) };
  } catch (e) {
    return { list: [] };
  }
}

function extractVideo(html) {
  const m = /data-config=(["'])([\s\S]*?)\1/.exec(html);
  if (!m) return null;
  try {
    const cfg = JSON.parse(m[2]);
    const out = {};
    if (cfg.video && cfg.video.url) out.url = cfg.video.url;
    if (cfg.video_h265 && cfg.video_h265.url) out.h265 = cfg.video_h265.url;
    return out.url ? out : null;
  } catch (e) { return null; }
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const url = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!/^https?:\/\//i.test(url)) return { list: [] };
  const html = await fetchHtml(url);
  let title = '';
  const tm = new RegExp('<meta[^>]*property="og:title"[^>]*content="([^"]*)"', 'i').exec(html);
  if (tm) title = t(tm[1]);
  const video = extractVideo(html);
  const playUrls = [];
  const playFrom = [];
  if (video && video.url) {
    // V2 双集: 中转组只包 .m3u8 (mp4 原样), 直连组全直链。
    const wrap = (u) => (/\.m3u8/i.test(u) ? RELAY_M3U8 + encodeURIComponent(u) : u);
    playFrom.push('每日大赛·中转', '每日大赛·直连');
    let relayUrls = '原画$' + wrap(video.url);
    if (video.h265) relayUrls += '#H265$' + wrap(video.h265);
    let directUrls = '原画$' + video.url;
    if (video.h265) directUrls += '#H265$' + video.h265;
    playUrls.push(relayUrls, directUrls);
  }
  return {
    list: [{
      vod_id: url,
      vod_name: title || '每日大赛',
      vod_pic: '',
      vod_play_from: playFrom.join('$$$'),
      vod_play_url: playUrls.join('$$$'),
    }],
  };
}

// 2026-11-01 流中转 V2 (双集 + 按域名分流): 清单域名在用户手机上被拦, 但 2026-11-01 18:12
// 实测 oolrvd 分片/密钥直连可通, 故中转只改写非直连 host 的分片/密钥 (省额度), 其余直连。
// detail 给双集 (中转集 + 直连集), play 对两者原样返回 (包壳已移到 detail 的中转集里, 不再双重包壳)。
// 只用免费额度、绝不付费升级; 中转集失效时手动切直连集保底。
const RELAY_M3U8 = 'https://javsb-relay-production.up.railway.app/m3u8?u=';

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  // id 可能是 "原画$http..." 或直接 URL
  const m = id.match(/\$?(https?:\/\/[^\s$#]+)/);
  const url = m ? m[1] : (/^https?:\/\//i.test(id) ? id : '');
  if (!url) return { parse: 0, url: '' };
  // V2 双线: 中转集地址与直连集地址原样返回 (包壳已移到 detail 的中转集里, 不再包壳)。
  return {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': BASE + '/' },
  };
}

export default function spider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
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
