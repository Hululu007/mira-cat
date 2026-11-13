// PimpBunny (py_pimpbunny)
// 站点: https://pimpbunny.com（用户点名）/ 官方镜像 https://pimpbunny.net
// 站方状态 (2026-11-13 VM 实测):
//   - pimpbunny.com 首页/分类/视频直链一律 403 + 1861 字节 Bunny Shield
//     PoW 挑战页（data-pow，须浏览器解 PoW 才能过；机房出口被拦）。
//     首页 meta 自述 .net 为 "the official PimpBunny Net mirror"，
//     详情页视频地址即指向 pimpbunny.com/videos/...，故蜘蛛走 .net
//     镜像取 HTML（VM 下 200），与 .com 同源同内容。
//   - 详情页唯一播放源: <video id="wpst-video"> 内单条或多条
//     <source src="https://pimpbunny.net/stream/...">
//     （两种 URL 形态：旧式 /stream/video.mp4?v=<base64>，新式
//     /stream/<base64>.mp4；base64 解开即
//     https://pimpbunny.com/videos/<slug>/）。
//     页内无 m3u8。下载按钮旁 "HD 1080p" 字样是外站广告
//     （rustydrawer.com），不是可验证的流清晰度。
//   - 档位核查（2026-11-13 实测，不编档位）：部分详情页（如 Kwini Kim）
//     有 4 条 <source>，label 分别为 1080p/720p/480p/360p，但 4 条
//     src 字节完全相同——站内"四档菜单"是同一 URL 的重复 label。
//     站源（.com 视频页，经 jina 诊断取文本）每部只有 1 个真实文件：
//     Abbie、Kwini 抽样均为单个 <hash>_720p.mp4（get_file 直链，
//     带 v-acctoken + rnd 参数）。故本站无真实多档可出：详情只给
//     一条"正片"，不把 1 条流展开成 4 档假菜单。
//   【v3 修正 2026-11-13 15:00：上一轮"单档"结论是错的——它只看了 .net
//     详情页的 <source>（确为同一 /stream URL 的假菜单）和 .com 页的
//     JSON-LD contentUrl（只有一条无 token 的 720p）。本轮实测 .com
//     视频页（/videos/<slug>/，经 jina 取 HTML）的 kt_player 内联配置
//     真有四档真文件（各档 hash 与 v-acctoken 均不同）：
//       video_url       = 360p（默认档）
//       video_alt_url   = 480p（文件名无后缀 .mp4）
//       video_alt_url2  = 720p
//       video_alt_url3  = 1080p
//     4 部抽样（Abbie/Kwini/Madiiitay/Anna）全有 360/480/720/1080p，
//     Madiiitay 另有 video_alt_url4 = 1440p。故 v3 起详情出真实档位
//     菜单（按档位数字降序，集名即档位），不再只出一条"正片"。】
//   - /stream/video.mp4 本身同样被 Bunny Shield 拦（VM 下 403 +
//     挑战页，换桌面 UA / video Accept / Referer=详情页 / Range /
//     Sec-Fetch-Dest: video / 带详情页 cookie 均无效；新式
//     /stream/<b64>.mp4 同样 403；.com 的 get_file 直链即使带
//     新鲜 v-acctoken，VM 下同样 403 0 字节——机房出口被拦与
//     token 无关）。即 VM 侧只能验到播放地址结构，拉不到首分片
//     字节；手机住宅出口是否过墙须真机定性（同 javrate
//     的 Bunny 墙先例：只拦机房出口、不拦手机）。
//   - 断点定位（2026-11-13，用户手机 Safari 站内自带播放能播，
//     App 内点播失败）：详情页 HTML 本身不走 Shield（VM 下 200，
//     页内无 shield 脚本、无 Set-Cookie），断点不在取页；断在播
//     放请求一步——Safari 以浏览器身份（Safari UA + Referer=详情
//     页 + Sec-Fetch-Dest: video + 浏览器 TLS 指纹）请求 /stream
//     能过，而 App 把裸 URL 交给原生播放器时请求上下文不同
//     （播放器自带 UA / 可能丢 Referer / 302 跳到 .com get_file
//     时头丢失），被 Shield 拦。蜘蛛侧修法（本文件 v2）：
//     ① play() 先用 HEAD（6s，maxRedirects:0）探 /stream 是否
//     302 到最终 get_file 直链，拿到就把最终地址 + Safari UA +
//     Referer=详情页直接交给播放器（与 Safari 跳转后的请求等价，
//     不再经过会丢头的跳转）；② 探不到（挑战页/超时/非 3xx）
//     则退回 parse:1，把详情页交给播放器嗅探（manko Upload18
//     同款做法），由 App 内浏览器环境复现 Safari 站内播放。
//     不解 PoW、不伪造凭证、不拿用户 cookie。
//   - 【v3 换思路 2026-11-13 15:00，Worker 腿实测已死——不要再走：
//     已部署的 sextb-hls v4 Worker（https://sextb-hls.li768435813.
//     workers.dev，其 /s 路由无宿主白名单、可当 Cloudflare 出口
//     探针）实测：/s 取 .net 详情页 200/67087 字节（探针本身工作，
//     CF 出口能取 .net HTML）；但 /s 取 /stream → 403 + 1861 字节
//     Bunny Shield 挑战页（与 VM 一字不差），/s 取带新鲜 token 的
//     get_file 720p → 403 0 字节（有无 token 同样死）。结论：
//     Cloudflare Workers 出口同样被 Bunny Shield 按机房 IP 拦，
//     Worker 侧整链代取 + 字节代理此站无解，故 v3 不写 pimpbunny
//     Worker、不推 Worker 腿。Railway 同为机房出口且用户禁播放
//     流量走 Railway，同样不走。jina 出口取 /stream 同样 403
//     （jina 只能取 HTML，不能代播）。
//     v3 新腿（jina 铸档位，手机直连播）2026-11-13 17:16 真机判死：
//     用户重导第二轮包后列表/分类/封面全能加载，点播直接"视频加
//     载失败"（立刻报错）。v3 的 token 前提是错的，见 v4 诊断。】
//   - 【v4 诊断 2026-11-13（R3 实测，纠正 v3 两处错误结论）：
//     (1) v3 称 token"不含 IP、不含过期戳、两次抓取字节相同、属稳
//     定铸造"是错的——它只解了 token 前半段。v-acctoken 解开实为
//     "<码率>|<站内 id>|0|<32 位 hex 签名>"（44/45 字节 ASCII）+
//     12 字节二进制尾；ASCII 前缀跨出口/跨时间全同，但二进制尾每
//     次新渲染都变：同一出口 15 秒两取即不同（VM1/VM2），jina
//     两次相同只是 jina 缓存了同一份页（rnd 相同、字节全同）。
//     尾部连续 10 次抓取约 40 秒不变（rnd 跨 39 秒），随后 VM
//     出口被 Shield 限流 403——尾部有效期以数十秒计，不是稳定值。
//     即 token 是"每次渲染现铸、有短有效期"的会话令牌，jina 缓
//     存页铸出的 token 到用户点播时早已过期 → 手机 403、立刻报
//     "视频加载失败"，与症状正对上。跨出口字节对比：jina 与 VM
//     直连同视频同档 token 前缀相同、尾部不同；CF 出口取 .com
//     页 403 Shield（取 .net 页仍 200），allorigins/codetabs
//     522、translate.goog 400，均不能当第三出口。
//     (2) v3 漏了另一半认证：.com 视频页每次回 Set-Cookie
//     bunny_shield_id_210144=<32 hex>（每次渲染值都不同），.net
//     详情页不设 cookie；Safari 站内播放时播放器请求自带该
//     cookie，蜘蛛 v3 只给了 URL+UA+Referer、没给 cookie。VM 侧
//     get_file 带同页 token+同页 cookie 用 curl 仍 403 0 字节
//     （VM 出口媒体层被拦，无法用 VM 直接验证令牌有效性；无
//     cookie 同样 403 0 字节，/stream 则回 1861 字节 Shield 页，
//     两者不是同一种 403）。结论：令牌是否绑 IP 仍无法在 VM 侧
//     直接证实，但"jina 铸 token + 无 cookie"这条路已被真机判
//     死，不再走。
//     v4 修法（与同批 yesporn 的"点播时重铸令牌"同款做法，
//     yesporn 注释：令牌按取详情页时的出口 IP 铸造，点播瞬间重
//     取详情页现铸才有效）：① detail() 改为手机端直连取 .com
//     页（不再走 jina 铸档位），现铸档位菜单 + 抓 Set-Cookie，
//     集串带上 cookie（pbplay:<详情页>|<.com 视频页>|<某档直链>
//     |<cookie>）；直连失败才退回 jina 取档位名（无 cookie 的
//     jina 令牌不再直接交给播放器）。② play() 点播时重铸：重取
//     .com 页按集名/文件名现铸同档新令牌 + 新 cookie 交播放器
//     （6 秒超时，单次）；重铸失败回落详情时刻铸好的令牌 +
//     cookie；再失败回落 parse:1 嗅探 .com 视频页（App 内浏览
//     器复现 Safari 站内播放，不再嗅探 .net 详情页——v2 的
//     parse:1 嗅 .net 已真机证死，其 <video> 走 /stream 是另一
//     条被 Shield 拦的路）。③ 直连 .com 页在 VM 下时通时断
//     （连续快取 10 次后 Shield 限流 403，过后恢复），故每条腿
//     都有失败回落，不把单腿当必通。】
//   - 【v5 诊断 2026-11-13（R4 实测：20:21 用户报四栏全"暂无数据"，
//     不是 v4 回归）：① v3→v4 diff：getText/parseList/listUrl/
//     category/home/search 一字未动，只改了 detail/play 与档位
//     helper，列表路径在代码上不可能因 v4 变空；② harness 定向
//     对照：v3 与 v4 的 home/最新 p1p2/分类/标签/模特/搜索/详情
//     点播全通、errors 均为 0，内容完全一致；③ 站方现态：.net
//     首页/分类/标签/模特页 VM 下全 200、无 Shield，每页 20 条
//     article、解析正则全中；④ 线上基线：蜘蛛 blob 108a875d 即
//     v4、router 已注册、dist md5 256ecca4 与构建提交 3655c923
//     的 dist 字节一致。结论：20:21 的全空是当时那一刻 .net
//     直连在手机出口上取不到页（Shield/限流/代理抖动之类的瞬
//     态），不是代码回归；但 v4 之前列表腿是单腿直连（getText
//     20 秒，空了就空），没有任何回落，一次瞬态就全栏皆空。
//     v5 修法：列表腿改直连 + jina 双腿（getListHtml，直连
//     10 秒、空了换 jina 10 秒取同一页原 HTML、仍空才认空；
//     jina 腿 2026-11-13 实测 /anal/ 页 200/64062 字节/20 条，
//     与直连同构；最坏总耗时 20 秒，与原来单腿 20 秒持平）。
//     detail() 的 .net 取页刻意不动（已有档位双腿兜底，动它
//     只加最坏耗时，不治列表的病）。】
//   - 列表分页必须带 ?filter=latest：默认排序首页 30 条/页、翻页在边界
//     处重复 1-2 条（anal p1/p2、home p1/p2/p3 实测）；带 filter=latest
//     后一律 20 条/页，p1/p2 零重叠（anal、home、tag、search 实测）。
//   - 封面为站内 wp-content/uploads 真 JPEG（实测 200，444KB）。
// 分类呈现（用户 2026-11-13 长期规矩）：顶级分类 + 筛选卡片，不平铺。
//   - 分类：/categories/ 页实测 20 个（单页、无翻页），全量入卡。
//   - 标签：站内 1652 个（/tags/ 页），取 219 部抽样中频次最高的
//     41 个（已剔除与分类重复的 slug 与 onlyfans-*/private-sex-tape
//     等无区分度通用标签）；显示名由 slug 还原。
//   - 模特：站内 /actors/ 93 页，取 219 部抽样中频次最高的 29 个
//     （harness 验出 Bougie 无演员页、已剔除；其余 29 个均有量）。
//   - 演员页规范地址为 /actor/<slug>/（/?actors=<slug> 会 301 到它）。
// 字幕：无番号，不接字幕芯。219 部抽样标题（首页/分类/搜索/标签/
//   演员）用 JAV 番号正则全扫为 0 命中——本站是 OnlyFans 泄露站，
//   标题为英文描述，无番号形态；按用户 2026-11-04 口径"无番号不接"。
//   （主线 sextb.js 的尾码优先 subLangOf 已实读核对，与存档一致，
//   但本站无码可查，接芯只会给每次点播加最多 6s 空搜，故不接。）
import req from '../../util/req.js';

const KEY = 'py_pimpbunny';
const NAME = 'PimpBunny';
const SITE = 'https://pimpbunny.net';
const COM = 'https://pimpbunny.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 20;

// 分类卡片：/categories/ 页实测 20 个（2026-11-13）。
const CAT_CARDS = [
  { n: '4K', v: '4k' },
  { n: 'Anal', v: 'anal' },
  { n: 'Asian', v: 'asian' },
  { n: 'BBC', v: 'bbc' },
  { n: 'BDSM', v: 'bdsm' },
  { n: 'Big Ass', v: 'big-ass' },
  { n: 'Big Boobs', v: 'big-boobs' },
  { n: 'Bizarre', v: 'bizarre' },
  { n: 'Blowjob', v: 'blowjob' },
  { n: 'Bunnies', v: 'bunnies' },
  { n: 'Cosplay', v: 'cosplay' },
  { n: 'Cosplayer', v: 'cosplayer' },
  { n: 'Deep Throat', v: 'deep-throat' },
  { n: 'Double Penetration', v: 'double-penetration' },
  { n: 'Exclusive', v: 'exclusive' },
  { n: 'Feet', v: 'feet' },
  { n: 'Fetish', v: 'fetish' },
  { n: 'Japanese', v: 'japanese' },
  { n: 'Latina', v: 'latina' },
  { n: 'Lesbian', v: 'lesbian' },
];

// 标签卡片：219 部抽样中频次最高的 40 个（已剔除与分类重复及通用标签）。
const TAG_CARDS = [
  { n: 'Doggy Style', v: 'doggy-style' },
  { n: 'Tattoos', v: 'tattoos' },
  { n: 'Ass', v: 'ass' },
  { n: 'POV Blowjob', v: 'pov-blowjob' },
  { n: 'Missionary', v: 'missionary' },
  { n: 'Pussy Play', v: 'pussy-play' },
  { n: 'Pussy Rubbing', v: 'pussy-rubbing' },
  { n: 'Cute', v: 'cute' },
  { n: 'Natural Body', v: 'natural-body' },
  { n: 'Dildo Riding', v: 'dildo-riding' },
  { n: 'Solo Masturbation', v: 'solo-masturbation' },
  { n: 'Brunette', v: 'brunette' },
  { n: 'Natural Tits', v: 'natural-tits' },
  { n: 'Anal Dildoing', v: 'anal-dildoing' },
  { n: 'Butt Plug', v: 'butt-plug' },
  { n: 'Big Tits', v: 'big-tits' },
  { n: 'Anal Creampie', v: 'anal-creampie' },
  { n: 'Solo Dildo', v: 'solo-dildo' },
  { n: 'BWC', v: 'bwc' },
  { n: 'Cowgirl', v: 'cowgirl' },
  { n: 'Anal Play', v: 'anal-play' },
  { n: 'Blonde', v: 'blonde' },
  { n: 'Solo Girl', v: 'solo-girl' },
  { n: 'Reverse Cowgirl', v: 'reverse-cowgirl' },
  { n: 'Shaved Pussy', v: 'shaved-pussy' },
  { n: 'Fingering', v: 'fingering' },
  { n: 'Amateur', v: 'amateur' },
  { n: 'Anal Plug', v: 'anal-plug' },
  { n: 'POV Anal', v: 'pov-anal' },
  { n: 'Pink Pussy', v: 'pink-pussy' },
  { n: 'Cumshot', v: 'cumshot' },
  { n: 'Petite', v: 'petite' },
  { n: 'Big Lips', v: 'big-lips' },
  { n: 'Small Tits', v: 'small-tits' },
  { n: 'Big Pussy', v: 'big-pussy' },
  { n: 'Dick Riding', v: 'dick-riding' },
  { n: 'Anal Masturbation', v: 'anal-masturbation' },
  { n: 'Cum', v: 'cum' },
  { n: 'Side Fuck', v: 'side-fuck' },
  { n: 'Big Cock', v: 'big-cock' },
  { n: 'Anal Solo', v: 'anal-solo' },
];

// 模特卡片：219 部抽样中频次最高的 30 个；显示名为 slug 还原。
const ACTOR_CARDS = [
  { n: 'Abbie Sykes', v: 'abbie-sykes' },
  { n: 'Missslily', v: 'missslily' },
  { n: 'Dredd', v: 'dredd' },
  { n: 'Anna Ralphs', v: 'anna-ralphs' },
  { n: 'Devon Jenelle', v: 'devon-jenelle' },
  { n: 'Rusitaok', v: 'rusitaok' },
  { n: 'Angela White', v: 'angela-white' },
  { n: 'Daria Angel', v: 'daria-angel' },
  { n: 'Vivienne Vo', v: 'vivienne-vo' },
  { n: 'Kwini Kim', v: 'kwini-kim' },
  { n: 'PanteraNika', v: 'panteranika' },
  { n: 'Little Tina', v: 'little-tina' },
  { n: 'Skylar Vox', v: 'skylar-vox' },
  { n: 'Aluraye', v: 'aluraye' },
  { n: 'Lola Rose', v: 'lola-rose' },
  { n: 'Myelliqueen', v: 'myelliqueen' },
  { n: 'Purple Bitch', v: 'purple-bitch' },
  { n: 'Taylor Banks', v: 'taylor-banks' },
  { n: 'Cherry Apricot', v: 'cherry-apricot' },
  { n: 'Eden Ivy', v: 'eden-ivy' },
  { n: 'Lulu Wild', v: 'lulu-wild' },
  { n: 'Agatha Vega', v: 'agatha-vega' },
  { n: 'Lilwaifulia', v: 'lilwaifulia' },
  { n: 'Madiiitay', v: 'madiiitay' },
  { n: 'Elle Brooke', v: 'elle-brooke' },
  { n: 'Xxxmilamonet', v: 'xxxmilamonet' },
  { n: 'Poetryandcherry', v: 'poetryandcherry' },
  { n: 'Eimi Girl', v: 'eimi-girl' },
  { n: 'Gabbie Carter', v: 'gabbie-carter' },
];

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return SITE + u;
  if (/^https?:\/\//i.test(u)) return u;
  return SITE + '/' + u;
}

// Bunny Shield 挑战页：1861 字节 "Establishing a secure connection"。
function isShield(html) {
  if (!html || typeof html !== 'string') return true;
  if (html.length < 2000) return true;
  if (html.indexOf('bunny-shield') >= 0) return true;
  if (/Establishing a secure connection/i.test(html.slice(0, 3000))) return true;
  return false;
}

async function getText(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: timeoutMs || 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const txt = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    if (!txt || isShield(txt)) return '';
    return txt;
  } catch (e) {
    return '';
  }
}

// v5：列表取页（category/search 共用）：直连 .net 10 秒，空了换
// jina 取同一页（x-respond-with: html 回原 HTML，jina 10 秒），
// 仍空才认空。R4 之前列表是单腿直连，.net 在手机出口上一次瞬态
// 取不到页（Shield/限流/代理抖动）就四栏全空；jina 换出口可绕
// 过出口侧的拦。最坏总耗时 20 秒，与原来单腿 20 秒持平，不叠加
// 重试。jina 免费腿有 429 可能、且会缓存页（列表缓存几分钟可接
// 受）；jina 也空时返回 ''，调用方原样出空列表，不编造内容。
async function getListHtml(url) {
  const direct = await getText(url, 10000);
  if (direct) return direct;
  try {
    const r = await req.get('https://r.jina.ai/' + url, {
      headers: { 'User-Agent': UA, 'x-respond-with': 'html', 'Accept': 'text/html,*/*' },
      timeout: 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : '';
    if (!html || isShield(html)) return '';
    return html;
  } catch (e) {
    return '';
  }
}

// 列表卡片：<article class="thumb-block ...">...</article>
//   <a href="<详情 URL>" title="<标题>">
//   <img src="<封面>"> ... <span class="duration">MM:SS</span>
// 只取主循环 article，忽略导航/侧栏/页脚链接。
function parseList(html) {
  const list = [];
  if (!html) return list;
  const re = /<article[^>]*class="thumb-block[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const seg = m[1];
    const href = seg.match(/<a\s+href="([^"]+)"/);
    const title = seg.match(/<span\s+class="title">([^<]+)<\/span>/);
    if (!href || !title) continue;
    const id = fixUrl(href[1]);
    const name = clean(title[1]);
    if (!id || !name) continue;
    const img = seg.match(/<img[^>]*src="([^"]+)"/);
    const dur = seg.match(/class="duration"[^>]*>([^<]+)</);
    list.push({
      vod_id: id,
      vod_name: name,
      vod_pic: img ? fixUrl(img[1]) : '',
      vod_remarks: dur ? t(dur[1]) : '',
    });
  }
  return list;
}

// 页数：取分页区 /page/N/ 的最大值（Last 链接或数字链接均可）；
// 无分页链接时：满页则未知（page+1），不满页即最后一页。
function parsePagecount(html, page, listLen) {
  let max = 0;
  if (html) {
    const re = /\/page\/(\d+)\//g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  if (max >= page) return max;
  return listLen >= PAGE_SIZE ? page + 1 : page;
}

function listResult(html, page) {
  const list = parseList(html);
  return {
    page,
    pagecount: parsePagecount(html, page, list.length),
    limit: list.length || PAGE_SIZE,
    total: 0,
    list,
  };
}

function listUrl(base, page) {
  if (page <= 1) return base + '?filter=latest';
  return base + 'page/' + page + '/?filter=latest';
}

function isoDurToStr(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const d = parseInt(m[1] || '0', 10);
  const h = parseInt(m[2] || '0', 10) + d * 24;
  const mi = parseInt(m[3] || '0', 10);
  const s = parseInt(m[4] || '0', 10);
  const total = h * 3600 + mi * 60 + s;
  if (total <= 0) return '';
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const mms = hh > 0 ? String(mm).padStart(2, '0') : String(mm);
  const sss = String(ss).padStart(2, '0');
  return hh > 0 ? hh + ':' + mms + ':' + sss : mms + ':' + sss;
}

async function init() {
  return {};
}

async function home() {
  return {
    class: [
      { type_id: 'latest', type_name: '最新' },
      { type_id: 'cats', type_name: '分类' },
      { type_id: 'tags', type_name: '标签' },
      { type_id: 'actors', type_name: '模特' },
    ],
    filters: {
      cats: [{ key: 'sub', name: '分类', value: CAT_CARDS }],
      tags: [{ key: 'sub', name: '标签', value: TAG_CARDS }],
      actors: [{ key: 'sub', name: '模特', value: ACTOR_CARDS }],
    },
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const id = String(body.id || 'latest');
  const extend = body.filters || body.extend || {};
  const sub = String(extend.sub || '');
  let base = '';
  if (id === 'latest') base = SITE + '/';
  else if (id === 'cats') base = SITE + '/' + (sub || CAT_CARDS[0].v) + '/';
  else if (id === 'tags') base = SITE + '/tag/' + (sub || TAG_CARDS[0].v) + '/';
  else if (id === 'actors') base = SITE + '/actor/' + (sub || ACTOR_CARDS[0].v) + '/';
  else return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const html = await getListHtml(listUrl(base, page));
  return listResult(html, page);
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = Array.isArray(body.id) ? body.id[0] : body.id;
  const id = t(raw);
  if (!id) return { list: [] };
  const url = /^https?:\/\//i.test(id) ? id : SITE + '/' + id.replace(/^\/+/, '') + '/';
  const html = await getText(url);
  if (!html) return { list: [] };
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name = h1 ? clean(h1[1]) : '';
  if (!name) return { list: [] };
  // 播放源：<video id="wpst-video"> 块内全部 <source>；多档页的 4 条
  // label（1080p/720p/480p/360p）src 字节相同，去重后只剩 1 条
  // 真实流（见文件头档位核查），故 .net 页本身只给一条 /stream；
  // 真实档位菜单在 .com 视频页的 kt_player 配置里，v4 由
  // fetchLadderDirect() 直连现铸（失败退回 fetchLadderJina()，见下）。
  // 集串同时带详情页与直链，供 play() 先解析、后嗅探。
  const vBlock = html.match(/<video[^>]*id="wpst-video"[^>]*>([\s\S]*?)<\/video>/)
    || html.match(/<video[^>]*>([\s\S]*?)<\/video>/);
  const srcs = [];
  if (vBlock) {
    const re = /<source[^>]*src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(vBlock[1])) !== null) {
      const u = fixUrl(m[1]);
      if (u && srcs.indexOf(u) < 0) srcs.push(u);
    }
  }
  let stream = srcs[0] || '';
  if (!stream) {
    const src = html.match(/<source[^>]*src="([^"]+stream\/video\.mp4[^"]*)"/)
      || html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/);
    if (src) stream = fixUrl(src[1]);
  }
  if (!stream) return { list: [] };
  const poster = html.match(/<video[^>]*poster="([^"]+)"/)
    || html.match(/property="og:image"\s+content="([^"]+)"/);
  const durMeta = html.match(/itemprop="duration"\s+content="([^"]+)"/);
  const desc = html.match(/<meta\s+itemprop="description"\s+content="([^"]+)"/);
  // v4：手机端现铸档位。先直连取 .com 视频页（现铸档位 + 抓会话
  // cookie），成功则出真实档位菜单（集串四段：
  // pbplay:<.net 详情页>|<.com 视频页>|<某档 get_file 直链>|<cookie>，
  // play() 点播时重铸，铸不到回落此令牌）；直连失败退回 jina 只取
  // 档位名（集串 cookie 段为空，play() 不直接交 jina 令牌）；
  // 两腿都失败则退回 v2 单"正片"集串（附 .com 视频页供 play()
  // 嗅探用）。
  let playUrl = '正片$pbplay:' + url + '|' + stream;
  const comVideo = comVideoFromStream(stream);
  if (comVideo) {
    let got = await fetchLadderDirect(comVideo);
    if (!got.ladder.length) got = await fetchLadderJina(comVideo);
    if (got.ladder.length) {
      playUrl = got.ladder.map((q) => q.label + '$pbplay:' + url + '|' + comVideo + '|' + q.url + '|' + (got.cookie || '')).join('#');
    } else {
      playUrl = '正片$pbplay:' + url + '|' + stream + '|' + comVideo;
    }
  }
  return {
    list: [{
      vod_id: url,
      vod_name: name,
      vod_pic: poster ? fixUrl(poster[1]) : '',
      vod_content: desc ? clean(desc[1]).slice(0, 200) : '',
      vod_remarks: durMeta ? isoDurToStr(durMeta[1]) : '',
      vod_play_from: NAME,
      vod_play_url: playUrl,
    }],
  };
}

// ---------- v4：手机端现铸档位（直连优先，jina 只取档位名） ----------
// /stream URL 内 base64 解开即 .com 视频页地址（新旧两种形态通用）。
function b64decode(s) {
  try {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64').toString('utf8');
  } catch (e) { return ''; }
}

function comVideoFromStream(stream) {
  try {
    const u = new URL(stream);
    let b64 = '';
    if (u.pathname === '/stream/video.mp4') b64 = u.searchParams.get('v') || '';
    else if (u.pathname.indexOf('/stream/') === 0) b64 = u.pathname.split('/').pop().replace(/\.mp4$/i, '');
    const dec = b64decode(b64);
    if (/^https:\/\/pimpbunny\.com\/videos\/[^/]+\/$/.test(dec)) return dec;
  } catch (e) { /* 不是可解的 /stream 形态 */ }
  return '';
}

// ---------- v4：手机端现铸档位（直连优先，jina 只取档位名） ----------

// 取 .com 视频页：回 { html, cookie }。cookie 取法与同批 yesporn 的
// getPage 同款（anysex/yesporn 的播放地址必须带详情页会话 cookie
// 才能取到 200，无 cookie 一律 410/403；本站 .com 页每次回
// Set-Cookie bunny_shield_id_210144，.net 页不设 cookie）。
// 注意不用 isShield() 判页：真页正文里也含 'bunny-shield' 字样，
// 判页只看解析出的档位（parseLadder 为空即失败），Shield 挑战页
// 本身无 kt_player 配置，自然落空。
async function getComPage(url, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': COM + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: timeoutMs || 6000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
    let cookies = [];
    if (r && r.headers) {
      const sc = r.headers['set-cookie'] || r.headers['Set-Cookie'];
      if (Array.isArray(sc)) cookies = sc;
      else if (typeof sc === 'string' && sc) cookies = [sc];
      else if (typeof r.headers.getSetCookie === 'function') {
        try { cookies = r.headers.getSetCookie(); } catch (e) { /* 忽略 */ }
      }
    }
    const cookie = (cookies || []).map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
    return { html, cookie };
  } catch (e) {
    return { html: '', cookie: '' };
  }
}

// 解析 kt_player 内联配置的档位菜单：
//   video_url: '<360p 直链>'（+ video_url_text: '360p'）
//   video_alt_url[N]: '<高档直链>'（+ video_alt_url[N]_text: '720p' 等）
// 只收带 v-acctoken 的 pimpbunny.com/get_file/ 直链，按档位数字降序。
// token 原样透传，不截不断（v-acctoken 解开是 ASCII 前缀 + 12 字节
// 二进制尾，截掉尾部即废令牌）。
function parseLadder(html) {
  if (!html || html.indexOf('video_url:') < 0 || html.indexOf('get_file/') < 0) return [];
  const texts = {};
  const tre = /(video_url|video_alt_url\d*)_text\s*:\s*'([^']+)'/g;
  let tm;
  while ((tm = tre.exec(html)) !== null) texts[tm[1]] = tm[2];
  const out = [];
  const seen = new Set();
  const ure = /(video_url|video_alt_url\d*)\s*:\s*'([^']+)'/g;
  let um;
  while ((um = ure.exec(html)) !== null) {
    const furl = um[2];
    if (!/^https:\/\/pimpbunny\.com\/get_file\/[^']*v-acctoken=[A-Za-z0-9%_-]+/.test(furl)) continue;
    if (seen.has(furl)) continue;
    seen.add(furl);
    const label = texts[um[1]] || '';
    const num = parseInt((label.match(/(\d+)/) || [])[1] || '0', 10) || 0;
    out.push({ label: label || (num ? num + 'p' : '正片'), num, url: furl });
  }
  out.sort((a, b) => b.num - a.num);
  return out;
}

// 直连取 .com 视频页现铸档位（手机端出口 + 当次会话 cookie，令牌
// 与 cookie 同次渲染才配对）。失败返回空档位，调用方退回 jina。
async function fetchLadderDirect(comVideo) {
  const pg = await getComPage(comVideo, 6000);
  const ladder = parseLadder(pg.html);
  if (!ladder.length) return { ladder: [], cookie: '' };
  return { ladder, cookie: pg.cookie };
}

// jina 取 .com 视频页（只取档位名/集名，令牌是 jina 缓存页铸的旧
// 令牌——有效期数十秒，到点播时已过期，绝不直接交给播放器；
// play() 会现铸，铸不到则走 parse:1 嗅探 .com 页）。
async function fetchLadderJina(comVideo) {
  try {
    const r = await req.get('https://r.jina.ai/' + comVideo, {
      headers: { 'User-Agent': UA, 'x-respond-with': 'html', 'Accept': 'text/html,*/*' },
      timeout: 8000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    const data = r && r.data;
    const html = typeof data === 'string' ? data : '';
    return { ladder: parseLadder(html), cookie: '' };
  } catch (e) {
    return { ladder: [], cookie: '' };
  }
}

function fileTail(url) {
  try {
    const u = new URL(String(url || ''));
    const base = u.pathname.split('/').filter(Boolean).pop() || '';
    return base;
  } catch (e) { return ''; }
}

// 点播时重铸（yesporn 同款）：点播瞬间重取 .com 页，用点播时的出
// 口 IP + 同会话 cookie 现铸同档新令牌。先按集名（档位，如 1080p）
// 找，再按文件名找（详情时刻的直链文件名与重铸后相同：同视频同档
// 文件路径不变，只换 token 尾部），再按档位数字找。找不到或取页
// 失败返回 null，调用方回落详情时刻的令牌/嗅探线。单次 6 秒超时，
// 不重试。
async function remintLadder(comVideo, label, fileUrl) {
  try {
    const pg = await getComPage(comVideo, 6000);
    const ladder = parseLadder(pg.html);
    if (!ladder.length) return null;
    const tail = fileTail(fileUrl);
    const num = parseInt((String(label || '').match(/(\d+)/) || [])[1] || '0', 10) || 0;
    const hit = (label && ladder.find((q) => q.label === label))
      || (tail && ladder.find((q) => fileTail(q.url) === tail))
      || (num && ladder.find((q) => q.num === num));
    if (!hit) return null;
    return { url: hit.url, cookie: pg.cookie, label: hit.label };
  } catch (e) {
    return null;
  }
}

// /stream 是代理：站内播放时它应 302 到 .com get_file 真实文件。
// 用 HEAD（不拉 body）+ maxRedirects:0 只读跳转目标；拿到最终地址
// 就交给播放器直连（等价于 Safari 跳转后的那次请求，不再经过会
// 丢头的跳转）。任何失败（挑战页/超时/非 3xx/无 Location）都返回
// ''，由 play() 退回 parse:1 嗅探线。本地已验：axios 1.6.7
// maxRedirects:0 + validateStatus 恒真时 302 响应可正常返回，
// headers.location 完整。
async function resolveFinal(stream, referer) {
  try {
    const r = await req.head(stream, {
      headers: { 'User-Agent': UA, 'Referer': referer || SITE + '/' },
      timeout: 6000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const loc = r && r.headers && (r.headers.location || r.headers.Location);
    if (r && r.status >= 300 && r.status < 400 && loc) {
      const u = new URL(String(loc), stream).href;
      if (/^https?:\/\//i.test(u)) return u;
    }
  } catch (e) { /* 解析失败即退回嗅探线 */ }
  return '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(Array.isArray(body.id) ? body.id[0] : body.id || '');
  if (!id) return { parse: 0, url: '' };
  const dollar = id.indexOf('$');
  const label = dollar >= 0 ? id.slice(0, dollar).trim() : '';
  if (dollar >= 0) id = id.slice(dollar + 1).trim();
  // 集串形态：
  //   档位（v4）：pbplay:<详情页>|<.com 视频页>|<某档 get_file 直链>|<cookie>
  //   档位（v3 遗留）：pbplay:<详情页>|<.com 视频页>|<某档 get_file 直链>
  //     （无 cookie 段，按 jina 令牌处理：重铸，铸不到走嗅探）
  //   单"正片"（v2）：pbplay:<详情页>|</stream> 或
  //     pbplay:<详情页>|</stream>|<.com 视频页>
  if (id.indexOf('pbplay:') === 0) {
    const rest = id.slice('pbplay:'.length);
    const parts = rest.split('|');
    // v4/v3 档位集串：parts[2] 是 get_file 直链。
    if (parts.length >= 3 && /^https:\/\/pimpbunny\.com\/get_file\//.test(parts[2])) {
      const detailUrl = parts[0] || '';
      const comVideo = parts[1] || '';
      const fileUrl = parts[2];
      const cookie = parts[3] || '';
      // 腿 1：点播时重铸（yesporn 同款）——重取 .com 页按集名现铸
      // 同档新令牌 + 新 cookie，6 秒超时。
      if (comVideo) {
        const fresh = await remintLadder(comVideo, label, fileUrl);
        if (fresh) {
          const header = { 'User-Agent': UA, 'Referer': comVideo };
          if (fresh.cookie) header.Cookie = fresh.cookie;
          return { parse: 0, url: fresh.url, header };
        }
      }
      // 腿 2：重铸失败，回落详情时刻铸好的令牌 + cookie（仅当集串
      // 带 cookie，即直连现铸；jina 集串无 cookie，不走这条）。
      if (fileUrl && cookie) {
        return {
          parse: 0,
          url: fileUrl,
          header: { 'User-Agent': UA, 'Referer': comVideo || COM + '/', 'Cookie': cookie },
        };
      }
      // 腿 3：无可用令牌（jina 旧令牌已过期，不直接交）→ 把 .com
      // 视频页交给播放器嗅探，由 App 内浏览器环境复现 Safari 站内
      // 播放（manko Upload18 同款 parse:1 做法；不解 PoW、不伪造
      // 凭证）。v2 嗅 .net 详情页已真机证死，不再嗅 .net。
      if (comVideo) {
        return {
          parse: 1,
          url: comVideo,
          header: { 'User-Agent': UA, 'Referer': SITE + '/' },
        };
      }
      if (detailUrl) {
        return {
          parse: 1,
          url: detailUrl,
          header: { 'User-Agent': UA, 'Referer': SITE + '/' },
        };
      }
      return { parse: 0, url: '' };
    }
    const detailUrl = parts[0] || '';
    const stream = parts[1] || '';
    const comVideo = parts[2] || '';
    // v2 单"正片"：腿 1 解析出最终文件地址，直接交给播放器
    // （Safari UA + Referer=详情页，与 Safari 跳转后的请求等价）。
    if (stream) {
      const final = await resolveFinal(stream, detailUrl);
      if (final) {
        return {
          parse: 0,
          url: final,
          header: { 'User-Agent': UA, 'Referer': detailUrl },
        };
      }
    }
    // 腿 2：解析不到（挑战页/超时）→ 嗅探 .com 视频页（v4 改：不
    // 再嗅 .net 详情页），无 .com 地址才嗅 .net 详情页。
    if (comVideo) {
      return {
        parse: 1,
        url: comVideo,
        header: { 'User-Agent': UA, 'Referer': SITE + '/' },
      };
    }
    if (detailUrl) {
      return {
        parse: 1,
        url: detailUrl,
        header: { 'User-Agent': UA, 'Referer': SITE + '/' },
      };
    }
    return { parse: 0, url: '' };
  }
  // 裸 get_file 直链（v3 档位 URL 被直接点播时）→ 直接交播放器。
  if (/^https:\/\/pimpbunny\.com\/get_file\//i.test(id)) {
    return {
      parse: 0,
      url: id,
      header: { 'User-Agent': UA, 'Referer': COM + '/' },
    };
  }
  // 旧缓存集串：裸 /stream 直链 → 老行为原样直出。
  if (/^https?:\/\//i.test(id) && /\/stream\//i.test(id)) {
    return {
      parse: 0,
      url: id,
      header: { 'User-Agent': UA, 'Referer': SITE + '/' },
    };
  }
  // 裸详情页 → 嗅探线。
  if (/^https?:\/\/pimpbunny\.net\//i.test(id)) {
    return {
      parse: 1,
      url: id,
      header: { 'User-Agent': UA, 'Referer': SITE + '/' },
    };
  }
  return { parse: 0, url: '' };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  const q = encodeURIComponent(wd);
  const url = page <= 1 ? SITE + '/?s=' + q : SITE + '/page/' + page + '/?s=' + q;
  const html = await getListHtml(url);
  // 无命中时站方仍会渲染 20 条推荐视频（与主循环同形），须以计数为准：
  // <span class="search-video-number">0 video found</span> 即空结果。
  if (html && /search-video-number">\s*0\s+video/i.test(html)) {
    return { page, pagecount: page, limit: 0, total: 0, list: [] };
  }
  const res = listResult(html, page);
  const totalM = html && html.match(/search-video-number">\s*([\d,]+)\s+videos?\s+found/i);
  if (totalM) {
    const total = parseInt(totalM[1].replace(/,/g, ''), 10) || 0;
    res.total = total;
    res.pagecount = Math.max(page, Math.ceil(total / PAGE_SIZE));
  }
  return res;
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
