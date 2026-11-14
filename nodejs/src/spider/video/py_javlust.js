// JavLust - CatPawOpen JS Spider（2026-11-15 新源，L2 组）
// 站点：https://javlust.net/（JavTiful 播放后端；详情嵌 javtiful.com/embed/{tid}）
// 结构（2026-11-15 VM 全链实测）：
//  - 列表：卡片 <a href="/video/{id}/{slug}">，封面 data-src=https://upload18.cc/v/{CODE}/poster.jpg，
//    标题在 h6 链接 title 属性，时长 🕓；分页 ?page=N（RM p2 验 23 条）。
//  - 顶级分类（站内导航实测）：最新 /、破解减码 /reducing-mosaic、有码 /censored、
//    无码 /uncensored、素人 /amateur、最多观看 /most-viewed；排序 ?sort=latest|code|rated|views。
//  - 类型筛选：/genre 页 285 个真实类型（/genre?name=<slug>，big-tits 页验 68 条）。
//  - 搜索：/search/?q=<kw>（CKCK-020 验 33 条）。
//  - 播放（关键：票据约 30 分钟，detail 时现取现投）：详情页 iframe
//    https://javtiful.com/embed/{tid}，embed 页内联 JSON "playback":
//    {endpoint:"/video/{tid}/playback", ticket:"p1.{tid}.0.{ts}.{hash}"}，
//    POST 该 endpoint（ticket 表单体，头 X-Requested-With + Referer embed 页）
//    返回 {"success":true,"sources":[{"src":"/media/video/{tid}/720p?expires=..&signature=..",
//    "size":720,"label":"720p"}],"defaultQuality":720}；src 为相对地址须补 javtiful.com
//    绝对地址，302 跳 R2 直链 MP4（CKCK-020/MIDA-348/LULU-405 三部实测皆单档 720p，
//    无 fallbackSrc，站内无多档可供选择，故只出单行「720p」，不编造档位）。
// 字幕：接定版字幕芯（Layer A，见文件尾），有番号一律接。
import req from '../../util/req.js';

const KEY = 'py_javlust';
const NAME = 'JavLust';
const HOST = 'https://javlust.net';
const TIFUL = 'https://javtiful.com';
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  href = String(href || '').trim();
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return HOST + href;
  return HOST + '/' + href;
}

// 卡片：<a href="/video/{id}/{slug}">…<img data-src="https://upload18.cc/v/{CODE}/poster.jpg">…
//   <div class="badge">CODE</div>…</a> 后跟 <h6><a title="全标题"> + <div class="video-details">👁 N 💗 N <span>🕓 时长</span>
function parseCards(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]*href="(\/video\/\d+\/[^"]+)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const inner = m[2];
    let pic = '';
    const dm = inner.match(/data-src\s*=\s*"([^"]+)"/i);
    if (dm && dm[1] && !/placeholder/i.test(dm[1])) pic = dm[1];
    if (!pic) {
      const sm = inner.match(/<img[^>]*src\s*=\s*"([^"]+)"/i);
      if (sm && sm[1] && !/placeholder/i.test(sm[1]) && sm[1].indexOf('data:image') !== 0) pic = sm[1];
    }
    const bm = inner.match(/badge[^>]*>([^<]+)</i);
    const code = bm ? stripTags(bm[1]) : '';
    // 标题与时长在卡片后 1200 字符内的 h6 / video-details
    const tail = html.slice(m.index + m[0].length, m.index + m[0].length + 1200);
    let title = '';
    const tm = tail.match(/<h6[^>]*>\s*<a[^>]*title="([^"]+)"/i);
    if (tm) title = clean(tm[1]);
    if (!title) title = code || href.split('/').pop().replace(/-/g, ' ');
    const du = tail.match(/🕓\s*([\d:]+)/);
    const remarks = du ? du[1] : (code || '');
    items.push({ vod_id: absUrl(href), vod_name: title, vod_pic: pic, vod_remarks: remarks });
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
  { type_id: 'latest', type_name: '最新', path: '/' },
  { type_id: 'reducing-mosaic', type_name: '破解减码', path: '/reducing-mosaic' },
  { type_id: 'censored', type_name: '有码', path: '/censored' },
  { type_id: 'uncensored', type_name: '无码', path: '/uncensored' },
  { type_id: 'amateur', type_name: '素人', path: '/amateur' },
  { type_id: 'most-viewed', type_name: '最多观看', path: '/most-viewed' },
];
const PATH_BY_ID = {};
for (const c of CATS) PATH_BY_ID[c.type_id] = c.path;

const SORT_FILTER = [
  { n: '最新', v: 'latest' },
  { n: '番号', v: 'code' },
  { n: '评分', v: 'rated' },
  { n: '观看', v: 'views' },
];

// 类型筛选（/genre 页 285 个真实类型，2026-11-15 实测全量抓取；站内英文名原样，不翻译不编造）
const GENRE_FILTER = [
  { n: '全部', v: '' },
  { n: '4K', v: '4k' },
  { n: '69', v: '69' },
  { n: 'Action & Fighting', v: 'action-fighting' },
  { n: 'Actress Best Compilation', v: 'actress-best-compilation' },
  { n: 'Adopted Daughter', v: 'adopted-daughter' },
  { n: 'Adultery', v: 'adultery' },
  { n: 'Amateur', v: 'amateur' },
  { n: 'Anal Play', v: 'anal-play' },
  { n: 'Anal Sex', v: 'anal-sex' },
  { n: 'Anime', v: 'anime' },
  { n: 'Asian Actress', v: 'asian-actress' },
  { n: 'Ass Lover', v: 'ass-lover' },
  { n: 'Athlete', v: 'athlete' },
  { n: 'Auntie', v: 'auntie' },
  { n: 'Autumn BIG sale', v: 'autumn-big-sale' },
  { n: 'Bath', v: 'bath' },
  { n: 'BDSM', v: 'bdsm' },
  { n: 'Beautiful Girl', v: 'beautiful-girl' },
  { n: 'Beautiful Tits', v: 'beautiful-tits' },
  { n: 'Big Asses', v: 'big-asses' },
  { n: 'Big Tits', v: 'big-tits' },
  { n: 'Big Tits Lover', v: 'big-tits-lover' },
  { n: 'Big Vibrator', v: 'big-vibrator' },
  { n: 'Bitch', v: 'bitch' },
  { n: 'Black Man', v: 'black-man' },
  { n: 'Blo', v: 'blo' },
  { n: 'Blowjob', v: 'blowjob' },
  { n: 'Bondage', v: 'bondage' },
  { n: 'Breast Milk', v: 'breast-milk' },
  { n: 'bride', v: 'bride' },
  { n: 'BUKKAKE', v: 'bukkake' },
  { n: 'Bunny Girl', v: 'bunny-girl' },
  { n: 'Bus Tour Guide', v: 'bus-tour-guide' },
  { n: 'Business Suit', v: 'business-suit' },
  { n: 'Campaign Girl', v: 'campaign-girl' },
  { n: 'Candle Drippings', v: 'candle-drippings' },
  { n: 'Car Sex', v: 'car-sex' },
  { n: 'Cat Cosplay', v: 'cat-cosplay' },
  { n: 'Caucasian Actress', v: 'caucasian-actress' },
  { n: 'Celeb', v: 'celeb' },
  { n: 'Cheating Wife', v: 'cheating-wife' },
  { n: 'Cheerleader', v: 'cheerleader' },
  { n: 'Cherry Boy', v: 'cherry-boy' },
  { n: 'Childhood Friend', v: 'childhood-friend' },
  { n: 'Chinese Dress', v: 'chinese-dress' },
  { n: 'Chubby', v: 'chubby' },
  { n: 'Clinic', v: 'clinic' },
  { n: 'Club Hostess Sex Worker', v: 'club-hostess-sex-worker' },
  { n: 'Club Manager', v: 'club-manager' },
  { n: 'Collaborative Work', v: 'collaborative-work' },
  { n: 'College Girl', v: 'college-girl' },
  { n: 'Comedy', v: 'comedy' },
  { n: 'Compilation', v: 'compilation' },
  { n: 'Conceived', v: 'conceived' },
  { n: 'Confessional', v: 'confessional' },
  { n: 'Confinement', v: 'confinement' },
  { n: 'Cosplay', v: 'cosplay' },
  { n: 'Couple', v: 'couple' },
  { n: 'Couple Swapping', v: 'couple-swapping' },
  { n: 'Cowgirl', v: 'cowgirl' },
  { n: 'Cre', v: 'cre' },
  { n: 'Creampie', v: 'creampie' },
  { n: 'Cross Dresser', v: 'cross-dresser' },
  { n: 'Cum Swallowing', v: 'cum-swallowing' },
  { n: 'Cunnilingus', v: 'cunnilingus' },
  { n: 'Dance', v: 'dance' },
  { n: 'Date', v: 'date' },
  { n: 'Daydream', v: 'daydream' },
  { n: 'Daydreamers', v: 'daydreamers' },
  { n: 'Debut', v: 'debut' },
  { n: 'Deep Thro', v: 'deep-thro' },
  { n: 'Deep Throat', v: 'deep-throat' },
  { n: 'Digital Mosaic', v: 'digital-mosaic' },
  { n: 'Dirty Talk', v: 'dirty-talk' },
  { n: 'DMM Exclusive', v: 'dmm-exclusive' },
  { n: 'Documentary', v: 'documentary' },
  { n: 'Doggystyle', v: 'doggystyle' },
  { n: 'Doll', v: 'doll' },
  { n: 'Domination', v: 'domination' },
  { n: 'Drama', v: 'drama' },
  { n: 'Drunk Girl', v: 'drunk-girl' },
  { n: 'Egg Vibrator', v: 'egg-vibrator' },
  { n: 'Emmanuel', v: 'emmanuel' },
  { n: 'Employee', v: 'employee' },
  { n: 'Enema', v: 'enema' },
  { n: 'Exclusive', v: 'exclusive' },
  { n: 'Exclusive Distribution', v: 'exclusive-distribution' },
  { n: 'Eyes-Roll-Back', v: 'eyes-roll-back' },
  { n: 'Face Sitting', v: 'face-sitting' },
  { n: 'Facial', v: 'facial' },
  { n: 'Fainting', v: 'fainting' },
  { n: 'Fan Appreciation', v: 'fan-appreciation' },
  { n: 'Fantasy', v: 'fantasy' },
  { n: 'Featured Actress', v: 'featured-actress' },
  { n: 'Female Anchor', v: 'female-anchor' },
  { n: 'Female Boss', v: 'female-boss' },
  { n: 'Female Detective', v: 'female-detective' },
  { n: 'Female Doctor', v: 'female-doctor' },
  { n: 'Female Ninja', v: 'female-ninja' },
  { n: 'Female Soldier', v: 'female-soldier' },
  { n: 'Female Teacher', v: 'female-teacher' },
  { n: 'Female Transformation', v: 'female-transformation' },
  { n: 'Fingering', v: 'fingering' },
  { n: 'Fisting', v: 'fisting' },
  { n: 'Flexible body', v: 'flexible-body' },
  { n: 'Foot Fetish', v: 'foot-fetish' },
  { n: 'Footjob', v: 'footjob' },
  { n: 'For Women', v: 'for-women' },
  { n: 'Foreign Imports', v: 'foreign-imports' },
  { n: 'Fuku Bukuro', v: 'fuku-bukuro' },
  { n: 'G-Spot', v: 'g-spot' },
  { n: 'Gal', v: 'gal' },
  { n: 'Gang Bang', v: 'gang-bang' },
  { n: 'Genital Close-Up', v: 'genital-close-up' },
  { n: 'Glasses', v: 'glasses' },
  { n: 'Golden Shower', v: 'golden-shower' },
  { n: 'Gonzo', v: 'gonzo' },
  { n: 'Groping', v: 'groping' },
  { n: 'Gym Clothes', v: 'gym-clothes' },
  { n: 'Gyno Exam', v: 'gyno-exam' },
  { n: 'Handjob', v: 'handjob' },
  { n: 'Hard Sex', v: 'hard-sex' },
  { n: 'Harlem', v: 'harlem' },
  { n: 'Hi-D', v: 'hi-d' },
  { n: 'Hi-De', v: 'hi-de' },
  { n: 'Hi Def', v: 'hi-def' },
  { n: 'Homemade', v: 'homemade' },
  { n: 'Horny', v: 'horny' },
  { n: 'Hostess', v: 'hostess' },
  { n: 'Hot Spring', v: 'hot-spring' },
  { n: 'Hotel', v: 'hotel' },
  { n: 'Housewife', v: 'housewife' },
  { n: 'How To', v: 'how-to' },
  { n: 'Huge Dick', v: 'huge-dick' },
  { n: 'Huge Tits', v: 'huge-tits' },
  { n: 'Humiliation', v: 'humiliation' },
  { n: 'Hypnotism', v: 'hypnotism' },
  { n: 'Idol', v: 'idol-' },
  { n: 'Idol Video', v: 'idol-video' },
  { n: 'Independent', v: 'independent' },
  { n: 'Instructor', v: 'instructor' },
  { n: 'KIMONO', v: 'kimono' },
  { n: 'Kiss Kiss', v: 'kiss-kiss' },
  { n: 'Knee-High Socks', v: 'knee-high-socks' },
  { n: 'Leotards', v: 'leotards' },
  { n: 'Lesbian', v: 'lesbian' },
  { n: 'Lesbian Kissing', v: 'lesbian-kissing' },
  { n: 'Lingerie', v: 'lingerie' },
  { n: 'Live Game Filming Edition', v: 'live-game-filming-edition' },
  { n: 'Lookalike', v: 'lookalike' },
  { n: 'Loose Socks', v: 'loose-socks' },
  { n: 'Lotion', v: 'lotion' },
  { n: 'Love', v: 'love' },
  { n: 'Maid', v: 'maid' },
  { n: 'Married Woman', v: 'married-woman' },
  { n: 'Martial Arts', v: 'martial-arts' },
  { n: 'Mask', v: 'mask' },
  { n: 'Masochist Man', v: 'masochist-man' },
  { n: 'Massage', v: 'massage' },
  { n: 'Massage Parlor', v: 'massage-parlor' },
  { n: 'Masturbation', v: 'masturbation' },
  { n: 'Masturbation Support', v: 'masturbation-support' },
  { n: 'Mature Woman', v: 'mature-woman' },
  { n: 'Mensetsu', v: 'mensetsu' },
  { n: 'MILF', v: 'milf' },
  { n: 'Minimal Mosaic', v: 'minimal-mosaic' },
  { n: 'Miniskirt', v: 'miniskirt' },
  { n: 'Mjo', v: 'mjo' },
  { n: 'Model', v: 'model' },
  { n: 'Mom Friends', v: 'mom-friends' },
  { n: 'More Than 16 Hours Of Footage', v: 'more-than-16-hours-of-footage' },
  { n: 'Muscular', v: 'muscular' },
  { n: 'Naked Apron', v: 'naked-apron' },
  { n: 'Neglect', v: 'neglect' },
  { n: 'No Bra', v: 'no-bra' },
  { n: 'No Panties', v: 'no-panties' },
  { n: 'Non-nude Erotica', v: 'non-nude-erotica' },
  { n: 'Nose Fuck', v: 'nose-fuck' },
  { n: 'Nurse', v: 'nurse' },
  { n: 'Nymphomaniac', v: 'nymphomaniac' },
  { n: 'Object Insertion', v: 'object-insertion' },
  { n: 'Office Lady', v: 'office-lady' },
  { n: 'Old Man', v: 'old-man' },
  { n: 'Older Sister', v: 'older-sister' },
  { n: 'Orgasm', v: 'orgasm' },
  { n: 'Orgy', v: 'orgy' },
  { n: 'Original Collaboration', v: 'original-collaboration' },
  { n: 'Otaku', v: 'otaku' },
  { n: 'Other Fetishes', v: 'other-fetishes' },
  { n: 'Others', v: 'others' },
  { n: 'Outdoor', v: 'outdoor' },
  { n: 'Over 4 Hours', v: 'over-4-hours' },
  { n: 'Panty Shot', v: 'panty-shot' },
  { n: 'Pantyhose', v: 'pantyhose' },
  { n: 'Party', v: 'party' },
  { n: 'Petite', v: 'petite' },
  { n: 'Picking Up Girls', v: 'picking-up-girls' },
  { n: 'Pooping', v: 'pooping' },
  { n: 'POV', v: 'pov' },
  { n: 'Pranks', v: 'pranks' },
  { n: 'Pregnant', v: 'pregnant' },
  { n: 'Premature Ejaculation', v: 'premature-ejaculation' },
  { n: 'Priestess', v: 'priestess' },
  { n: 'Princess Mademoiselle', v: 'princess-mademoiselle' },
  { n: 'Private Tutor', v: 'private-tutor' },
  { n: 'Queen', v: 'queen' },
  { n: 'Quickie', v: 'quickie' },
  { n: 'Race Queen', v: 'race-queen' },
  { n: 'Receptionist', v: 'receptionist' },
  { n: 'Relatives', v: 'relatives' },
  { n: 'Reluctant', v: 'reluctant' },
  { n: 'Reverse Pick Up', v: 'reverse-pick-up' },
  { n: 'Romantic Comedy', v: 'romantic-comedy' },
  { n: 'Ropes & Ties', v: 'ropes-ties' },
  { n: 'Sadism', v: 'sadism' },
  { n: 'Sailor Uniform', v: 'sailor-uniform' },
  { n: 'Sale', v: 'sale' },
  { n: 'Sample video', v: 'sample-video' },
  { n: 'School', v: 'school' },
  { n: 'School Swimsuits', v: 'school-swimsuits' },
  { n: 'School Uniform', v: 'school-uniform' },
  { n: 'Schoolgirl', v: 'schoolgirl' },
  { n: 'Sci-Fi', v: 'sci-fi' },
  { n: 'Secretary', v: 'secretary' },
  { n: 'Series', v: 'series' },
  { n: 'Serious', v: 'serious' },
  { n: 'Set Items', v: 'set-items' },
  { n: 'Sex Toys', v: 'sex-toys' },
  { n: 'Sexy', v: 'sexy' },
  { n: 'Shame', v: 'shame' },
  { n: 'Shaved Pussy', v: 'shaved-pussy' },
  { n: 'Shemale', v: 'shemale' },
  { n: 'Shotacon', v: 'shotacon' },
  { n: 'Sister', v: 'sister' },
  { n: 'Slender', v: 'slender' },
  { n: 'Slut', v: 'slut' },
  { n: 'Small Tits', v: 'small-tits' },
  { n: 'Soapland Girl', v: 'soapland-girl' },
  { n: 'SOD Create Sale', v: 'sod-create-sale' },
  { n: 'SOD Group 40% Off Sale', v: 'sod-group-40%-off-sale' },
  { n: 'Spanking', v: 'spanking' },
  { n: 'Special Effects', v: 'special-effects' },
  { n: 'Special Smartphone Vertical Video', v: 'special-smartphone-vertical-video' },
  { n: 'Sports', v: 'sports' },
  { n: 'Spring BIG sale', v: 'spring-big-sale' },
  { n: 'Squirting', v: 'squirting' },
  { n: 'StaffPicks01', v: 'staffpicks01' },
  { n: 'StaffPicks02', v: 'staffpicks02' },
  { n: 'StaffPicks03', v: 'staffpicks03' },
  { n: 'StaffPicks04', v: 'staffpicks04' },
  { n: 'StaffPicks05', v: 'staffpicks05' },
  { n: 'StaffPicks06', v: 'staffpicks06' },
  { n: 'Stepmom', v: 'stepmom' },
  { n: 'Stewardess', v: 'stewardess' },
  { n: 'Substance Use', v: 'substance-use' },
  { n: 'Suntan', v: 'suntan' },
  { n: 'Super Heroine', v: 'super-heroine' },
  { n: 'Swallowing', v: 'swallowing' },
  { n: 'Sweating', v: 'sweating' },
  { n: 'Swimsuits', v: 'swimsuits' },
  { n: 'Tall Girl', v: 'tall-girl' },
  { n: 'Threesome', v: 'threesome' },
  { n: 'Thriller', v: 'thriller' },
  { n: 'Tickling', v: 'tickling' },
  { n: 'Tight Dress', v: 'tight-dress' },
  { n: 'Time Warp', v: 'time-warp' },
  { n: 'Titty Fuck', v: 'titty-fuck' },
  { n: 'Titty Shots', v: 'titty-shots' },
  { n: 'Training', v: 'training' },
  { n: 'Trip', v: 'trip' },
  { n: 'TSUNDERE', v: 'tsundere' },
  { n: 'Uniform', v: 'uniform' },
  { n: 'Urination', v: 'urination' },
  { n: 'V', v: 'v' },
  { n: 'Variety', v: 'variety' },
  { n: 'Various Worker', v: 'various-worker' },
  { n: 'Vibrator', v: 'vibrator' },
  { n: 'Virgin', v: 'virgin' },
  { n: 'Vomit', v: 'vomit' },
  { n: 'Voyeur', v: 'voyeur' },
  { n: 'Waitress', v: 'waitress' },
  { n: 'Widow', v: 'widow' },
  { n: 'Yoga', v: 'yoga' },
  { n: 'Young Wife', v: 'young-wife' },
  { n: 'Youthful', v: 'youthful' },
];

function filtersFor() {
  return [
    { key: 'genre', name: '类型', value: GENRE_FILTER },
    { key: 'sort', name: '排序', value: SORT_FILTER },
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

function listUrl(id, page, genre, sort) {
  sort = sort || 'latest';
  let url;
  if (genre) {
    url = HOST + '/genre?name=' + encodeURIComponent(genre) + '&sort=' + sort;
  } else {
    const path = PATH_BY_ID[id] || '/';
    url = HOST + path + '?sort=' + sort;
  }
  if (page > 1) url += '&page=' + page;
  return url;
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const id = String(body.id || body.tid || 'latest');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const flt = body.filters || body.extend || {};
  const genre = fltVal(flt, 'genre');
  const sort = fltVal(flt, 'sort') || 'latest';
  const url = listUrl(id, page, genre, sort);
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: parsePagecount(html), limit: 90, total: list.length ? 999999 : 0, list };
}

async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = t(body.wd || '');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 90, total: 0, list: [] };
  const url = HOST + '/search/?q=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  return { page, pagecount: parsePagecount(html), limit: 90, total: list.length, list };
}

// 详情页 -> embed 页 -> playback POST 取 sources（现取现投，票据约 30 分钟）
async function fetchPlayback(durl, html) {
  const em = html.match(/javtiful\.com\/embed\/(\d+)/i);
  if (!em) return null;
  const embedUrl = TIFUL + '/embed/' + em[1];
  const ehtml = await getText(embedUrl, durl);
  if (!ehtml) return null;
  const pm = ehtml.match(/"playback"\s*:\s*\{\s*"endpoint"\s*:\s*"([^"]+)"\s*,\s*"ticket"\s*:\s*"([^"]+)"/i);
  if (!pm) return null;
  const endpoint = pm[1].indexOf('http') === 0 ? pm[1] : TIFUL + pm[1];
  try {
    const { data } = await req.post(endpoint, 'ticket=' + encodeURIComponent(pm[2]), {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': embedUrl,
      },
      timeout: 15000,
    });
    const j = typeof data === 'string' ? JSON.parse(data) : data;
    if (j && j.success && Array.isArray(j.sources) && j.sources.length) {
      return { sources: j.sources, embedUrl };
    }
  } catch {}
  return { sources: null, embedUrl };
}

async function detail(reqIn) {
  const ids = Array.isArray(reqIn && reqIn.body && reqIn.body.id) ? reqIn.body.id : [reqIn && reqIn.body && reqIn.body.id];
  const list = [];
  for (const raw of ids.filter(Boolean)) {
    const durl = /^https?:\/\//i.test(raw) ? raw : HOST + (String(raw).startsWith('/') ? raw : '/' + raw);
    const html = await getText(durl, HOST + '/');
    const tm = html.match(/<title>([^<]*)<\/title>/i);
    const title = tm ? clean(tm[1]) : 'JavLust';
    let pic = '';
    const slug = (durl.match(/\/video\/\d+\/([^/?#]+)/) || [])[1] || '';
    const code = slug ? slug.toUpperCase() : '';
    const pm = html.match(/https:\/\/upload18\.cc\/v\/([A-Za-z0-9-]+)\/poster\.jpg(?!&)/i);
    if (pm) pic = 'https://upload18.cc/v/' + pm[1] + '/poster.jpg';
    else if (code) pic = 'https://upload18.cc/v/' + code + '/poster.jpg';
    let playUrl = '';
    const lineUrls = [];
    const pb = await fetchPlayback(durl, html);
    if (pb && pb.sources) {
      const lines = [];
      const abs = (u) => {
        u = String(u || '');
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        return TIFUL + (u.startsWith('/') ? u : '/' + u);
      };
      for (const s of pb.sources) {
        if (!s.src) continue;
        const lm = String(s.src).match(/\/(\d+)p\//);
        const label = lm ? lm[1] + 'p' : (s.label || (s.size ? s.size + 'p' : '正片'));
        lines.push(label + '$' + abs(s.src));
        lineUrls.push(abs(s.src));
      }
      const fb = pb.sources.find((s) => s.fallbackSrc);
      if (fb) { lines.push('MP4$' + abs(fb.fallbackSrc)); lineUrls.push(abs(fb.fallbackSrc)); }
      if (lines.length) playUrl = lines.join('#');
    }
    if (!playUrl) {
      const emb = (pb && pb.embedUrl) || '';
      playUrl = '网页播放$' + (emb || durl);
      lineUrls.push(emb || durl);
    }
    const vod = { vod_id: raw, vod_name: title, vod_pic: pic, vod_play_from: NAME, vod_play_url: playUrl };
    if (lineUrls.length) {
      try {
        subRegister([durl], vod);
      } catch (e) {}
    }
    list.push(vod);
  }
  return { list };
}

async function play(reqIn) {
  let id = String((reqIn && reqIn.body && reqIn.body.id) || '').trim();
  id = subNormKey(id);
  if (!id) return { parse: 1, url: '' };
  const isVideo = /\.(m3u8|mp4)/i.test(id) || /\/media\/video\//i.test(id);
  if (isVideo) {
    const subs = await subSearchAll(id).catch(() => []);
    const result = {
      parse: 0,
      url: id,
      header: { 'User-Agent': UA, 'Referer': TIFUL + '/' },
    };
    if (subs && subs.length) result.subs = subs;
    return result;
  }
  if (/javtiful\.com\/embed\//i.test(id)) return { parse: 1, url: id };
  // 详情 URL：现取现投（票据约 30 分钟，play 时新鲜取）
  if (/javlust\.net\/video\//i.test(id)) {
    const html = await getText(id, HOST + '/');
    const pb = html ? await fetchPlayback(id, html) : null;
    if (pb && pb.sources && pb.sources.length) {
      const s0 = pb.sources[0];
      const abs = String(s0.src || '').indexOf('http') === 0 ? s0.src : TIFUL + s0.src;
      const subs = await subSearchAll(id).catch(() => []);
      const result = {
        parse: 0,
        url: abs,
        header: { 'User-Agent': UA, 'Referer': TIFUL + '/' },
      };
      if (subs && subs.length) result.subs = subs;
      return result;
    }
    return { parse: 1, url: (pb && pb.embedUrl) || id };
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
  const slug = (String(durl || '').match(/\/video\/\d+\/([^/?#]+)/) || [])[1] || '';
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
