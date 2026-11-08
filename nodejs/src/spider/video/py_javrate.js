import req from '../../util/req.js';

// JavRate https://www.javrate.com/ —— 鑑黃師（站方自称 Javrate；标题“正妹AV,日本A片,國產AV,免費在綫看 - Javrate”）
// *** 2026-11-04 用户点名先写这 8 个，故本源已导入（原协调员 HELD 意见被用户指令取代）。
// 播放仍受限：见下文播放链路说明——列表/分类/详情/搜索/封面/字幕均实测可用，
// 唯播放需播单改写代理（token 30 秒 + 逐分片签名）——v3 已接蜘蛛本地字节代理 /proxy/m3u8（见 v3 注）。
// 播放链路（2026-11-04 VM 实测）：详情页 JSON-LD contentUrl 是未签名裸清单（videocdn.avking.xyz，
// 直接取 403）；真流须走详情页 iframe /player/v2?payload=… 取签名 master（cloud-*.avking.xyz，
// token 有效期仅 30 秒，过期即 403）；且每条分片请求都必须单独带 token 查询串（裸分片 403 实测），
// 站方自带播放器靠自定义 loader 给每个请求注入并刷新 token，App 播放器不会这样做，
// v3：play() 返回本地代理地址，分片由代理现铸现贴 token，30 秒窗口不再卡播放器。
// 除播放外全部实测可用：首页/菜单/关键词分类/详情/搜索/封面均为直链。
// 分类：菜单 3 个（censored/uncensored/chinese）+ 关键词分类（名与路径均取自站方 /keywords/movie 索引页实测）
// 列表翻页：菜单 /menu/<m>/5-2-<页>；关键词 /keywords/movie/<词>?page=<页>&moviesort=3（第 2 页标题实测“第2頁”）
// 搜索：/search/<关键词>（实测 FNS-274 返回 1 条）；详情 JSON-LD identifier.value 即番号，字幕按条目接。
// v2（2026-11-08，基于 main blob 7ebb3fad 手术式修改；CATS 与字幕芯一字未动）：
// 站方墙 11-08 收紧，直连/Worker /f/Railway 三腿全死，只剩 jina（r.jina.ai）活。
// getHtml 改多腿并行竞速：Worker 8s / 直连 3s / jina 20s，先到先赢；jina 回 Markdown，
// 走 Markdown 解析分支（parseCardsMd / parseDetailMd），不再把 Markdown 当 HTML 解析。
// jina 腿有 req 与 fetch 双通道（见 getPage 注释：VM 里仓库 req.js 的自定义 Agent 不走
// 出口代理，直连 jina 会 ECONNRESET；全局 fetch 走代理全通）。竞速器 firstSuccess 在
// 全部腿落败时立即回空，不再烧满 20.5s 上限（初版 bug：axios 版全链路 12 个环节各烧
// 满 20.5s 才回空，146/386 条）。
// jina 会剥 script 与 iframe：详情页拿不到 /player/v2 payload 与 JSON-LD contentUrl，
// 故 jina 详情不出播单（play_url 为空，不转圈）；play() 仍保留原链路（payload 在时现铸
// master，master 到手拆 720p/1080p 两档，铸不出回空地址 + msg 诊断）。
// 播单改写代理不写进蜘蛛（B 路 11-08 已判死：/f 取详情 6 次全 403，铸不出新鲜 master），
// 等墙松了再接独立 javrate-hls Worker。
// v3（2026-11-08，基于 v2 blob c71929da 手术式修改；CATS 与字幕芯一字未动）：
// 用户 13:50 真机：v2 列表已确认能出（jina 腿 App 内通）；播放仍死——详情一集都没有
// （UMAN-017 播放键灰掉），病因即 jina 详情无 payload 故不出集。v3 只攻播放：
// ① 详情 HTML 腿优先拿 payload（jina 赢了竞速也再给 HTML 腿 6s 追一次，拿到就出双集；
// 拿不到也留一集懒解析，点播时 play() 内重取详情 HTML 提 payload）；
// ② 播放改走蜘蛛本地字节代理 /proxy/m3u8（24jav/mogu/丝瓜同款）：play() 现铸签名 master
// （token 精确 30 秒、payload 可重复铸，11-08 VM 实测），分片走代理现取现传，
// token 由代理按 payload 现铸现贴、过期前重铸，解决 30 秒签名 + 播放器不透传 token；
// ③ 直连腿 3s→8s（竞速先到先赢，抬上限不增加等待；300KB 首页手机 VPN 下 3s 太紧）。
// 播放不走 Railway（Rule 23）。Worker 不用动。
// v6（2026-11-08，基于线上 v5 blob b1679a2d 手术式修改；CATS 与字幕芯除定时器外一字未动）：
// 三路合成病因：① jina 是有毒的快腿——竞速总被它抢赢，但它剥 script/iframe、无 payload；
// ② 新主路 POST /api/bunnytoken/generate（直连活体验通）：入参只有 {"m3u8Url": 裸清单地址}
// （详情 HTML JSON-LD 的 contentUrl；guid != 详情 uuid，故集内须带 contentUrl），
// 无签名/Referer/Cookie；Worker POST 405、jina 转 GET 也 405，铸 token 只能直连 POST；
// ③ v5“回诊断、不转圈”在设备侧是假的——play() 回 {parse:0,url:''} 时 App 不显示诊断、
// 一直转圈；且定时器兜底依赖两条未经设备证实的前提（setTimeout 触发、axios timeout 生效）。
// 故 v6：详情 HTML 腿先行、jina 只作展示兜底；主路 bunnytoken 直连铸 master，
// 回落现行 /player/v2 老路；全链 withTimeout 硬定时器 + play() 20s 总预算 +
// jrProxy 25s 总预算 + mintInflight 10s 超时去毒；全失败回 parse:1 + 详情页 url +
// 中文诊断（仓内先例：91duanju/javhdporn/javgg/brazz），绝不再回 {parse:0,url:''}。
// v7（2026-11-08，基于线上 v6 blob 2c538938 手术式修改；CATS 与字幕芯一字未动）：
// 用户 23:14 真机：v6 仍无 1080p/720p、无法播放，症状由一直转圈变为直接“视频加载失败”。
// 根因坐实：详情 HTML 腿在手机上全死（Worker /f 取 HTML 回 403 验证页、直连也被拦），
// 故无 payload、无 contentUrl，详情只剩一集“正片”；play() 内重取 HTML 同样落败，
// playFail 回 {parse:1, url:详情页}，播放器拿 HTML 页当视频加载即“视频加载失败”。
// 修法：绕开详情 HTML——POST /api/hot?q=<番号> 直接取裸清单（子代理 2026-11-08 实测格式：
// 关键字放查询串 ?q=、无请求体、Content-Type: application/json；响应 data.movies[].cloudPlayList[0].m3U8Url
// 才是裸地址，movie 级 m3U8Url 可能为空；每部片只 1 条 cloudPlayList，分档由铸 token 后的 master 解析）。
// Worker 实测能通 /api/（GET 打 /api/bunnytoken/generate 与 /api/hot 均回 405，
// 即 API 本身通了、只是 GET 不被接受；HTML 才回 403），故 Worker 同步升 v2
// （加 POST /api/hot 与 POST /api/bunnytoken/generate 代取路由，/f/ 与根路径一字未动）。
// v7：详情无 payload 且无 contentUrl 时凭番号调 apiHot 取 bare，出 1080p/720p/自适应三集
// （payload 为空、只带 @@bare，mintBunny 主路只凭 bare）；mintBunny 直连失败时回落 Worker POST；
// play() 懒解析集点播时同样先试 apiHot 再重取 HTML。
// v8（2026-11-09，基于 v7 blob 007d74f8；CATS 与字幕芯一字未动）：
// 用户 01:22 真机：v7 详情已能选分辨率，但点播仍“视频加载失败”。
// 计时 bug：mintBunny 直连先行 2 次 × 8 秒会耗光 mintMaster 的 10 秒预算，Worker 回落
// 根本跑不到；apiHot 直连先行同样在手机上挂 6 秒。改 Worker 先行（实测 1.3–1.4 秒）、
// 直连只作回落；mintMaster 与 playInner 的铸 token 预算 10 秒放宽到 15 秒。
// 注意：v8 只修计时，不解决 Bunny Stream 片（SSNI-229/RAS-067）的 404——那类片的裸地址
// 在 b-cdn.net 上，bunnytoken 签名地址拉了 404；站方真链是 payload → /player/v2 →
// POST /api/token/generate（需每会话轮换的 apiSecret，见 probe/），HTML 腿全死故暂无解。
// v9（2026-11-09，基于 v8 blob 7400f47f）：修無碼A片只剩正片（subExtractCode 先抓無碼
// 日期碼并保留分隔符）与無碼破解翻頁（去掉 &moviesort=3）；用户 02:28 确认都好了。
// v10（2026-11-09，基于 v9 blob 6abc4107；CATS 与字幕芯一字未动）：攻 Bunny 墙——
// 用户 03:16 报 lailai-rex 的 JavRate（REX 1.0.5）無碼破解下 ROYD-187/SSNI-229/SSNI-295
// 都能播，而猫源同分类同片播不了。根因：REX 用 Widget.http.get 在设备上能直接拉详情页与
// /player/v2（走原生栈、能过站方验证），猫源 req（axios 沙箱）被指纹拦。修法：HTML 腿
// （htmlOnly）加两条全局 fetch 通道（直连 + Worker），赌 App 的 fetch 走与 Widget.http
// 相近的原生栈；App 内无 fetch 时不加、行为与 v9 一致。成败待真机（SSNI-229）。
// v11（2026-11-09，基于 v10 blob 23f8b84b）：用户 03:31 报详情已出 1080p/720p/自适应三集、
// 点播仍“视频加载失败”。根因不在详情（详情直接调 resolveSignedMaster，走 /player/v2 的
// cloud-warm-N 真链，故三集正常），在 play：mintMaster 先走 mintBunny，bunnytoken API 对
// 已迁移的 Bunny 片照常返回签名地址、实拉却 404，mintMaster 见非空即认、不回落 /player/v2。
// 修法：b-cdn.net 签名地址实拉探活（200 + #EXTM3U 才认），死链回落 /player/v2。
// videocdn.avking.xyz 的片（UMAN-017 等）bunnytoken 能通，v8 应能播。
// v12（2026-11-09，基于 v11 blob 1a51e341）：用户 04:11 真机确认重导后 SSNI-229 仍播不了。
// v11 的探活耗时间、且探活失败后留给 /player/v2 的预算不足，仍可能超时快败。v12 改为：
// bare 在 b-cdn.net 上时直接跳过 mintBunny，直走 /player/v2 的 resolveSignedMaster
// （详情正是此路，已证实能拿到 cloud-warm-N 真链）；videocdn 等非 b-cdn.net 才走 mintBunny。
// 这样 play 与 detail 走同一条真链，不再分叉。
// v9（2026-11-09，基于 v8 blob 7400f47f；CATS 与字幕芯除 subExtractCode 外一字未动）：
// 用户 02:19 真机：UMAN-017 能播（v8 生效）、SSNI-229 仍失败（Bunny 墙未解）；另报两问题：
// ① 无码A片下大量只显示「正片」无分辨率；② 无码破解翻页加载不出更多。
// ① 根因：subExtractCode 的旧 pattern 只抓到日期段（CARIB-110726）丢序号，且正规化吃掉底线
// （1PON-110726_001 变 1PON-110726-001），apiHot 严格比对故查不到、无 bare、只剩正片。
// 修法：先抓无码日期码 PREFIX-YYMMDD-NNN/_NNN 并保留原始分隔符（放最前，有码不会误抓）。
// ② 根因：关键词翻页 URL 带 &moviesort=3，把排序从「最新更新」改成「大家都喜欢」，
// 第 2 页起与第 1 页不同排序、翻页出重复（无码破解 p2 与 p1 重 5/20）。修法：翻页只留 ?page=，
// 实测 p2 与 p1 重 0/20、巨乳同样 0 重。
const HOST = 'https://www.javrate.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const RELAY = 'https://javrate.li768435813.workers.dev';
const KEY = 'py_javrate';
// 2026-11-05: 手机直连 javrate.com 拿不到内容（VM 全通），取数改走 Worker 优先、
// 直连兜底；Worker 未部署时 Worker 腿速败、行为与原来一致，部署后无需重推即生效。
function b64url(str) {
  try {
    return Buffer.from(String(str), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function viaWorker(url) { return RELAY + '/f/' + b64url(url); }

// 2026-11-05 round2（照搬 porncgw 能通的取数韧性）：CF 挑战页特征识别 + sleep。
function isChallengeHtml(html) {
  if (!html) return false;
  return /Just a moment|Attention Required|challenges\.cloudflare\.com|cf-ray|cf-challenge/i.test(html);
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// v6：硬定时器包装（hang-audit §5.1）——不依赖 axios timeout 是否生效；
// 超时即结算为 fallback。注意：若 App 的 req 是同步阻塞实现，setTimeout 同样
// 无法触发，此时本包装无效（减腿方案见 hang-audit §5.5，需另定）。
function withTimeout(p, ms, fallback) {
  let t;
  const to = new Promise((resolve) => { t = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), to]);
}

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&x([0-9A-Fa-f]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)));
}

function cleanLabel(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ''))
    .replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').replace(/[$#]/g, '').trim();
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

// ---------------- 取数：三腿并行竞速（v2） ----------------
// Worker 8s / 直连 8s / jina 20s 同时发，先成功者赢；挑战页/空页/报错的腿只算失败，
// 不抢赢。lastFetch 记录赢腿的 kind（'html' | 'md'）与 via，供解析分支选用。
// jina 腿：https://r.jina.ai/<目标 URL>，回 Markdown（头含 Title:/URL Source:/Markdown Content:）。
const JINA = 'https://r.jina.ai/';
const lastFetch = { kind: 'html', via: '' };

function isJinaMd(body) {
  return typeof body === 'string' && body.length > 200 && body.indexOf('Markdown Content:') >= 0;
}

function firstSuccess(jobs, ms) {
  return new Promise((resolve) => {
    let done = false;
    let settled = 0;
    const total = jobs.length;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
    const onSettled = () => {
      settled += 1;
      if (!done && settled >= total) { done = true; clearTimeout(timer); resolve(null); }
    };
    if (total === 0) { done = true; clearTimeout(timer); resolve(null); return; }
    for (const p of jobs) {
      Promise.resolve(p).then((v) => {
        if (done) return;
        if (v) { done = true; clearTimeout(timer); resolve(v); return; }
        onSettled();
      }).catch(onSettled);
    }
  });
}

async function getPage(path, opts) {
  let url = String(path || '');
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = HOST + url;
  const headers = { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
  const legs = [
    { via: 'worker', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'req' },
    { via: 'direct', ms: 15000, kind: 'html', u: url, transport: 'req' },
    { via: 'jina-req', ms: 20000, kind: 'md', u: JINA + url, transport: 'req' },
  ];
  // jina 双通道（2026-11-08 VM 实测）：仓库 req.js 是 axios.create 配自定义 https.Agent，
  // 该 Agent 不走 VM 出口代理（NODE_USE_ENV_PROXY 只对 globalAgent 生效），直连 r.jina.ai
  // 会在收到 200 后被中途掐断（ECONNRESET，7/8 次）；而全局 fetch（undici，走代理）与
  // 不带自定义 Agent 的 axios 4/4 全通。故 jina 腿再加一条 fetch 通道（有 fetch 的运行
  // 时才发），与 req 通道并行竞速，先到先赢；App 内无 fetch 时只剩 req 通道（手机直连，
  // 无 VM 代理问题，行为待真机看）。Worker/直连腿仍走 req，与 v1 一致。
  // v10（2026-11-09，Bunny 墙）：lailai-rex 的 JavRate 用 Widget.http.get 在设备上能
  // 直接拉详情页与 /player/v2（SSNI-229 可播），而猫源 req 腿全死——两边 HTTP 实现不同，
  // REX 的走原生栈、能过站方验证，猫源 req（axios 沙箱）被指纹拦。猫源 App 若有全局 fetch，
  // 它可能走与 Widget.http 相近的原生栈；故 HTML 腿（htmlOnly：详情 payload 与 /player/v2）
  // 加两条 fetch 通道（直连 + Worker），与 req 腿并行竞速。App 内无 fetch 时不加，
  // 行为与 v9 一致；fetch 腿拿不到/被挑战页时只算失败、不影响 req 腿。
  if (typeof fetch === 'function') {
    legs.push({ via: 'jina-fetch', ms: 20000, kind: 'md', u: JINA + url, transport: 'fetch' });
    if (opts && opts.htmlOnly) {
      legs.push({ via: 'direct-fetch', ms: 15000, kind: 'html', u: url, transport: 'fetch' });
      legs.push({ via: 'worker-fetch', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'fetch' });
    }
  }
  // v6：htmlOnly（详情/铸 master）与 mdOnly（详情展示兜底）分流；jina 永不作为 payload 来源。
  const useLegs = (opts && opts.htmlOnly) ? legs.filter((l) => l.kind === 'html')
    : (opts && opts.mdOnly) ? legs.filter((l) => l.kind === 'md') : legs;
  const jobs = useLegs.map((leg) => (async () => {
    try {
      let body = '';
      let status = 0;
      if (leg.transport === 'fetch') {
        // v6：fetch 腿的硬定时器 = 中止定时器 + race（超时即结算 null，不等系统默认）。
        const ctrl = new AbortController();
        let abortTimer;
        const aborted = new Promise((resolve) => { abortTimer = setTimeout(() => { try { ctrl.abort(); } catch (e) { /* ignore */ } resolve(null); }, leg.ms); });
        try {
          const r = await Promise.race([fetch(leg.u, { headers, signal: ctrl.signal }), aborted]);
          if (!r) return null;
          status = r.status;
          body = await withTimeout(r.text(), leg.ms, '');
        } finally { clearTimeout(abortTimer); }
      } else {
        // v6：每条 req 腿包 withTimeout 硬定时器（axios timeout 在 App 内是否生效未经证实）。
        const r = await withTimeout(req.get(leg.u, { headers, timeout: leg.ms }), leg.ms, null);
        if (!r) return null;
        status = r.status || 0;
        body = (r && r.data != null) ? String(r.data) : '';
      }
      if (!body || isChallengeHtml(body)) return null;
      if (leg.kind === 'md' && !isJinaMd(body)) return null;
      if (status === 200) return { body, kind: leg.kind, via: leg.via };
    } catch (e) { /* ignore, other legs race on */ }
    return null;
  })());
  const won = await firstSuccess(jobs, (opts && opts.ms) || 20500);
  if (won) { lastFetch.kind = won.kind; lastFetch.via = won.via; return won.body; }
  lastFetch.kind = 'html'; lastFetch.via = '';
  return '';
}

async function getHtml(path) {
  return getPage(path);
}

// 只走 HTML 腿（Worker + 直连，不走 jina）：铸 master 与提 payload 专用——
// jina 的 player 页是 500 Markdown，抽不到 master；详情 Markdown 也无 payload。
// v6：默认 15s（各腿超时放宽到 15s；详情 HTML 先行预算与腿超时一致）。
async function getHtmlOnly(path, ms) {
  return getPage(path, { htmlOnly: true, ms: ms || 15000 });
}

// v6：只走 jina 腿（详情展示兜底）：HTML 腿先行失败后才走，不再与 HTML 腿竞速。
async function getMdOnly(path, ms) {
  return getPage(path, { mdOnly: true, ms: ms || 20500 });
}

// 字幕芯取数原语（与 py_mogu 一致）：统一回 {status, body}
async function reqRaw(url, headers, timeoutMs) {
  // v6：内包 withTimeout 硬定时器（超时 +1000ms），字幕三槽与 play 回落的 reqRaw
  // 不再只依赖 axios timeout（hang-audit §5.6）。
  const inner = (async () => {
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
  })();
  return withTimeout(inner, (timeoutMs || 10000) + 1000, { status: 0, body: '', headers: {}, err: new Error('reqRaw timeout') });
}

// 本站卡片是“图链 + 文链”多个 <a> 共用同一 /movie/detail/<uuid>.html，按 URL 合并图与标题
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
  const re = /<a[^>]+href=["'](\/movie\/detail\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const vUrl = m[1].trim();
    const inner = m[2];
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    const pic = extractPic(inner);
    if (pic && !it.vod_pic) it.vod_pic = normUrl(pic.startsWith('http') ? pic : absUrl(pic, host));
    const txt = cleanLabel(inner);
    // 同一 URL 有图链（alt 仅番号）与文链（完整标题）两个锚点：取较长者，文链标题胜出
    if (txt && txt.length > 2 && txt.length > it.vod_name.length) it.vod_name = txt;
    // 本站图链锚点内无文字、标题只在 <img alt="..."> 里，取 alt 作标题兜底（去尾“封面”二字）
    if (!it.vod_name || it.vod_name.length < 3) {
      const altM = inner.match(/alt=["']([^"']+)["']/i);
      if (altM) { const altTxt = cleanLabel(altM[1]).replace(/\s*封面\s*$/, ''); if (altTxt && altTxt.length > it.vod_name.length) it.vod_name = altTxt; }
    }
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

// ---------------- jina Markdown 解析分支（v2） ----------------
// jina 把站方 HTML 转成 Markdown：卡片是图链 + 文链两个锚点共用同一详情 URL，
//   图链：[![Image N: <完整标题> 封面](<picture.avking.xyz 图>)](<详情 URL> "<完整标题>")
//   文链：### [**<番号>** <完整标题>](<详情 URL> "<完整标题>")
// 封面以 Markdown 图片形式保留（_s.webp/_thumbnail.webp 直链）；时长/徽标在图链后
//   约 400 字符内（“無碼·中字”徽标行、02:10 这类时长行）；分页链接 jina 不保留，
//   翻页仍按已知 URL 模式（/menu/<m>/5-2-<页>、?page=<页>），总数从 Title 行取。
// 注意：jina 详情页剥 script/iframe，无 payload、无 JSON-LD，见 parseDetailMd。
function mdNormDur(s) {
  return String(s || '').replace(/\s*:\s*/g, ':');
}

function parseCardsMd(md, host) {
  const text = String(md || '');
  const byUrl = new Map();
  // 外层 Markdown 链接：[文字](URL "标题")；图链的文字本身是 ![alt](pic)
  const re = /\[((?:!\[[^\]]*\]\([^)]*\)|[^\]]*))\]\((https?:\/\/[^)\s"]+\/movie\/detail\/[^)\s"]+\.html)(?:\s+"([^"]*)")?\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const outer = m[1] || '';
    const abs = m[2].trim();
    const titleAttr = (m[3] || '').trim();
    const vUrl = abs.replace(/^https?:\/\/[^/]+/, '');
    let it = byUrl.get(vUrl);
    if (!it) { it = { vod_id: vUrl, vod_name: '', vod_pic: '', vod_remarks: '' }; byUrl.set(vUrl, it); }
    if (outer.indexOf('![') === 0) {
      const picM = outer.match(/!\[[^\]]*\]\(([^)]+)\)/);
      const altM = outer.match(/!\[([^\]]*)\]/);
      if (picM && picM[1] && !it.vod_pic) it.vod_pic = normUrl(picM[1].trim().startsWith('http') ? picM[1].trim() : absUrl(picM[1].trim(), host));
      const cand = titleAttr || (altM ? cleanLabel(altM[1]).replace(/\s*封面\s*$/, '') : '');
      if (cand && cand.length > it.vod_name.length) it.vod_name = cand;
    } else {
      const cand = titleAttr || cleanLabel(outer.replace(/\*\*/g, ''));
      if (cand && cand.length > it.vod_name.length) it.vod_name = cand;
    }
    if (!it.vod_remarks) {
      const win = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
      const durM = win.match(/(\d{1,2}\s*:\s*\d{2}(?::\s*\d{2})?)/);
      if (durM) it.vod_remarks = mdNormDur(durM[1]);
      else {
        const badgeM = win.match(/(無碼·中字|無碼破解|無碼|中文字幕)/);
        if (badgeM) it.vod_remarks = badgeM[1];
      }
    }
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

// jina 详情 Title 行：“第1頁 共29039部”这类总数；无则回 null
function mdPageTotal(md) {
  const t = String(md || '').match(/^Title: (.*)$/m);
  if (!t) return null;
  const m = t[1].match(/第(\d+)頁\s*共(\d+)部/);
  if (!m) return null;
  return { page: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

function parseDetailMd(md, rawId, durl) {
  const text = String(md || '');
  let title = '';
  const tM = text.match(/^Title: (.*)$/m);
  if (tM) title = cleanLabel(tM[1]).replace(/\s*\|\s*Javrate\s*$/i, '').trim();
  if (!title) {
    const hM = text.match(/^# \*\*([^*]+)\*\*(.*)$/m);
    if (hM) title = cleanLabel(hM[1] + hM[2]);
  }
  if (!title) title = '精彩视频';
  subCacheName(durl, title);
  // 封面：_m.webp 大图优先（jina 详情 Image 15），退回任一 picture.avking.xyz 图
  let posterPic = '';
  const mPosters = text.match(/https:\/\/picture\.avking\.xyz[^)\s"<>]+?_m\.webp/g);
  if (mPosters && mPosters.length) posterPic = mPosters[0];
  if (!posterPic) {
    const anyPic = text.match(/https:\/\/picture\.avking\.xyz[^)\s"<>]+?\.webp/g);
    if (anyPic && anyPic.length) posterPic = anyPic[0];
  }
  let code = '';
  const codeM = text.match(/\n番號\n\n([A-Z0-9][A-Z0-9\- ]*)\n/);
  if (codeM) code = codeM[1].trim();
  if (!code) code = subExtractCode(title) || '';
  let dur = '';
  const durM = text.match(/(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/);
  if (durM) dur = mdNormDur(durM[1]);
  let desc = '';
  const descM = text.match(/影片劇情\n\n([\s\S]*?)(?:\n\n展開全文|\n## 出演女優|$)/);
  if (descM) {
    desc = clean(descM[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^【在綫觀看】[^\n]*\n?/, ''));
  }
  // jina 剥 script/iframe：详情 Markdown 里没有 /player/v2?payload=，也没有 JSON-LD
  // contentUrl，故只留一集懒解析（play() 内重取详情 HTML 提 payload；提不到回诊断、不转圈）。
  // v3 之前这里 play_url 为空，详情一集都没有（UMAN-017 真机播放键灰掉即此病）。
  return {
    list: [{
      vod_id: rawId,
      vod_name: title,
      vod_pic: posterPic,
      vod_remarks: code ? (code + (dur ? ' · ' + dur : '')) : 'HD',
      vod_content: desc || 'JavRate',
      vod_play_from: 'JavRate',
      vod_play_url: '正片$' + durl,
    }],
  };
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
  const slug = (String(durl || '').match(/\/movie\/detail\/([^/.]+)\.html/) || [])[1] || '';
  return slug ? clean(slug.replace(/[-_]+/g, ' ')) : '';
}

function subExtractCode(text) {
  const raw = String(text || '');
  // v9 無碼日期碼：PREFIX-YYMMDD-NNN / PREFIX-YYMMDD_NNN（CARIB/10MU/1PON/PACO 等），
  // 須在正規化前先抓、保留原始分隔符——1PON 用底線（1PON-110726_001），apiHot 嚴格比對，
  // 轉連字號就查不到（實測：連字號版 0 條、底線版 1 條）。舊正規化會把底線吃掉、
  // 且 CARIB/1PONDO 等舊 pattern 只抓到日期段（CARIB-110726）丟序號，apiHot 亦查不到，
  // 故無碼A片大量只剩「正片」。放最前；有碼（SSNI-229 等）無日期+序號格式，不會誤抓。
  const unc = raw.match(/\b[A-Z0-9]{2,6}[-_]\d{6}[-_]\d{2,3}\b/i);
  if (unc) return unc[0].toUpperCase();
  const s = raw.toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
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



// ---------------- JavRate 分类（全部站方实测存在） ----------------
// 菜单类：/menu/censored（日本A片/有碼，28860部）、/menu/uncensored（無碼A片，3004部）、
// /menu/chinese（國產AV，1619部）；关键词类：路径取自 /keywords/movie 索引页，
// 其中 無碼破解（57部）、巨乳（18066部）为实测标题“类别A片在綫免費播放”。
// 用户点名的 無碼流出 / 减码 / 减少马赛克 在站方索引里无完全对应名，未硬凑（最接近为 無碼破解 +
// 無碼A片菜单，见 NOTES.md）；大屁股无完全对应名，站方自有近义项为 美臀 / 巨尻，已列出。
const CATS = [
  { id: 'menu_censored', name: '日本A片', kind: 'menu', path: 'censored' },
  { id: 'menu_uncensored', name: '無碼A片', kind: 'menu', path: 'uncensored' },
  { id: 'menu_chinese', name: '國產AV', kind: 'menu', path: 'chinese' },
  { id: 'kw_wumapojie', name: '無碼破解', kind: 'kw', path: '無碼破解' },
  { id: 'kw_juru', name: '巨乳', kind: 'kw', path: '巨乳' },
  { id: 'kw_meitun', name: '美臀', kind: 'kw', path: '美臀' },
  { id: 'kw_juqiao', name: '巨尻', kind: 'kw', path: '巨尻' },
  { id: 'kw_meiru', name: '美乳', kind: 'kw', path: '美乳' },
  { id: 'kw_zhongwen', name: '中文字幕', kind: 'kw', path: '中文字幕' },
  { id: 'kw_4k', name: '4K', kind: 'kw', path: '4k' },
  { id: 'kw_zhifu', name: '制服', kind: 'kw', path: '制服' },
  { id: 'kw_renqi', name: '人妻', kind: 'kw', path: '人妻' },
  { id: 'kw_shunv', name: '熟女', kind: 'kw', path: '熟女' },
  { id: 'kw_nvjiaoshi', name: '女教師', kind: 'kw', path: '女教師' },
  { id: 'kw_hushi', name: '護士', kind: 'kw', path: '護士' },
  { id: 'kw_kongjie', name: '空姐', kind: 'kw', path: '空姐' },
  { id: 'kw_ol', name: 'OL', kind: 'kw', path: 'ol' },
];
const CAT_MAP = {};
for (const c of CATS) CAT_MAP[c.id] = c;

function catUrl(cat, page) {
  if (cat.kind === 'menu') {
    return page <= 1 ? ('/menu/' + cat.path) : ('/menu/' + cat.path + '/5-2-' + page);
  }
  const base = '/keywords/movie/' + encodeURIComponent(cat.path);
  // v9：翻頁去掉 &moviesort=3——它把排序從「最新更新」改成「大家都喜歡」，第 2 頁起與第 1 頁
  // 不是同一排序，翻頁會出重複（實測無碼破解 p2 與 p1 重 5/20）；去掉後 p2 與 p1 重 0/20，
  // 巨乳同樣 0 重。只留 ?page=<頁>，與第 1 頁同排序。
  return page <= 1 ? base : (base + '?page=' + page);
}

async function home() {
  const classes = [{ type_id: 'new', type_name: '最新更新' }];
  for (const c of CATS) classes.push({ type_id: c.id, type_name: c.name });
  let list = [];
  try {
    const html = await getHtml('/');
    list = (lastFetch.kind === 'md' ? parseCardsMd(html, HOST) : parseCards(html, HOST)).slice(0, 30);
  } catch (e) { list = []; }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(Array.isArray(body.id) ? body.id[0] : body.id || body.tid || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!tid || tid === 'new') {
    const html = await getHtml('/movie/new');
    return { page: 1, pagecount: 1, list: lastFetch.kind === 'md' ? parseCardsMd(html, HOST) : parseCards(html, HOST) };
  }
  const cat = CAT_MAP[tid];
  if (!cat) return { page, pagecount: page, list: [] };
  const html = await getHtml(catUrl(cat, page));
  const list = lastFetch.kind === 'md' ? parseCardsMd(html, HOST) : parseCards(html, HOST);
  // jina 腿：总数从 Title 行取（“第X頁 共Y部”），pagecount 直接算出；HTML 腿沿用 v1 口径
  let pagecount = list.length > 0 ? page + 1 : page;
  if (lastFetch.kind === 'md') {
    const tot = mdPageTotal(html);
    if (tot && tot.total > 0 && list.length > 0) pagecount = Math.ceil(tot.total / list.length);
  }
  return { page, pagecount, list };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const kw = String(body.wd || '').trim();
  if (!kw) return { list: [] };
  const html = await getHtml('/search/' + encodeURIComponent(kw));
  return { page: 1, pagecount: 1, list: lastFetch.kind === 'md' ? parseCardsMd(html, HOST) : parseCards(html, HOST) };
}

function extractPayload(html) {
  const m = String(html || '').match(/\/player\/v2\?payload=([^"'&]+)/);
  return m ? m[1] : '';
}

function extractLd(html, key) {
  const m = String(html || '').match(new RegExp('"' + key + '":\\s*"([^"]+)"'));
  return m ? unescapeHtml(m[1]) : '';
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { list: [] };
  const durl = rawId.startsWith('http') ? rawId : HOST + rawId;
  // v6 P0：HTML 腿先行（getHtmlOnly 15s 在竞速之前，追补预算 = 腿超时，修掉 v5
  // “6s 追补 < 腿 8s 超时”的必败）；jina 只留作展示兜底，永不作为 payload 来源。
  const htmlFirst = await withTimeout(getHtmlOnly(rawId, 15000), 15000, '');
  if (htmlFirst) { lastFetch.kind = 'html'; lastFetch.via = 'html-first'; return detailHtml(htmlFirst, rawId, durl); }
  const md = await getMdOnly(rawId);
  if (!md) {
    // v5：全腿落败也回一集懒解析，详情永不空手（play() 内重取详情 HTML 提 payload
    // 与 contentUrl；提不到回诊断、不转圈）。无 HTML 时无标题/封面，集名即“正片”。
    return {
      list: [{
        vod_id: rawId,
        vod_name: '精彩视频',
        vod_pic: '',
        vod_remarks: 'HD',
        vod_content: 'JavRate',
        vod_play_from: 'JavRate',
        vod_play_url: '正片$' + durl,
      }],
    };
  }
  const base = parseDetailMd(md, rawId, durl);
  // v7：jina 详情无 payload，凭番号调 /api/hot 取 bare，出 1080p/720p/自适应三集
  // （绕开已死的详情 HTML 腿；apiHot 直连先行、失败走 Worker v2）。
  try {
    const it = base && base.list && base.list[0];
    if (it && String(it.vod_play_url || '') === '正片$' + durl) {
      const hotCode = subExtractCode(it.vod_name) || subExtractCode(it.vod_remarks) || subExtractCode(durl);
      if (hotCode) {
        const bare = await apiHotBare(hotCode);
        if (bare) {
          const bareSeg = '@@' + bare;
          it.vod_play_url = '1080p$' + durl + '@@' + '' + '@@1080p' + bareSeg + '#720p$' + durl + '@@' + '' + '@@720p' + bareSeg + '#自适应$' + durl + '@@' + '' + '@@auto' + bareSeg;
        }
      }
    }
  } catch (e) { /* 保持正片，play() 内再试 */ }
  return base;
}

async function detailHtml(html, rawId, durl) {
  let mainTitle = extractLd(html, 'name');
  if (!mainTitle) {
    const tM = html.match(/<title>(.*?)<\/title>/i);
    if (tM) mainTitle = cleanLabel(tM[1]).replace(/\s*\|\s*Javrate\s*$/i, '').trim();
  }
  if (!mainTitle) mainTitle = '精彩视频';
  subCacheName(durl, mainTitle);
  // 封面：详情页 _m.webp 大图优先，退回 JSON-LD thumbnailUrl（_s.webp），均为 picture.avking.xyz 直链（VM 实测 200）
  let posterPic = '';
  const mPosters = html.match(/https:\/\/picture\.avking\.xyz[^"'\s<>]+?_m\.webp/g);
  if (mPosters && mPosters.length) posterPic = mPosters[0];
  if (!posterPic) posterPic = extractLd(html, 'thumbnailUrl');
  if (!posterPic) {
    const ogM = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogM) posterPic = normUrl(ogM[1].trim());
  }
  const desc = extractLd(html, 'description');
  const code = extractLd(html, 'value');
  const payload = extractPayload(html);
  // v6：guid 来源结论（api-probe 实测 + 复核）：JSON-LD contentUrl 里的 guid
  // （UMAN-017：9bb29374-bdfe-40f2-b0f4-b82dee4717ab）!= 详情页 URL 的 uuid
  // （7dd38275-386b-4eb3-8bca-737b9bbe9d63）；/api/hot 的 movies[].cloudPlayList[0]
  // .m3U8Url 同样含该 guid，但 hot 只是搜索联想 POST 接口、不能替代详情。
  // 故 play 全程不能由 durl 零 HTML 构造裸清单——集内须带 contentUrl（第 4 段 @@
  // 裸地址），play() 凭它直连 POST bunnytoken 铸 master。
  let contentUrl = extractLd(html, 'contentUrl');
  // v7：HTML 里无 payload 且无 contentUrl 时，凭番号调 /api/hot 取 bare
  // （绕开已死的详情 HTML 腿；apiHot 直连先行、失败走 Worker v2）。
  if (!payload && !contentUrl) {
    const hotCode = code || subExtractCode(mainTitle) || subExtractCode(durl);
    if (hotCode) {
      try { contentUrl = await apiHotBare(hotCode) || ''; } catch (e) { contentUrl = ''; }
    }
  }
  // 播单不在详情时固化：play() 凭 payload 现取 player v2（token 仅 30 秒有效，详情时取必过期，
  // 故详情只存 payload，不存签名 URL）；有 payload 出 1080p/720p/自适应三集（play() 内现铸现包代理），
  // 无 payload 只留一集懒解析（play() 内重取详情 HTML 提 payload，提不到回诊断、不转圈）。
  // v4：再加一条“自适应”线（master 本身走代理出线，代理改写 master 的 variant 行，
  // 播放器按带宽自选档位；三条线都是真实存在的地址，不编造）。
  // v7：有 bare 无 payload 也出三集（payload 段留空，只带 @@bare，mintBunny 主路只凭 bare）。
  const bareSeg = contentUrl ? '@@' + contentUrl : '';
  const playUrl = (payload || contentUrl)
    ? ('1080p$' + durl + '@@' + (payload || '') + '@@1080p' + bareSeg + '#720p$' + durl + '@@' + (payload || '') + '@@720p' + bareSeg + '#自适应$' + durl + '@@' + (payload || '') + '@@auto' + bareSeg)
    : ('正片$' + durl);
  return {
    list: [{
      vod_id: rawId,
      vod_name: mainTitle,
      vod_pic: posterPic,
      vod_remarks: code || 'HD',
      vod_content: desc || 'JavRate',
      vod_play_from: 'JavRate',
      vod_play_url: playUrl,
    }],
  };
}


// ---------------- 播单/分片本地代理（v3，24jav/mogu/丝瓜同款形态） ----------------
// 病因（11-08 VM 实测）：签名 master 的 token 精确 30 秒有效、payload 可重复铸；
// 变体/分片裸取 403、带 token 200；分片是纯 TS、无 AES 密钥（两档各 950 分片，
// #EXT-X-KEY 0 条）。App 播放器不透传 token，详情给的直链 30 秒后必死。
// 解法：play() 只出本地代理地址；代理按 payload 现铸现贴 token（缓存 25 秒，过期前重铸），
// 清单改写（分片行指回代理）、分片字节透传（支持 Range，便于拖动）。
// v4（2026-11-08）：play() 的 variants 改走本地代理地址（v3 是无 token 裸 CDN，双双 403）；
// 分片取失败先强制重铸重试、仍失败回 502，不再 302 到无 token 裸地址；详情加“自适应”线。
// v5（2026-11-08，基于线上 v4 blob 13070850 手术式修改；CATS 与字幕芯一字未动）：
// 用户 20:25 真机：重导后详情一集都没出（全腿落败时 detail() 回 {list: []}，懒解析集只在
// getHtml 有回包时才出）；用户 20:23 真机：点播依旧转圈。VM 计时（v5 诊断，curl 同步桩会
// 串行放大耗时，绝对值仅供同桩对比）：play() 冷 17.8-23.9s、温 14.4-14.8s，其中 master
// 取回 1.9-11.6s、mint 冷 11.9-15.5s；代理播单/分片本身 2.0-2.6s、35 秒后重铸 3.1s 均通。
// 故 v5：① 详情全腿落败也回一集懒解析，永不空手；② play() 不再取 master——变体地址按
// 实测形态（master 目录 + 720p|1080p/video.m3u8 + master 查询串）直接构造，两部片实测
// 构造地址经代理取回 200/ENDLIST（2106/1692 分片），形态不符才回落旧路现取 master 拆档；
// ③ 字幕不再 await（1.5 秒 race，超时即不要字幕、先回地址）；④ 代理令牌剩 0-10 秒时
// 用现令牌立即出分片、后台现铸刷新缓存，不再让重铸堵住分片；⑤ fetchBytes 超时 30s→15s。
// 地址形态与 24jav 同款：播放地址查询串 /proxy/m3u8?u=&r=&p=；改写后的分片行用请求 Host
// 拼完整 http:// 绝对地址、路径段形式 + .ts 后缀（过 ffmpeg 分片后缀白名单）。
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function proxyUrl(reqIn, path, targetUrl, referer, payload, bare) {
  try {
    const server = reqIn?.server;
    const dynamic = server?.address?.()?.dynamic || 'js2p://_WEB_';
    const prefix = server?.prefix || ('/spider/' + KEY + '/3');
    let u = `${dynamic}${prefix}${path}?u=${b64url(targetUrl)}&r=${b64url(referer || '')}`;
    if (payload) u += '&p=' + b64url(payload);
    if (bare) u += '&b=' + b64url(bare);
    return u;
  } catch (e) { return ''; }
}

async function fetchBytes(url, referer, timeoutMs, deadlineMs) {
  // v6：每次取数包 withTimeout 10s 硬定时器（hang-audit §5.5：全链唯一零定时器
  // 兜底的 await 在此）；循环仍 2 次，总 ≤20s；有 deadline 时单次不超过剩余时间。
  const to = timeoutMs || 10000;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (deadlineMs && Date.now() >= deadlineMs) break;
    const attemptMs = deadlineMs ? Math.max(1000, Math.min(to, deadlineMs - Date.now())) : to;
    try {
      const r = await withTimeout(req.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/' },
        timeout: attemptMs,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      }), attemptMs, null);
      if (r && r.status >= 200 && r.status < 300 && r.data) return Buffer.from(r.data);
    } catch (e) { /* 重试，落空走 302 降级 */ }
  }
  return null;
}

// token 缓存：cacheKey -> {master, q, exp}；exp 为 token 的 expires（秒），
// 用前剩 5 秒以上才复用，否则重铸。只在模块内存里，不落盘、不跨 App 重启。
// v6：cacheKey = 有 bare 时 'bunny:' + bare，否则 'payload:' + payload（两路
// 铸出的 master 宿主不同——videocdn vs cloud-hot，不可混用缓存）。
const tokenCache = new Map();
// v5：并发现铸去重——同一 payload 同一时刻只铸一次（后台刷新与分片阻塞铸不再重复取 /player/v2）。
const mintInflight = new Map();

function jrCacheKey(payload, bare) {
  return bare ? 'bunny:' + bare : 'payload:' + (payload || '');
}

// v7 新腿——POST /api/hot?q=<番号> 取裸清单地址（子代理 2026-11-08 实测格式）：
//   请求：POST https://www.javrate.com/api/hot?q=<番号>，Content-Type: application/json，无请求体；
//   响应：{"code":200,"data":{"movies":[{id, code, m3U8Url, cloudPlayList:[{m3U8Url, guidId, isDefault}]}]}}；
//   必须读 cloudPlayList[0].m3U8Url（UMAN-017 的 movie 级 m3U8Url 为空串，cloudPlayList 里才有值）；
//   每部片只 1 条 cloudPlayList（isDefault=1），不分 1080p/720p——分档由铸 token 后的 master 清单解析。
//   v8：Worker 先行（实测 1.3 秒回，稳定）；直连在手机上常挂住 6 秒，白白拖慢详情。
//   用途：详情 HTML 腿死时（无 payload、无 contentUrl），凭番号直接拿 bare，走 mintBunny 主路。
async function apiHotBare(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return '';
  const q = encodeURIComponent(kw);
  const legs = [
    { name: 'worker', url: RELAY + '/api/hot?q=' + q, ms: 8000 },
    { name: 'direct', url: HOST + '/api/hot?q=' + q, ms: 6000 },
  ];
  for (const leg of legs) {
    try {
      const r = await withTimeout(req({
        method: 'POST', url: leg.url,
        data: '',
        headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: leg.ms, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5,
      }), leg.ms + 1000, null);
      if (!r) continue;
      const raw = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
      let j = null;
      try { j = JSON.parse(raw); } catch (e) { j = null; }
      const movies = (j && j.data && Array.isArray(j.data.movies)) ? j.data.movies : [];
      if (!movies.length) continue;
      const upKw = kw.toUpperCase();
      const hit = movies.find((mv) => String(mv.code || '').toUpperCase() === upKw)
        || movies.find((mv) => String(mv.id || '') === kw)
        || movies[0];
      if (!hit) continue;
      const cps = Array.isArray(hit.cloudPlayList) ? hit.cloudPlayList : [];
      const cp = cps.find((c) => c && c.m3U8Url) || cps[0];
      const bare = (cp && cp.m3U8Url) || hit.m3U8Url || '';
      if (bare && String(bare).indexOf('.m3u8') >= 0) return String(bare);
    } catch (e) { /* 下一条腿 */ }
  }
  return '';
}

// v8：铸 token 改 Worker 先行——Worker v2 的 POST /api/bunnytoken/generate 实测 1.4 秒
// 出签名地址且稳定；直连在手机上常挂住（2 次 × 8 秒会耗光 mintMaster 的 10 秒预算，
// Worker 回落根本跑不到，点播直接失败）。Worker 先行、直连只作回落。
async function mintBunny(bareUrl) {
  const body = JSON.stringify({ m3u8Url: bareUrl });
  const hdrs = { 'User-Agent': UA, 'Referer': HOST + '/', 'Content-Type': 'application/json', 'Accept': 'application/json' };
  const parseSigned = (r) => {
    if (!r) return '';
    let j = null;
    const raw = typeof r.data === 'string' ? r.data : (r.data ? JSON.stringify(r.data) : '');
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    const signed = j && j.success && j.data && j.data.signedUrl;
    return signed ? String(signed) : '';
  };
  // ① Worker 先行（v2 已部署；未部署时回 400，继续直连）。
  try {
    const r = await withTimeout(req({
      method: 'POST', url: RELAY + '/api/bunnytoken/generate',
      data: body, headers: hdrs,
      timeout: 8000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5,
    }), 8000, null);
    const signed = parseSigned(r);
    if (signed) return signed;
  } catch (e) { /* 回落直连 */ }
  // ② 直连回落（1 次，8 秒）。
  try {
    const r = await withTimeout(req({
      method: 'POST', url: HOST + '/api/bunnytoken/generate',
      data: body, headers: hdrs,
      timeout: 8000, responseType: 'text', transformResponse: [(d) => d], validateStatus: () => true, maxRedirects: 5,
    }), 8000, null);
    const signed = parseSigned(r);
    if (signed) return signed;
  } catch (e) { /* 回落 */ }
  return '';
}

async function mintMaster(durl, payload, bare) {
  const nowS = Math.floor(Date.now() / 1000);
  const cacheKey = jrCacheKey(payload, bare);
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.exp - 5 > nowS) return hit;
  if (mintInflight.has(cacheKey)) return mintInflight.get(cacheKey);
  const pRaw = (async () => {
    let master = '';
    // v6 主路：bunnytoken 直连 POST（只需裸清单地址，不依赖 payload/HTML 腿）。
    // v11 曾给 b-cdn.net 签名地址加实拉探活，但用户 04:11 真机确认重导后 SSNI-229 仍播不了
    // （详情三集正常）。v11 的探活本身耗时间、且探活失败后留给 /player/v2 的预算不足，
    // 仍可能超时快败。v12 改为：bare 在 b-cdn.net 上时直接跳过 mintBunny（已迁移的 Bunny
    // 片签名地址必 404，探活无意义），直走 /player/v2 的 resolveSignedMaster（详情正是此路，
    // 已证实能拿到 cloud-warm-N 真链）；videocdn 等非 b-cdn.net 才走 mintBunny（UMAN-017
    // 靠此路）。这样 play 与 detail 走同一条真链，不再分叉。
    if (bare && bare.indexOf('b-cdn.net') < 0) {
      const cand = await mintBunny(bare);
      if (cand) master = cand;
    }
    // 回落：现行 /player/v2 HTML 老路（需 payload；无 bare、bare 在 b-cdn.net、或 bunny 失败时）。
    if (!master && payload) master = await resolveSignedMaster(durl, payload);
    if (!master) return hit || null;
    const q = (master.split('?')[1] || '');
    const expM = q.match(/expires=(\d+)/);
    const exp = expM ? parseInt(expM[1], 10) : nowS + 30;
    const rec = { master, q, exp };
    tokenCache.set(cacheKey, rec);
    if (tokenCache.size > 50) tokenCache.delete(tokenCache.keys().next().value);
    return rec;
  })();
  // v6：inflight 包 10 秒硬超时、超时去毒——超时结算后 finally 删表项，下一次调用
  // 重新发请求，不再共享死 promise（hang-audit §2.3/§5.4：一次挂住毒死同 payload
  // 全部后续播放，直到 App 重启）。
  const p = withTimeout(pRaw.catch(() => null), 15000, null);
  mintInflight.set(cacheKey, p);
  try { return await p; } finally { mintInflight.delete(cacheKey); }
}

async function mintFreshToken(durl, payload, bare) {
  const rec = await mintMaster(durl, payload, bare);
  return rec ? rec.q : '';
}

// 给目标 URL 贴上新鲜 token 查询串（替换旧查询串；相对地址已在调用处解成绝对地址）。
function withToken(url, q) {
  if (!q) return url;
  const i = String(url).indexOf('?');
  return (i >= 0 ? String(url).slice(0, i) : String(url)) + '?' + q;
}

// 改写清单正文：# 行的 URI="..."（密钥/音频轨）与非 # 行（variant/分片）一律改指回本地代理。
// 分片行走路径段形式 + .ts 后缀（b64url 字母表无 '.'，后缀无歧义；代理入口先剥后缀再解码）。
function rewriteJrM3u8(raw, playlistUrl, selfBase, referer, payload, bare) {
  const isMaster = String(raw).includes('#EXT-X-STREAM-INF');
  const lines = String(raw).split(/\r?\n/);
  const pEnc = payload ? b64url(payload) : '';
  // v6：播单/分片地址同时带 bare（&b= / 第 3 路径段），代理过期重铸时可走 bunnytoken
  // 直连主路，不再只依赖 /player/v2 HTML 腿；旧两段式分片地址仍兼容（bare 缺省）。
  const bEnc = bare ? b64url(bare) : '';
  const out = lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) {
      if (s.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (all, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            return `URI="${selfBase}/proxy/m3u8?u=${b64url(abs)}&r=${b64url(referer || '')}${pEnc ? '&p=' + pEnc : ''}${bEnc ? '&b=' + bEnc : ''}"`;
          } catch (e) { return all; }
        });
      }
      return line;
    }
    try {
      const abs = new URL(s, playlistUrl).toString();
      const bareAddr = abs.split('?')[0];
      if (isMaster) return `${selfBase}/proxy/m3u8?u=${b64url(bareAddr)}&r=${b64url(referer || '')}${pEnc ? '&p=' + pEnc : ''}${bEnc ? '&b=' + bEnc : ''}`;
      return `${selfBase}/proxy/${b64url(bareAddr)}/${b64url(payload || '-')}/${b64url(bare || '-')}.ts`;
    } catch (e) { return line; }
  });
  return out.join('\n');
}

// 代理入口（两种地址格式都接受）：
// 主格式：/proxy/m3u8?u={b64url 目标}&r={b64url referer}&p={b64url payload}；
// 分片格式：/proxy/{b64url 目标}/{b64url payload}.ts（分片行改写用）。
// 有 payload 时现铸现贴 token（缓存 25 秒）；无 payload 时按原地址直取（兼容旧地址）。
async function jrProxy(request, reply) {
  // v6：代理总预算 25s（hang-audit §5.5）——mint ≤8s、fetchBytes 每次 ≤10s 总 ≤20s，
  // 超了立即 502（分片）/302（播单），不再让播放器等 76s 或无界。
  const deadline = Date.now() + 25000;
  const q = request?.query || {};
  // v4：分片一级（/proxy/* 路径段形，无查询串 u）与播单一级（/proxy/m3u8?u=…）分开处理。
  // 分片行 u 是去查询串的 bare 地址，302 回它必 403，故分片失败不再 302，改走强制重铸重试 + 502 快败；
  // 播单一级的 u 本身带 token，302 尚有意义，保持原样。
  const isSegment = !q.u;
  let uEnc = q.u || '';
  let rEnc = q.r || '';
  let pEnc = q.p || '';
  let bEnc = q.b || '';
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
    // v6：分片三段式 /proxy/{目标}/{payload}/{bare}.ts；旧两段式仍兼容（bare 缺省）。
    if (segs.length) { uEnc = segs[0]; pEnc = segs[1] || ''; bEnc = segs[2] || ''; }
  }
  if (!uEnc) { reply.code(400).send('missing u'); return; }
  let target = '';
  let referer = HOST + '/';
  let payload = '';
  let bare = '';
  try {
    target = unb64url(uEnc);
    if (rEnc && rEnc !== '-') referer = unb64url(rEnc) || referer;
    if (pEnc && pEnc !== '-') payload = unb64url(pEnc) || '';
    if (bEnc && bEnc !== '-') bare = unb64url(bEnc) || '';
  } catch (e) { reply.code(400).send('bad u'); return; }
  if (!/^https?:\/\//.test(target)) { reply.code(400).send('bad u'); return; }
  const host = request.headers && request.headers.host;
  const selfBase = host
    ? `http://${host}/spider/${KEY}/3`
    : (proxyUrl(request, '', '', '').replace(/\?.*$/, '') || `/spider/${KEY}/3`);
  // 有 payload：现铸现贴 token；铸不出时退回原地址直取（token 未过期时仍可能通）。
  // v5：令牌剩 0-10 秒时用现令牌立即出分片、后台现铸刷新缓存，不再让重铸堵住本次分片；
  // 令牌已过期或无缓存才同步现铸（不可避免的一次等待）。
  let fetchUrl = target;
  if (payload || bare) {
    try {
      const nowS = Math.floor(Date.now() / 1000);
      const cached = tokenCache.get(jrCacheKey(payload, bare));
      if (cached && cached.exp > nowS && cached.exp - nowS <= 10) {
        fetchUrl = withToken(target, cached.q);
        mintMaster(referer, payload, bare).catch(() => {});
      } else {
        // v6：同步现铸包 8s 硬上限（hang-audit §5.5），超时即 tk='' 用原地址直取。
        const tk = await withTimeout(mintFreshToken(referer, payload, bare), 8000, '');
        if (tk) fetchUrl = withToken(target, tk);
      }
    } catch (e) { /* 退回原地址 */ }
  }
  try {
    let buf = await fetchBytes(fetchUrl, referer, 10000, deadline);
    if ((!buf || !buf.length) && isSegment && (payload || bare) && Date.now() < deadline - 2000) {
      // v4 分片取失败：先强制重铸一次（绕过 tokenCache）再试一次——旧 token 可能刚过期，
      // 缓存复用窗口（exp-5）未必覆盖本次失败；仍失败再 502 快败，不 302 到无 token 裸地址。
      // v6：重铸与重试均不得超过 25s 总预算，超了立即 502。
      try {
        tokenCache.delete(jrCacheKey(payload, bare));
        const leftMs = Math.max(1000, Math.min(8000, deadline - Date.now()));
        const tk2 = await withTimeout(mintFreshToken(referer, payload, bare), leftMs, '');
        if (tk2) fetchUrl = withToken(target, tk2);
        buf = await fetchBytes(fetchUrl, referer, 10000, deadline);
      } catch (e) { /* 重铸失败即走下面的 502 */ }
    }
    if (!buf || !buf.length) {
      if (isSegment) { reply.code(502).send('JavRate segment fetch failed'); return; }
      reply.redirect(target); return;
    }
    const head = buf.subarray(0, Math.min(buf.length, 16)).toString('utf8');
    if (head.trimStart().startsWith('#EXTM3U')) {
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.send(rewriteJrM3u8(buf.toString('utf8'), fetchUrl, selfBase, referer, payload, bare));
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
    if (isSegment) { try { reply.code(502).send('JavRate segment fetch failed'); } catch (e2) { /* 已发送则忽略 */ } return; }
    try { reply.redirect(target); } catch (e2) { /* 已发送则忽略 */ }
  }
}

async function resolveSignedMaster(durl, payload) {
  // 现取 player v2（Referer 必须为详情页），抽签名 master；master 内含 720p/1080p 两档（首个样本实测）。
  // v3：只走 HTML 腿（getHtmlOnly）——11-08 实测 jina 的 player 页 Markdown 仅 858B 外壳，
  // master 由站方 JS 运行时才铸，jina 静态转码永远拿不到；竞速里 jina 一旦抢赢就是假赢
  // （懒解析 play 实测：jina 抢赢 -> 铸不出 master；紧接着 720p 走 HTML 腿即铸成）。
  // /player/v2 在 v1 里就是 GET，不走 POST（POST 透传 11-08 实测：
  // Worker /f POST 同样 403 验证页、直连 POST 20s 超时，两腿在到达站方前就死，无法验证）。
  // v6：腿超时放宽到 15s（与 getPage 腿一致）；外层 mintMaster 另有 10s 硬上限兜底。
  const playerHtml = await getHtmlOnly('/player/v2?payload=' + encodeURIComponent(payload), 15000);
  if (!playerHtml) return '';
  const found = [];
  const re = /https:\/\/cloud-[a-z0-9-]+\.avking\.xyz[^"'\s<>]+?playlist\.m3u8[^"'\s<>]*/g;
  let m;
  while ((m = re.exec(playerHtml)) !== null) {
    const u = unescapeHtml(m[0]);
    if (u.indexOf('token=') >= 0 && found.indexOf(u) < 0) found.push(u);
  }
  return found.length ? found[0] : '';
}

// v5：变体地址直接构造——实测两部片 master 文本的变体 URI 均为相对路径
// `<dir>/720p/video.m3u8` 与 `<dir>/1080p/video.m3u8`（2026-11-08 VM 实测，
// 构造地址经代理取回 200/ENDLIST：UMAN-017 2106 分片、MIUM-1451 1692 分片）。
// 构造 = master 目录 + `<h>p/video.m3u8` + master 查询串（token 由代理取数时现铸替换，
// 故构造地址的查询串新旧不影响播放）。master URL 形态不符时回 null，调用处回落旧路。
function constructVariants(masterUrl) {
  const m = String(masterUrl || '').match(/^(https:\/\/[^?]+\/)playlist\.m3u8(\?.*)?$/);
  if (!m) return null;
  const base = m[1];
  const qs = m[2] || '';
  return [
    { height: 1080, label: '1080p', url: base + '1080p/video.m3u8' + qs },
    { height: 720, label: '720p', url: base + '720p/video.m3u8' + qs },
  ];
}

// 自适应 master 播单拆两档：#EXT-X-STREAM-INF 的 RESOLUTION 行 + 下一行 URI。
// URI 可能是相对路径（带 token 查询串），按 master URL 解析成绝对地址。
function parseMasterVariants(masterText, masterUrl) {
  const lines = String(masterText || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const inf = lines[i].match(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)/);
    if (!inf) continue;
    const uri = (lines[i + 1] || '').trim();
    if (!uri || uri.startsWith('#')) continue;
    let abs = uri;
    try { abs = new URL(uri, masterUrl).toString(); } catch (e) { /* 保持原样 */ }
    out.push({ height: parseInt(inf[2], 10), label: inf[2] + 'p', url: abs });
  }
  return out;
}

const PLAY_DIAG_NO_PAYLOAD = 'JavRate 播放失败：详情页里没有播放参数（/api/hot 也没取到裸清单，直连与 Worker 腿又被站方验证墙拦住），铸不出签名播单。列表与详情可看，播放需等墙松。';
const PLAY_DIAG_NO_MASTER = 'JavRate 播放失败：拿到播放参数但铸不出签名播单（直连铸 token 与 /player/v2 都被站方验证墙拦住），请稍后再试，不要反复点播。';
const PLAY_DIAG_TIMEOUT = 'JavRate 播放失败：点播 20 秒内没有回音（取数腿挂住），请稍后再试，不要反复点播。';

// v6：集链接解析——1080p$durl@@payload@@1080p@@<contentUrl 裸清单>
// （第 4 段为 v6 新增；旧三段与懒解析裸 durl 仍兼容）。
function parsePlayId(rawId) {
  let id = String(rawId || '');
  if (id.includes('$')) id = id.split('$').pop();
  const parts = id.split('@@');
  if (parts.length >= 2) {
    const suf = parts[2] || '';
    return {
      durl: parts[0], payload: parts[1] || '', bare: parts[3] || '',
      wantHeight: suf === '720p' ? 720 : 1080,
      wantAdaptive: suf === 'auto',
    };
  }
  if (id.startsWith('http') || id.startsWith('/')) {
    return { durl: id, payload: '', bare: '', wantHeight: 1080, wantAdaptive: false };
  }
  return { durl: '', payload: id, bare: '', wantHeight: 1080, wantAdaptive: false };
}

// v6：永不回空 url——全失败回仓内先例形态 {parse:1, jx:0, url:详情页, msg:中文诊断}
// （91duanju/javhdporn/javgg/brazz 同款：App 拿非空 url + 诊断，不再无限转圈；
// v5 的 {parse:0, url:''} 在设备侧不显示诊断、即转圈，已证实为假快败）。
function playFail(durl, msg) {
  if (durl) return { parse: 1, jx: 0, url: durl, header: { 'User-Agent': UA, 'Referer': HOST + '/' }, msg };
  return { parse: 0, url: '', msg };
}

// v6：play() 总预算 20s（hang-audit §5.3）——任何分段挂起都最多 20s 即回诊断
// （parse:1 + 详情页 url + 中文诊断），不再无限转圈。
async function play(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  const { durl } = parsePlayId(rawId);
  const res = await Promise.race([
    playInner(reqIn).catch(() => null),
    sleep(20000).then(() => null),
  ]);
  if (res) return res;
  return playFail(durl, PLAY_DIAG_TIMEOUT);
}

async function playInner(reqIn) {
  const body = reqIn?.body || {};
  const rawId = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!rawId) return { parse: 0, url: '', msg: PLAY_DIAG_NO_PAYLOAD };
  // 集名里带档位：1080p$durl@@payload@@1080p@@bare / 720p$… / 自适应$…；
  // 裸详情地址（懒解析集）即 durl 本身，payload 为空、走下面的重取；v2 从未收到裸地址，
  // 沿用“无 @@ 即 payload 本身”的旧解析会把整条 durl 当 payload、铸 master 必然失败。
  let { durl, payload, bare, wantHeight, wantAdaptive } = parsePlayId(rawId);
  if (!payload && !bare && durl) {
    // v7：懒解析集先凭番号调 /api/hot 取 bare（绕开已死的详情 HTML 腿；直连先行、失败走 Worker v2）。
    try {
      const title = subNameCache.get(durl) || '';
      const hotCode = subExtractCode(title) || subExtractCode(durl);
      if (hotCode) bare = await apiHotBare(hotCode) || '';
    } catch (e) { /* 再试 HTML */ }
    if (!payload && !bare) {
      // 懒解析集：详情走 jina 时无 payload，play 时重取详情 HTML（只走 HTML 腿）
      // 再提一次 payload 与 contentUrl（v6：追补预算 = 腿超时 15s）。
      try {
        const path = durl.startsWith('http') ? durl.slice(HOST.length) : durl;
        const htmlOnly = await withTimeout(getHtmlOnly(path, 15000), 15000, '');
        if (htmlOnly) {
          payload = extractPayload(htmlOnly);
          if (!bare) bare = extractLd(htmlOnly, 'contentUrl');
        }
      } catch (e) { /* ignore */ }
    }
  }
  if (!payload && !bare) return playFail(durl, PLAY_DIAG_NO_PAYLOAD);
  // 字幕按条目接：仅当标题含番号才搜，否则不带 subs 键（与模板同一口径）
  const title = subNameCache.get(durl) || '';
  const code = subExtractCode(title) || subExtractCode(durl);
  const subsP = code ? subSearchAll(durl).catch(() => []) : Promise.resolve([]);
  // 现铸签名 master（token 30 秒，payload 可重复铸），拆档后包一层本地代理再出线；
  // 分片由代理现铸现贴 token，播放器只跟本地代理说话。
  // v5：不再取 master 拆档——变体地址按实测形态直接构造（省一次 2-12 秒的 master 取回）；
  // 构造失败（master URL 形态不符）才回落旧路现取 master 拆档。
  let target = '';
  let variants = [];
  try {
    // v6：mint 包 10s 硬上限（mintMaster 内另有 10s 去毒，见 §9）；主路 bunnytoken
    // 只需 bare，不依赖 HTML 腿；无 bare 时回落 /player/v2 老路。
    const rec = await withTimeout(mintMaster(durl, payload, bare), 15000, null);
    if (rec && rec.master) {
      variants = constructVariants(rec.master) || [];
      if (!variants.length) {
        try {
          const mr = await reqRaw(rec.master, { 'User-Agent': UA, 'Referer': durl || (HOST + '/') }, 8000);
          if (mr.status === 200 && mr.body && mr.body.indexOf('#EXTM3U') >= 0) {
            variants = parseMasterVariants(mr.body, rec.master);
          }
        } catch (e) { /* 分档失败不致命，回自适应 master */ }
      }
      // v4 自适应集：直接取 master 走代理（master 本身带 token；代理改写其 variant 行，
      // 播放器按带宽自选档位），不拆档。
      let signedVariant;
      if (wantAdaptive) {
        signedVariant = rec.master;
      } else {
        const want = variants.find((v) => v.height === wantHeight)
          || variants.find((v) => v.height === 1080)
          || variants.find((v) => v.height === 720);
        signedVariant = want ? want.url : rec.master;
        // parseMasterVariants 解析相对 URI 时会丢查询串（RFC 3986）：变体地址若无 token，补上 master 的查询串。
        if (signedVariant.indexOf('?') < 0 && rec.q) signedVariant += '?' + rec.q;
      }
      const proxied = proxyUrl(reqIn, '/proxy/m3u8', signedVariant, durl || (HOST + '/'), payload, bare);
      if (proxied) target = proxied;
      // v4 修 variants：v3 返回的是 parseMasterVariants 解析出的无 token 裸 CDN 地址
      // （相对 URI 丢查询串、又没补 rec.q），直接取双双 403，且是全仓唯一把 variants
      // 放进 play() 返回的源。改成每档走蜘蛛本地代理地址（与主 url 同款、带 payload），
      // 1080p 在前；App 若消费它拿到的是可播地址，若忽略它也无害。绝不返回无 token 的原始 CDN 地址。
      if (variants.length) {
        const proxiedVariants = variants
          .slice()
          .sort((a, b) => (b.height || 0) - (a.height || 0))
          .map((v) => {
            let sv = v.url;
            if (sv.indexOf('?') < 0 && rec.q) sv += '?' + rec.q;
            const pu = proxyUrl(reqIn, '/proxy/m3u8', sv, durl || (HOST + '/'), payload, bare);
            return pu ? { height: v.height, label: v.label, url: pu } : null;
          })
          .filter(Boolean);
        if (proxiedVariants.length) variants = proxiedVariants;
        else variants = [];
      }
    }
  } catch (e) { target = ''; }
  // v6：铸不出 master 即快败回诊断（parse:1 + 详情页），不再等字幕 race。
  if (!target) return playFail(durl, PLAY_DIAG_NO_MASTER);
  const result = { parse: 0, url: target, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  if (variants.length) result.variants = variants;
  // v5：字幕不再 await——1.5 秒 race，超时即不要字幕、先回地址（字幕是加分项，播放地址是主线；
  // subsP 后台继续跑，结果进 subResultCache 供后续点播用）。
  const subs = await Promise.race([subsP, sleep(1500).then(() => null)]);
  if (subs && subs.length) result.subs = subs;
  return result;
}

export default function createSpider() {
  return {
    meta: { key: 'py_javrate', name: 'JavRate', type: 3 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.get('/proxy/*', jrProxy);
      fastify.get('/proxy/m3u8', jrProxy);
      fastify.post('/search', search);
    },
  };
}
