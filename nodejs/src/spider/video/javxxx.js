// javxxx.me — MiraPlayer 猫源蜘蛛（完整版，未并入仓库，仅供审阅/测试）
// 结论：能写。播放链路已全程实测打通（见 javxxx_attack.md）。
// 链路：详情页 data-ts-live/data-ts-id
//   → dex(tsId, tsLive, '_0x48107a') 得 token
//   → POST https://www.javxxx.me/api/play/ {sources, ep:1, ver:2}
//   → dex(tsId, resp.data, 'undefined') 得 embed 地址
//   → 取 embed 页 data-config
//   → seed = b64(path+query).slice(6,22)，dex(seed, config, '_0x59a0e4') 得 {src,img,vtt}
//   → b64解 src 得 [{file: streamtape mp4, type:'mp4', label:'auto'}]
// 注意：
//  - 最终是 streamtape 单个 mp4 文件（单档，无多清晰度，不要硬编 1080p/720p）。
//  - streamtape 链接带 ip 绑定 + 约 19.5 小时过期，必须在 play() 里现取现播，
//    不要在 detail() 里提前解好缓存（detail 只存详情页地址）。
//  - 主 embed 失败时按 reserve 备用地址顺序重试（lo: de/nl/cf/nl3/de3/fr）。
//  - /api/play/ 从 VM 实测 HTTP 200（与 bestjavporn 的 POST 全死不同），
//    但最终 streamtape 取片在 VM 因出口 IP 与请求 IP 不一致被拒（500），
//    手机上 App 内同一 IP 走完全程，预期可播，须真机验证。
//  - v2（2026-11-11）：站方质询收紧后直连重试已无意义，取数改多腿并行竞速
//    （Worker + 直连 + fetch + jina，见 getHtml/fetchPage），主腿是待部署的
//    javxxx-fetch Worker（代码见 javxxx-fetch-worker.js，用户自行部署）；
//    Worker 未部署时行为与 v1 一致（直连重试），部署后无需重推即生效。
//  - v3（2026-11-11）：v2 的并行竞速在手机上翻车——jina 腿常比 Worker 腿先赢，
//    mdToListHtml 把 Markdown 转出假条目（封面文件名当标题、语言旗当封面、
//    封面地址当详情地址），列表 1-4 条全假、点开播不了、最新全空。改两段式：
//    HTML 腿先行竞速、全部落败才走 jina 兜底；mdToListHtml 加严校验（详情地址
//    只认 javxxx.me 的 /video/<slug>/、标题/封面白名单），垃圾宁可返回空；
//    parseList 封面改显式取 data-lazy-src（站方新上懒加载，主 img src 是
//    data: 空占位）。解析、dex 链、字幕芯未动。
//  - v4（2026-11-11）：换思路——列表解析搬到服务端。v3 在手机上全空，
//    实测坐实 Worker 上游取页按出口 IP 信誉判定（curl 16/16 通、Node 10/10
//    被拦，机房不同出口不同），App 端多腿竞速 + HTML 解析已无意义。
//    新架构：列表（首页/分类/搜索）只发一个 GET 到 Worker /j/list，
//    服务端解析后回 JSON，App 里不再竞速、不再解析 HTML、不走 jina；
//    详情走 /j/detail 取名/图/简介（失败回落 /f/ 原样取页）；
//    播放链（dex、/api/play/、embed）与字幕芯一字未动。
//    Worker 未部署 v2 或上游被拦时列表回空、不出假条目。
//  - v5（2026-11-13）：v4 的两条 Worker 主腿在手机上全死——实测坐实是“谁去取页”：
//    已部署 Worker v2 的 /j/list、/f/ 在 CF 边缘撞挑战（502 challenge / 403 Just a moment），
//    且结果按调用方网络路径决定（curl 18/18 通、node 0/14 被拦、UA 无关）；
//    站方为 WordPress + CF APO，/wp-json 需登录、/feed 回首页、/sitemap 被拦、
//    /api/play/ GET 回 405（API 墙与 HTML 墙不同，可通）。
//    破局点：jina（自有出口）回完整 HTML——列表含 data-lazy-src 封面，
//    详情含 data-ts-live/data-ts-id（与上游逐字一致），embed 页含 data-config；
//    且实测坐实视频直链绑 embed 取页方 IP（jina 取与 Worker 取的 data-config
//    解出不同 ip/token），故 embed 必须由 Worker 上游直取、直链必须由 Worker 代理。
//    视频宿主不止 streamtape：DASS-027 实测四条 embed 分别是 pianopic HLS、
//    streamhls HLS、cloudatacdn 1080p mp4，且三者皆 IP 绑定（换 Referer 仍 403）。
//    新架构：Worker v3（javxxx-fetch-worker-v3.js，用户部署）：
//      /j/list、/j/detail：上游直取 → jina HTML（Markdown 第二回落）；
//      /resolve：Worker 内全链解析（详情→token→/api/play/→embed 上游→直链），
//        HLS（.m3u8/type=hls）回本站 /h 改写代理地址，单文件回本站 /v 代理地址
//        （仅白名单宿主：streamtape、pianopic、streamhls、cloudatacdn；白名单外回裸地址）；
//      /v：单文件字节代理（Range 透传）；/h：HLS 播放列表改写代理（变体回 /h，
//        分片/密钥回 /s）；/s：分片/密钥字节代理；/diag：全链诊断。
//    蜘蛛 v5 改动仅三处：getJson 超时 20s→30s（Worker 内含上游+jina 两段）；
//    新增 getResolve（Worker /resolve 优先）；play() 先试 /resolve、失败回落 v4 本地链。
//    其余（分类/详情/搜索、dex、字幕芯）一字未动；Worker 未部署 v3 时自动走本地链。
//  - v7（2026-11-13）：修点播“直接视频加载失败”。定性（见 diag-1113-r3-javxxx/REPORT.md）：
//    ① /resolve 是单发抽奖——同一分钟 Node 栈 0/11 通（10×E_DETAIL、1×E_API_HTTP403），
//       curl 栈 6/6 通；v6 只给列表加了三段冗余，播放仍是单发，失败即落到本地链；
//    ② 本地链回落是死路：HLS embed 回的是未改写的裸 m3u8（VM 直取 403，分片不过 /s、
//       PNG 头不剥），mp4 绑取 embed 方 IP， 全败则回 parse:1 详情页地址——三者
//       在手机上都是立刻加载失败，与用户症状一致。修法（只改蜘蛛）：
//    a) getResolve 改 3 次顺序重试，每次 req 腿与 fetch 腿竞速（先 ok 者赢），
//       单次 20s、三次最坏 60s（失败多为 0.1~2.5s 速败，典型 3~10s 结算；
//       成功实测 2.4~7.8s，20s 有余量）；
//    b) 本地链 / 直链分支拿到的 HLS（pianopic/streamhls 的 .m3u8）一律包一层
//       Worker /h?u=b64url，让变体/分片走 /h、/s（PNG 剥头），不再裸奔；
//       mp4 保持原样（直连腿赢时绑手机 IP，仍有机会播）。
//    列表/详情/搜索/字幕芯一字未动。Worker 侧另有 v5（/s Range 剥头、fetchHtml
//    重试、probeHls 走真实改写地址），见 javxxx-fetch-worker-v5.js，蜘蛛不依赖它。
//  - v9（2026-11-13）：修第五轮真机反馈“点播十秒内失败 + 详情仍只有‘播放’一档”。
//    换路：分段铸造（split-casting）——铸造链在“绑定交接点”处切开，手机与 Worker 各做一半。
//    坐实依据（见 diag-1113-r5-javxxx/REPORT.md，VM 实测）：
//    ① /resolve 在手机路径上是死腿：同一分钟 Node 栈 0/6（E_DETAIL / E_API_HTTP403），
//       curl 栈 2/2——Worker 的详情取页与 /api/play/ POST 从坏 colo 出口必被拦；
//       v7/v8 在它上面加重试、加竞速、加预算都救不活（同一手机出口撞同一坏 colo）。
//    ② 但 Worker /f/ 取 embed 页是活腿：同一分钟、同一 Node 栈，/f/ 取 hugstream embed
//       2/2 通（671–740ms），解出真 HLS master，经 /h 取 master 200 #EXTM3U——
//       embed 宿主（hugstream.xyz / video.javxxx.me）不拦坏 colo 出口。
//       分片是 PNG 伪装（直取 200 image/png、长 %188=70），须走 /s 剥头；
//       master/变体绑铸造方 IP（直取 403），须由取 embed 的一方（Worker）经 /h 取。
//       故：手机做详情 token + /api/play/ 直发（JavRate 先例：站方墙拦 HTML 不拦 /api/），
//       Worker 只做 /f/ 取 embed + /h + /s——两边各走自己能通的腿。
//    ③ 时间是第二断点：v8 的 detail 独占 8.6–10.1s、play 字幕等 6s、竞速预算 25s，
//       全超 App 约 10 秒等待上限——链路纵通也等不到结算。v9 全链硬预算：
//       play() 8 秒、detail() 档位发现 8 秒（超时回单条），字幕永不阻塞 play()
//       （只挂已缓存的字幕，detail() 里继续 warm）。
//    修法：play() 并行竞速两条独立铸造路（分段路 与 /resolve 单次），先赢者出线，
//    8 秒封顶；detail() 用分段路做有界档位发现（8 秒封顶，失败回单条“播放”）；
//    mp4 兜底仍走纯直连重取（直连取到的 mp4 才绑手机 IP）。
//    其余（列表/搜索/dex/字幕芯）一字未动；不依赖任何未部署的 Worker（已部署 v5 即够，
//    /f/、/h、/s 均为 v5 已有路由；v6 可选，不依赖）。
//  - v10（2026-11-13）：修第六轮真机反馈“v9 仍视频加载失败 + 详情仍只有‘播放’一档（SVCAO-032）”。
//    换路：token 双腿——v9 的 token 只有 Worker /j/detail 一条源，R6 探针坐实它在手机路径上
//    已死（Worker 直取详情页 10/10 遭 403 challenge；Worker 经 jina 7/10 被 429；
//    /resolve 0/10：7×E_DETAIL + 3×E_API_HTTP403，即 Worker 侧 POST /api/play/ 也被 403）。
//    分段路与 /resolve 两路共用这一个死源，同死即手机上的症状。新增蜘蛛直连 jina 详情页腿
//    （与列表 getJinaList 同款，req+fetch 竞速）：VM 侧 9/10 + 2/2 新鲜 token（1.4–3.3s），
//    是当前唯一能拿到 live/tid 的源；手机 POST /api/play/ 仍是 JavRate 先例的那条腿，
//    VM 侧现相位下直连 POST 亦被 403/掐断、无法代验，只差手机真机一验。
//    另修 v9 的 detail() bug：entryP 定义后从未被 await，却仍在后台跑完一整条分段链，
//    与下面的第二次 getMasterEntrySplit 调用重复——每开一次详情页向上游发两套铸造请求。
// v12（2026-11-14 第八轮）：R8 坐实 Worker /j/detail 与 /resolve 对新片均活
//    （DASS-027/SAME-155/CMV-214 皆 ok:true），v10/v11 手机端死的两点是：① Worker
//    token 腿 2.5s 封顶，手机上 1.5-3s 的 /j/detail 常被掐死；② SVCAO-032 长
//    slug 站方已改短（现为 /video/svcao-032/），旧长链回 404/挑战，拿不到 token
//    是站方链接变了不是蜘蛛坏。本版只改 getTokenAll：Worker 腿 8s + 一次重试，
//    jina 共用承诺无 token 时再现取一次；其余一字未动。
//    分段铸造本身、8 秒预算、/resolve 单次第二路、mp4 直连兜底、字幕行为一字未动；
//    无新 Worker、不部署任何东西（R4 的 v6 草稿只加 embed 重试，修不了 token 源与 apiPlay 403，不部署）。
//  - v13（2026-11-14 第九轮）：修第八轮真机反馈“仍无法播放”。根因（JavRate 先例 + 代码内证）：
//    token 绑取页方 IP——live/tid 是详情页按取页方 IP 签发的（jina 取与 Worker 取解出不同 ip/token，
//    见 v5 注释；蜘蛛内亦注“token 约 19.5 小时过期且绑 IP”），手机 /api/play/ 直发用的 token
//    必须是手机自己取详情页拿到的（direct 腿）。旧 getTokenAll 三腿竞速“先拿到者赢”专挑错的：
//    Worker/jina 腿更快（1.5-3s），直连腿更慢，竞速恒让 Worker/jina token 赢，再拿去直发即异 IP。
//    VM 实测佐证（非决定性：VM 出口本身也被墙）：jina 铸的 token 直发 POST 回 CF 403 Just a
//    moment；经 jina 转发 POST 目标回 405——jina 不转发 POST，只 GET，此路已死。
//    修法（只改蜘蛛，不部署）：getTokenAll 改为 direct 优先——先试直连（短预算），拿到即赢；
//    直连失败再并行 Worker + jina 回落（异 IP token 直发或成或败，/resolve 路并行兜底）。
//    token 缓存记 via 备查。分段路与 /resolve 两路并行竞速，先赢者出线。
//  - v14（2026-11-14 第十轮）：修第九轮真机反馈“仍无档位、只有‘播放’、无法播放”。新定性
//    （/diag 现测）：Worker 链本身是活的——/j/detail ok:true 有 live/tid，/resolve ok:true
//    回 /h master（streamhls 720p 变体，VM 侧 /h 取 master 200 真播单）；死的是手机端。
//    两点：① v13 的 direct 先试（5s 串行）会拖慢回落——直连腿若半天不回，12s 预算先吃
//    一半；② 档位发现只走分段路（detail），/resolve 只在 play()（8s）里跑，手机上链路
//    慢时 8s 常等不到它，详情页便永远不出档位。修法（只改蜘蛛，不部署）：
//    a) getTokenAll 改三腿并行 + direct 1.5s 宽限（并行不拖时间，宽限保 direct 优先）；
//    b) detail() 的档位发现并行两路——分段路与 /resolve（取 /h master 现解析变体），
//    先出变体者赢并缓存，play() 即可 0 秒出线；detail() 有 12s，比 play() 的 8s 更能
//    等到 /resolve 结算。
//  - v15（2026-11-14 第十一轮，用户令“多参考 javrate”）：照 JavRate v5/v7 的修法重做。
//    JavRate 当年同毛病（详情只剩一集“正片”、无 1080p/720p/自适应）是这么修好的：
//    ① 详情页凭 bare 地址直接出三集档位行，不取 master 现解析（v5：play() 不再取
//    master，变体地址按实测形态直接构造）；② HTML 腿死时凭番号调 /api/hot 取 bare
//    （v7，绕开已死的详情 HTML 腿）。javxxx 照搬：
//    a) 详情档位行不再取 master 文本现解析——拿到 master 地址即出档位行
//    （streamhls 单档 720p 已实测两部片皆单变体 1280x720，变体地址即 master 本身，
//    播放器取 master 自适应；其余宿主仍取 master 文本解析作回落）；
//    b) 新增 Worker /resolve2（javxxx-fetch v6，需用户部署）：手机把 jina 详情页
//    取到的 live/tid 交给 Worker，Worker 只做 /api/play/ POST + embed 取页，不再
//    自己取详情 HTML（JavRate Worker v2 模式：/api/ 墙比 HTML 墙弱；/resolve 的
//    HTML 取页是坏 colo 抽奖）。分段路、/resolve、/resolve2 三路并行竞速。
//  - v16（2026-11-14 第十二轮，v15 仍无档位）：两处改动。
//    ① 时序 bug：v15 的 resolve2EntryP 是在 `await tokenP` 之后才创建，token 若
//    拿得慢（10 秒），resolve2 只剩 2 秒、必超时。改成 tokenP.then 链式创建，与
//    entryP、resolveEntryP 同时起跑（token 一到即发 /resolve2）。
//    ② 诊断：detail() 回包的 vod_remarks 带腿况（tk=token 来源，r2=/resolve2，
//    r=/resolve，sp=分段路；ok/空/-），手机实测截图可读，定位手机侧断点。
//    （另已坐实：live/tid 是每片稳定的——jina 两次取、Worker 取均同一 live
//    串，tid 596077 不变；token 不绑 IP、不快过期。故断点不在 token 本身，
//    而在手机侧取 token 或调 /resolve2 的某一步。）
//  - v11（2026-11-14，第七轮）：v10 仍单条"播放"——Worker 腿死、jina 腿在手机上也没赢。
//    新路：直连详情页取 token。getBaseAll 的 HTML 回落腿（getHtmlOnly：Worker /f/ +
//    直连 + fetch 竞速）本来就能取到详情页 HTML、parseDetailHtml 本来就能从中抽
//    出 data-ts-live/data-ts-id，但它只回 {name, pic, desc}，把 live/tid 扔了；
//    getTokenAll 也从来没接过这条腿。v11 把直连详情页（req.get + fetch 双腿并行，
//    6 秒封顶，不走 Worker、不走 jina）加为 token 第三腿，与 Worker/jina 并行竞速，
//    先拿到 live/tid 者赢。detail() 预算 8 秒→12 秒（直连腿本身 6 秒封顶，
//    档位发现仍需 apiPlay POST + embed 扫描的时间；play() 仍 8 秒，
//    主路是 detail() 已缓存的 token，冷播才走三腿竞速）。
import req from '../../util/req.js';

const KEY = 'py_javxxx';
const NAME = 'JavXXX';
const HOST = 'https://www.javxxx.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 分类：站内导航原样。vXX 前缀是站方规范地址（/category/<slug>/ 会 301 到它）。
// home=最新；其余 9 个为视频分类。/pornstars/ 与 /studios/ 为人物/厂商索引，结构不同，暂不做。
const CLASSES = [
  { type_id: 'home', type_name: '最新' },
  { type_id: 'censored', type_name: '有碼' },
  { type_id: 'uncensored', type_name: '無碼' },
  { type_id: 'uncensored-leaked', type_name: '無碼流出' },
  { type_id: 'decensored', type_name: '破解' },
  { type_id: 'chinese-subtitle', type_name: '中字' },
  { type_id: 'english-subtitle', type_name: '英字' },
  { type_id: 'subtitle-indonesia', type_name: '印尼字幕' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'fc2-ppv', type_name: 'FC2' },
];
// 分类到站内 vXX 地址（导航原样）
const VPATH = {
  'censored': 'v35', 'uncensored': 'v9', 'uncensored-leaked': 'v10',
  'decensored': 'v17', 'chinese-subtitle': 'v21', 'english-subtitle': 'v18',
  'subtitle-indonesia': 'v7', 'amateur': 'v31', 'fc2-ppv': 'v36',
};

function headers(referer) {
  return {
    'User-Agent': UA,
    'Referer': referer || (HOST + '/'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Cloudflare 托管质询页特征：命中即算该腿失败（不抢赢、不污染结果）。
function isChallengePage(body) {
  const s = String(body || '');
  return !s || s.length < 800 || s.includes('Just a moment') ||
    s.includes('Attention Required') || s.includes('cf-challenge') ||
    s.includes('challenges.cloudflare.com');
}

// ---------- 取数：多腿并行竞速（2026-11-11 v2，照 JavRate v10 + pornhub-fetch 模式重构） ----------
// 背景：站方 2026-11-11 起把 Cloudflare 托管质询收紧，VM 侧直连基本全灭
// （403 "Just a moment" 或连接直接被掐断），手机端 App 的 req（axios 沙箱）
// 同样被指纹拦，列表全空。旧版“直连重试 6 次”在质询率 ~100% 时已无意义。
// 新版照抄两条已被证实有效的路子：
//  ① JavRate 猫源 v10：三腿并行竞速——Worker 腿 + 直连腿 + jina 腿，
//     先拿到真页者赢；另加两条全局 fetch 腿（直连 + Worker），赌 App 的
//     fetch 走与 REX Widget.http.get 相近的原生栈（REX 的 JavRate 能过
//     站方验证、猫源 req 被指纹拦，同源同理）。App 内无 fetch 时不加腿。
//  ② pornhub-fetch / duanju91-fetch：专用取页 Worker（CF 边缘代取），
//     列表/详情/播放接口全走它。Worker 未部署时该腿速败（404），行为与
//     旧版一致；部署后无需重推即生效。
// 腿清单（getHtml，列表用；jina 只作兜底，见 fetchPage 两段式）：
//   第一段 HTML 腿：
//   worker        req   FETCH_WORKER /f/<b64url>  15s
//   direct        req   直连（内部最多 3 次，1s 间隔）  12s/次
//   worker-fetch  fetch FETCH_WORKER /f/<b64url>  15s（有 fetch 才发）
//   direct-fetch  fetch 直连                      12s（有 fetch 才发）
//   第二段 jina 腿（仅 HTML 全败时）：
//   jina          req   https://r.jina.ai/<目标>   15s（回 Markdown，转列表 HTML）
//   jina-fetch    fetch 同上                       15s（有 fetch 才发）
// getHtmlOnly（详情/播放/embed 用，不走 jina）：jina 的 Markdown 丢掉了
// data-ts-live / data-ts-id / data-config 这些 HTML 属性，解不出播放地址，
// 故详情与播放链路只走 HTML 腿（Worker + 直连 + fetch），与 JavRate 的
// htmlOnly/mdOnly 分流同理。
// 质询页/空页/报错的腿只算失败、不抢赢；全部腿落败时立即回空，不烧满上限。
const FETCH_WORKER = 'https://javxxx-fetch.li768435813.workers.dev';

function b64url(str) {
  try {
    return Buffer.from(String(str), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch (e) { return ''; }
}
function viaWorker(url) { return FETCH_WORKER + '/f/' + b64url(url); }

// 硬定时器包装（照 JavRate v6）：不依赖 axios timeout 是否生效，超时即结算 fallback。
function withTimeout(p, ms, fallback) {
  var t;
  var to = new Promise(function (resolve) { t = setTimeout(function () { resolve(fallback); }, ms); });
  return Promise.race([Promise.resolve(p).finally(function () { clearTimeout(t); }), to]);
}

// 先成功者赢：任一 job 返回真值即结算；全部失败/超时返回 null。
function firstSuccess(jobs, ms) {
  return new Promise(function (resolve) {
    var done = false;
    var settled = 0;
    var total = jobs.length;
    var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
    var onSettled = function () {
      settled += 1;
      if (!done && settled >= total) { done = true; clearTimeout(timer); resolve(null); }
    };
    if (total === 0) { done = true; clearTimeout(timer); resolve(null); return; }
    for (var i = 0; i < jobs.length; i++) {
      Promise.resolve(jobs[i]).then(function (v) {
        if (done) return;
        if (v) { done = true; clearTimeout(timer); resolve(v); return; }
        onSettled();
      }).catch(onSettled);
    }
  });
}

// 单条腿：返回 { body, kind }（kind: 'html' | 'md'）或 null（失败）。
// kind=md 的腿只在第二段（allowMd）才发，见 fetchPage。
async function runLeg(leg, hdrs) {
  try {
    var body = '';
    var status = 0;
    if (leg.transport === 'fetch') {
      var ctrl = null;
      var abortTimer = null;
      try {
        if (typeof AbortController === 'function') ctrl = new AbortController();
      } catch (e) { ctrl = null; }
      var aborted = new Promise(function (resolve) {
        abortTimer = setTimeout(function () {
          try { if (ctrl) ctrl.abort(); } catch (e) {}
          resolve(null);
        }, leg.ms);
      });
      try {
        var r = await Promise.race([
          fetch(leg.u, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined }),
          aborted,
        ]);
        if (!r) return null;
        status = r.status;
        body = await withTimeout(r.text(), leg.ms, '');
      } finally { clearTimeout(abortTimer); }
    } else {
      var r2 = await withTimeout(req.get(leg.u, { headers: hdrs, timeout: leg.ms }), leg.ms, null);
      if (!r2) return null;
      status = r2.status || 0;
      body = (r2 && r2.data != null) ? String(r2.data) : '';
    }
    if (!body) return null;
    if (isChallengePage(body)) return null;
    if (status !== 200) return null;
    return { body: body, kind: 'html' };
  } catch (e) { return null; }
}

// 直连腿（带重试）：单次质询率高，内部最多 3 次、1s 间隔；
// 其它腿先赢时本腿的后续重试自然被 firstSuccess 丢弃。
async function runDirectLeg(url, hdrs) {
  for (var i = 0; i < 3; i++) {
    var got = await runLeg({ via: 'direct', ms: 12000, kind: 'html', u: url, transport: 'req' }, hdrs);
    if (got) return got;
    if (i < 2) await sleep(1000);
  }
  return null;
}

// 取页（v4，2026-11-11）：只走 HTML 腿（Worker + 直连 + fetch），不再走 jina。
// 列表不再用本函数（改走 Worker /j/list JSON）；本函数只供详情/播放/embed 用。
async function fetchPage(url, referer) {
  var hdrs = headers(referer);
  var hasFetch = (typeof fetch === 'function');
  var htmlLegs = [
    { via: 'worker', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'req' },
  ];
  if (hasFetch) {
    htmlLegs.push({ via: 'worker-fetch', ms: 15000, kind: 'html', u: viaWorker(url), transport: 'fetch' });
    htmlLegs.push({ via: 'direct-fetch', ms: 12000, kind: 'html', u: url, transport: 'fetch' });
  }
  var htmlJobs = htmlLegs.map(function (leg) { return runLeg(leg, hdrs); });
  htmlJobs.push(runDirectLeg(url, hdrs));
  var won = await firstSuccess(htmlJobs, 15000);
  if (won) return won.body;
  return '';
}

// ---------- 服务端 JSON 取数（v4）：列表与详情只发一个 GET 到 Worker ----------
// Worker /j/list 与 /j/detail 在边缘代取并解析后回 JSON；App 不再解析 HTML。
// 单一路径、无竞速、无 jina；Worker 未部署 v2 或上游被拦时回空、不出假条目。
function viaJsonList(url) { return FETCH_WORKER + '/j/list/' + b64url(url); }
function viaJsonDetail(url) { return FETCH_WORKER + '/j/detail/' + b64url(url); }

async function getJson(url, ms) {
  var timeoutMs = ms || 30000;
  try {
    var r = await withTimeout(req.get(url, { headers: headers(), timeout: timeoutMs }), timeoutMs, null);
    if (!r || r.status !== 200) return null;
    var data = r.data;
    var obj = null;
    if (typeof data === 'string') {
      try { obj = JSON.parse(data); } catch (e) { return null; }
    } else if (data && typeof data === 'object') obj = data;
    else return null;
    if (!obj || obj.ok !== true) return null;
    return obj;
  } catch (e) { return null; }
}

// 列表 JSON 校验：只认 vod_id 为 javxxx.me /video/<slug>/、标题非空非文件名的条目。
function filterJsonList(arr) {
  if (!Array.isArray(arr)) return [];
  var out = [];
  var seen = new Set();
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i] || {};
    var id = String(it.vod_id || '');
    var name = String(it.vod_name || '').trim();
    if (!/^https:\/\/www\.javxxx\.me\/video\/[^\/]+\/?$/.test(id)) continue;
    if (!name || /\.(jpg|jpeg|png|gif|webp|svg)(\?|#|$)/i.test(name)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    var pic = String(it.vod_pic || '');
    if (/^data:/i.test(pic) || /\/404\.png$/i.test(pic)) pic = '';
    out.push({ vod_id: id, vod_name: name.substring(0, 120) || '未知', vod_pic: pic, vod_remarks: String(it.vod_remarks || '') });
  }
  return out;
}

// 列表 HTML 解析（与已部署 Worker v4 的 parseListHtml 同款逻辑，蜘蛛侧复刻）：
// 卡片 <a href="/video/<slug>/" title="...">…<img data-lazy-src="...">；
// 条目 <3 时再试 Markdown 链接回落（jina 有时回 Markdown，封面为空）。
function parseListHtml(html) {
  var out = [];
  var seen = new Set();
  var push = function (id, name, pic, remarks) {
    id = String(id || '').trim();
    if (!/^https:\/\/www\.javxxx\.me\/video\/[^\/]+\/?$/.test(id)) return;
    name = clean(String(name || '')).substring(0, 120);
    if (!name || /\.(jpg|jpeg|png|gif|webp|svg)(\?|#|$)/i.test(name)) return;
    if (seen.has(id)) return;
    seen.add(id);
    pic = String(pic || '');
    if (/^data:/i.test(pic) || /\/404\.png$/i.test(pic)) pic = '';
    out.push({ vod_id: id, vod_name: name, vod_pic: pic, vod_remarks: String(remarks || '') });
  };
  var reA = /<a[^>]+href="(https?:\/\/www\.javxxx\.me\/video\/[^"\/]+\/?|\/video\/[^"\/]+\/?)"[^>]*>/gi;
  var m;
  while ((m = reA.exec(html)) && out.length < 40) {
    var href = m[1];
    var id = href.indexOf('http') === 0 ? href : HOST + href;
    var tag = m[0];
    var seg = html.slice(m.index, Math.min(html.length, m.index + 4000));
    var name = '';
    var tm = tag.match(/title="([^"]*)"/i);
    if (tm) name = tm[1];
    if (!name) {
      var endA = seg.search(/<\/a>/i);
      var innerHtml = endA >= 0 ? seg.slice(tag.length, endA) : '';
      name = clean(innerHtml);
    }
    var pic = '';
    var pm = seg.match(/data-lazy-src="(https?:[^"]+)"/i);
    if (pm) pic = pm[1];
    if (!pic) {
      var sm = seg.match(/<img[^>]+src="(https?:[^"]+)"/i);
      if (sm) pic = sm[1];
    }
    var remarks = '';
    var dm = seg.match(/(\d{1,2}:\d{2}:\d{2})/);
    if (dm) remarks = dm[1];
    push(id, name, pic, remarks);
  }
  if (out.length >= 3) return out;
  var reMd = /\[([^\]\n]{3,150})\]\((https:\/\/www\.javxxx\.me\/video\/[^)\s"]+\/?)(?:\s+"[^"]*")?\)/g;
  var mm;
  while ((mm = reMd.exec(html)) && out.length < 40) {
    push(mm[2], mm[1], '', '');
  }
  return out;
}

// 蜘蛛直连 jina 腿：r.jina.ai 回完整 HTML（x-respond-with: html），不走 Worker，
// 故不受“Worker 上游撞挑战”影响。req 腿与 fetch 腿并行竞速，先解析出真条目者赢。
async function getJinaList(url, minN) {
  var min = minN || 3;
  var jinaUrl = 'https://r.jina.ai/' + url;
  var hdrs = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'x-respond-with': 'html' };
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(jinaUrl, { headers: hdrs, timeout: 15000 }), 15000, null);
      if (!r || r.status !== 200) return null;
      var body = (r && r.data != null) ? String(r.data) : '';
      if (!body || isChallengePage(body)) return null;
      var list = parseListHtml(body);
      return list.length >= min ? list : null;
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 15000);
        try {
          var r2 = await fetch(jinaUrl, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var body2 = await withTimeout(r2.text(), 15000, '');
          if (!body2 || isChallengePage(body2)) return null;
          var list2 = parseListHtml(body2);
          return list2.length >= min ? list2 : null;
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, 15000);
  return won || [];
}

// 列表取数（v6）：Worker /j/list 单发即回 [] 是本轮空列表的直接原因，改三段顺序：
// Worker → 蜘蛛直连 jina HTML → Worker 再一发；任一段出 >=3 条真条目即返回。
// 单腿上限 15s；三段全败才回 []（不出假条目）。
async function getJsonList(url, minN) {
  var min = minN || 3;
  var obj = await getJson(viaJsonList(url), 15000);
  var list = filterJsonList(obj && obj.list);
  if (list.length >= min) return list;
  var jinaList = await getJinaList(url, min);
  if (jinaList.length >= min) return jinaList;
  var obj2 = await getJson(viaJsonList(url), 15000);
  var list2 = filterJsonList(obj2 && obj2.list);
  if (list2.length >= min) return list2;
  return list.length ? list : (jinaList.length ? jinaList : list2);
}

// 详情 JSON：{name, pic, desc, live, tid}；失败返回 null（调用方回落 /f/ 原样取页）。
async function getJsonDetail(url) {
  var obj = await getJson(viaJsonDetail(url));
  if (!obj) return null;
  return { name: String(obj.name || ''), pic: String(obj.pic || ''), desc: String(obj.desc || ''), live: String(obj.live || ''), tid: String(obj.tid || '') };
}

// ---------- v10：token 双腿（R6 换路的核心） ----------
// 从详情页 HTML 抽名/图/简介/live/tid（Worker /j/detail 与 jina 详情页共用同一解析）。
function parseDetailHtml(html) {
  var out = { name: '', pic: '', desc: '', live: '', tid: '' };
  var s = String(html || '');
  if (!s) return out;
  var tm = s.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    || s.match(/<title>([\s\S]*?)<\/title>/i);
  if (tm) out.name = cleanText(tm[1]).replace(/\s*-\s*JAVXXX\.Me\s*$/i, '').substring(0, 120);
  var pm = s.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (pm) out.pic = pm[1];
  var dm = s.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  if (dm) out.desc = cleanText(dm[1]);
  out.live = (s.match(/data-ts-live="([^"]+)"/) || [])[1] || '';
  out.tid = (s.match(/data-ts-id="([^"]+)"/) || [])[1] || '';
  return out;
}

// 蜘蛛直连 jina 取详情页（与列表的 getJinaList 同款：r.jina.ai + x-respond-with: html，
// req+fetch 竞速）。有名或有 token 即回 parseDetailHtml 结果，否则回 null。
// R6 探针：VM node fetch 9/10 + 2/2 新鲜 token（1.4–3.3s）；是当前唯一能拿到 live/tid 的 token 源。
async function getJinaDetail(vid, deadlineMs) {
  var jinaUrl = 'https://r.jina.ai/' + vid;
  var hdrs = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'x-respond-with': 'html' };
  var cap = deadlineMs ? Math.max(1500, Math.min(9000, deadlineMs - Date.now())) : 6000;
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(jinaUrl, { headers: hdrs, timeout: cap }), cap, null);
      if (!r || r.status !== 200) return null;
      var b = (r && r.data != null) ? String(r.data) : '';
      if (!b || isChallengePage(b)) return null;
      var p = parseDetailHtml(b);
      if ((!p.live || !p.tid) && !p.name) return null;
      return p;
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, cap);
        try {
          var r2 = await fetch(jinaUrl, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var b2 = await withTimeout(r2.text(), cap, '');
          if (!b2 || isChallengePage(b2)) return null;
          var p2 = parseDetailHtml(b2);
          if ((!p2.live || !p2.tid) && !p2.name) return null;
          return p2;
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, cap);
  return won || null;
}

// v11：直连详情页取 token（第三腿）。手机直连 javxxx.me 详情页是唯一从未试过的
// token 源：Worker /j/detail 死于 CF 出口 403，jina 腿在手机上没赢过，而详情页
// 本身的 data-ts-live/data-ts-id 就在静态 HTML 里（与 Worker/jina 腿共用同一解析）。
// req.get + fetch 双腿并行、6 秒封顶，不走 Worker、不走 jina；挑战页/空页回 null。
// 与 getJinaDetail 同款结构，只换直连 URL、去掉 x-respond-with。
async function getDirectToken(vid, deadlineMs) {
  var hdrs = headers();
  var cap = deadlineMs ? Math.max(1500, Math.min(9000, deadlineMs - Date.now())) : 6000;
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(vid, { headers: hdrs, timeout: cap }), cap, null);
      if (!r || r.status !== 200) return null;
      var b = (r && r.data != null) ? String(r.data) : '';
      if (!b || isChallengePage(b)) return null;
      var p = parseDetailHtml(b);
      if (!p.live || !p.tid) return null;
      return { live: p.live, tid: p.tid, via: 'direct' };
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, cap);
        try {
          var r2 = await fetch(vid, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var b2 = await withTimeout(r2.text(), cap, '');
          if (!b2 || isChallengePage(b2)) return null;
          var p2 = parseDetailHtml(b2);
          if (!p2.live || !p2.tid) return null;
          return { live: p2.live, tid: p2.tid, via: 'direct' };
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, cap);
  return won || null;
}

// /j/detail 原样取回（ok:false 的 notoken 也带 name/pic/desc，基础信息腿自判 live/tid）。
async function getJsonDetailAny(vid) {
  try {
    var r = await withTimeout(req.get(viaJsonDetail(vid), { headers: headers(), timeout: 15000 }), 15000, null);
    if (!r || r.status !== 200) return null;
    var data = r.data;
    var obj = null;
    if (typeof data === 'string') {
      try { obj = JSON.parse(data); } catch (e) { return null; }
    } else if (data && typeof data === 'object') obj = data;
    else return null;
    if (!obj) return null;
    return { name: String(obj.name || ''), pic: String(obj.pic || ''), desc: String(obj.desc || ''), live: String(obj.live || ''), tid: String(obj.tid || '') };
  } catch (e) { return null; }
}

// token（v14）：三腿并行竞速，direct 优先（1.5s 宽限）。
// v13 的 direct 先试（5s 串行）会拖慢回落：直连腿若半天不回，12s 预算先吃一半。
// 并行 + 宽限两全：direct 若先到直接赢；Worker/jina 若先到，等 1.5s 看 direct 来不来，
// 来则用 direct，不来则用先到的；宽限内无 token 则继续等到 deadline（v12 同款回落）。
async function getTokenAll(vid, deadlineMs, jinaDetailP) {
  var directP = (async function () {
    try {
      var dt = await getDirectToken(vid, deadlineMs);
      if (dt && dt.live && dt.tid) return { live: dt.live, tid: dt.tid, via: 'direct' };
    } catch (e) {}
    return null;
  })();
  var otherP = (async function () {
    var jobs = [];
    jobs.push((async function () {
      try {
        var capW = deadlineMs ? Math.max(1500, Math.min(8000, deadlineMs - Date.now())) : 8000;
        var jd = await withTimeout(getJsonDetail(vid), capW, null);
        if (jd && jd.live && jd.tid) return { live: jd.live, tid: jd.tid, via: 'worker' };
        if (deadlineMs && Date.now() < deadlineMs - 2000) {
          var jd2 = await withTimeout(getJsonDetail(vid), Math.max(1500, Math.min(8000, deadlineMs - Date.now())), null);
          if (jd2 && jd2.live && jd2.tid) return { live: jd2.live, tid: jd2.tid, via: 'worker-retry' };
        }
      } catch (e) {}
      return null;
    })());
    jobs.push((async function () {
      try {
        var jt = jinaDetailP ? await jinaDetailP : await getJinaDetail(vid, deadlineMs);
        if (jt && jt.live && jt.tid) return { live: jt.live, tid: jt.tid, via: 'jina' };
        if (jinaDetailP && deadlineMs && Date.now() < deadlineMs - 2000) {
          var jt2 = await getJinaDetail(vid, deadlineMs);
          if (jt2 && jt2.live && jt2.tid) return { live: jt2.live, tid: jt2.tid, via: 'jina-retry' };
        }
      } catch (e) {}
      return null;
    })());
    var cap = deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : 6000;
    return await firstSuccess(jobs, cap);
  })();
  var capAll = deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : 6000;
  var first = await firstSuccess([directP, otherP], capAll);
  if (!first) return { live: '', tid: '', via: '' };
  if (first.via === 'direct') return first;
  var grace = deadlineMs ? Math.max(0, Math.min(1500, deadlineMs - Date.now())) : 1500;
  if (grace > 0) {
    var d = await withTimeout(directP, grace, null);
    if (d && d.live && d.tid) return d;
  }
  return first;
}

// 基础信息（名/图/简介）并行三腿：Worker /j/detail（notoken 也带名图）、蜘蛛 jina 详情页
// （共用调用方传入的 jinaDetailP）、HTML 回落（Worker /f/ + 直连 + fetch）。先出名者赢。
async function getBaseAll(vid, deadlineMs, jinaDetailP) {
  var cap = deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : 6000;
  var jobs = [];
  jobs.push((async function () {
    try {
      var jd = await getJsonDetailAny(vid);
      if (jd && jd.name) return { name: jd.name, pic: jd.pic, desc: jd.desc };
    } catch (e) {}
    return null;
  })());
  jobs.push((async function () {
    try {
      var jt = jinaDetailP ? await jinaDetailP : await getJinaDetail(vid, deadlineMs);
      if (jt && jt.name) return { name: jt.name, pic: jt.pic, desc: jt.desc };
    } catch (e) {}
    return null;
  })());
  jobs.push((async function () {
    try {
      var html = await withTimeout(getHtmlOnly(vid), Math.min(6000, cap), '');
      if (!html) return null;
      var tk2 = parseDetailHtml(html);
      if (tk2.name) return { name: tk2.name, pic: tk2.pic, desc: tk2.desc };
    } catch (e) {}
    return null;
  })());
  var won = await firstSuccess(jobs, cap);
  return won || { name: '', pic: '', desc: '' };
}

// Worker v3 /resolve：服务端全链解析，回 {ok:true, url: Worker /v 代理地址} 或 null。
// v3 未部署（404/非 JSON）或上游 embed 被拦时返回 null，调用方回落 v4 本地链。
// v7：单发是抽奖（本轮实测 Node 栈 0/11、curl 栈 9/9，见 REPORT.md），改 3 次顺序重试；
// 每次 req 腿与 fetch 腿竞速，先拿到 ok:true 者赢；单次 20s。任一次 ok 即回，
// 三次全败才回 null（调用方走本地链）。失败多为速败（0.1~2.5s），典型 3~10s 结算。
function viaResolve(detailUrl) { return FETCH_WORKER + '/resolve?u=' + encodeURIComponent(detailUrl); }
function parseResolveObj(data) {
  var obj = null;
  if (typeof data === 'string') {
    try { obj = JSON.parse(data); } catch (e) { return null; }
  } else if (data && typeof data === 'object') obj = data;
  else return null;
  if (!obj || obj.ok !== true || !obj.url) return null;
  return { url: String(obj.url), kind: String(obj.kind || ''), expires: String(obj.expires || '') };
}
async function getResolveOnce(detailUrl) {
  var target = viaResolve(detailUrl);
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(target, { headers: headers(), timeout: 20000 }), 20000, null);
      if (!r || r.status !== 200) return null;
      return parseResolveObj(r.data);
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 20000);
        try {
          var r2 = await fetch(target, { headers: headers(), signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var t2 = await withTimeout(r2.text(), 20000, '');
          return parseResolveObj(t2);
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, 20000);
  return won || null;
}
// v9：/resolve 只发单次（不再 3 次重试——同一出口撞同一坏 colo，重试不换命；
// 救命靠与分段路并行竞速，不靠在死腿上加次数）。调用方用 withTimeout 封顶。
async function getResolve(detailUrl) {
  try { return await getResolveOnce(detailUrl); } catch (e) { return null; }
}

// ---------- v15：/resolve2（手机供 token）与“master 地址即出档位” ----------
// /resolve2：GET FETCH_WORKER + '/resolve2?u=<详情页>&live=<live>&tid=<tid>'。
// 手机把 jina 详情页取到的 live/tid 交给 Worker，Worker 只做 /api/play/ POST +
// embed 取页，不取详情 HTML（JavRate Worker v2 模式）。未部署 v6 时 404 速败。
function viaResolve2(live, tid, detailUrl) {
  return FETCH_WORKER + '/resolve2?u=' + encodeURIComponent(detailUrl)
    + '&live=' + encodeURIComponent(live) + '&tid=' + encodeURIComponent(tid);
}
async function getResolve2(live, tid, detailUrl, deadlineMs) {
  var target = viaResolve2(live, tid, detailUrl);
  var cap = deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : 8000;
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(target, { headers: headers(), timeout: cap }), cap, null);
      if (!r || r.status !== 200) return null;
      return parseResolveObj(r.data);
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, cap);
        try {
          var r2 = await fetch(target, { headers: headers(), signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var t2 = await withTimeout(r2.text(), cap, '');
          return parseResolveObj(t2);
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, cap);
  return won || null;
}
// base64url 解码（Cat 运行时有 Buffer）。/h 地址的 u 参数是 b64url 编码的真 master 地址。
function b64urlDecode(str) {
  try {
    var b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return Buffer.from(b, 'base64').toString('utf8');
  } catch (e) { return ''; }
}
// master 地址的真实宿主：/h 地址解 u 参数，其余取自身 host。
function masterHostOf(masterHUrl) {
  var u = String(masterHUrl || '');
  try {
    if (/\/h\?u=/.test(u)) {
      var m = u.match(/[?&]u=([^&]+)/);
      if (m) {
        var real = b64urlDecode(decodeURIComponent(m[1]));
        if (real) return new URL(real).hostname.toLowerCase();
      }
    }
    return new URL(u).hostname.toLowerCase();
  } catch (e) { return ''; }
}
// v15（JavRate v5 模式）：拿到 master 地址即出档位行，不取 master 文本现解析。
// streamhls 单档 720p 已实测（DASS-027、SAME-155 皆单变体 1280x720），变体地址即
// master 本身（播放器取 master 自适应）；其余宿主仍取 master 文本解析作回落。
async function entryFromMasterUrl(masterHUrl, deadlineMs) {
  if (!masterHUrl) return null;
  var host = masterHostOf(masterHUrl);
  if (host === 'streamhls.click') {
    return { masterHUrl: masterHUrl, variants: [{ h: 720, url: masterHUrl }] };
  }
  try {
    var txt = await fetchMasterText(masterHUrl, Math.min(5000, Math.max(1000, deadlineMs ? deadlineMs - Date.now() : 5000)));
    if (!txt) return null;
    var vs = parseHlsVariants(txt, masterHUrl);
    if (!vs.length) return null;
    return { masterHUrl: masterHUrl, variants: vs };
  } catch (e) { return null; }
}

// 本地链 / 直链分支拿到的 HLS 裸地址包一层 Worker /h（只认 Worker /h 白名单里的
// HLS 宿主 pianopic/streamhls/cloudatacdn——/h 的 isVideoHost 三家都认；其余宿主
// /h 会 400，不如裸奔，故只包这三家；已是 /h 地址的不重复包）。
// 作用：变体/分片走 /h、/s，分片 PNG 头由 /s 剥，不再把裸 m3u8 交给播放器。
function wrapHlsViaWorker(rawUrl) {
  var u = String(rawUrl || '');
  if (!u || /\/h\?u=/.test(u)) return u;
  if (!/\.m3u8(\?|#|$)/i.test(u)) return u;
  var host = '';
  try { host = new URL(u).hostname.toLowerCase(); } catch (e) { return u; }
  if (host !== 'pianopic.com' && host !== 'streamhls.click' && host !== 'cloudatacdn.com' && !host.endsWith('.cloudatacdn.com')) return u;
  return FETCH_WORKER + '/h?u=' + b64url(u);
}


// ---------- v8：master 变体表（档位） ----------
// master 缓存：detail() 解析出的变体表供 play() 复用（token 约 12h 有效，缓存 10 分钟）。
const MASTER_TTL = 10 * 60 * 1000;
const masterCache = new Map();
function masterCacheGet(vid) {
  var e = masterCache.get(vid);
  if (!e) return null;
  if (Date.now() - e.ts > MASTER_TTL) { masterCache.delete(vid); return null; }
  return e;
}
function masterCacheSet(vid, entry) {
  if (!vid || !entry) return;
  entry.ts = Date.now();
  masterCache.set(vid, entry);
  if (masterCache.size > 50) masterCache.delete(masterCache.keys().next().value);
}

// 解析 master 文本里的变体表：[{h:1080, bw, url}]（按 h 从高到低去重）。
// 变体地址：/h 改写地址原样保留；裸 master 里的相对地址按 base 解析、再过 wrapHlsViaWorker。
function parseHlsVariants(text, base) {
  var out = [];
  var seen = new Set();
  var s = String(text || '');
  if (!/#EXTM3U/.test(s)) return out;
  var re = /#EXT-X-STREAM-INF:([^\n]*)\n([^\n]+)/g;
  var m;
  while ((m = re.exec(s))) {
    var inf = m[1] || '';
    var url = String(m[2] || '').trim();
    if (!url || url.charAt(0) === '#') continue;
    var rm = inf.match(/RESOLUTION=\d+x(\d+)/i);
    var h = rm ? parseInt(rm[1], 10) : 0;
    if (!h) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    var bm = inf.match(/BANDWIDTH=(\d+)/i);
    var bw = bm ? parseInt(bm[1], 10) : 0;
    if (!/^https?:\/\//i.test(url) && base && !/\/h\?u=/.test(base)) {
      try { url = new URL(url, base).href; } catch (e) {}
    }
    out.push({ h: h, bw: bw, url: wrapHlsViaWorker(url) });
  }
  out.sort(function (a, b) { return (b.h - a.h) || (b.bw - a.bw); });
  return out;
}

// 取 master 文本（/h 地址或裸 m3u8）：ms 封顶（默认 10s，v9 调用方传剩余预算）；非 #EXTM3U 回 ''。
async function fetchMasterText(masterUrl, ms) {
  var cap = ms || 10000;
  try {
    var r = await withTimeout(req.get(masterUrl, { headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*' }, timeout: cap }), cap, null);
    if (!r || r.status !== 200) return '';
    var t = (r && r.data != null) ? String(r.data) : '';
    if (!/#EXTM3U/.test(t)) return '';
    return t;
  } catch (e) { return ''; }
}

// 从缓存条目里按 q 选变体地址：精确命中；否则不高于 q 的最高档；否则最低档；无 q 回 master。
function pickVariantFromEntry(entry, q) {
  if (!entry || !entry.masterHUrl) return '';
  var vs = entry.variants || [];
  if (!q || !vs.length) return entry.masterHUrl;
  var exact = null, below = null, lowest = vs[vs.length - 1];
  for (var i = 0; i < vs.length; i++) {
    if (vs[i].h === q) { exact = vs[i]; break; }
    if (vs[i].h < q && !below) below = vs[i];
  }
  var pick = exact || below || lowest;
  return (pick && pick.url) || entry.masterHUrl;
}

// v9 detail() 用：分段路取某片的 master 与变体表（8 秒总期限由调用方 deadlineMs 卡）。
// 链：token（调用方传入，已由 /j/detail 拿到的 live/tid）→ /api/play/ 直发
//   → Worker /f/ 并行取 embed（只走 Worker 腿，master 绑 Worker 出口）
//   → 命中 HLS 后经 /h 取 master 文本（白名单宿主）或裸取（maxstream 等非白名单宿主，
//     裸 master 可直取且分片自带 AES-128 密钥，见 R5 probe_max）。
// 任一步失败/超时回 null（调用方回单条“播放”）。不调 /resolve（死腿不等它）。
async function getMasterEntrySplit(vid, live, tid, deadlineMs) {
  var cached = masterCacheGet(vid);
  if (cached) return cached;
  try {
    var remain = function () { return Math.max(0, deadlineMs - Date.now()); };
    if (remain() < 1500) return null;
    var embeds = await decodeEmbedsSplit(vid, live, tid, deadlineMs);
    if (!embeds || !embeds.length || remain() < 1500) return null;
    var found = await scanEmbedsWorkerOnly(embeds, vid, deadlineMs);
    if (!found || found.kind !== 'hls' || !found.url) return null;
    var masterH = found.url;
    var entry = await entryFromMasterUrl(masterH, deadlineMs);
    if (!entry || !entry.variants || !entry.variants.length || remain() < 500) return null;
    masterCacheSet(vid, entry);
    return entry;
  } catch (e) { return null; }
}

// 详情/播放/embed 用：只走 HTML 腿（Worker /f/ + 直连 + fetch）。
async function getHtmlOnly(url, referer) {
  return fetchPage(url, referer);
}

// POST /api/play/ 多腿竞速：Worker POST 腿 + 直连 POST 腿（+ fetch 腿，有 fetch 才发）。
// Worker 未部署时 Worker 腿速败；直连被质询时回挑战页、JSON 解析失败即算失败。
function parsePlayResp(r) {
  if (!r) return null;
  var data = r.data;
  var obj = {};
  if (typeof data === 'string') {
    try { obj = JSON.parse(data); } catch (e) { return null; }
  } else if (data && typeof data === 'object') obj = data;
  else return null;
  if (obj && obj.status === true && obj.data) return obj;
  if (obj && obj.data) return obj;
  return null;
}

// v9：POST /api/play/ 只走手机直连腿（req + fetch，各单次 6s，不重试）。
// 刻意不走 Worker /f/ POST 腿——Worker 侧 POST 从坏 colo 出口必 403（E_API_HTTP403，
// R3/R5 实测），而手机直连 /api/ 是 JavRate 先例里“墙拦 HTML 不拦 /api/”的那条腿。
// 调用方用 deadline 封顶；失败回 {}（调用方决定是否走 /resolve 竞速）。
async function postApiPlayDirect(url, form, referer, deadlineMs) {
  var qs = new URLSearchParams(form).toString();
  var hdrs = { ...headers(referer), 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' };
  var cap = 6000;
  if (deadlineMs) cap = Math.max(1000, Math.min(9000, deadlineMs - Date.now()));
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.post(url, qs, { headers: hdrs, timeout: cap }), cap, null);
      return parsePlayResp(r);
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, cap);
        try {
          var r2 = await fetch(url, { method: 'POST', headers: hdrs, body: qs, signal: ctrl ? ctrl.signal : undefined });
          var t2 = await withTimeout(r2.text(), cap, '');
          return parsePlayResp({ data: t2 });
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, cap);
  return won || {};
}

function absUrl(u) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

function cleanText(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// ---------- pornfhd dex：RC4 + base64 两层 ----------
// dex(seed, data, suffix)：
//   key = reverse(b64encode(seed + suffix))
//   mid = RC4(key, b64decode(data))        // mid 本身是一段 base64 文本
//   return b64decode(mid)                  // 还原出明文
// 三处用法（实测确认）：
//   token  = dex(tsId, data-ts-live, '_0x48107a')
//   embed  = dex(tsId, resp.data, 'undefined')   // suffix 字面量就是 'undefined'
//   config = dex(seed, data-config, '_0x59a0e4') // seed = b64(path+query).slice(6,22)
function b64enc(str) { return Buffer.from(String(str), 'utf8').toString('base64'); }
function b64decBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64');
}
function rc4(key, data) {
  var S = [], i, j = 0, a = 0, t;
  for (i = 0; i < 256; i++) S[i] = i;
  for (i = 0; i < 256; i++) { j = (j + S[i] + key.charCodeAt(i % key.length)) & 255; t = S[i]; S[i] = S[j]; S[j] = t; }
  var out = Buffer.alloc(data.length);
  j = 0;
  for (var n = 0; n < data.length; n++) {
    a = (a + 1) & 255; j = (j + S[a]) & 255; t = S[a]; S[a] = S[j]; S[j] = t;
    out[n] = data[n] ^ S[(S[a] + S[j]) & 255];
  }
  return out;
}
function dex(seed, data, suffix) {
  try {
    var key = b64enc(String(seed) + suffix).split('').reverse().join('');
    var mid = rc4(key, b64decBytes(data)).toString('latin1');
    return b64decBytes(mid).toString('latin1');
  } catch (e) { return ''; }
}

// 从 embed 地址取 path+query（seed 用），兼容 //video.javxxx.me 与 hugstream.xyz 等备用域
function embedPathQuery(embedUrl) {
  var u = String(embedUrl || '');
  var m = u.match(/^https?:\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i) || u.match(/^\/\/[^\/]+(\/[^?#]*\?[^?#]*)/i);
  if (m) return m[1];
  try {
    var uu = new URL(u.startsWith('//') ? 'https:' + u : u);
    return uu.pathname + uu.search;
  } catch (e) { return ''; }
}

// 从 embed 页 HTML 解出视频文件：返回 {file, type}（type 取 config sources 的 type，
// 'hls' | 'mp4' | ''）；失败回 null。v8：从旧 resolveEmbed 抽出纯解码，供两路复用。
function decodeEmbedInfo(html, embedUrl) {
  try {
    var cm = String(html || '').match(/data-config="([^"]+)"/);
    if (!cm) return null;
    var pq = embedPathQuery(embedUrl);
    if (!pq) return null;
    var seed = b64enc(pq).slice(6, 22);
    var cfgJson = dex(seed, cm[1], '_0x59a0e4');
    if (!cfgJson) return null;
    var cfg;
    try { cfg = JSON.parse(cfgJson); } catch (e) { return null; }
    if (!cfg || !cfg.src) return null;
    var srcJson = b64decBytes(cfg.src).toString('latin1');
    var sources;
    try { sources = JSON.parse(srcJson); } catch (e) { return null; }
    if (!Array.isArray(sources)) return null;
    for (var i = 0; i < sources.length; i++) {
      var f = sources[i] && (sources[i].file || sources[i].src || '');
      // 注意：streamtape 直链是 get_video?id=...&stream=1，URL 里没有 .mp4 后缀，
      // 不能用 /\.mp4/ 过滤；config 的 sources 只含真实视频文件，直接认 http(s) 地址即可。
      if (f && /^https?:\/\//i.test(f)) return { file: f, type: String(sources[i].type || '') };
    }
    return null;
  } catch (e) { return null; }
}

// 纯直连取页（不走 Worker /f/）：8s 封顶。mp4 兜底专用——直连腿取到的 mp4 才绑手机 IP。
async function getHtmlDirectOnly(url, referer) {
  var hdrs = headers(referer);
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(url, { headers: hdrs, timeout: 8000 }), 8000, null);
      if (!r || r.status !== 200) return null;
      var b = (r && r.data != null) ? String(r.data) : '';
      if (!b || isChallengePage(b)) return null;
      return b;
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 8000);
        try {
          var r2 = await fetch(url, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var b2 = await withTimeout(r2.text(), 8000, '');
          if (!b2 || isChallengePage(b2)) return null;
          return b2;
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, 8000);
  return won || '';
}

// 解一个 embed 页，返回 {file, type}（失败回 null）。
// directOnly=true 时只走直连腿（mp4 兜底用）；否则走 getHtmlOnly（Worker /f/ + 直连 + fetch 竞速）。
async function resolveEmbedInfo(embedUrl, referer, directOnly) {
  try {
    var full = absUrl(embedUrl);
    var html = directOnly ? await getHtmlDirectOnly(full, referer) : await getHtmlOnly(full, referer);
    if (!html) return null;
    return decodeEmbedInfo(html, full);
  } catch (e) { return null; }
}

// ---------- v8：token 缓存（detail → play 直通） ----------
// detail() 已取过 data-ts-live/data-ts-id（/j/detail 直接回，HTML 回落里也有），
// play() 的本地链复用它可省一次详情取页（坏 colo 下一次取页 6~10s，是本地链最大的单项耗时）。
// token 有效期按小时计，缓存 10 分钟；缓存 token 失效时（api 无数据）删缓存、重取详情再试一次。
const TOKEN_TTL = 10 * 60 * 1000;
const tokenCache = new Map();
function tokenCacheGet(vid) {
  var e = tokenCache.get(vid);
  if (!e) return null;
  if (Date.now() - e.ts > TOKEN_TTL) { tokenCache.delete(vid); return null; }
  return e;
}
function tokenCacheSet(vid, live, tid, via) {
  if (!vid || !live || !tid) return;
  tokenCache.set(vid, { live: live, tid: tid, via: via || '', ts: Date.now() });
  if (tokenCache.size > 50) tokenCache.delete(tokenCache.keys().next().value);
}

// 详情页 → embed 列表（主 + reserve，dex 解出）：与旧 resolvePlay 前半段同款，抽出供本地链复用。
// 用给定的 live/tid 调 /api/play/ 并解 embed 列表。
// 回 embeds 数组（可能为空）；回 null 表示 token/接口失败（调用方决定是否重取）。
// ---------- v9：分段铸造（split-casting） ----------
// 切分点 = 绑定交接点：master/变体绑“取 embed 页的那一方 IP”（streamtape mp4 同理，
// v5 注释与 R3 均已坐实）。手机做 token + /api/play/ 直发，Worker 只做 /f/ 取 embed
// （R5 探针：同一 Node 栈 /f/ 取 hugstream embed 2/2 通、671–740ms，解出真 HLS master，
// 经 /h 取 master 200；同一分钟 /resolve 0/6 E_DETAIL）+ /h + /s（PNG 剥头）。
// 分片不绑 IP（VM 轮换出口直取 200 image/png），故 /s 能取手机铸的 token 对应的分片；
// 但 master 绑 Worker 出口，分段路的 HLS 必须经 /f/ 铸、经 /h 取——直连取 embed 解出的
// master 是手机绑定的，包 /h 也取不到（R4 已证），故 HLS 扫描只走 Worker 腿。

// 只走 Worker /f/ 腿取页（req + fetch 竞速，不走直连）：8s 封顶；挑战页/空页回 ''。
// 8s 而非 6s：4 路并行 /f/ 实测单腿 4.3–5.3s（单路 2.2s），6s 会在突发下误杀能赢的腿；
// 扫描总期限仍由调用方 deadlineMs 卡，不会拖过 play/detail 的全局预算。
async function getHtmlWorkerOnly(url, referer) {
  var hdrs = headers(referer);
  var jobs = [];
  jobs.push((async function () {
    try {
      var r = await withTimeout(req.get(viaWorker(url), { headers: hdrs, timeout: 8000 }), 8000, null);
      if (!r || r.status !== 200) return null;
      var b = (r && r.data != null) ? String(r.data) : '';
      if (!b || isChallengePage(b)) return null;
      return b;
    } catch (e) { return null; }
  })());
  if (typeof fetch === 'function') {
    jobs.push((async function () {
      try {
        var ctrl = null;
        try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
        var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 8000);
        try {
          var r2 = await fetch(viaWorker(url), { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
          if (!r2 || r2.status !== 200) return null;
          var b2 = await withTimeout(r2.text(), 8000, '');
          if (!b2 || isChallengePage(b2)) return null;
          return b2;
        } finally { clearTimeout(timer); }
      } catch (e) { return null; }
    })());
  }
  var won = await firstSuccess(jobs, 8000);
  return won || '';
}

// 只走 Worker /f/ 腿解一个 embed 页，返回 {file, type}（失败回 null）。
async function resolveEmbedInfoWorkerOnly(embedUrl, referer) {
  try {
    var full = absUrl(embedUrl);
    var html = await getHtmlWorkerOnly(full, referer);
    if (!html) return null;
    return decodeEmbedInfo(html, full);
  } catch (e) { return null; }
}

// 详情页 → embed 列表（主 + reserve，dex 解出）：用给定的 live/tid 调 /api/play/ 直发。
// 回 embeds 数组（可能为空）；回 null 表示 token/接口失败。
async function decodeEmbedsWithToken(detailUrl, live, tid, deadlineMs) {
  var token = dex(tid, live, '_0x48107a');
  if (!token) return null;
  var resp = await postApiPlayDirect(HOST + '/api/play/', { sources: token, ep: '1', ver: '2' }, detailUrl, deadlineMs);
  if (!resp || resp.status !== true || !resp.data) return null;
  var embeds = [];
  var main = dex(tid, resp.data, 'undefined');
  if (main) embeds.push(main);
  // 备用：reserve 是加密 JSON 数组 [{data, lo}]，每项 data 同样用 dex(tid, data, 'undefined') 解
  try {
    var reserveJson = dex(tid, resp.reserve || '', 'undefined');
    var reserve = JSON.parse(reserveJson);
    if (Array.isArray(reserve)) {
      for (var i = 0; i < reserve.length; i++) {
        if (reserve[i] && reserve[i].data) {
          var e = dex(tid, reserve[i].data, 'undefined');
          if (e && embeds.indexOf(e) === -1) embeds.push(e);
        }
      }
    }
  } catch (e) {}
  return embeds;
}

// 详情页 → embed 列表：先用 detail() 缓存的 token（省一次取页）；
// 缓存无 token 时调用方传入的 live/tid（detail 刚取到的）直接用；
// 两者皆无时回 null（不另取详情页——调用方 deadline 内等不起，/resolve 竞速会兜底）。
async function decodeEmbedsSplit(detailUrl, live, tid, deadlineMs) {
  if (live && tid) {
    var e0 = await decodeEmbedsWithToken(detailUrl, live, tid, deadlineMs);
    if (e0 && e0.length) return e0;
  }
  var cached = tokenCacheGet(detailUrl);
  if (cached && !(live && tid && cached.live === live && cached.tid === tid)) {
    var e1 = await decodeEmbedsWithToken(detailUrl, cached.live, cached.tid, deadlineMs);
    if (e1 && e1.length) return e1;
    tokenCache.delete(detailUrl);
  }
  return null;
}

// 并行 embed 扫描（v9）：全部 embed 一次并行、只走 Worker /f/ 腿，首个 HLS 赢；
// 白名单宿主（pianopic/streamhls/cloudatacdn，可经 /h 取）的 HLS 优先；
// 无白名单 HLS 时回首个非白名单 HLS（maxstream 裸 master 可直取、分片自带 AES-128 密钥，
// R5 probe_max 实测；其余宿主裸播是最后的赌注，好过 parse:1）；
// 无 HLS 时回首个 mp4（呼叫方再决定是否用纯直连重取——Worker 腿取到的 mp4 绑 Worker IP，
// 手机上 403，只有直连重取的才可用）。deadlineMs 封顶，超时回已见的最佳结果。
async function scanEmbedsWorkerOnly(embeds, detailUrl, deadlineMs) {
  var total = embeds.length;
  if (!total) return null;
  var cap = Math.max(1000, deadlineMs - Date.now());
  return new Promise(function (resolve) {
    var done = 0, anyHls = null, mp4First = null, settled = false;
    var timer = setTimeout(function () {
      if (!settled) { settled = true; resolve(anyHls || mp4First); }
    }, cap);
    function isWhite(u) {
      try {
        var h = new URL(u).hostname.toLowerCase();
        return h === 'pianopic.com' || h === 'streamhls.click' || h === 'cloudatacdn.com' || h.endsWith('.cloudatacdn.com');
      } catch (e) { return false; }
    }
    function finish(v) { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } }
    function onSettled(info) {
      if (settled) return;
      done++;
      if (info && info.kind === 'hls') {
        // 白名单看裸 file 的宿主（info.url 已是 /h 包过的地址，宿主是 Worker，不能用来判断）。
        if (info.white) { finish(info); return; }
        if (!anyHls) anyHls = info;
      } else if (info && info.kind === 'mp4' && !mp4First) {
        mp4First = info;
      }
      if (done >= total) finish(anyHls || mp4First);
    }
    embeds.forEach(function (e) {
      resolveEmbedInfoWorkerOnly(e, detailUrl).then(function (inf) {
        if (!inf || !inf.file) return onSettled(null);
        var isHls = inf.type === 'hls' || /\.m3u8(\?|#|$)/i.test(inf.file);
        // 白名单 HLS 在这里包 /h（分片走 /s 剥 PNG 头）；非白名单 HLS 裸回
        // （maxstream 裸 master 可直取，见 R5 probe_max；其余宿主裸播是最后赌注）。
        onSettled(isHls
          ? { url: wrapHlsViaWorker(inf.file), kind: 'hls', referer: absUrl(e), raw: inf.file, white: isWhite(inf.file) }
          : { url: inf.file, kind: 'mp4', referer: absUrl(e) });
      }).catch(function () { onSettled(null); });
    });
  });
}

// 分段路（v9 主路）：详情页 → 最终播放地址（现取现播）。
// token（调用方传入或缓存）→ /api/play/ 直发 → Worker /f/ 并行扫 embed（HLS 优先）
// → 白名单 HLS 包 /h（分片走 /s 剥 PNG 头），非白名单 HLS 裸回（maxstream 同款）。
// 返回 {url, kind:'hls'|'mp4', referer} 或 ''。mp4 不在这里出（Worker 腿的 mp4 绑 Worker IP）。
async function resolvePlaySplit(detailUrl, live, tid, deadlineMs) {
  var embeds = await decodeEmbedsSplit(detailUrl, live, tid, deadlineMs);
  if (!embeds || !embeds.length) return '';
  if (Date.now() >= deadlineMs - 1000) return '';
  var found = await scanEmbedsWorkerOnly(embeds, detailUrl, deadlineMs);
  if (found && found.kind === 'hls') return found;
  return '';
}

// mp4 兜底（v9）：纯直连并行重取 embed（只找 mp4），先拿到的赢；直连取到的 mp4 才绑手机 IP。
// 调用方用 deadlineMs 封顶；无 mp4 回 ''。
async function resolveMp4Direct(detailUrl, embeds, deadlineMs) {
  if (!embeds || !embeds.length) return '';
  var cap = Math.max(1000, deadlineMs - Date.now());
  var dJobs = embeds.map(function (e) {
    return (async function () {
      var inf = await resolveEmbedInfo(e, detailUrl, true);
      if (inf && inf.file && inf.type !== 'hls' && !/\.m3u8(\?|#|$)/i.test(inf.file)) {
        return { url: inf.file, kind: 'mp4', referer: absUrl(e) };
      }
      return null;
    })();
  });
  var won = await firstSuccess(dJobs, cap);
  return won || '';
}

async function init(reqIn) { return {}; }
async function home(reqIn) { return { class: CLASSES, filters: {} }; }
async function homeVod(reqIn) {
  var list = await getJsonList(HOST + '/');
  return { list: list.slice(0, 12) };
}
async function category(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var tid = String(body.tid || body.id || 'home');
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  // v5：首页无翻页——站内首页无 pagination 链接，/page/N/ 实测回第一页内容（两路验证：
  //   Worker /f/ 与 jina 均回同一 28 条），翻页会无限重复。首页固定 28 条单页。
  if (tid === 'home' && page > 1) {
    return { page: page, pagecount: page, limit: 20, total: 28, list: [] };
  }
  var url;
  if (tid === 'home') {
    url = HOST + '/';
  } else {
    var v = VPATH[tid] || '';
    // 第 1 页用站方规范 vXX 地址；翻页用站内实际生成的 /category/<slug>/page/N/（会 301 到 vXX 版）
    url = page > 1
      ? HOST + '/category/' + tid + '/page/' + page + '/'
      : HOST + '/' + v + '/category/' + tid + '/';
  }
  var list = await getJsonList(url);
  var pc = list.length >= 20 ? page + 1 : page;
  return { page: page, pagecount: pc, limit: 20, total: 999, list: list };
}
async function detail(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var vid = String(body.id || '').trim();
  if (!vid) return { list: [] };
  // v11：档位发现等 12 秒（从 detail 起跑算起），超时/失败回单条“播放”。
  // v10 的 8 秒不够直连腿（本身 6 秒封顶）+ 档位发现走完；12 秒仍有界。
  // 另修 v9 的 bug：detail() 里 entryP（tokenP.then(getMasterEntrySplit)）定义后从未被 await，
  // 却仍在后台跑完一整条分段链（又一次 apiPlay POST + 4 路并行 /f/ 扫描），与下面
  // withTimeout 里的第二次 getMasterEntrySplit 调用重复——每次打开详情页都向上游发两套铸造请求。
  // v10 只跑一次：entryP 定义后由下面唯一一次 withTimeout 结算。
  var detailDeadline = Date.now() + 12000;
  // jina 详情页只取一次：tokenP 与 baseP 共用同一份承诺，不重复发 jina（jina 也会 429）。
  var jinaDetailP = getJinaDetail(vid, detailDeadline);
  var tokenP = getTokenAll(vid, detailDeadline, jinaDetailP);
  var baseP = getBaseAll(vid, detailDeadline, jinaDetailP);
  // 档位发现与基础取数并行起跑（共用 tokenP，不等基础取数先结算）。
  var entryP = tokenP.then(function (tk) {
    return getMasterEntrySplit(vid, tk.live, tk.tid, detailDeadline);
  }).catch(function () { return null; });
  // v14：/resolve 也参与档位发现（全 Worker 链，与分段路并行竞速，先出变体者赢）。
  // 分段路在手机上常因 token/直发被墙而空手，/resolve 在好 colo 上 2-7s 即出 master；
  // play() 只有 8s 常等不到它，detail() 有 12s，把它挪到详情页发现并缓存，play() 即可 0 秒出线。
  var resolveEntryP = (async function () {
    try {
      var rv = await withTimeout(getResolve(vid), Math.max(1000, detailDeadline - Date.now()), null);
      if (!rv || !rv.url) return null;
      if (rv.kind !== 'hls' && !/\.m3u8(\?|#|$)/i.test(rv.url)) return null;
      return await entryFromMasterUrl(rv.url, detailDeadline);
    } catch (e) { return null; }
  })();
  // v16：resolve2EntryP 改成 tokenP.then 链式创建（与 entryP、resolveEntryP 同时起跑，
  // token 一到即发 /resolve2，不再等 `await tokenP` 之后才创建）。
  var diag = { tk: '', r2: '', r: '', sp: '' };
  var resolve2EntryP = tokenP.then(function (tk2) {
    return (async function () {
      try {
        if (!tk2 || !tk2.live || !tk2.tid) { diag.r2 = '-'; return null; }
        var rv2 = await withTimeout(getResolve2(tk2.live, tk2.tid, vid, detailDeadline), Math.max(1000, detailDeadline - Date.now()), null);
        if (!rv2 || !rv2.url) { diag.r2 = 'fail'; return null; }
        if (rv2.kind !== 'hls' && !/\.m3u8(\?|#|$)/i.test(rv2.url)) { diag.r2 = 'nonhls'; return null; }
        var e2 = await entryFromMasterUrl(rv2.url, detailDeadline);
        diag.r2 = e2 ? 'ok' : 'noentry';
        return e2;
      } catch (e) { diag.r2 = 'err'; return null; }
    })();
  });
  // 诊断：记录 entryP（分段路）与 resolveEntryP（/resolve）的结果。
  var entryP2 = entryP.then(function (e) { diag.sp = e ? 'ok' : 'fail'; return e; });
  var resolveEntryP2 = resolveEntryP.then(function (e) { diag.r = e ? 'ok' : 'fail'; return e; });
  var tk = await tokenP;
  var live = tk.live;
  var tid = tk.tid;
  diag.tk = (tk.via || '-') ;
  if (live && tid) tokenCacheSet(vid, live, tid, tk.via);
  var base = await withTimeout(baseP, Math.max(500, detailDeadline - Date.now()), { name: '', pic: '', desc: '' });
  var name = base.name;
  var pic = base.pic;
  var desc = base.desc;
  // 只存详情页地址；play() 里现取现播（token 约 19.5 小时过期且绑 IP，不能提前解好）
  // 字幕：token-key 登记——detail 只存详情页地址 vid，play 按 vid 查名（javsaga 同款 subRegister/subAttach 模式）；
  // 直链分支（id 已是 streamtape/m3u8 地址）查不到缓存是正常的，与 javtiful 一致。
  if (name) { subCacheName(vid, name); subWarm(vid); }
  // v10：档位行。有几档出几行（master 变体表实测值，不编造）；取不到变体回单条“播放”。
  var playUrl = '播放$' + vid;
  try {
    var entry = await firstSuccess([entryP2, resolveEntryP2, resolve2EntryP], Math.max(1000, detailDeadline - Date.now()));
    if (entry && entry.variants && entry.variants.length) {
      masterCacheSet(vid, entry);
      playUrl = entry.variants.map(function (v) { return v.h + 'p$' + vid + '|q=' + v.h; }).join('#');
    }
  } catch (e) {}
  return {
    list: [{
      vod_id: vid,
      vod_name: name || 'JavXXX',
      vod_pic: pic,
      vod_content: desc,
      vod_play_from: NAME,
      vod_remarks: 'tk:' + (diag.tk || '-') + ' r2:' + (diag.r2 || '-') + ' r:' + (diag.r || '-') + ' sp:' + (diag.sp || '-'),
      vod_play_url: playUrl,
    }],
  };
}
// v9 play()：两条独立铸造路并行竞速，先赢者出线，8 秒全局封顶。
//   A 分段路：token（缓存或现取）→ /api/play/ 直发 → Worker /f/ 取 embed → /h 包 master。
//   B /resolve 单次：Worker 内全链（坏 colo 上死腿，但好 colo 上 2.2–6.6s 即赢，不可丢）。
// 两路 t=0 同时起跑（v8 的本地腿延迟 5s 是纯浪费）；无重试、无串行、无字幕等待。
// 字幕只挂已缓存的（detail() 已 warm）；未缓存不挂、不等——播不出来时字幕毫无意义。
// q 选档只用缓存的变体表（detail 已解析过）；缓存未命中回 master（播放器自适应）。
async function play(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var id = String(body.id || '').trim();
  if (id.indexOf('$') !== -1) id = id.split('$').pop().trim();
  // 剥 |q=<height> 档位后缀（detail 的档位行带上来的）；剥完才是干净 vid
  var q = 0;
  var mQ = id.match(/\|q=(\d{3,4})$/);
  if (mQ) { q = parseInt(mQ[1], 10); id = id.slice(0, mQ.index); }
  var playDeadline = Date.now() + 8000;
  var attachCached = function (res) {
    return subCached(res, subNormKey(id));
  };
  // 已是直链（m3u8/mp4，或 streamtape 的 get_video 直链，URL 里无 .mp4 后缀）则直接播；
  // 裸 .m3u8（pianopic/streamhls）包一层 Worker /h 再播，分片走 /s 剥 PNG 头；
  // 有 q 且缓存有变体表才按档选，否则回 master（播放器自适应）。
  if (/\.(m3u8|mp4)(\?|$)/i.test(id) || /streamtape\.(com|net)\/get_video/i.test(id)) {
    var directUrl = id;
    if (/\.m3u8(\?|#|$)/i.test(id)) {
      var wrapped = wrapHlsViaWorker(id);
      var dc = masterCacheGet(id);
      directUrl = (q > 0 && dc && dc.masterHUrl === wrapped) ? pickVariantFromEntry(dc, q) : wrapped;
    }
    return attachCached({ parse: 0, url: directUrl, header: { 'User-Agent': UA, 'Referer': HOST + '/' } });
  }
  // 缓存命中（detail 已解析过变体）直接出线，不再现算——play() 约 0 秒结算。
  var cached = masterCacheGet(id);
  if (cached && cached.masterHUrl) {
    var curl2 = pickVariantFromEntry(cached, q);
    if (curl2) {
      return attachCached({ parse: 0, url: curl2, header: { 'User-Agent': UA, 'Referer': HOST + '/' } });
    }
  }
  // token：缓存优先（detail 已取过时 0 秒）；无缓存则取 token（见 getTokenAll：
  // v13 起 direct 优先，Worker/jina 只作回落）。token 拿不到时分段路直接判死，
  // 只剩 /resolve 路竞速。
  var live0 = '';
  var tid0 = '';
  var tc0 = tokenCacheGet(id);
  if (tc0) { live0 = tc0.live; tid0 = tc0.tid; }
  var tokenP = (async function () {
    if (live0 && tid0) return { live: live0, tid: tid0 };
    var tk0 = await getTokenAll(id, playDeadline);
    if (tk0 && tk0.live && tk0.tid) {
      tokenCacheSet(id, tk0.live, tk0.tid, tk0.via);
      return { live: tk0.live, tid: tk0.tid };
    }
    return { live: '', tid: '' };
  })();
  var splitJob = tokenP.then(function (tk) {
    return (async function () {
      try {
        if (!tk.live || !tk.tid) return null;
        var r = await resolvePlaySplit(id, tk.live, tk.tid, playDeadline);
        if (r && r.url) return { url: r.url, kind: r.kind, referer: r.referer || (HOST + '/'), via: 'split' };
      } catch (e) {}
      return null;
    })();
  });
  var resolveJob = (async function () {
    try {
      var rv = await withTimeout(getResolve(id), Math.max(1000, playDeadline - Date.now()), null);
      if (rv && rv.url) {
        var kind = rv.kind === 'mp4' ? 'mp4' : (rv.kind === 'hls' ? 'hls' : (/\.m3u8(\?|#|$)/i.test(rv.url) ? 'hls' : 'mp4'));
        return { url: rv.url, kind: kind, referer: HOST + '/', via: 'resolve' };
      }
    } catch (e) {}
    return null;
  })();
  var resolve2Job = tokenP.then(function (tk) {
    return (async function () {
      try {
        if (!tk.live || !tk.tid) return null;
        var rv2 = await withTimeout(getResolve2(tk.live, tk.tid, id, playDeadline), Math.max(1000, playDeadline - Date.now()), null);
        if (rv2 && rv2.url) {
          var kind2 = rv2.kind === 'mp4' ? 'mp4' : (rv2.kind === 'hls' ? 'hls' : (/\.m3u8(\?|#|$)/i.test(rv2.url) ? 'hls' : 'mp4'));
          return { url: rv2.url, kind: kind2, referer: HOST + '/', via: 'resolve2' };
        }
      } catch (e) {}
      return null;
    })();
  });
  var won = await firstSuccess([splitJob, resolveJob, resolve2Job], Math.max(1000, playDeadline - Date.now()));
  if (won && won.url) {
    var finalUrl = won.url;
    var referer = won.referer || (HOST + '/');
    if (won.kind === 'hls' || /\.m3u8(\?|#|$)/i.test(won.url)) {
      // 分段路回的已是 /h 包过的 master（scanEmbedsWorkerOnly 里包过）；/resolve 回的同理。
      // 这里只做 q 选档：缓存有变体表才选，否则回 master 本身（播放器自适应）。
      var ec = masterCacheGet(id);
      if (q > 0 && ec && ec.masterHUrl) {
        finalUrl = pickVariantFromEntry(ec, q);
      } else if (q > 0 && /\/h\?u=/.test(won.url)) {
        // 无缓存但带 q：master 文本现取一次（5s 封顶，超时回 master；仍在 deadline 内才做）。
        if (Date.now() < playDeadline - 1500) {
          var txt = await fetchMasterText(won.url, Math.min(5000, playDeadline - Date.now()));
          var vs = parseHlsVariants(txt, won.url);
          if (vs.length) {
            masterCacheSet(id, { masterHUrl: won.url, variants: vs });
            finalUrl = pickVariantFromEntry({ masterHUrl: won.url, variants: vs }, q);
          }
        }
      }
    }
    return attachCached({ parse: 0, url: finalUrl, header: { 'User-Agent': UA, 'Referer': referer } });
  }
  // 两路皆败、时间尚有剩余：mp4 直连兜底（直连重取 embed，绑手机 IP 的 mp4 才能播）。
  if (Date.now() < playDeadline - 1000) {
    try {
      var tk2 = await withTimeout(tokenP, Math.max(500, playDeadline - Date.now()), { live: '', tid: '' });
      if (tk2 && tk2.live && tk2.tid) {
        var embeds2 = await decodeEmbedsSplit(id, tk2.live, tk2.tid, playDeadline);
        if (embeds2 && embeds2.length) {
          var mp4 = await resolveMp4Direct(id, embeds2, playDeadline);
          if (mp4 && mp4.url) {
            return attachCached({ parse: 0, url: mp4.url, header: { 'User-Agent': UA, 'Referer': mp4.referer || (HOST + '/') } });
          }
        }
      }
    } catch (e) {}
  }
  return attachCached({ parse: 1, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } });
}

async function search(reqIn) {
  var body = (reqIn && reqIn.body) || {};
  var wd = String(body.wd || '').trim();
  var page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page: page, pagecount: 1, limit: 20, total: 0, list: [] };
  // 站内搜索：/?s=<kw> 301 到 /search/<kw>/；直接用后者
  var url = page > 1
    ? HOST + '/search/' + encodeURIComponent(wd) + '/page/' + page + '/'
    : HOST + '/search/' + encodeURIComponent(wd) + '/';
  // 搜索结果可能只有 1 条（如 SSNI-229），下限放 1；分类/首页仍用默认 3。
  var list = await getJsonList(url, 1);
  return { page: page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: 999, list: list };
}

// ---------------- 字幕聚合接线（2026-11-11） ----------------
// reqRaw + clean：字幕芯（subcore.js，2026-11-02 定版）需要的两个伴生 helpers，芯本身不含；
// 与已接芯的 py_javtiful 同款。芯原文逐字粘贴在后，未改一字。
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
function clean(s) { return cleanText(String(s || '').replace(/<[^>]*>/g, ' ')); }

// subNormKey / subAttach：javsaga 同款 token-key 模式——play 入参剥掉 "集名$" 前缀后按 vid 查名；
// 仅当结果带 url 且字幕命中时才挂 subs 键。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}
// v9：play() 不再 await 字幕搜索（v8 的 subAttach 等满 6 秒预算，是 play 超时的元凶之一）。
// 字幕只挂 subResultCache 里已有的（detail() 的 subWarm 已提前跑完）；本函数保留给
// 未来调用方复用，play() 内用的是同步的 attachCached（见 play）。
function subCached(res, durl) {
  try {
    var hit = subResultCache.get(durl);
    if (hit && Date.now() - hit.ts < SUB_TTL && hit.subs && hit.subs.length && res && res.url) res.subs = hit.subs;
  } catch (e) {}
  return res;
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

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/homeVod', homeVod);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}

