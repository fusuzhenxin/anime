/* 动漫集 · 共享脚本 */
'use strict';

const SITE = (window.DIEFAN_DATA && window.DIEFAN_DATA.site) || { name: '动漫集', tagline: '', email: '' };
const PALETTES = [
  ['#3a1d3c', '#ff5c8a'],
  ['#14224a', '#6ea8ff'],
  ['#1b2a22', '#7ee0b0'],
  ['#3a1a18', '#ff8a5c'],
  ['#24143a', '#c9a6ff'],
  ['#10222a', '#5ce1e6']
];

function esc(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hashHue(str){
  let h = 0;
  for (const ch of String(str || 'x')) h = (h * 31 + ch.charCodeAt(0)) & 0xffffff;
  return h;
}
function asset(path){
  const prefix = (typeof window !== 'undefined' && window.ASSET_PREFIX) || '';
  return `${prefix}${path}`;
}
function coverSrc(cover){
  const c = String(cover || '');
  if (!c) return '';
  if (/^https?:\/\//i.test(c)) return c;
  const site = (typeof DATA !== 'undefined' && DATA.site) || (typeof window !== 'undefined' && window.DIEFAN_DATA && window.DIEFAN_DATA.site) || {};
  const cdn = String(site.coverCdn || '').replace(/\/$/, '');
  if (cdn) return `${cdn}/${c.replace(/^\//, '')}`;
  return asset(c);
}
function param(name){
  const search = (typeof location !== 'undefined' && location.search) || '';
  return new URLSearchParams(search).get(name);
}
function listUrl(id){ return asset(`l/${encodeURIComponent(id)}.html`); }
function detailUrl(id){ return asset(`w/${encodeURIComponent(id)}.html`); }
function catUrl(id){ return id === 'featured' ? asset('lists.html') : asset(`c/${encodeURIComponent(id)}.html`); }
function homeUrl(){ return asset('index.html'); }

function posterHtml(work, cls='poster'){
  const title = esc(work.title);
  const rate = esc(work.rate || '');
  const alt = esc(`${work.title}${work.year ? ' ' + work.year : ''} 动漫海报`);
  if (work.cover) {
    return `<div class="${cls}"><img src="${esc(coverSrc(work.cover))}" alt="${alt}" width="300" height="450" loading="lazy"><span class="poster-rate">${rate}</span></div>`;
  }
  const i = hashHue(work.id) % PALETTES.length;
  const [c1, c2] = PALETTES[i];
  return `<div class="${cls} gen-ph" style="background:linear-gradient(160deg,${c1},${c2})" role="img" aria-label="${alt}"><b>${title}</b><span>${rate}</span></div>`;
}

function formatLabel(work){
  if (work.format === 'movie') return '剧场版';
  if (work.format === 'ova') return 'OVA/WEB';
  return 'TV';
}

function indexData(raw){
  const works = raw.works || [];
  const lists = raw.lists || [];
  const workById = Object.fromEntries(works.map(w => [w.id, w]));
  const listById = Object.fromEntries(lists.map(l => [l.id, l]));
  const listsByWork = {};
  lists.forEach(list => {
    (list.items || []).forEach(id => {
      (listsByWork[id] || (listsByWork[id] = [])).push(list);
    });
  });
  const listCount = {};
  Object.keys(listsByWork).forEach(id => { listCount[id] = listsByWork[id].length; });
  return { ...raw, works, lists, workById, listById, listsByWork, listCount };
}

const DATA = indexData(window.DIEFAN_DATA || { lists: [], works: [], categories: [] });

function rateNum(w){
  const n = parseFloat(w && w.rate);
  return Number.isFinite(n) ? n : 0;
}
function zhLen(s){
  return Array.from(String(s || '')).length;
}
function parseCount(raw){
  const s = String(raw || '').trim();
  if (!s) return 0;
  const wan = s.match(/^([\d.]+)\s*万/);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function padDesc(text, extra){
  let out = String(text || '').replace(/\s+/g, ' ').trim();
  if (zhLen(out) < 80 && extra) out += extra;
  if (zhLen(out) < 80) out += '动漫集只做动漫推荐、新番表、片单交叉和观看顺序对照，不提供在线播放，也不提供下载或片源。';
  return out;
}
function pageMetaDesc(text, extra){
  const max = 150;
  const out = padDesc(text, extra);
  const chars = Array.from(out);
  if (chars.length <= max) return out;
  const slice = chars.slice(0, max).join('');
  const cut = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'));
  if (cut >= 48) return slice.slice(0, cut + 1);
  return slice.replace(/[，、；;：:\s]+$/, '') + '…';
}
function listSeoDesc(list){
  const names = (list.items || []).map(id => DATA.workById[id]).filter(Boolean).map(w => w.title);
  const extra = `本片单共收录${(list.items || []).length}部作品${names.length ? '，包括' + names.slice(0, 8).join('、') + '等' : ''}。可按评分、季度和观看顺序对照，适合查${(list.keywords || '').split(',').slice(0, 3).join('、')}。`;
  return padDesc(list.desc, extra);
}
function absUrl(pathFromRoot){
  const raw = String(pathFromRoot || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  let path = raw.replace(/^\//, '');
  if (path === 'index.html') path = '';
  const base = String((DATA.site && DATA.site.baseUrl) || '').replace(/\/$/, '');
  if (base) return path ? `${base}/${path}` : `${base}/`;
  return path ? `/${path}` : '/';
}
function jsonLd(obj){
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}
function crumbJson(items){
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path)
    }))
  };
}

function workCard(work){
  return `<a class="card poster-card" href="${detailUrl(work.id)}">${posterHtml(work)}
    <div class="cap"><b>${esc(work.title)}</b><em>${esc(work.rate || '')} · ${esc(formatLabel(work))}</em></div></a>`;
}

function listCard(list){
  const ids = (list.items || []).slice(0, 1);
  const work = DATA.workById[ids[0]] || { id: list.id, title: list.name, rate: '' };
  return `<a class="hub-card" href="${listUrl(list.id)}"><div class="thumb">${posterHtml(work)}</div><div class="t">${esc(list.name)}</div></a>`;
}

function neighborWhy(n){
  const bits = [];
  if (n.sharedCount > 1) bits.push(n.sharedLists.slice(0, 2).map(l => l.name).join(' · '));
  else if (n.anchorList) bits.push(n.anchorList.name);
  if (n.sameStudio) bits.push('同一工作室');
  if (n.movie.year) bits.push(String(n.movie.year));
  return bits.join(' · ');
}

function workGraph(id){
  const work = DATA.workById[id];
  const memberships = DATA.listsByWork[id] || [];
  const sharedCount = {};
  const sharedLists = {};
  memberships.forEach(list => {
    (list.items || []).forEach(other => {
      if (other === id) return;
      sharedCount[other] = (sharedCount[other] || 0) + 1;
      (sharedLists[other] || (sharedLists[other] = [])).push(list);
    });
  });
  const neighbors = Object.keys(sharedCount).map(mid => {
    const other = DATA.workById[mid];
    if (!other) return null;
    const lists = sharedLists[mid];
    let distance = 9999, anchor = null, position = -1, total = 0;
    lists.forEach(item => {
      const a = (item.items || []).indexOf(id);
      const b = (item.items || []).indexOf(mid);
      if (a < 0 || b < 0) return;
      const d = Math.abs(a - b);
      if (d < distance){ distance = d; anchor = item; position = b; total = (item.items || []).length; }
    });
    return {
      movie: other,
      sharedCount: sharedCount[mid],
      sharedLists: lists,
      sameStudio: !!(work.studio && other.studio === work.studio),
      distance, position, total, anchorList: anchor
    };
  }).filter(Boolean).sort((a,b) => b.sharedCount - a.sharedCount || a.distance - b.distance || rateNum(b.movie) - rateNum(a.movie)).slice(0, 6);

  const byCat = {};
  memberships.forEach(list => { (byCat[list.category] || (byCat[list.category] = [])).push(list); });
  const reasons = [];
  if ((byCat.rank || []).length + (byCat.studio || []).length >= 2){
    const shown = [...(byCat.rank || []), ...(byCat.studio || [])].slice(0, 3);
    reasons.push({ title: '名单共识', body: '同时出现在' + shown.map(l => l.name).join('、') + '。', lists: shown });
  }
  if ((byCat.genre || []).length >= 2){
    reasons.push({ title: '题材交叉', body: `既在「${byCat.genre[0].name}」，也在「${byCat.genre[1].name}」。`, lists: byCat.genre.slice(0, 2) });
  }
  if ((byCat.studio || [])[0]){
    reasons.push({ title: '制作入口', body: `可以从「${byCat.studio[0].name}」走进同一工作室。`, lists: byCat.studio.slice(0, 1) });
  }
  const hops = [];
  const seen = new Set();
  function addHop(list, kind, desc){
    if (!list || seen.has(list.id)) return;
    seen.add(list.id);
    hops.push({ kind, title: list.name, href: listUrl(list.id), desc });
  }
  addHop((byCat.order || [])[0], 'order', '观看顺序，下一跳按名单走。');
  addHop((byCat.studio || [])[0], 'studio', '同一工作室或监督的其它作品。');
  addHop((byCat.genre || [])[0] || (byCat.season || [])[0], 'topic', '沿这条口味继续找。');

  const orders = memberships.filter(l => l.category === 'order').map(list => {
    const ids = list.items || [];
    const index = ids.indexOf(id);
    if (index < 0) return null;
    return {
      list, index, total: ids.length,
      prev: index > 0 ? DATA.workById[ids[index - 1]] : null,
      next: index < ids.length - 1 ? DATA.workById[ids[index + 1]] : null
    };
  }).filter(Boolean).slice(0, 2);

  return { memberships, neighbors, reasons: reasons.slice(0, 3), hops: hops.slice(0, 3), orders };
}

function blurb(work, nLists, listNames){
  const kind = formatLabel(work);
  const parts = [`「${work.title}」` + (work.year ? `（${work.year}）` : '') + `是一部${kind}`];
  if (work.director) parts.push(`由${work.director}执导`);
  if (work.studio) parts.push(`制作${work.studio}`);
  if (work.tags && work.tags.length) parts.push('类型包括' + work.tags.slice(0, 3).join('、'));
  if (work.rate) parts.push(`评分${work.rate}`);
  if (nLists) parts.push(`在本站出现在${nLists}份片单中`);
  if (listNames && listNames.length) parts.push('例如' + listNames.slice(0, 3).join('、'));
  const fact = parts.join('，') + '。页面只做片单对照，不提供播放。';
  if ((work.syn || '').length >= 12) return fact + work.syn.replace(/。+$/, '') + '。';
  return fact;
}
function workSeoDesc(work){
  const n = DATA.listCount[work.id] || 0;
  const names = (DATA.listsByWork[work.id] || []).map(l => l.name);
  return padDesc(blurb(work, n, names));
}

const LOGO = () => `<a class="logo" href="${homeUrl()}" aria-label="${SITE.name}">
  <img class="logo-mark" src="${asset('favicon.svg')}" width="32" height="32" alt="${esc(SITE.name)}">
  <span><span class="brand-c">${esc(SITE.name)}</span></span>
</a>`;

function chromeNav(page){
  const links = [
    ['home', homeUrl(), '首页'],
    ['season', listUrl('summer-2026'), '本季'],
    ['catalog', asset('works.html'), '全部'],
    ['lists', asset('lists.html'), '片单'],
    ['order', catUrl('order'), '顺序'],
    ['method', asset('method.html'), '方法']
  ];
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  if (page === 'list' && (param('id') === 'summer-2026' || /summer-2026\.html$/.test(path))) page = 'season';
  if (page === 'lists' && (param('cat') === 'order' || /c\/order\.html$/.test(path))) page = 'order';
  if (page === 'list') page = 'lists';
  return `<nav class="nav"><div class="wrap nav-in">
    ${LOGO()}
    <div class="nav-links">${links.map(([k, href, label]) => `<a href="${href}" data-p="${k}" class="${page===k?'active':''}">${label}</a>`).join('')}</div>
    <div class="nav-right">
      <button class="icon-btn" id="searchBtn" aria-label="搜索动漫推荐"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button>
      <button class="toggle" id="themeBtn" aria-label="切换主题"><span class="dot"></span></button>
    </div>
  </div></nav>`;
}

function chromeFoot(){
  const keys = DATA.lists.slice(0, 12).map(l => `<a href="${listUrl(l.id)}">${esc(l.name)}</a>`).join('');
  return `<footer>
    <div class="wrap foot-grid">
      <div>
        <div class="logo" style="margin-bottom:10px">${LOGO()}</div>
        <p class="foot-desc">动漫集是二次元动漫网站，把日漫、国漫和新番收成动漫大全，对照高分推荐、2026新番表、动画电影和观看顺序。不提供在线播放。</p>
        <p class="foot-desc" style="margin-top:10px">联系邮箱 <a href="mailto:${esc(SITE.email)}" style="color:var(--brand)">${esc(SITE.email)}</a></p>
      </div>
      <div class="foot-col">
        <h3>浏览</h3>
        <a href="${asset('works.html')}">全部作品</a>
        <a href="${asset('lists.html')}">全部片单</a>
        <a href="${listUrl('summer-2026')}">2026夏番</a>
        <a href="${catUrl('order')}">观看顺序</a>
        <a href="${asset('method.html')}">方法</a>
      </div>
      <div class="foot-col">
        <h3>站点</h3>
        <a href="${asset('about.html')}#about">关于</a>
        <a href="${asset('about.html')}#copyright">版权声明</a>
        <a href="${asset('about.html')}#complaint">侵权投诉</a>
      </div>
    </div>
    <div class="wrap"><div class="foot-keys">${keys}</div></div>
    <div class="wrap"><div class="copy">© ${esc(SITE.name)} · 动漫推荐交叉索引 · 不提供在线播放</div></div>
  </footer>`;
}

function initChrome(page){
  const nav = document.getElementById('nav');
  const foot = document.getElementById('foot');
  if (nav && !nav.hasAttribute('data-static')) nav.innerHTML = chromeNav(page);
  if (foot && !foot.hasAttribute('data-static')) foot.innerHTML = chromeFoot();
  if (!document.getElementById('modal')) {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="modal"><div class="search-box">
      <input id="searchInput" placeholder="搜索动漫、监督、声优或片单…" autocomplete="off" />
      <div class="hot"><span>本季新番</span><span>日漫</span><span>国漫</span><span>异世界</span><span>恋爱</span><span>治愈</span><span>宫崎骏</span><span>观看顺序</span><span>剧场版</span></div>
      <div class="results" id="searchResults"></div>
    </div></div>`);
  }
  if (!document.getElementById('backTop')) {
    document.body.insertAdjacentHTML('beforeend', `<button class="back-top" id="backTop" type="button" aria-label="回到顶部">↑</button>`);
  }
  const root = document.documentElement;
  const saved = localStorage.getItem('df-theme');
  if (saved) root.setAttribute('data-theme', saved);
  document.getElementById('themeBtn')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('df-theme', next);
  });
  const modal = document.getElementById('modal');
  const input = document.getElementById('searchInput');
  document.getElementById('searchBtn')?.addEventListener('click', () => { modal.classList.add('open'); setTimeout(() => input.focus(), 30); });
  modal.onclick = e => { if (e.target === modal) modal.classList.remove('open'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('open'); });
  input.addEventListener('input', () => renderSearch(input.value));
  modal.querySelectorAll('.hot span').forEach(s => s.addEventListener('click', () => {
    input.value = s.textContent;
    renderSearch(input.value);
  }));
  const backTop = document.getElementById('backTop');
  const sync = () => backTop.classList.toggle('show', window.scrollY > 520);
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

function renderSearch(q){
  const box = document.getElementById('searchResults');
  q = (q || '').trim().toLowerCase();
  if (!q){ box.innerHTML = ''; return; }
  const inStr = s => (s || '').toLowerCase().includes(q);
  const works = DATA.works.filter(w => inStr(w.title) || inStr(w.orig) || inStr(w.director) || inStr(w.studio) || (w.seiyuu||[]).some(inStr) || (w.tags||[]).some(inStr)).slice(0, 8);
  const lists = DATA.lists.filter(l => inStr(l.name) || inStr(l.desc) || inStr(l.keywords)).slice(0, 6);
  let html = '';
  if (works.length) html += `<div class="res-group"><span class="res-k">作品</span>${works.map(w => `<a class="res" href="${detailUrl(w.id)}">${esc(w.title)} <em>${esc(w.rate||'')}</em></a>`).join('')}</div>`;
  if (lists.length) html += `<div class="res-group"><span class="res-k">片单</span>${lists.map(l => `<a class="res" href="${listUrl(l.id)}">${esc(l.name)}</a>`).join('')}</div>`;
  box.innerHTML = html || '<div class="res-empty">没有找到相关结果</div>';
}

const TONIGHT_MOODS = {
  heat: { label: '热血', keys: ['热血', '战斗', '巨人', '鬼灭', '咒术'] },
  love: { label: '恋爱', keys: ['恋爱', '你的名字', '校园恋爱'] },
  heal: { label: '治愈', keys: ['治愈', '日常', '紫罗兰', '龙猫'] },
  isekai: { label: '异世界', keys: ['异世界', '转生', '无职'] },
  brain: { label: '烧脑', keys: ['悬疑', '科幻', '命运石之门', '今敏'] },
  easy: { label: '轻松', keys: ['搞笑', '轻松', '音乐'] }
};
const TONIGHT_EXTRAS = {
  movie: { label: '只看剧场版' },
  binge: { label: '可以连看' },
  high: { label: '只看高分' },
  jp: { label: '日漫' },
  cn: { label: '国漫' }
};

function tonightExtraOk(work, extra){
  if (!extra) return true;
  if (extra === 'movie') return work.format === 'movie';
  if (extra === 'binge') return work.format === 'tv' || (DATA.listsByWork[work.id] || []).some(l => l.category === 'order');
  if (extra === 'high') return rateNum(work) >= 8.5;
  if (extra === 'jp') return work.region === '日本';
  if (extra === 'cn') return /中国/.test(work.region || '');
  return true;
}

function tonightHTML(state){
  const mood = TONIGHT_MOODS[state.mood];
  const has = !!(state.mood || state.extra);
  let ranked = [];
  if (has){
    DATA.works.forEach(work => {
      if (!tonightExtraOk(work, state.extra)) return;
      const lists = DATA.listsByWork[work.id] || [];
      const matching = mood ? lists.filter(l => mood.keys.some(k => (l.name + (l.keywords||'')).includes(k))) : lists.slice(0, 2);
      const hitTags = mood ? (work.tags || []).filter(t => mood.keys.some(k => t.includes(k))) : [];
      if (mood && !matching.length && !hitTags.length) return;
      ranked.push({ work, matching, hitTags, score: rateNum(work) * 12 + matching.length * 15 + Math.min(8, lists.length) });
    });
    ranked.sort((a,b) => b.score - a.score);
  }
  const start = (state.offset || 0) % Math.max(ranked.length, 1);
  const rotated = ranked.slice(start).concat(ranked.slice(0, start));
  const picks = [];
  const seen = new Set();
  rotated.forEach(item => {
    if (picks.length >= 3 || seen.has(item.work.id)) return;
    seen.add(item.work.id);
    picks.push(item);
  });
  const shuffle = ranked.length > 3 ? `<button type="button" class="btn-sm" data-k="shuffle">换一批</button>` : '';
  let body = '<p class="tonight-empty">点任意一个标签，从现有名单里抽三部。</p>';
  if (has && !picks.length) body = '<p class="tonight-empty">这个组合暂时没有，换一个标签。</p>';
  else if (picks.length){
    body = `<div class="tonight-picks">${picks.map(item => {
      const names = item.matching.slice(0, 2).map(l => l.name);
      let reason = names.length ? `因为在「${names.join('」和「')}」里` : (item.hitTags.length ? `因为标签有「${item.hitTags.slice(0,2).join(' / ')}」` : '');
      if (item.work.rate) reason += `，评分 ${item.work.rate}`;
      return `<a class="tonight-pick" href="${detailUrl(item.work.id)}"><div class="tonight-poster">${posterHtml(item.work)}</div>
        <div class="tonight-meta"><b>${esc(item.work.title)}</b>${item.work.rate?`<span class="tonight-rate">${esc(item.work.rate)}</span>`:''}<p class="tonight-why">${esc(reason)}</p></div></a>`;
    }).join('')}</div>`;
  }
  return `<div class="sec-head"><h2 class="sec-title">今晚追什么</h2>${shuffle}</div>
    <div class="tonight-filters">
      ${Object.keys(TONIGHT_MOODS).map(id => `<button type="button" class="btn-sm ${state.mood===id?'active':''}" data-k="mood" data-v="${id}">${TONIGHT_MOODS[id].label}</button>`).join('')}
      <span class="tonight-sep"></span>
      ${Object.keys(TONIGHT_EXTRAS).map(id => `<button type="button" class="btn-sm ${state.extra===id?'active':''}" data-k="extra" data-v="${id}">${TONIGHT_EXTRAS[id].label}</button>`).join('')}
    </div>${body}`;
}

function bindTonight(root){
  if (!root) return;
  const state = { mood: 'heat', extra: '', offset: 0 };
  function render(){ root.innerHTML = tonightHTML(state); }
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-k]');
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.k, value = btn.dataset.v;
    if (key === 'mood') state.mood = value;
    else if (key === 'extra') state.extra = state.extra === value ? '' : value;
    else if (key === 'shuffle') state.offset += 3;
    else return;
    if (key !== 'shuffle') state.offset = 0;
    render();
  });
  render();
}

function homeHTML(){
  const season = DATA.listById['summer-2026'];
  const seasonWorks = (season.items || []).map(id => DATA.workById[id]).filter(Boolean);
  const nMulti = Object.values(DATA.listCount).filter(n => n >= 3).length;
  const crossed = DATA.works.filter(w => (DATA.listCount[w.id] || 0) >= 3)
    .sort((a,b) => (DATA.listCount[b.id]||0) - (DATA.listCount[a.id]||0) || rateNum(b) - rateNum(a)).slice(0, 8);
  const homeCats = DATA.categories.filter(c => c.id !== 'featured');
  const rows = homeCats.map(cat => {
    const lists = DATA.lists.filter(l => l.category === cat.id).slice(0, 8);
    if (!lists.length) return '';
    return `<section><div class="sec-head"><h2 class="sec-title">${esc(cat.name)}</h2><a class="btn-sm" href="${catUrl(cat.id)}">更多</a></div>
      <div class="sec-row">${lists.map(listCard).join('')}</div></section>`;
  }).join('');
  return `<section class="hero wrap">
    <p class="hero-kicker">动漫网站 · 二次元</p>
    <h1 class="home-h1">动漫网站、动漫大全与二次元推荐</h1>
    <p class="hero-lead">动漫集是二次元动漫网站，把高分日漫、国漫、2026新番和动画电影收成动漫大全。对照片单重叠和观看顺序，查好看的动漫、本季新番表和从哪部看，不提供在线播放。</p>
    <div class="hero-stats"><div><b>${DATA.lists.length}</b><span>份公开片单</span></div><div><b>${DATA.works.length}</b><span>部对照作品</span></div><div><b>${nMulti}</b><span>部出现在 3 份以上名单</span></div></div>
    <div class="hero-links"><a href="${asset('works.html')}">全部 ${DATA.works.length} 部作品</a>${homeCats.map(c => `<a href="${catUrl(c.id)}">${esc(c.name)}</a>`).join('')}</div>
  </section>
  <section class="wrap">
    <div class="sec-head"><h2 class="sec-title">2026夏番 · 本季新番</h2><a class="btn-sm" href="${listUrl('summer-2026')}">完整新番表</a></div>
    <p class="home-note">2026年夏季新番推荐按七月档日漫续作整理，可对照本季新番表、高分日漫和观看顺序，不提供播放源。</p>
    <div class="season-hero">
      <div class="season-viewport">
        <div class="season-track">${seasonWorks.map(workCard).join('')}</div>
      </div>
      <div class="season-side">
        <a class="mini" href="${asset('works.html')}"><b>全部作品</b><p>本地 ${DATA.works.length} 部按评分浏览，不用搜。</p></a>
        <a class="mini" href="${listUrl('jp-high')}"><b>高分日漫推荐</b><p>好看的日本动漫、必看日漫和经典番剧。</p></a>
        <a class="mini" href="${catUrl('order')}"><b>动漫观看顺序</b><p>火影、龙珠、物语、小圆、巨人从哪部看。</p></a>
        <a class="mini" href="${listUrl('cn-high')}"><b>高分国漫推荐</b><p>国产动漫与国漫电影对照。</p></a>
        <a class="mini" href="${listUrl('movie-high')}"><b>高分剧场版</b><p>动画电影、吉卜力与新海诚。</p></a>
      </div>
    </div>
  </section>
  <main class="wrap">
    <section id="tonight">${tonightHTML({ mood: 'heat', extra: '', offset: 0 })}</section>
    <section>
      <div class="sec-head"><h2 class="sec-title">交叉最多的作品</h2><a class="btn-sm" href="${asset('method.html')}">怎么算的</a></div>
      <p class="home-note">按「同时出现在几份动漫名单」排序，不是热搜。用来查必看日漫、高分动漫和剧场版入门。</p>
      <div class="cross-hits">${crossed.map(w => `<a class="cross-hit" href="${detailUrl(w.id)}"><div class="thumb">${posterHtml(w)}</div><div><b>${esc(w.title)}</b><span>出现在 ${DATA.listCount[w.id]} 份片单</span></div></a>`).join('')}</div>
    </section>
    ${rows}
    <section class="home-seo">
      <h2>动漫网站和二次元动漫大全</h2>
      <p>动漫集是动漫网站，不是播放站。把日漫、国漫、新番和剧场版做成可检索的二次元动漫大全：一份名单和另一份叠了多少、一部番只在这里还是到处都有、系列从哪部看。想查 2026新番、高分日漫、国漫推荐、动画电影或观看顺序，从片单进入即可。说明见<a href="${asset('method.html')}">交叉怎么算</a>。</p>
      <h2>可以怎么查动漫推荐</h2>
      <p>按季度看<a href="${listUrl('summer-2026')}">2026年夏季新番推荐</a>，按地区看<a href="${listUrl('jp-high')}">高分日漫推荐</a>和<a href="${listUrl('cn-high')}">高分国漫推荐</a>，按系列看<a href="${catUrl('order')}">动漫观看顺序</a>，或打开<a href="${asset('works.html')}">动漫大全</a>浏览全部作品。页面提供海报、监督、声优和入选片单，不提供在线播放。</p>
    </section>
  </main>`;
}

function homeJSONLD(){
  const nMulti = Object.values(DATA.listCount).filter(n => n >= 3).length;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE.name,
        alternateName: ['动漫网站', '动漫大全', '二次元', '动漫推荐', '新番表'],
        description: '动漫集是二次元动漫网站与动漫大全，收录高分日漫、国漫、2026新番、剧场版和观看顺序。',
        inLanguage: 'zh-CN',
        url: absUrl('index.html'),
        publisher: {
          '@type': 'Organization',
          name: SITE.name,
          url: absUrl('index.html'),
          email: SITE.email,
          logo: { '@type': 'ImageObject', url: absUrl('icon-512.png') }
        }
      },
      {
        '@type': 'ItemList',
        name: '动漫集公开片单',
        description: `共${DATA.lists.length}份动漫片单、${DATA.works.length}部作品，其中${nMulti}部出现在3份以上名单。`,
        numberOfItems: DATA.lists.length,
        itemListElement: DATA.lists.slice(0, 20).map((list, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: list.name,
          url: absUrl(`l/${list.id}.html`)
        }))
      },
      crumbJson([{ name: '动漫推荐首页', path: 'index.html' }])
    ]
  };
}

function renderHome(root){
  root.innerHTML = homeHTML();
  bindTonight(document.getElementById('tonight'));
  bindSeasonTrack();
}

function hubHTML(catId){
  const cat = DATA.categories.find(c => c.id === catId) || { id: 'featured', name: '精选片单' };
  const lists = catId === 'featured' ? DATA.lists : DATA.lists.filter(l => l.category === catId);
  const menu = DATA.categories.map(c => `<a href="${catUrl(c.id)}" class="${c.id===cat.id?'active':''}">${esc(c.name)}</a>`).join('');
  const lead = padDesc(`动漫集「${cat.name}」共有${lists.length}份公开片单，覆盖新番表、高分日漫、国漫、剧场版、工作室和观看顺序。片单名按搜索词来写，点进去看重叠邻单和独有条目，不提供在线播放。`);
  return `<div class="wrap hub">
    <aside class="side-menu">${menu}</aside>
    <main>
      <h1 class="hub-title">${esc(cat.name === '精选片单' ? '动漫片单推荐' : cat.name)}</h1>
      <p class="hub-lead">${esc(lead)}</p>
      <h2 class="sec-title" style="margin:0 0 14px">${esc(cat.name === '精选片单' ? '全部动漫片单' : cat.name + '片单列表')}</h2>
      <div class="hub-grid">${lists.map(listCard).join('')}</div>
    </main>
  </div>`;
}

function renderHub(root, catId){
  root.innerHTML = hubHTML(catId);
}

function formatBar(works){
  const nAll = works.length;
  const nTv = works.filter(w => (w.format || 'tv') === 'tv').length;
  const nMovie = works.filter(w => w.format === 'movie').length;
  const nOva = works.filter(w => w.format === 'ova').length;
  return `<input class="fmt-input" type="radio" name="list-fmt" id="fmt-all" checked>
      <input class="fmt-input" type="radio" name="list-fmt" id="fmt-tv">
      <input class="fmt-input" type="radio" name="list-fmt" id="fmt-movie">
      <input class="fmt-input" type="radio" name="list-fmt" id="fmt-ova">
      <div class="filter-bar" id="filterBar">
        <label class="btn-sm" for="fmt-all">全部 ${nAll}</label>
        <label class="btn-sm" for="fmt-tv">TV ${nTv}</label>
        <label class="btn-sm" for="fmt-movie">剧场版 ${nMovie}</label>
        <label class="btn-sm" for="fmt-ova">OVA/WEB ${nOva}</label>
        <span class="list-count fmt-count-all">共 ${nAll} 部</span>
        <span class="list-count fmt-count-tv">共 ${nTv} 部</span>
        <span class="list-count fmt-count-movie">共 ${nMovie} 部</span>
        <span class="list-count fmt-count-ova">共 ${nOva} 部</span>
      </div>`;
}

function listItemHTML(w, i){
  return `<div class="m-item" id="m${i+1}" data-kind="${esc(w.format || 'tv')}">
      <a class="m-detail-hit" href="${detailUrl(w.id)}" aria-label="查看${esc(w.title)}动漫推荐"></a>
      <h2 class="m-title"><span class="num">#${i+1}</span>${esc(w.title)}</h2>
      <div class="m-poster">${posterHtml(w)}</div>
      <div class="m-main">
        <div class="m-rate"><span class="big">${esc(w.rate || '—')}</span><span><span class="stars">★★★★★</span><div>${esc(w.count || '')}人评价</div></span></div>
        <div class="m-meta"><b>标签</b>${esc([w.year, w.region, formatLabel(w), w.season, ...(w.tags||[])].filter(Boolean).join(' / '))}</div>
        <div class="m-meta"><b>监督</b>${esc(w.director || '—')}　<b>制作</b>${esc(w.studio || '—')}</div>
        <div class="m-meta"><b>声优</b>${esc((w.seiyuu||[]).join(' / ') || '—')}</div>
        <p class="m-desc">${esc(workSeoDesc(w))}</p>
      </div>
    </div>`;
}

function listHTML(listId){
  const list = DATA.listById[listId];
  if (!list) return '<div class="wrap"><p class="empty">未找到该片单</p></div>';
  const works = (list.items || []).map(id => DATA.workById[id]).filter(Boolean);
  const cat = DATA.categories.find(c => c.id === list.category);
  const neighbor = {};
  let only = 0, shared = 0;
  works.forEach(w => {
    const others = (DATA.listsByWork[w.id] || []).filter(l => l.id !== list.id);
    if (others.length){ shared += 1; others.forEach(o => neighbor[o.id] = (neighbor[o.id] || 0) + 1); }
    else only += 1;
  });
  const neigh = Object.entries(neighbor).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id, n]) => [DATA.listById[id], n]).filter(x => x[0]);
  const items = works.map((w, i) => listItemHTML(w, i)).join('');
  const toc = works.map((w,i) => `<a href="#m${i+1}" data-kind="${esc(w.format || 'tv')}">${i+1}. ${esc(w.title)}</a>`).join('');
  return `<div class="wrap">
    <nav class="crumb" aria-label="面包屑"><a href="${homeUrl()}">动漫推荐首页</a><span class="sep">/</span><a href="${asset('lists.html')}">动漫片单</a><span class="sep">/</span><span>${esc(list.name)}</span></nav>
    <h1 class="page-title">${esc(list.name)} <span class="cat-tag">${esc(cat && cat.name || '')}</span></h1>
    <p class="hub-lead">${esc(listSeoDesc(list))}</p>
    <div class="list-stats">
      <div class="list-stat"><b>${works.length}</b><span>本页条目</span></div>
      <div class="list-stat"><b>${only}</b><span>只在这份名单</span></div>
      <div class="list-stat"><b>${shared}</b><span>还出现在其它名单</span></div>
      <div class="list-stat"><b>${neigh.length}</b><span>重叠最多的邻单</span></div>
    </div>
    <div class="overlap-lists">${neigh.map(([l,n]) => `<a href="${listUrl(l.id)}">${esc(l.name)} · ${n} 部重叠</a>`).join('')}</div>
    <div class="fmt-box">
      ${formatBar(works)}
      <div class="list-layout">
        <div class="anime-list" id="animeList">${items || '<div class="empty">该片单没有作品</div>'}<div class="empty fmt-empty">这份名单没有对应形式的作品</div></div>
        <nav class="toc"><h2>内容导航</h2>${toc}</nav>
      </div>
    </div>
  </div>`;
}

function catalogWorks(){
  return DATA.works.slice().sort((a, b) => rateNum(b) - rateNum(a) || (b.year || 0) - (a.year || 0) || String(a.title || '').localeCompare(String(b.title || ''), 'zh'));
}

function catalogHTML(){
  const works = catalogWorks();
  return `<div class="wrap">
    <nav class="crumb" aria-label="面包屑"><a href="${homeUrl()}">动漫推荐首页</a><span class="sep">/</span><span>全部作品</span></nav>
    <h1 class="page-title">动漫大全 <span class="cat-tag">二次元</span></h1>
    <p class="hub-lead">动漫集这份动漫大全共 ${works.length} 部二次元作品，按评分排列。可按 TV、剧场版和 OVA/WEB 筛选，点进详情看片单交叉和观看顺序，不提供在线播放。</p>
    <div class="list-stats">
      <div class="list-stat"><b>${works.length}</b><span>全部作品</span></div>
      <div class="list-stat"><b>${DATA.lists.length}</b><span>公开片单</span></div>
      <div class="list-stat"><b>${works.filter(w => (w.format || 'tv') === 'tv').length}</b><span>TV</span></div>
      <div class="list-stat"><b>${works.filter(w => w.format === 'movie').length}</b><span>剧场版</span></div>
    </div>
    <div class="fmt-box">
      ${formatBar(works)}
      <div class="list-layout">
        <div class="anime-list" id="animeList">${works.map((w, i) => listItemHTML(w, i)).join('')}<div class="empty fmt-empty">没有对应形式的作品</div></div>
        <nav class="toc"><h2>内容导航</h2>${works.map((w,i) => `<a href="#m${i+1}" data-kind="${esc(w.format || 'tv')}">${i+1}. ${esc(w.title)}</a>`).join('')}</nav>
      </div>
    </div>
  </div>`;
}

function catalogJSONLD(){
  const works = catalogWorks();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: '动漫大全',
        description: `二次元动漫网站动漫集的动漫大全，共 ${works.length} 部。`,
        numberOfItems: works.length,
        itemListElement: works.slice(0, 40).map((w, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: w.title,
          url: absUrl(`w/${w.id}.html`)
        }))
      },
      crumbJson([
        { name: '动漫推荐首页', path: 'index.html' },
        { name: '动漫大全', path: 'works.html' }
      ])
    ]
  };
}

function listJSONLD(list){
  const works = (list.items || []).map(id => DATA.workById[id]).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: list.name,
        description: listSeoDesc(list),
        numberOfItems: works.length,
        itemListElement: works.slice(0, 40).map((w, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: w.title,
          url: absUrl(`w/${w.id}.html`)
        }))
      },
      crumbJson([
        { name: '动漫推荐首页', path: 'index.html' },
        { name: '动漫片单', path: 'lists.html' },
        { name: list.name, path: `l/${list.id}.html` }
      ])
    ]
  };
}

function bindListFilter(){
  /* Format chips are CSS-only via :has() radios in listHTML(). */
}

function bindSeasonTrack(){
  const track = document.querySelector('.season-track');
  if (!track || track.dataset.bound) return;
  track.dataset.bound = '1';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...track.children];
  if (cards.length < 4) return;
  const set = document.createElement('div');
  set.className = 'season-set';
  cards.forEach(node => set.appendChild(node));
  const clone = set.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.querySelectorAll('a').forEach(a => a.setAttribute('tabindex', '-1'));
  track.appendChild(set);
  track.appendChild(clone);
  track.classList.add('is-marquee');
  track.style.animationDuration = `${Math.max(48, cards.length * 2.5)}s`;
}

function renderList(root, listId){
  root.innerHTML = listHTML(listId);
  const list = DATA.listById[listId];
  if (list) document.title = `${list.name} - ${(list.keywords||'').split(',')[0] || '动漫推荐'} | ${SITE.name}`;
  bindListFilter();
}

function detailHTML(id){
  const work = DATA.workById[id];
  if (!work) return '<div class="wrap"><p class="empty">未找到该作品</p></div>';
  const graph = workGraph(id);
  const tags = [work.year, work.region, formatLabel(work), work.season, work.source, work.studio, ...(work.tags || [])].filter(Boolean);
  const reason = graph.reasons.length ? `<div class="block"><h2>为什么在这些片单里</h2><div class="graph-reasons">${graph.reasons.map(r => `<article class="reason-card"><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><div class="graph-pills">${r.lists.map(l => `<a href="${listUrl(l.id)}">${esc(l.name)}</a>`).join('')}</div></article>`).join('')}</div></div>` : '';
  const step = (mv, label, current=false) => {
    if (!mv) return `<div class="graph-ostep"><span>${label}</span><em>没有了</em></div>`;
    const inner = `<div class="graph-nposter">${posterHtml(mv)}</div><div class="graph-olabel"><span>${label}</span><b>${esc(mv.title)}</b></div>`;
    return current ? `<div class="graph-ostep is-now">${inner}</div>` : `<a class="graph-ostep" href="${detailUrl(mv.id)}">${inner}</a>`;
  };
  const order = graph.orders.length ? `<div class="block"><h2>观看顺序</h2>${graph.orders.map(o => `<div><a class="graph-order-name" href="${listUrl(o.list.id)}">${esc(o.list.name)} · 第 ${o.index+1} / ${o.total} 部</a><div class="graph-order">${step(o.prev,'上一跳')}${step(work,'当前',true)}${step(o.next,'下一跳')}</div></div>`).join('')}</div>` : '';
  const grouped = [];
  DATA.categories.forEach(cat => {
    const lists = graph.memberships.filter(l => l.category === cat.id);
    if (lists.length) grouped.push([cat, lists]);
  });
  const listBlock = graph.memberships.length ? `<div class="block"><h2>入选片单 · ${graph.memberships.length}</h2>${grouped.map(([cat, lists]) => `<div><h3 style="font-size:13px;color:var(--muted);margin:0 0 8px">${esc(cat.name)} · ${lists.length}</h3><div class="graph-pills">${lists.map(l => `<a href="${listUrl(l.id)}">${esc(l.name)}</a>`).join('')}</div></div>`).join('')}</div>` : '';
  const neighbors = graph.neighbors.length ? `<div class="block"><h2>同框最多</h2><p class="home-note">按共享片单数排序，用来找和「${esc(work.title)}」一起出现的高分动漫。</p><div class="graph-nlist">${graph.neighbors.map(n => `<a class="graph-nitem" href="${detailUrl(n.movie.id)}"><div class="graph-nposter">${posterHtml(n.movie)}</div><div><div class="graph-nrow"><b>${esc(n.movie.title)}</b><span class="graph-shared">共享 ${n.sharedCount} 个片单</span></div><div class="tonight-rate">${esc(n.movie.rate||'')}</div><div class="graph-why">因为：${esc(neighborWhy(n))}</div></div></a>`).join('')}</div></div>` : '';
  const hops = graph.hops.length ? `<div class="block"><h2>从这里可以走到</h2><div class="graph-hops">${graph.hops.map(h => `<a class="graph-hop" href="${h.href}"><div class="k">${esc({order:'观看顺序',studio:'工作室',topic:'题材片单'}[h.kind]||'片单')}</div><div class="t">${esc(h.title)}</div><p>${esc(h.desc)}</p></a>`).join('')}</div></div>` : '';
  return `<div class="wrap">
    <nav class="crumb" aria-label="面包屑"><a href="${homeUrl()}">动漫推荐首页</a><span class="sep">/</span><a href="${asset('lists.html')}">动漫片单</a><span class="sep">/</span><span>${esc(work.title)}</span></nav>
    <div class="detail">
      <div class="cover">${posterHtml(work)}</div>
      <div class="info">
        <h1>${esc(work.title)}</h1>
        <div class="orig">${esc(work.orig || '')}</div>
        <div class="tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${work.badge?`<span class="badge">${esc(work.badge)}</span>`:''}</div>
        <div class="graph-stats">
          <div class="graph-stat"><b>${esc(work.rate || '—')}</b><span>Bangumi${work.count? ' · ' + work.count + '人':''}</span></div>
          ${work.douban ? `<div class="graph-stat"><b>${esc(work.douban)}</b><span>豆瓣</span></div>` : ''}
          <div class="graph-stat"><b>${graph.memberships.length}</b><span>入选片单</span></div>
          <div class="graph-stat"><b>${esc(String(work.episodes || '—'))}</b><span>集数</span></div>
        </div>
        <div class="meta-row"><b>监督</b><span>${esc(work.director || '—')}</span></div>
        <div class="meta-row"><b>制作</b><span>${esc(work.studio || '—')}</span></div>
        <div class="meta-row"><b>声优</b><span>${esc((work.seiyuu||[]).join(' / ') || '—')}</span></div>
        <div class="meta-row"><b>原作</b><span>${esc(work.source || '—')}</span></div>
      </div>
    </div>
    <div class="block"><h2>${esc(formatLabel(work))}简介</h2><p class="hub-lead">${esc(workSeoDesc(work))}</p></div>
    ${reason}${order}${listBlock}${neighbors}${hops}
  </div>`;
}

function detailJSONLD(work){
  const graph = workGraph(work.id);
  const ratingCount = parseCount(work.count);
  const type = work.format === 'movie' ? 'Movie' : 'TVSeries';
  const node = {
    '@type': type,
    name: work.title,
    alternateName: work.orig || undefined,
    datePublished: work.year ? String(work.year) : undefined,
    genre: work.tags,
    image: work.cover ? absUrl(coverSrc(work.cover)) : absUrl('icon-512.png'),
    director: work.director ? { '@type': 'Person', name: work.director } : undefined,
    productionCompany: work.studio ? { '@type': 'Organization', name: work.studio } : undefined,
    description: workSeoDesc(work)
  };
  if (work.rate && ratingCount >= 100) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: work.rate,
      bestRating: '10',
      worstRating: '0',
      ratingCount: ratingCount
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      node,
      crumbJson([
        { name: '动漫推荐首页', path: 'index.html' },
        { name: '动漫片单', path: 'lists.html' },
        { name: work.title, path: `w/${work.id}.html` }
      ]),
      graph.memberships.length ? {
        '@type': 'ItemList',
        name: `${work.title}入选片单`,
        numberOfItems: graph.memberships.length,
        itemListElement: graph.memberships.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: l.name,
          url: absUrl(`l/${l.id}.html`)
        }))
      } : null
    ].filter(Boolean)
  };
}

function renderDetail(root, id){
  root.innerHTML = detailHTML(id);
  const work = DATA.workById[id];
  if (work) document.title = `${work.title}${work.year?' '+work.year:''} 动漫推荐与观看顺序 | ${SITE.name}`;
}

function methodHTML(){
  const nMulti = Object.values(DATA.listCount).filter(n => n >= 3).length;
  return `<div class="wrap"><article class="page-doc">
    <h1>交叉怎么算</h1>
    <p class="lead">动漫集是二次元动漫网站，把 ${DATA.works.length} 部作品做成动漫大全，用来查新番表、高分日漫、国漫和观看顺序，不提供在线播放。</p>
    <h2>能查哪些动漫推荐</h2>
    <p>在这个动漫网站查<a href="${listUrl('year-2026')}">2026新番</a>、<a href="${listUrl('summer-2026')}">本季新番表</a>、<a href="${listUrl('jp-high')}">高分日漫推荐</a>、<a href="${listUrl('cn-high')}">国漫推荐</a>、<a href="${listUrl('movie-high')}">动画电影</a>和<a href="${catUrl('order')}">动漫观看顺序</a>。二次元热门还有<a href="${listUrl('isekai')}">异世界动漫</a>、<a href="${listUrl('shonen')}">热血动漫</a>、<a href="${listUrl('romance')}">恋爱动漫</a>、<a href="${listUrl('miyazaki')}">宫崎骏</a>、<a href="${listUrl('shinkai')}">新海诚</a>、<a href="${listUrl('ghibli')}">吉卜力</a>，以及火影忍者、龙珠、物语系列、魔法少女小圆、从零开始从哪部看。<a href="${asset('works.html')}">动漫大全</a>共 ${DATA.works.length} 部，按评分浏览好看的动漫和必看日漫，不提供在线播放。</p>
    <h2>重叠怎么计</h2>
    <p>一部作品每进入一份名单，计数加一。出现在 3 份以上名单的作品目前有 ${nMulti} 部，会排在首页「交叉最多的作品」。名单页会写出只在这份名单出现的条目，以及重叠最多的邻单，方便从高分日漫走到观看顺序或工作室片单。</p>
    <h2>观看顺序</h2>
    <p>只有归在观看顺序类的名单才提供上一跳和下一跳，例如火影忍者、龙珠、物语系列、魔法少女小圆、从零开始、无职转生、进击的巨人、鬼灭之刃和 Fate。顺序以该名单原有排列为准，用来回答「这部番从哪部看」。其它类型片单只做对照，不强制排序。</p>
    <h2>不提供什么</h2>
    <p>没有播放器，没有片源，没有账号，没有下载。海报是本地下载的封面图。动漫集的页面用于动漫推荐、新番表查询和观看顺序对照，计算方式保持可复核，不冒充播放站。</p>
  </article></div>`;
}

function aboutHTML(){
  return `<div class="wrap"><article class="page-doc">
    <h1>关于动漫集</h1>
    <p class="lead">动漫集是二次元动漫网站，用来查高分日漫、国漫、2026新番、剧场版和观看顺序，相当于一份不提供播放的动漫大全。</p>
    <h2 id="about">本站做什么</h2>
    <p>动漫集把新番表、高分日漫、国漫、剧场版、工作室和观看顺序做成可检索的二次元动漫大全。一部作品同时出现在哪些名单里、和哪几部共享最多名单、系列该按什么顺序看，都可以在作品页看到。搜索热词覆盖动漫网站、动漫大全、本季新番、日漫推荐、国漫推荐、异世界、宫崎骏和观看顺序。</p>
    <h2 id="copyright">版权声明</h2>
    <p>片单名称、作品信息、评分和海报来自各自的公开来源，版权归原作者或权利人所有。封面图缓存自 Bangumi 公开接口，仅供本站离线展示。本站仅作学习与浏览展示，不存储片源，不提供在线播放或下载。如需转载片单对照结果，请保留出处并勿用于播放导流。</p>
    <h2 id="complaint">侵权投诉</h2>
    <p>权利人请把页面链接与权属说明发到 <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>，核实后会删除相关展示。投诉请写明作品名称、所在页面和希望处理的范围，我们会在合理时间内回复。</p>
  </article></div>`;
}

function renderMethod(root){ root.innerHTML = methodHTML(); }
function renderAbout(root){ root.innerHTML = aboutHTML(); }

function boot(){
  if (typeof document === 'undefined') return;
  const page = (typeof window !== 'undefined' && window.PAGE) || 'home';
  initChrome(page);
  const app = document.getElementById('app');
  if (!app) return;
  const isStatic = app.hasAttribute('data-static');
  if (isStatic) {
    bindTonight(document.getElementById('tonight'));
    bindListFilter();
    bindSeasonTrack();
    return;
  }
  if (page === 'home') renderHome(app);
  else if (page === 'catalog') app.innerHTML = catalogHTML();
  else if (page === 'lists') renderHub(app, param('cat') || 'featured');
  else if (page === 'list') renderList(app, param('id') || 'summer-2026');
  else if (page === 'detail') renderDetail(app, param('id'));
  else if (page === 'method') renderMethod(app);
  else if (page === 'about') renderAbout(app);
}

if (typeof document !== 'undefined' && document.addEventListener) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
window.DieFan = {
  DATA, SITE, listUrl, detailUrl, catUrl, homeUrl, asset, coverSrc, esc, absUrl, pageMetaDesc,
  chromeNav, chromeFoot, homeHTML, hubHTML, listHTML, catalogHTML, detailHTML, methodHTML, aboutHTML,
  homeJSONLD, listJSONLD, catalogJSONLD, detailJSONLD, jsonLd, listSeoDesc, workSeoDesc, padDesc, zhLen
};

