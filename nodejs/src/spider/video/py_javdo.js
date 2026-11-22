// jav.do - CatPawOpen JS Spider（2026-11-15 新源，L2 组）
// 站点：https://jav.do/（Laravel 站；视频页 /videos/<slug>，slug 含番号+标题）
// 结构（2026-11-15 VM 全链实测）：
//  - 列表：卡片 <a href="https://jav.do/videos/<slug>" title="CODE - 标题" aria-label=…>
//    内 <img src="https://img.jav.do/videos/…-poster-….webp">；分页 ?page=N。
//  - 顶级分类：最新 /videos、Reducing Mosaic（站内无此类型页，走搜索
//    /search?q=reducing-mosaic，77 条实测）；类型筛选：/genres 索引 192 个真实
//    类型（/genres/<slug>，8 页全量抓取）。
//  - 搜索：/search?q=<kw>（GET，name=q）。
//  - 播放（关键：resolve 必须同会话 XSRF-TOKEN Cookie + meta csrf-token，
//    光带 token 不带 Cookie 回 419；票据 expires_in 180 秒，play 时现取现投）：
//    详情页按钮 data-resolve-url="…/videos/<slug>/servers/{id}/resolve"、
//    data-embed-url="https://www.dooplayer.com/embed/e/…"；
//    POST resolve（body '{}'，头 Accept/Content-Type/X-CSRF-TOKEN/
//    X-Requested-With + Cookie）回 {"ok":true,"type":"video",
//    "url":"https://cdn.mostplayer.com/stream?t=…",
//    "proxy_url":"…/servers/{id}/media","fallback_url":"…dooplayer…","expires_in":180}；
//    直链 url 新鲜时 200 video/mp4（DLDSS-532 实测 49.9MB，ftyp isom avc1）；
//    proxy_url 实测恒 502（站方媒体代理坏）、dooplayer embed 实测 204 空，
//    故只出单行「正片」MP4，不编造档位；resolve 失败时回 parse:1 网页嗅探行。
//    注意：猫源 App 不向蜘蛛回传 Set-Cookie（设备侧已证），真机上直连线
//    恒 419；2026-11-15 改走 javdo-fetch Worker 中转（单次调用内抓详情页
//    接 Cookie 再 POST resolve），直连线只作回落；嗅探行仍为最后兜底。
// 字幕：接定版字幕芯（Layer A，见文件尾），有番号一律接。
import req from '../../util/req.js';

const KEY = 'py_javdo';
const NAME = 'jav.do';
const HOST = 'https://jav.do';
// javdo-fetch Worker：App 不回传 Set-Cookie，手机直解恒 419，改走 Worker 中转
// （Worker 单次调用内抓详情页接 Cookie 再 POST resolve；直链不绑 IP/Cookie、
// 180 秒过期，点播时现调现解）。Worker 未部署/失败时返回空，走直连回落。
const WORKER = 'https://javdo-fetch.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function H(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || HOST + '/',
  };
}

async function getFull(url, referer) {
  try {
    const r = await req.get(url, { headers: H(referer), timeout: 15000 });
    return { text: String(r.data || ''), headers: r.headers || {}, status: r.status || 0 };
  } catch { return { text: '', headers: {}, status: 0 }; }
}

async function getText(url, referer) {
  const r = await getFull(url, referer);
  return r.text;
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function t(v) { return String(v == null ? '' : v).trim(); }
function clean(s) {
  return t(s).replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

// 卡片：缩略图锚点 <a href="https://jav.do/videos/<slug>" title="CODE - 标题" aria-label=…>
//   内 <img src="https://img.jav.do/…poster….webp" alt="…">；h3 标题锚点无 aria-label，不重复计
function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a href="(https:\/\/jav\.do\/videos\/[^"]+)" title="([^"]*)" aria-label="[^"]*">([\s\S]{0,2000}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const title = clean(m[2]);
    if (!title || title.length < 2) continue;
    let pic = '';
    const im = m[3].match(/<img[^>]*src\s*=\s*"([^"]+)"/i);
    if (im && im[1] && !/placeholder/i.test(im[1])) pic = im[1];
    items.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: '' });
    if (items.length >= 60) break;
  }
  return items;
}

function parsePagecount(html) {
  if (!html) return 1;
  html = String(html).replace(/&amp;/g, '&');
  const pages = [];
  const re = /[?&]page=(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) pages.push(parseInt(m[1], 10) || 1);
  if (!pages.length) return 1;
  return Math.max.apply(null, pages);
}

const CATS = [
  { type_id: 'latest', type_name: '最新', path: '/videos' },
  { type_id: 'rm', type_name: 'Reducing Mosaic', path: '/search?q=reducing-mosaic' },
  // 2026-11-23 加 5 个分类：均为站内 /search?q= 真实可验（各 25 条/页，标题对题；&page=2 已验通）
  // 子代理逐个验过 14 个候选词后定稿：censored/amateur/4k 因结果混杂/对题度差被排除，改用以下三家
  { type_id: 'uncensored', type_name: 'Uncensored', path: '/search?q=uncensored' },
  { type_id: 'fc2', type_name: 'FC2', path: '/search?q=fc2' },
  { type_id: 'heyzo', type_name: 'HEYZO', path: '/search?q=heyzo' },
  { type_id: 'caribbean', type_name: 'Caribbeancom', path: '/search?q=caribbean' },
  { type_id: 'vr', type_name: 'VR', path: '/search?q=vr' },
];
const PATH_BY_ID = {};
for (const c of CATS) PATH_BY_ID[c.type_id] = c.path;

// 类型筛选（/genres 索引 192 个真实类型，2026-11-15 实测 8 页全量抓取；站内英文名原样，不翻译不编造）
const GENRE_FILTER = [
  { n: '全部', v: '' },
  { n: '3P', v: '3p' },
  { n: '4HR+', v: '4hr' },
  { n: '4P', v: '4p' },
  { n: '69', v: '69' },
  { n: 'Abuse', v: 'abuse' },
  { n: 'Acme · Orgasm', v: 'acme-orgasm' },
  { n: 'Actress Best', v: 'actress-best' },
  { n: 'Affair', v: 'affair' },
  { n: 'Amateur', v: 'amateur' },
  { n: 'Anal', v: 'anal' },
  { n: 'Anchorwoman', v: 'anchorwoman' },
  { n: 'Aunt', v: 'aunt' },
  { n: 'AV Actress', v: 'av-actress' },
  { n: 'Back', v: 'back' },
  { n: 'Bath', v: 'bath' },
  { n: 'BBW', v: 'bbw' },
  { n: 'Beautiful Girl', v: 'beautiful-girl' },
  { n: 'Beauty Shop', v: 'beauty-shop' },
  { n: 'Best', v: 'best' },
  { n: 'Big Tits', v: 'big-tits' },
  { n: 'Bitch', v: 'bitch' },
  { n: 'Black Actor', v: 'black-actor' },
  { n: 'Bloomers', v: 'bloomers' },
  { n: 'Blow', v: 'blow' },
  { n: 'Blu-ray', v: 'blu-ray' },
  { n: 'Bondage', v: 'bondage' },
  { n: 'Breast Milk', v: 'breast-milk' },
  { n: 'Breasts', v: 'breasts' },
  { n: 'Bride', v: 'bride' },
  { n: 'Bukkake', v: 'bukkake' },
  { n: 'Bunny Girl', v: 'bunny-girl' },
  { n: 'Business Attire', v: 'business-attire' },
  { n: 'Busty Fetish', v: 'busty-fetish' },
  { n: 'Butt', v: 'butt' },
  { n: 'Cervix', v: 'cervix' },
  { n: 'Close Up', v: 'close-up' },
  { n: 'Conceived', v: 'conceived' },
  { n: 'Confinement', v: 'confinement' },
  { n: 'Cosplay', v: 'cosplay' },
  { n: 'Couple', v: 'couple' },
  { n: 'Cowgirl', v: 'cowgirl' },
  { n: 'Creampie', v: 'creampie' },
  { n: 'Cross Dressing', v: 'cross-dressing' },
  { n: 'Cuckold', v: 'cuckold' },
  { n: 'Cum', v: 'cum' },
  { n: 'Cunnilingus', v: 'cunnilingus' },
  { n: 'Date', v: 'date' },
  { n: 'Dead Drunk', v: 'dead-drunk' },
  { n: 'Debut Production', v: 'debut-production' },
  { n: 'Deep Throating', v: 'deep-throating' },
  { n: 'Delusion', v: 'delusion' },
  { n: 'Digital Mosaic', v: 'digital-mosaic' },
  { n: 'Dildo', v: 'dildo' },
  { n: 'Dirty Words', v: 'dirty-words' },
  { n: 'Documentary', v: 'documentary' },
  { n: 'Drama', v: 'drama' },
  { n: 'Drinking Party', v: 'drinking-party' },
  { n: 'Drug', v: 'drug' },
  { n: 'Elder Male', v: 'elder-male' },
  { n: 'Electric Massager', v: 'electric-massager' },
  { n: 'Enema', v: 'enema' },
  { n: 'Entertainer', v: 'entertainer' },
  { n: 'Erotic Wear', v: 'erotic-wear' },
  { n: 'Evil', v: 'evil' },
  { n: 'Facesitting', v: 'facesitting' },
  { n: 'Facials', v: 'facials' },
  { n: 'Fan Appreciation', v: 'fan-appreciation' },
  { n: 'Female Boss', v: 'female-boss' },
  { n: 'Female College Student', v: 'female-college-student' },
  { n: 'Female Doctor', v: 'female-doctor' },
  { n: 'Female Investigator', v: 'female-investigator' },
  { n: 'Female Teacher', v: 'female-teacher' },
  { n: 'Fighting Action', v: 'fighting-action' },
  { n: 'Finger Fuck', v: 'finger-fuck' },
  { n: 'Footjob', v: 'footjob' },
  { n: 'Foreign Objects', v: 'foreign-objects' },
  { n: 'Gal', v: 'gal' },
  { n: 'Gangbang', v: 'gangbang' },
  { n: 'Girl', v: 'girl' },
  { n: 'Glasses', v: 'glasses' },
  { n: 'Handjob', v: 'handjob' },
  { n: 'Hardcore', v: 'hardcore' },
  { n: 'High Quality VR', v: 'high-quality-vr' },
  { n: 'Hostess', v: 'hostess' },
  { n: 'Hot Spring', v: 'hot-spring' },
  { n: 'Huge Butt', v: 'huge-butt' },
  { n: 'Huge Cock', v: 'huge-cock' },
  { n: 'Humiliation', v: 'humiliation' },
  { n: 'Hypnosis', v: 'hypnosis' },
  { n: 'Image Video', v: 'image-video' },
  { n: 'Immediate Oral', v: 'immediate-oral' },
  { n: 'Impromptu Sex', v: 'impromptu-sex' },
  { n: 'Incest', v: 'incest' },
  { n: 'Instructor', v: 'instructor' },
  { n: 'Kimono', v: 'kimono' },
  { n: 'Kiss', v: 'kiss' },
  { n: 'Landlady', v: 'landlady' },
  { n: 'Leg Fetish', v: 'leg-fetish' },
  { n: 'Leotard', v: 'leotard' },
  { n: 'Lesbian', v: 'lesbian' },
  { n: 'Lesbian Kiss', v: 'lesbian-kiss' },
  { n: 'Lingerie', v: 'lingerie' },
  { n: 'Long Boots', v: 'long-boots' },
  { n: 'Lotion', v: 'lotion' },
  { n: 'Love', v: 'love' },
  { n: 'Maid', v: 'maid' },
  { n: 'Male Squirting', v: 'male-squirting' },
  { n: 'Married Woman', v: 'married-woman' },
  { n: 'Massage', v: 'massage' },
  { n: 'Masturbation', v: 'masturbation' },
  { n: 'Masturbation Support', v: 'masturbation-support' },
  { n: 'Mature Woman', v: 'mature-woman' },
  { n: 'Mini', v: 'mini' },
  { n: 'Mini Skirt', v: 'mini-skirt' },
  { n: 'Miss', v: 'miss' },
  { n: 'Molester', v: 'molester' },
  { n: 'Mother', v: 'mother' },
  { n: 'Mother-in-law', v: 'mother-in-law' },
  { n: 'Mourning', v: 'mourning' },
  { n: 'Multiple Story', v: 'multiple-story' },
  { n: 'Muscle', v: 'muscle' },
  { n: 'Nampa', v: 'nampa' },
  { n: 'Nasty', v: 'nasty' },
  { n: 'No Bra', v: 'no-bra' },
  { n: 'Nurse', v: 'nurse' },
  { n: 'OL', v: 'ol' },
  { n: 'Older Sister', v: 'older-sister' },
  { n: 'Omnibus', v: 'omnibus' },
  { n: 'Original Collaboration', v: 'original-collaboration' },
  { n: 'Other Fetish', v: 'other-fetish' },
  { n: 'Outdoors', v: 'outdoors' },
  { n: 'Pantyhose', v: 'pantyhose' },
  { n: 'Piss Drinking', v: 'piss-drinking' },
  { n: 'Planning', v: 'planning' },
  { n: 'POV', v: 'pov' },
  { n: 'Prank', v: 'prank' },
  { n: 'Promiscuity', v: 'promiscuity' },
  { n: 'Prostitutes', v: 'prostitutes' },
  { n: 'Race Queen', v: 'race-queen' },
  { n: 'Rape', v: 'rape' },
  { n: 'Restraint', v: 'restraint' },
  { n: 'Restraints', v: 'restraints' },
  { n: 'Risky Mosaic', v: 'risky-mosaic' },
  { n: 'Sailor Suit', v: 'sailor-suit' },
  { n: 'School Girls', v: 'school-girls' },
  { n: 'School Stuff', v: 'school-stuff' },
  { n: 'School Swimsuit', v: 'school-swimsuit' },
  { n: 'School Uniform', v: 'school-uniform' },
  { n: 'Secretary', v: 'secretary' },
  { n: 'Sexy', v: 'sexy' },
  { n: 'Shaved', v: 'shaved' },
  { n: 'Shibari', v: 'shibari' },
  { n: 'Sister', v: 'sister' },
  { n: 'Slender', v: 'slender' },
  { n: 'Slut', v: 'slut' },
  { n: 'SM', v: 'sm' },
  { n: 'Soapland', v: 'soapland' },
  { n: 'Solowork', v: 'solowork' },
  { n: 'Special Effects', v: 'special-effects' },
  { n: 'Sport', v: 'sport' },
  { n: 'Squirting', v: 'squirting' },
  { n: 'Stepmother', v: 'stepmother' },
  { n: 'Stewardess', v: 'stewardess' },
  { n: 'Subjectivity', v: 'subjectivity' },
  { n: 'Submissive Men', v: 'submissive-men' },
  { n: 'Submissive Woman', v: 'submissive-woman' },
  { n: 'Subordinates / Colleagues', v: 'subordinates-colleagues' },
  { n: 'Sun tan', v: 'sun-tan' },
  { n: 'Sweat', v: 'sweat' },
  { n: 'Swimsuit', v: 'swimsuit' },
  { n: 'Tall', v: 'tall' },
  { n: 'Tits', v: 'tits' },
  { n: 'Titty Fuck', v: 'titty-fuck' },
  { n: 'Toy', v: 'toy' },
  { n: 'Training', v: 'training' },
  { n: 'Transsexual', v: 'transsexual' },
  { n: 'Travel', v: 'travel' },
  { n: 'Tutor', v: 'tutor' },
  { n: 'Ultra-Huge Tits', v: 'ultra-huge-tits' },
  { n: 'Underwear', v: 'underwear' },
  { n: 'Uniform', v: 'uniform' },
  { n: 'Urination', v: 'urination' },
  { n: 'User Submission', v: 'user-submission' },
  { n: 'Various Professions', v: 'various-professions' },
  { n: 'Vibe', v: 'vibe' },
  { n: 'Virgin', v: 'virgin' },
  { n: 'Virgin Man', v: 'virgin-man' },
  { n: 'Voyeur', v: 'voyeur' },
  { n: 'VR', v: 'vr' },
  { n: 'White Actress', v: 'white-actress' },
  { n: 'Widow', v: 'widow' },
  { n: 'Young Wife', v: 'young-wife' },
];

function filtersFor() {
  return [
    { key: 'genre', name: '类型', value: GENRE_FILTER },
  ];
}

function fltVal(flt, key) {
  const v = flt ? flt[key] : '';
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') return t(v.value || v.v || '');
  return '';
}

async function init() { return {}; }

async function home() {
  const cls = CATS.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  for (const c of CATS) filters[c.type_id] = filtersFor();
  return { class: cls, filters };
}

function listUrl(id, page, genre) {
  let url;
  if (genre) {
    url = HOST + '/genres/' + encodeURIComponent(genre);
  } else if (id === 'rm') {
    url = HOST + '/search?q=reducing-mosaic';
  } else {
    url = HOST + (PATH_BY_ID[id] || '/videos');
  }
  if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  return url;
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const flt = body.filters || body.extend || {};
  const genre = fltVal(flt, 'genre');
  const url = listUrl(id, page, genre);
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: parsePagecount(html), limit: 90, total: list.length ? 999999 : 0, list };
}

async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const url = HOST + '/search?q=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: parsePagecount(html), limit: 90, total: list.length, list };
}

// Set-Cookie -> Cookie 头（只取真实 cookie 名值，剔 expires/path/domain 等属性；
// 多个 Set-Cookie 拼成逗号串时也能抠；App 不回传时返回空串，调用方靠失败降级）
const COOKIE_ATTRS = { expires: 1, path: 1, domain: 1, 'max-age': 1, samesite: 1, secure: 1, httponly: 1 };
function cookieFromHeaders(headers) {
  try {
    if (!headers) return '';
    let raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
    if (Array.isArray(raw)) raw = raw.join(', ');
    if (typeof raw !== 'string' || !raw) return '';
    const pairs = [];
    const seen = new Set();
    const re = /([A-Za-z0-9_-]+)=([^;,]+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const name = m[1];
      if (COOKIE_ATTRS[name.toLowerCase()]) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      pairs.push(name + '=' + m[2].trim());
    }
    return pairs.join('; ');
  } catch (e) { return ''; }
}

// 详情页 -> resolve POST 取直链（现取现投，票据 180 秒）
async function resolvePlay(durl, html, cookie) {
  const tm = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const rm = html.match(/data-resolve-url="([^"]+)"/i);
  const em = html.match(/data-embed-url="([^"]+)"/i);
  const embedUrl = em ? em[1] : '';
  if (!tm || !rm) return { url: '', embedUrl };
  try {
    const headers = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': tm[1],
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': durl,
    };
    if (cookie) headers['Cookie'] = cookie;
    const { data } = await req.post(rm[1], '{}', { headers, timeout: 15000 });
    const j = typeof data === 'string' ? JSON.parse(data) : data;
    if (j && j.ok && j.url) return { url: String(j.url), embedUrl };
  } catch {}
  return { url: '', embedUrl };
}

// Worker 中转解析（主修法）：GET {WORKER}/resolve?u=<详情URL>，Worker 在单次调用内
// 完成 详情页取 Cookie -> POST resolve 全链，返回新鲜直链；失败返回空，不抛错。
async function resolveViaWorker(durl) {
  try {
    const r = await req.get(WORKER + '/resolve?u=' + encodeURIComponent(durl), { timeout: 20000, validateStatus: () => true });
    const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (j && j.ok && j.url) return { url: String(j.url), embedUrl: j.embedUrl || '' };
    return { url: '', embedUrl: (j && j.embedUrl) || '' };
  } catch (e) { return { url: '', embedUrl: '' }; }
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn && reqIn.body && reqIn.body.id) ? reqIn.body.id : [reqIn && reqIn.body && reqIn.body.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    const durl = /^https?:\/\//i.test(raw) ? raw : HOST + (String(raw).startsWith('/') ? raw : '/' + raw);
    const html = await getText(durl, HOST + '/');
    const tm = html.match(/<title>([^<]*)<\/title>/i);
    const title = tm ? clean(tm[1]) : 'jav.do';
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const pic = og ? og[1] : '';
    const em = html.match(/data-embed-url="([^"]+)"/i);
    const embedUrl = em ? em[1] : '';
    // 正片走 play 时现取现投（票据 180 秒，detail 时不预解）；网页播放为嗅探兜底
    const playUrl = '正片$' + durl + (embedUrl ? '#网页播放$' + embedUrl : '');
    const vod = { vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: playUrl };
    try {
      subRegister([durl], vod);
    } catch (e) {}
    list.push(vod);
  }
  return { list };
}

async function play(reqIn) {
  let id = String((reqIn && reqIn.body && reqIn.body.id) || '').trim();
  id = subNormKey(id);
  if (!id) return { parse: 1, url: '' };
  if (/dooplayer\.com/i.test(id)) return { parse: 1, url: id };
  const isVideo = /\.(m3u8|mp4)/i.test(id) || /mostplayer\.com\/stream/i.test(id);
  if (isVideo) {
    const subs = await subSearchAll(id).catch(() => []);
    const result = {
      parse: 0,
      url: id,
      header: { 'User-Agent': UA, 'Referer': HOST + '/' },
    };
    if (subs && subs.length) result.subs = subs;
    return result;
  }
  if (/jav\.do\/videos\//i.test(id)) {
    const durl = id;
    // ① Worker 中转（手机直解 419 的主修法）
    let res = await resolveViaWorker(durl);
    if (res.url) {
      const subs = await subSearchAll(durl).catch(() => []);
      const result = {
        parse: 0,
        url: res.url,
        header: { 'User-Agent': UA, 'Referer': durl },
      };
      if (subs && subs.length) result.subs = subs;
      return result;
    }
    // ② 直连回落（VM/harness 侧 Cookie 通时可走；手机侧 419 后继续降级）
    const r = await getFull(durl, HOST + '/');
    const cookie = cookieFromHeaders(r.headers);
    res = r.text ? await resolvePlay(durl, r.text, cookie) : { url: '', embedUrl: '' };
    if (res.url) {
      const subs = await subSearchAll(durl).catch(() => []);
      const result = {
        parse: 0,
        url: res.url,
        header: { 'User-Agent': UA, 'Referer': durl },
      };
      if (subs && subs.length) result.subs = subs;
      return result;
    }
    return { parse: 1, url: res.embedUrl || durl };
  }
  return { parse: 1, url: id };
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
    // v7: 预热键必须与 playFinish() 的缓存查找键一致（裸详情 URL）。
    // 旧版用 eps[0]（形如 F4$<durl>@F4），play 侧先剥 $ 前缀与 @hint
    // 再查，键永远对不上 → 预热白做。vod_id 即 play 侧的裸 durl。
    const warmKey = vod.vod_id ? String(vod.vod_id) : (eps[0] || '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// (play 侧字幕挂载已改为 playFinish() 的缓存只读, 不再现搜。)

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
  const slug = (String(durl || '').match(/\/videos\/([^/?#]+)/) || [])[1] || '';
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
