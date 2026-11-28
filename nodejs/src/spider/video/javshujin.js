// Javshujin — javshujin.com（WordPress WPST/kingtube，JAV 全长高清）
// 结构：分类 /category/{censored|english-subtitle|reducing-mosaic}/，
// 分页 /page/N/；列表 <article> 块（标题在 a 的 title、封面 img data-src、
// 时长 duration）；详情页 base64 Rocket Lazy Load 脚本解出 videplay.us 嵌页
// （var defaultUrl = "https://x.videplay.us/v/{id}"）；嵌页 Dean Edwards 打包
// 解包后取 master 清单——模板 A：api.videplay.us/o/v-master.m3u8/<token>；
// 模板 B：let pox / let dp 经 EVP_BytesToKey + AES-256-CBC 解密得 master；
// master 按 RESOLUTION 分档出线（1080p/720p/480p/360p，有几档出几档，绝不编造）。
// 变体直链直接交给播放器（本站无自家 Worker；/ved/ 线的分片可能为 .image 伪装，
// 若某档播不了请反馈）；master 解不出时省略该集，绝不输出嵌页地址懒解析。
// 有番号接字幕芯。分类：reducing-mosaic（减码/LTX）必须保留；顶级分类 10 个
// （导航 3 个 + 最新 + 6 个高频标签归档）；每分类挂 3 张筛选卡片：标签 36、厂商 10、女优 6，
// 全部是站方真实存在的归档页（2026-11-28 逐页验过 200，每页 20 条）。
// 注意：VM 直连 x.videplay.us 无响应（curl 52/000），嵌页解析链未在 VM 验通，
// 同型流程已在 py_javcc.js（javcc.me）2026-11-07 实测通过，须真机定性。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_javshujin';
const NAME = 'Javshujin';
const HOST = 'https://javshujin.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 顶级分类：站方导航仅 3 个（2026-11-28 实测）+ 最新；
// 其余 6 个是站方真实存在的标签归档页（/tag/{slug}/，逐个验过 200 且每页 20 条），
// 按近 90 篇文章里出现频次取前 6，不编造。厂商/女优归档同为真实页，作筛选卡片。
const CLASSES = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'category/censored', type_name: '有碼' },
  { type_id: 'category/english-subtitle', type_name: '英字' },
  { type_id: 'category/reducing-mosaic', type_name: '減碼' },
  { type_id: 'tag/masturbation', type_name: '自慰' },
  { type_id: 'tag/creampie', type_name: '中出' },
  { type_id: 'tag/big-tits', type_name: '巨乳' },
  { type_id: 'tag/married-woman', type_name: '人妻' },
  { type_id: 'tag/mature-woman', type_name: '熟女' },
  { type_id: 'tag/cuckold', type_name: '出軌' },
];

// 标签筛选卡片（站方原生标签，文章 class / 标签页实测存在；
// ltx-decensored = LTX Decensored，必须保留）
const TAG_FILTER = [
  { n: 'LTX Decensored', v: 'ltx-decensored' },
  { n: '減碼', v: 'reducing-mosaic' },
  { n: '巨乳', v: 'big-tits' },
  { n: '大屁股', v: 'huge-butt' },
  { n: '人妻', v: 'married-woman' },
  { n: '角色扮演', v: 'cosplay' },
  { n: '自慰', v: 'masturbation' },
  { n: '妓女', v: 'prostitutes' },
  { n: '女學生', v: 'school-girls' },
  { n: '苗條', v: 'slender' },
  { n: '蕩婦', v: 'slut' },
  { n: '三人行', v: 'threesome-foursome' },
  { n: '乳交', v: 'titty-fuck' },
  { n: '偷窺', v: 'voyeur' },
  { n: '女僕', v: 'waitress' },
  { n: '姐妹', v: 'sister' },
  { n: '情趣用品', v: 'sex-toys' },
  { n: '主觀', v: 'subjectivity' },
  { n: '中出', v: 'creampie' },
  { n: '熟女', v: 'mature-woman' },
  { n: '出軌', v: 'cuckold' },
  { n: '顏射', v: 'facials' },
  { n: '口交', v: 'blowjob' },
  { n: '女上位', v: 'cowgirl' },
  { n: '美臀', v: 'beautiful-butt' },
  { n: '女大學生', v: 'female-college-student' },
  { n: '潮吹', v: 'squirting' },
  { n: '護士', v: 'nurse' },
  { n: '絲襪', v: 'pantyhose' },
  { n: '紀錄片', v: 'documentary' },
  { n: '劇情', v: 'drama' },
  { n: '美少女', v: 'beautiful-girl' },
  { n: '秘書', v: 'secretary' },
  { n: '女上司', v: 'female-boss' },
  { n: '其他戀物', v: 'other-fetishes' },
  { n: '硬核', v: 'hardcore' },
];
// 厂商筛选卡片（站方 /studio/{slug}/ 归档，2026-11-28 逐个验过 200 且每页 20 条，
// 按近 90 篇文章里出现频次取前 10；显示名用站方英文品牌名）
const STUDIO_FILTER = [
  { n: 'Attackers', v: 'attackers' },
  { n: 'IdeaPocket', v: 'idea-pocket' },
  { n: 'Fitch', v: 'fitch' },
  { n: 'Venus', v: 'venus' },
  { n: 'Moodyz', v: 'moodyz' },
  { n: 'Madonna', v: 'madonna' },
  { n: 'Center Village', v: 'center-village' },
  { n: 'Go Go Zu', v: 'go-go-zu' },
  { n: 'Wanz Factory', v: 'wanz-factory' },
  { n: 'Prestige', v: 'prestige' },
];
// 女优筛选卡片（站方 /actor/{slug}/ 归档，2026-11-28 逐个验过 200 且每页 20 条，
// 按近 90 篇文章里出现频次取前 6；显示名用站方罗马音）
const ACTOR_FILTER = [
  { n: 'Izuki Yukimura', v: 'izuki-yukimura' },
  { n: 'Remu Suzumori', v: 'remu-suzumori' },
  { n: 'Megumi Maki', v: 'megumi-maki' },
  { n: 'Yumi Nijimura', v: 'yumi-nijimura' },
  { n: 'Sayuri Hayama', v: 'sayuri-hayama' },
  { n: 'Ao Ebisaki', v: 'ao-ebisaki' },
];
const FILTERS = {};
for (const c of CLASSES) {
  FILTERS[c.type_id] = [
    { key: 'tag', name: '标签', value: TAG_FILTER },
    { key: 'studio', name: '厂商', value: STUDIO_FILTER },
    { key: 'actor', name: '女优', value: ACTOR_FILTER },
  ];
}

const embedCache = new Map(); // variantUrl -> embedUrl（play 时作 Referer）

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripTags(s) {
  return cleanText(String(s || '').replace(/<[^>]*>/g, ' '));
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const b = base || HOST;
  return b + (u.startsWith('/') ? u : '/' + u);
}

async function getText(url, referer, timeoutMs) {
  try {
    const r = await req.get(url, {
      headers: { 'User-Agent': UA, 'Referer': referer || HOST + '/', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: timeoutMs || 20000,
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    if (r.status !== 200) return '';
    return typeof r.data === 'string' ? r.data : '';
  } catch (e) { return ''; }
}

// 列表：<article> 块（标题在 a 的 title 属性，封面在 img data-src，时长 duration）
function parseCards(html) {
  const items = [];
  if (!html) return items;
  const seen = new Set();
  const re = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const blk = m[1];
    const lm = blk.match(/<a[^>]+href="https:\/\/javshujin\.com\/([^"\/\?#]+)\/([^"\/\?#]+)\/?"[^>]*title="([^"]*)"/i)
      || blk.match(/<a[^>]+href="https:\/\/javshujin\.com\/([^"\/\?#]+)\/([^"\/\?#]+)\/?"[^>]*>/i);
    if (!lm) continue;
    const slug = lm[1] + '/' + lm[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    let title = lm[3] ? stripTags(lm[3]) : '';
    if (!title) {
      const hm = blk.match(/<header[^>]*>([\s\S]{0,400}?)<\/header>/i);
      if (hm) title = stripTags(hm[1]);
    }
    if (!title || title.length < 2) continue;
    let pic = '';
    const im = blk.match(/<img[^>]+>/i);
    if (im) {
      const sm = im[0].match(/(?:data-src|data-original|src)\s*=\s*"([^"]+)"/i);
      if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) pic = sm[1];
    }
    let remarks = '';
    const dm = blk.match(/duration">[\s\S]{0,120}?(\d+:\d+(?::\d+)?)/i);
    if (dm) remarks = dm[1];
    items.push({ vod_id: HOST + '/' + slug + '/', vod_name: title, vod_pic: pic, vod_remarks: remarks });
    if (items.length >= 60) break;
  }
  return items;
}

function parsePagecount(html, curPage) {
  let max = curPage;
  if (html) {
    const re = /\/page\/(\d+)[\/'"]/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// ---------- videplay 解析（逻辑与 py_javcc.js 同型） ----------

function b64Decode(s) {
  const clean = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(clean, 'base64').toString('utf-8'); } catch (e) { return ''; }
}


function jsUnescapeSingle(s) {
  return s.replace(/\\(.)/g, (m, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return c;
  });
}

// Dean Edwards 打包解包（与 hornyjav/videplay 同款纯字符串算法）

function unpackDeanEdwards(html) {
  const m = String(html || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
  if (!m) return '';
  let p = jsUnescapeSingle(m[1]);
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = jsUnescapeSingle(m[4]).split('|');
  const enc = (n) => (n < a ? '' : enc(Math.floor(n / a))) + ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36));
  let i = c;
  while (i--) {
    if (k[i]) {
      const word = k[i];
      p = p.replace(new RegExp('\\b' + enc(i) + '\\b', 'g'), () => word);
    }
  }
  return p;
}

function extractEmbedUrl(html) {
  const bm = String(html || '').match(/data-rocketlazyloadscript='data:text\/javascript;base64,([^']+)'/);
  if (bm) {
    const js = b64Decode(bm[1]);
    const um = js.match(/defaultUrl\s*=\s*"([^"]+)"/);
    if (um && /^https?:\/\//i.test(um[1])) return um[1];
  }
  const vm = String(html || '').match(/https:\/\/[a-z0-9.\-]*videplay\.us\/v\/[A-Za-z0-9]+/i);
  if (vm) return vm[0];
  const fm = String(html || '').match(/<iframe[^>]+src="([^"]+)"/i);
  if (fm && /^https?:\/\//i.test(fm[1])) return fm[1];
  return '';
}

// master 清单按 RESOLUTION 分档；单档只出一线，多档各出一线（绝不编造）

function parseMasterVariants(text) {
  const out = [];
  const seen = new Set();
  const re = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\n([^\n#][^\n]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const h = parseInt(m[2], 10);
    const url = m[3].trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const q = h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h >= 360 ? '360p' : (h + 'p');
    out.push({ name: q, url });
  }
  out.sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
  return out;
}

// ---------- videplay 模板 B：pox/dp AES 解密（纯 JS，无 CryptoJS/node:crypto） ----------
// 嵌页 setup 用 file:ply(pox,dp) 运行时组装地址；ply 等价逻辑（2026-10-31
// 对 jur-887 嵌页实测坐实）：
//   pass = pox.split('+')[1].slice(1)（取中间 '+' 段并去掉首字符）
//   dp 经 base64 解码得 JSON {ct(base64), iv(hex), s(hex 盐)}
//   EVP_BytesToKey(MD5, pass, salt, 48 字节) -> key=前 32(AES-256) + iv=后 16
//   AES-256-CBC 解密 ct、去 PKCS7 填充 -> 真实 master 清单地址（如 /x/v-master.m3u8/<token>）
// 注意：JSON 里的 iv 与 EVP 派生 iv 一致，解密时以 EVP 为准；md5Bytes 与
// AES-256 均由 py_one.js 的 MD5/AES-128 改编（MD5 改走字节数组输入，
// AES 扩展 Nk=8/Nr=14，轮函数与 S 盒算法不变）。

function md5Bytes(input) {
  const msg = Array.from(input || []);
  const len = msg.length;
  const bitLen = len * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  const lo = bitLen >>> 0; const hi = Math.floor(bitLen / 4294967296) >>> 0;
  msg.push(lo & 255, (lo >>> 8) & 255, (lo >>> 16) & 255, (lo >>> 24) & 255);
  msg.push(hi & 255, (hi >>> 8) & 255, (hi >>> 16) & 255, (hi >>> 24) & 255);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  for (let off = 0; off < msg.length; off += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) M[j] = msg[off + j * 4] | (msg[off + j * 4 + 1] << 8) | (msg[off + j * 4 + 2] << 16) | (msg[off + j * 4 + 3] << 24);
    let A = a0; let B = b0; let C = c0; let D = d0;
    for (let r = 0; r < 64; r++) {
      let F; let g;
      if (r < 16) { F = (B & C) | (~B & D); g = r; }
      else if (r < 32) { F = (D & B) | (~D & C); g = (5 * r + 1) % 16; }
      else if (r < 48) { F = B ^ C ^ D; g = (3 * r + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * r) % 16; }
      const tmp = D; D = C; C = B;
      const sum = (A + F + K[r] + M[g]) | 0;
      B = (B + ((sum << S[r]) | (sum >>> (32 - S[r])))) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = [];
  for (const x of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out.push((x >>> (i * 8)) & 255);
  return out;
}


const AES256 = (function () {
  function xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff; }
  function mul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r & 0xff; }
  const SBOX = []; const INV = [];
  for (let a = 0; a < 256; a++) {
    let inv = 0;
    if (a) { for (let b = 1; b < 256; b++) { if (mul(a, b) === 1) { inv = b; break; } } }
    const x = inv;
    const s = x ^ ((x << 1 | x >> 7) & 255) ^ ((x << 2 | x >> 6) & 255) ^ ((x << 3 | x >> 5) & 255) ^ ((x << 4 | x >> 4) & 255) ^ 0x63;
    SBOX[a] = s & 0xff;
  }
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
  function expandKey256(key) {
    const Nk = 8; const Nr = 14;
    const w = [];
    for (let i = 0; i < Nk; i++) w[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
    let rcon = 1;
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
      let tt = w[i - 1];
      if (i % Nk === 0) {
        tt = ((tt << 8) | (tt >>> 24)) >>> 0;
        tt = ((SBOX[(tt >>> 24) & 255] << 24) | (SBOX[(tt >>> 16) & 255] << 16) | (SBOX[(tt >>> 8) & 255] << 8) | SBOX[tt & 255]) >>> 0;
        tt = (tt ^ (rcon << 24)) >>> 0;
        rcon = xt(rcon);
      } else if (i % Nk === 4) {
        tt = ((SBOX[(tt >>> 24) & 255] << 24) | (SBOX[(tt >>> 16) & 255] << 16) | (SBOX[(tt >>> 8) & 255] << 8) | SBOX[tt & 255]) >>> 0;
      }
      w[i] = (w[i - Nk] ^ tt) >>> 0;
    }
    return w;
  }
  function invShift(st) {
    const cols = [];
    for (let c = 0; c < 4; c++) cols[c] = [(st[c] >>> 24) & 255, (st[c] >>> 16) & 255, (st[c] >>> 8) & 255, st[c] & 255];
    const rows = [[], [], [], []];
    for (let cc = 0; cc < 4; cc++) for (let rr = 0; rr < 4; rr++) rows[rr][cc] = cols[cc][rr];
    for (let r2 = 0; r2 < 4; r2++) { const t2 = rows[r2].slice(); for (let c2 = 0; c2 < 4; c2++) rows[r2][(c2 + r2) % 4] = t2[c2]; }
    for (let c3 = 0; c3 < 4; c3++) for (let r3 = 0; r3 < 4; r3++) cols[c3][r3] = rows[r3][c3];
    const out = [];
    for (let c4 = 0; c4 < 4; c4++) out[c4] = ((cols[c4][0] << 24) | (cols[c4][1] << 16) | (cols[c4][2] << 8) | cols[c4][3]) >>> 0;
    return out;
  }
  function invSub(st) {
    const out = [];
    for (let c = 0; c < 4; c++) out[c] = ((INV[(st[c] >>> 24) & 255] << 24) | (INV[(st[c] >>> 16) & 255] << 16) | (INV[(st[c] >>> 8) & 255] << 8) | INV[st[c] & 255]) >>> 0;
    return out;
  }
  function invMix(st) {
    const out = [];
    for (let c = 0; c < 4; c++) {
      const b0 = (st[c] >>> 24) & 255; const b1 = (st[c] >>> 16) & 255; const b2 = (st[c] >>> 8) & 255; const b3 = st[c] & 255;
      out[c] = ((mul(b0, 14) ^ mul(b1, 11) ^ mul(b2, 13) ^ mul(b3, 9)) << 24 |
        (mul(b0, 9) ^ mul(b1, 14) ^ mul(b2, 11) ^ mul(b3, 13)) << 16 |
        (mul(b0, 13) ^ mul(b1, 9) ^ mul(b2, 14) ^ mul(b3, 11)) << 8 |
        (mul(b0, 11) ^ mul(b1, 13) ^ mul(b2, 9) ^ mul(b3, 14))) >>> 0;
    }
    return out;
  }
  function decBlock(w, s, Nr) {
    let st = [];
    for (let i = 0; i < 4; i++) st[i] = s[i] >>> 0;
    for (let round = Nr; round >= 1; round--) {
      for (let k = 0; k < 4; k++) st[k] = (st[k] ^ w[round * 4 + k]) >>> 0;
      if (round !== Nr) st = invMix(st);
      st = invShift(st);
      st = invSub(st);
    }
    for (let k2 = 0; k2 < 4; k2++) st[k2] = (st[k2] ^ w[k2]) >>> 0;
    return st;
  }
  function cbcDecrypt(keyBytes, ivBytes, dataBytes) {
    const w = expandKey256(keyBytes);
    const iv = [];
    for (let i = 0; i < 4; i++) iv[i] = ((ivBytes[i * 4] << 24) | (ivBytes[i * 4 + 1] << 16) | (ivBytes[i * 4 + 2] << 8) | ivBytes[i * 4 + 3]) >>> 0;
    const out = []; let prev = iv;
    for (let off = 0; off < dataBytes.length; off += 16) {
      const blk = [];
      for (let j = 0; j < 4; j++) blk[j] = ((dataBytes[off + j * 4] << 24) | (dataBytes[off + j * 4 + 1] << 16) | (dataBytes[off + j * 4 + 2] << 8) | dataBytes[off + j * 4 + 3]) >>> 0;
      let res = decBlock(w, blk, 14);
      res = [(res[0] ^ prev[0]) >>> 0, (res[1] ^ prev[1]) >>> 0, (res[2] ^ prev[2]) >>> 0, (res[3] ^ prev[3]) >>> 0];
      for (let j2 = 0; j2 < 4; j2++) out.push((res[j2] >>> 24) & 255, (res[j2] >>> 16) & 255, (res[j2] >>> 8) & 255, res[j2] & 255);
      prev = blk;
    }
    return out;
  }
  return { cbcDecrypt };
})();


function evpBytesToKey(password, salt, total) {
  const pw = Array.from(Buffer.from(String(password || ''), 'utf-8'));
  const sl = Array.from(salt || []);
  let out = []; let prev = [];
  while (out.length < total) {
    prev = md5Bytes(prev.concat(pw, sl));
    out = out.concat(prev);
  }
  return out.slice(0, total);
}

// ply 等价：pox/dp -> 真实 master 清单地址；失败返回 ''（绝不输出半截地址）

function decryptVideplayDp(pox, dp) {
  try {
    const parts = String(pox || '').split('+');
    if (parts.length < 3) return '';
    const pass = parts[1].slice(1);
    if (!pass) return '';
    const json = JSON.parse(Buffer.from(String(dp || ''), 'base64').toString('utf-8'));
    if (!json || !json.ct || !json.s) return '';
    const ct = Array.from(Buffer.from(json.ct, 'base64'));
    const salt = Array.from(Buffer.from(json.s, 'hex'));
    if (!ct.length || ct.length % 16 !== 0 || salt.length !== 8) return '';
    const dk = evpBytesToKey(pass, salt, 48);
    const plain = AES256.cbcDecrypt(dk.slice(0, 32), dk.slice(32, 48), ct);
    const pad = plain[plain.length - 1];
    const cut = (pad >= 1 && pad <= 16) ? plain.slice(0, plain.length - pad) : plain;
    const text = Buffer.from(cut).toString('utf-8');
    // 明文本身是 JSON 带引号字符串（"https:\/\/..."），先按 JSON 解析还原；
    // 非引号开头时只做 \/ -> / 还原。
    let url = text;
    if (text.startsWith('"')) {
      try { url = JSON.parse(text); } catch (e) { url = text.replace(/^"|"$/g, '').replace(/\\\//g, '/'); }
    } else url = text.replace(/\\\//g, '/');
    if (!/^https?:\/\/[^"'\\\s<>]+\/v-master\.m3u8\/[A-Za-z0-9_\-\.%=]+/i.test(url)) return '';
    return url;
  } catch (e) { return ''; }
}
// ---------- /videplay 模板 B ----------


// 嵌页 -> master 清单 -> 按 RESOLUTION 分档。直连变体清单（本站无自家 Worker）；
// master 解不出或变体为空时返回 []（省略该集，绝不输出嵌页地址）。
async function resolveLines(embedUrl, durl) {
  const embedHtml = await getText(embedUrl, durl);
  if (!embedHtml) return [];
  const unpacked = unpackDeanEdwards(embedHtml);
  const hay = unpacked || embedHtml;
  let master = '';
  const mm = hay.match(/https:\/\/api\.videplay\.us\/o\/v-master\.m3u8\/[A-Za-z0-9_\-\.%]+/i);
  if (mm) master = mm[0];
  if (!master) {
    const px = embedHtml.match(/let\s+pox\s*=\s*'([^']+)'/);
    const dp = embedHtml.match(/let\s+dp\s*=\s*'([^']+)'/);
    if (px && dp) master = decryptVideplayDp(px[1], dp[1]);
  }
  if (!master) return [];
  const masterText = await getText(master, embedUrl);
  const variants = masterText ? parseMasterVariants(masterText) : [];
  if (!variants.length) return [];
  const lines = [];
  for (const v of variants) {
    embedCache.set(v.url, embedUrl);
    if (embedCache.size > 200) embedCache.delete(embedCache.keys().next().value);
    lines.push({ name: v.name, url: v.url });
  }
  return lines;
}

async function init() {
  return {};
}

async function home() {
  const html = await getText(HOST + '/', HOST + '/');
  return { class: CLASSES, filters: FILTERS, list: parseCards(html) };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || 'latest').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.filters || body.extend || {};
  // 筛选卡片：选中的标签/厂商/女优地址优先，未选走顶级分类
  let base;
  if (extend.tag && String(extend.tag).trim()) {
    base = '/tag/' + String(extend.tag).trim();
  } else if (extend.studio && String(extend.studio).trim()) {
    base = '/studio/' + String(extend.studio).trim();
  } else if (extend.actor && String(extend.actor).trim()) {
    base = '/actor/' + String(extend.actor).trim();
  } else if (id === 'latest') {
    base = '/';
  } else {
    base = '/' + id;
  }
  const b = base.replace(/\/+$/, '');
  const url = page > 1 ? HOST + b + '/page/' + page + '/' : HOST + (b === '' ? '/' : b + '/');
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(Array.isArray(body.id) ? body.id[0] : body.id || '').trim();
  if (!id) return { list: [] };
  const durl = absUrl(id);
  const html = await getText(durl, HOST + '/');
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  let name = cleanText($('meta[property="og:title"]').attr('content'))
    || cleanText($('title').text()).replace(/\s*[–|-]\s*Javshujin.*$/i, '').trim();
  let pic = absUrl($('meta[property="og:image"]').attr('content'))
    || absUrl($('meta[name="thumbnailUrl"]').attr('content')) || '';
  const embedUrl = extractEmbedUrl(html);
  let lines = [];
  if (embedUrl) lines = await resolveLines(embedUrl, durl);
  const eps = [];
  for (const l of lines) {
    if (!l.url) continue;
    eps.push(l.name + '$' + l.url);
  }
  const vod = {
    vod_id: durl,
    vod_name: name,
    vod_pic: pic,
    vod_play_from: NAME,
    vod_play_url: eps.join('#'),
  };
  if (eps.length && subExtractCode(name)) {
    for (const e of eps) subCacheName(e.split('$').pop(), name);
    (async () => {
      for (const e of eps) {
        try { await subSearchAll(e.split('$').pop()); } catch (err) {}
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
  const url = id;
  const embedUrl = embedCache.get(url) || '';
  const regTitle = subNameCache.get(url) || '';
  const subs = subExtractCode(regTitle) ? await subSearchAll(url).catch(() => []) : [];
  const result = {
    parse: 0,
    url,
    header: { 'User-Agent': UA, 'Referer': embedUrl || HOST + '/' },
  };
  if (subs && subs.length) result.subs = subs;
  return result;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const wd = String(body.wd || '').trim();
  if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
  const q = encodeURIComponent(wd);
  const url = page > 1 ? HOST + '/page/' + page + '/?s=' + q : HOST + '/?s=' + q;
  const html = await getText(url, HOST + '/');
  const list = parseCards(html);
  const pagecount = list.length ? parsePagecount(html, page) : page;
  return { page, pagecount, limit: list.length || 20, total: pagecount * 20, list };
}

// ---------- 共享字幕芯（与 av01/av123 等蜘蛛同款自包含块：
//   迅雷 > 迅雷看看 > SubtitleCat；只挂有番号条目；全局上限 10、单槽 8；
//   总预算 6s、失败静默；无结果不带 subs 键）----------
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
  const parts = String(durl || '').split('/').filter(Boolean);
  const slug = parts.length ? parts[parts.length - 1] : '';
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
