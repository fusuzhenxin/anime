#!/usr/bin/env node
/* 把 data.js 预渲染成静态 HTML，供爬虫收录。运行：node build.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;

function loadApp(prefix) {
  const context = {
    window: { ASSET_PREFIX: prefix, PAGE: 'home' },
    console,
    URLSearchParams,
    encodeURIComponent,
    JSON,
    Array,
    String,
    Object,
    Math,
    Number,
    Date,
    parseFloat,
    parseInt
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), context);
  return context.window.DieFan;
}

function withPrefix(prefix, fn) {
  const DF = loadApp(prefix);
  return fn(DF);
}

function attr(s){
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function head(opts) {
  const {
    prefix, title, description, keywords, canonical, jsonld,
    ogTitle, ogDescription, ogImage, robots, abs, clip
  } = opts;
  const A = (p) => prefix + p;
  const absFn = abs || (p => (p === 'index.html' || !p ? '/' : '/' + String(p).replace(/^\//, '')));
  const clipFn = clip || (s => s);
  const desc = attr(clipFn(description));
  const ogd = attr(clipFn(ogDescription || description));
  const ogt = attr(ogTitle || title);
  const robotsContent = robots || 'index,follow';
  const noindex = /noindex/i.test(robotsContent);
  const canon = absFn(canonical || '');
  const ogImg = absFn(ogImage || 'icon-512.png');
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <meta name="description" content="${desc}"/>
  <meta name="keywords" content="${keywords}"/>
  <meta name="robots" content="${robotsContent}"/>
  <meta name="author" content="动漫集"/>
  ${noindex ? '' : `<link rel="canonical" href="${attr(canon)}"/>`}
  <link rel="icon" href="${A('favicon.ico')}" sizes="48x48">
  <link rel="icon" href="${A('favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${A('apple-touch-icon.png')}">
  <link rel="manifest" href="${A('site.webmanifest')}">
  <meta name="theme-color" content="#0e1320">
  <meta name="application-name" content="动漫集">
  <meta property="og:site_name" content="动漫集">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${ogt}">
  <meta property="og:description" content="${ogd}">
  ${noindex ? '' : `<meta property="og:url" content="${attr(canon)}">`}
  <meta property="og:image" content="${attr(ogImg)}">
  <meta property="og:image:alt" content="${ogt}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogt}">
  <meta name="twitter:description" content="${ogd}">
  <meta name="twitter:image" content="${attr(ogImg)}">
  <meta name="msapplication-TileColor" content="#0e1320">
  <meta name="msapplication-TileImage" content="${A('icon-192.png')}">
  <link rel="stylesheet" href="${A('styles.css')}?v=14"/>
  ${jsonld || ''}
</head>`;
}

function documentPage(opts) {
  const { prefix, page, body } = opts;
  return `${head(opts)}
<body>
  <div id="nav" data-static="1">${opts.nav}</div>
  <div id="app" data-static="1">${body}</div>
  <div id="foot" data-static="1">${opts.foot}</div>
  <script>window.PAGE=${JSON.stringify(page)};window.ASSET_PREFIX=${JSON.stringify(prefix)};</script>
  <script src="${prefix}data.js"></script>
  <script src="${prefix}app.js?v=14"></script>
</body>
</html>
`;
}

function write(rel, html) {
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
}

function main() {
  const DF0 = loadApp('');
  const site = DF0.SITE.name;
  const pages = [];

  function add(rel, prefix, page, meta, bodyFn) {
    const DF = loadApp(prefix);
    const html = documentPage({
      prefix,
      page,
      nav: DF.chromeNav(page),
      foot: DF.chromeFoot(),
      body: bodyFn(DF),
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      canonical: meta.canonical,
      jsonld: DF.jsonLd(meta.jsonld),
      ogTitle: meta.ogTitle,
      ogDescription: meta.description,
      ogImage: meta.ogImage,
      robots: meta.robots,
      abs: p => DF.absUrl(p),
      clip: t => DF.pageMetaDesc(t)
    });
    write(rel, html);
    pages.push(rel.replace(/\\/g, '/'));
  }

  const homeDesc = DF0.padDesc('动漫集是二次元动漫网站，把2826部作品做成动漫大全。查高分日漫、国漫、2026新番、动画电影和观看顺序，不提供在线播放。');
  add('index.html', '', 'home', {
    title: '动漫网站 - 动漫大全、二次元推荐与2026新番表 | 动漫集',
    description: homeDesc,
    keywords: '动漫网站,动漫大全,二次元,动漫推荐,日漫推荐,国漫推荐,2026新番,本季新番,高分动漫,动漫观看顺序,剧场版,动漫集',
    canonical: 'index.html',
    jsonld: DF0.homeJSONLD()
  }, DF => DF.homeHTML());

  DF0.DATA.categories.forEach(cat => {
    const lists = cat.id === 'featured' ? DF0.DATA.lists : DF0.DATA.lists.filter(l => l.category === cat.id);
    const title = cat.id === 'featured'
      ? '动漫片单推荐 - 动漫网站、二次元动漫大全与新番表 | 动漫集'
      : `${cat.name}动漫片单 - 动漫网站二次元推荐 | 动漫集`;
    const description = DF0.padDesc(`动漫集「${cat.name}」共有${lists.length}份公开片单，覆盖新番表、高分日漫、国漫、剧场版和观看顺序。二次元动漫网站动漫大全入口，不提供在线播放。`);
    const rel = cat.id === 'featured' ? 'lists.html' : `c/${cat.id}.html`;
    const prefix = cat.id === 'featured' ? '' : '../';
    const page = cat.id === 'order' ? 'order' : 'lists';
    add(rel, prefix, page, {
      title,
      description,
      keywords: `${cat.name},动漫网站,动漫大全,二次元,动漫片单,动漫推荐,${site}`,
      canonical: rel,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: cat.id === 'featured' ? '动漫片单推荐' : cat.name,
        description,
        hasPart: lists.map(l => ({ '@type': 'ItemList', name: l.name, url: DF0.absUrl(`l/${l.id}.html`) }))
      }
    }, DF => DF.hubHTML(cat.id));
  });

  DF0.DATA.lists.forEach(list => {
    const kw = (list.keywords || '动漫推荐').split(',')[0];
    const description = DF0.listSeoDesc(list);
    const page = list.id === 'summer-2026' ? 'season' : 'list';
    add(`l/${list.id}.html`, '../', page, {
      title: `${list.name} - ${kw} | ${site}`,
      description,
      keywords: `${list.keywords || '动漫推荐'},${site}`,
      canonical: `l/${list.id}.html`,
      jsonld: DF0.listJSONLD(list)
    }, DF => DF.listHTML(list.id));
  });

  add('works.html', '', 'catalog', {
    title: `动漫大全 - ${DF0.DATA.works.length}部二次元动漫目录 | ${site}`,
    description: DF0.padDesc(`动漫集动漫大全共${DF0.DATA.works.length}部，二次元日漫、国漫、剧场版按评分浏览。动漫网站目录，不提供在线播放。`),
    keywords: `动漫大全,二次元,动漫网站,全部动漫,动漫目录,动漫推荐,高分动漫,${site}`,
    canonical: 'works.html',
    jsonld: DF0.catalogJSONLD()
  }, DF => DF.catalogHTML());

  DF0.DATA.works.forEach(work => {
    const description = DF0.workSeoDesc(work);
    add(`w/${work.id}.html`, '../', 'detail', {
      title: `${work.title}${work.year ? ' ' + work.year : ''} 动漫推荐与观看顺序 | ${site}`,
      description,
      keywords: `${work.title},动漫推荐,观看顺序,${(work.tags || []).join(',')},${site}`,
      canonical: `w/${work.id}.html`,
      ogImage: (work.cover ? DF0.coverSrc(work.cover) : '') || 'icon-512.png',
      jsonld: DF0.detailJSONLD(work)
    }, DF => DF.detailHTML(work.id));
  });

  add('method.html', '', 'method', {
    title: '动漫网站 - 动漫大全、二次元推荐与新番表 | 动漫集',
    description: DF0.padDesc('二次元动漫网站动漫集：查2026新番、动漫大全、高分日漫、国漫、动画电影、异世界、宫崎骏和观看顺序，不提供在线播放。'),
    keywords: '动漫网站,动漫大全,二次元,动漫推荐,日漫推荐,国漫推荐,2026新番,新番表,本季新番,观看顺序,动画电影,异世界动漫,宫崎骏,新海诚,吉卜力,热血动漫,恋爱动漫',
    canonical: 'method.html',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: '2026新番和本季新番表在哪查？', acceptedAnswer: { '@type': 'Answer', text: '在动漫集查2026新番、夏季新番表和高分日漫、国漫、动画电影片单，不提供在线播放。' } },
        { '@type': 'Question', name: '动漫观看顺序从哪看？', acceptedAnswer: { '@type': 'Answer', text: '进击的巨人、鬼灭之刃、Fate、EVA、JOJO 和高达观看顺序在顺序类片单里，回答这部番从哪部看。' } },
        { '@type': 'Question', name: '是否提供在线播放？', acceptedAnswer: { '@type': 'Answer', text: '不提供。动漫集只做动漫推荐、新番表、日漫国漫对照和观看顺序。' } }
      ]
    }
  }, DF => DF.methodHTML());

  add('about.html', '', 'about', {
    title: '关于动漫集 - 二次元动漫网站与动漫大全',
    description: DF0.padDesc('动漫集是二次元动漫网站，把高分日漫、国漫、2026新番做成动漫大全，不提供在线播放。本页含版权声明与侵权投诉方式。'),
    keywords: '动漫网站,动漫大全,二次元,关于动漫集,动漫推荐,版权声明',
    canonical: 'about.html',
    jsonld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: '关于动漫集', description: '动漫集介绍、版权声明与联系方式。' }
  }, DF => DF.aboutHTML());

  write('list.html', `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${DF0.absUrl('lists.html')}"><meta http-equiv="refresh" content="0;url=lists.html"><title>片单已改地址</title>
<script>const id=new URLSearchParams(location.search).get('id');location.replace(id?'l/'+encodeURIComponent(id)+'.html':'lists.html');</script>
</head><body><p>请访问<a href="lists.html">动漫片单</a>。</p></body></html>`);
  write('detail.html', `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${DF0.absUrl('lists.html')}"><meta http-equiv="refresh" content="0;url=lists.html"><title>作品已改地址</title>
<script>const id=new URLSearchParams(location.search).get('id');location.replace(id?'w/'+encodeURIComponent(id)+'.html':'lists.html');</script>
</head><body><p>请访问<a href="lists.html">动漫片单</a>。</p></body></html>`);
  write('404.html', `${head({
    prefix: '',
    title: '页面不存在 - 动漫集',
    description: '您打开的页面不存在。请返回动漫集首页查看动漫推荐、新番表和观看顺序。',
    keywords: '动漫集,404',
    canonical: 'index.html',
    jsonld: '',
    robots: 'noindex,follow',
    ogTitle: '页面不存在',
    ogDescription: '页面不存在',
    ogImage: 'icon-512.png',
    abs: p => DF0.absUrl(p),
    clip: t => DF0.pageMetaDesc(t)
  })}
<body>
  <div class="wrap" style="padding:80px 24px"><h1>页面不存在</h1><p>请回到<a href="index.html">动漫推荐首页</a>或<a href="lists.html">动漫片单</a>。</p></div>
  <link rel="stylesheet" href="styles.css?v=11">
</body></html>`);

  const keepWorks = new Set(DF0.DATA.works.map(w => `${w.id}.html`));
  const wdir = path.join(ROOT, 'w');
  let pruned = 0;
  if (fs.existsSync(wdir)) {
    for (const name of fs.readdirSync(wdir)) {
      if (!name.endsWith('.html') || keepWorks.has(name)) continue;
      fs.unlinkSync(path.join(wdir, name));
      pruned += 1;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  function urlMeta(p) {
    if (p === 'index.html') return { freq: 'weekly', pri: '1.0' };
    if (p === 'lists.html' || p === 'works.html' || p.startsWith('c/')) return { freq: 'weekly', pri: '0.8' };
    if (p.startsWith('l/')) return { freq: 'weekly', pri: '0.7' };
    if (p.startsWith('w/')) return { freq: 'monthly', pri: '0.6' };
    return { freq: 'monthly', pri: '0.4' };
  }
  const urls = pages.map(p => {
    const { freq, pri } = urlMeta(p);
    return `  <url><loc>${DF0.absUrl(p)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  }).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /fetch_covers.py\nDisallow: /fetch_catalog.py\nDisallow: /make_icons.py\nDisallow: /build.js\nDisallow: /list.html\nDisallow: /detail.html\nDisallow: /covers/_catalog_cache.json\nDisallow: /covers/_meta.json\nSitemap: ${DF0.absUrl('sitemap.xml')}\n`, 'utf8');
  if (!DF0.DATA.site.baseUrl) {
    console.warn('site.baseUrl 为空，canonical / sitemap 使用站点根路径。上线请把 data.js 里的 site.baseUrl 改成 https://你的域名 后重新 node build.js');
  }
  console.log(`built ${pages.length} pages` + (pruned ? `, pruned ${pruned} stale work pages` : ''));
}

main();
