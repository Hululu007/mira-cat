// 麻豆社 (https://madou.club) -> MiraPlayer spider (fixed 2026-11-11)
// 修复记录:
//  1. home() 排除 href="#" 的死链接: "其他原创/企划" 是下拉菜单父项(无真实页面),
//     其子分类(果冻传媒/天美传媒/皇家华人等)已各自单列; 旧版把它当成分类导致
//     category("#") 抛 "Failed to parse URL from #"、分类打不开。同理排除 "筛选"(#)。
//  2. detail() 不再提前取 token: 播放 token 是 JWT, 有效期只有 100 秒(iat->exp),
//     旧版在 detail() 里取好, 用户翻详情页超过 100 秒再点播就过期播不了。
//     改为 detail() 只存 iframe 的 share 地址, play() 里现取现解(与 javxxx 同款)。
//  3. detail()/play() 不再抛错: dash.madou.club 播放主机 502 时, 旧版
//     `match(...)[1]` 在 null 上取值抛错, App 报"视频信息获取失败"。
//     现改为取不到则返回空集/回落 iframe 地址(parse:1), 不抛错。
//  4. detail() 补标题与封面(旧版回空), 播放地址改为 parse:0 直链。
// 注意: 播放主机 dash.madou.club 2026-11-11 实测全站 502 Bad Gateway(后端挂了,
//  share 页 /videos/ 海报全 502, 与 UA/cookie/HTTP 版本无关), 且 madou.club 本身
//  间歇性 500 数据库错误。主机恢复前无法真机验证播放; 本蜘蛛在主机恢复后可直接播。
//  m3u8 结构(2026-04-11 存档页实测): /videos/<share_id>/index.m3u8?token=<JWT>,
//  token 从 share 页 `var token = "..."` 取, m3u8 从 `var m3u8 = '...'` 取。
import req from '../../util/req.js';
import * as cheerio from 'cheerio';

const KEY = 'py_madou';
const NAME = '麻豆社';
const HOST = 'https://madou.club';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// 下拉父项等无真实页面的导航名(按 href="#" 兜底也拦, 这里是双保险)
const EXCLUDE_NAMES = ['首页', '其他', '热门标签', '精选', '筛选'];

function headers(referer) {
  return { 'User-Agent': UA, 'Referer': referer || (HOST + '/') };
}

async function getHtml(url, referer) {
  try {
    const { data } = await req.get(url, { headers: headers(referer), timeout: 15000 });
    return String(data || '');
  } catch (e) { return ''; }
}

function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return HOST + u;
  return HOST + '/' + u;
}

function cleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return m; } })
    .replace(/\s+/g, ' ').trim();
}

async function init() { return {}; }

async function home() {
  const html = await getHtml(HOST + '/');
  const $ = cheerio.load(html);
  const list = [];
  const seen = new Set();
  $('.sitenav a').each((i, el) => {
    const name = cleanText($(el).text());
    let href = String($(el).attr('href') || '').trim();
    if (!name || !href) return;
    if (href === '#' || href.startsWith('javascript:')) return;
    if (EXCLUDE_NAMES.includes(name)) return;
    href = absUrl(href);
    if (seen.has(href)) return;
    seen.add(href);
    list.push({ type_id: href, type_name: name });
  });
  return { class: list };
}

function parseList(html) {
  const $ = cheerio.load(html || '');
  const out = [];
  const seen = new Set();
  $('.excerpts-wrapper article').each((i, el) => {
    const a = $(el).find('a').first();
    const href = absUrl(String(a.attr('href') || '').trim());
    if (!href || seen.has(href)) return;
    seen.add(href);
    const name = cleanText($(el).find('h2').text());
    const pic = absUrl(String($(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '').trim());
    const remarks = cleanText($(el).find('.post-view').text());
    out.push({ vod_id: href, vod_name: name || href, vod_pic: pic, vod_remarks: remarks });
  });
  return out;
}

async function category(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  let id = String(body.id || body.tid || '').trim();
  let page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!id || id === '#') return { page, pagecount: page, limit: 0, total: 0, list: [] };
  let url = id;
  if (page > 1) url = id.replace(/\/$/, '') + '/page/' + page;
  const html = await getHtml(url);
  const list = parseList(html);
  return { page, pagecount: list.length < 10 ? page : page + 1, limit: list.length || 20, total: 9999, list, filter: [] };
}

async function detail(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const vid = String(body.id || '').trim();
  if (!vid) return { list: [] };
  const html = await getHtml(vid);
  if (!html) return { list: [] };
  const $ = cheerio.load(html);
  let name = cleanText($('title').text()).replace(/\s*-\s*麻豆社\s*$/i, '').trim();
  if (!name) name = cleanText($('h1').first().text());
  let pic = String($('meta[property="og:image"]').attr('content') || '').trim();
  if (!pic) {
    const m = html.match(/shareimage\s*:\s*'([^']+)'/);
    if (m) pic = m[1];
  }
  // 播放器 iframe: <article class="article-content"><iframe src=https://dash.madou.club/share/<id>>
  let iframe = String($('.article-content iframe').attr('src') || '').trim();
  if (!iframe) {
    const m = html.match(/<iframe[^>]+src=([^\s>"']+)/i);
    if (m) iframe = m[1];
  }
  if (!iframe) return { list: [] };
  iframe = absUrl(iframe);
  return {
    list: [{
      vod_id: vid,
      vod_name: name || '麻豆社',
      vod_pic: absUrl(pic),
      vod_play_from: NAME,
      // 只存 share 地址; token 只有 100 秒有效, play() 里现取现解
      vod_play_url: '播放$' + iframe,
    }],
  };
}

// 从 share 页解 token + m3u8, 返回签名直链(失败返回 '')
async function resolveShare(shareUrl) {
  const html = await getHtml(shareUrl);
  if (!html) return '';
  const tm = html.match(/var token\s*=\s*"([^"]+)"/);
  const mm = html.match(/var m3u8\s*=\s*'([^']+)'/);
  if (!tm || !mm || !tm[1] || !mm[1]) return '';
  const origin = (shareUrl.match(/^(https?:\/\/[^\/]+)/) || [])[1] || 'https://dash.madou.club';
  const path = mm[1].startsWith('/') ? mm[1] : '/' + mm[1];
  return origin + path + '?token=' + tm[1];
}

async function play(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  let id = String(body.id || '').trim();
  if (id.indexOf('$') !== -1) id = id.split('$').pop().trim();
  if (!id) return { parse: 1, url: '', header: { 'User-Agent': UA } };
  // 已是直链 m3u8/mp4: 直接播
  if (/\.(m3u8|mp4)(\?|$)/i.test(id)) {
    return { parse: 0, url: id, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
  }
  // share 地址(或裸 share id): 现取 token 解签名直链
  let shareUrl = id;
  if (!/^https?:\/\//i.test(shareUrl)) {
    shareUrl = 'https://dash.madou.club/share/' + shareUrl.replace(/^\/+/, '');
  }
  try {
    const url = await resolveShare(shareUrl);
    if (url) {
      return { parse: 0, url, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
    }
  } catch (e) {}
  // share 页取不到(播放主机挂了): 回落 iframe 地址让播放器自己试, 不抛错
  return { parse: 1, url: shareUrl, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
}

async function search(reqIn) {
  const body = (reqIn && reqIn.body) || {};
  const wd = String(body.wd || '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
  // 注意: 站方搜索间歇性 500 数据库错误, 是站方问题
  const url = HOST + '/page/' + page + '?s=' + encodeURIComponent(wd);
  const html = await getHtml(url);
  const list = parseList(html);
  return { page, pagecount: list.length < 10 ? page : page + 1, limit: list.length || 20, total: 9999, list };
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
