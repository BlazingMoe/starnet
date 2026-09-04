// scripts/website-shell.mjs — stamps the shared chrome (topbar, docs sidebar, pager, footer,
// search index, sitemap) into every static page under website/.
//
// The site is plain HTML on Cloudflare Pages with no build step, so the shell used to be
// hand-copied into every page and drifted (docs pages lacked FIELD MANUAL, legal pages had a
// different nav, sidebars disagreed about what existed). This script makes ONE manifest the
// truth: run it after adding or renaming a page and every family is re-stamped identically.
//
//   node scripts/website-shell.mjs           # rewrite in place
//   node scripts/website-shell.mjs --check   # exit 1 if any page would change (CI-friendly)
//
// Rules the script enforces:
//   * Only the regions between the shell markers are touched — page bodies are never rewritten.
//   * docs/ and legal/ pages never load site.js (privacy.html discloses that only the download
//     page makes the one api.github.com request). docs.js is network-free by construction.
//   * The sitemap lists every published page; stage-website-deploy.mjs prunes held-back URLs.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'website');
const CHECK = process.argv.includes('--check');
const V = '20260903';
const ORIGIN = 'https://starnetos.com';
const GITHUB = 'https://github.com/androoAGI/starnet';
const RELEASES = 'https://github.com/androoAGI/starnet-releases/releases/latest';
const CONTACT = 'mailto:androo.agi@gmail.com';

// ---------------------------------------------------------------------------------------
// THE MANIFEST — order here is sidebar order AND pager order.
// ---------------------------------------------------------------------------------------
export const NAV = [
  { group: 'START HERE', items: [
    { url: 'docs/index.html',                 title: 'DOCS HOME' },
    { url: 'docs/getting-started.html',       title: 'GETTING STARTED' },
    { url: 'docs/guides/first-line.html',     title: 'YOUR FIRST WORKING LINE' },
    { url: 'docs/providers.html',             title: 'PROVIDERS & KEYS' },
  ]},
  { group: 'FIELD MANUAL', items: [
    { url: 'docs/guides/index.html',          title: 'ALL GUIDES' },
    { url: 'docs/guides/conveyors.html',      title: 'HOW CONVEYORS WORK' },
    { url: 'docs/guides/filter.html',         title: 'SORTING WORK WITH A FILTER' },
    { url: 'docs/guides/splitter-joiner.html',title: 'SPLITTER & JOINER' },
    { url: 'docs/guides/crew.html',           title: 'YOUR CREW & THEIR GEAR' },
    { url: 'docs/guides/goals.html',          title: 'GOALS, QUESTS & XP' },
    { url: 'docs/guides/night-shift.html',    title: 'NIGHT SHIFT' },
    { url: 'docs/guides/routines.html',       title: 'SKILLS, RECIPES & ROUTINES' },
    { url: 'docs/guides/channels.html',       title: 'RUN IT FROM YOUR PHONE' },
  ]},
  { group: 'REFERENCE', items: [
    { url: 'docs/station.html',               title: 'THE STATION' },
    { url: 'docs/agents.html',                title: 'AGENTS & TEAMS' },
    { url: 'docs/autonomy.html',              title: 'AUTONOMY & NIGHT SHIFT' },
    { url: 'docs/skills.html',                title: 'SKILLS, RECIPES, ROUTINES' },
    { url: 'docs/connect-a-platform.html',    title: 'CONNECT A PLATFORM' },
    { url: 'docs/connectors.html',            title: 'CONNECTORS & INTEROP' },
    { url: 'docs/migrating.html',             title: 'FROM OPENCLAW / HERMES' },
  ]},
  { group: 'HELP', items: [
    { url: 'docs/help.html',                  title: 'HELP CENTER' },
    { url: 'docs/troubleshooting.html',       title: 'TROUBLESHOOTING' },
    { url: 'docs/shortcuts.html',             title: 'KEYBOARD SHORTCUTS' },
    { url: 'docs/glossary.html',              title: 'GLOSSARY' },
  ]},
];
const FLAT = NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));

// Only these load site.js (the one api.github.com request) — they get the live version badge.
const LOADS_SITE_JS = ['index.html', 'pricing.html'];
// Pages that get the topbar + footer but no sidebar/pager.
const TOP_PAGES = ['index.html', 'pricing.html', '404.html', 'legal/privacy.html', 'legal/terms.html',
  'legal/_privacy.nocredits.html', 'legal/_terms.nocredits.html'];

// ---------------------------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;');
function rel(fromPage, toUrl) {
  // both are website-relative posix paths
  const fromDir = posix.dirname(fromPage);
  let r = posix.relative(fromDir === '.' ? '' : fromDir, toUrl);
  return r || './';
}
function topbar(page) {
  const here = (u) => rel(page, u);
  const home = page === 'index.html' ? '' : here('index.html');
  const is404 = page === '404.html';
  const root = is404 ? '/' : home;                    // 404 is served at any depth → absolute
  const h = (u) => is404 ? '/' + u : here(u);
  const active = (u) => (page === u || (u.endsWith('index.html') && page.startsWith(posix.dirname(u) + '/') && !page.startsWith('docs/guides/') ) ? ' class="on"' : '');
  const fm = page.startsWith('docs/guides/') ? ' class="on"' : '';
  const dc = page.startsWith('docs/') ? ' class="on"' : '';
  const pr = page === 'pricing.html' ? ' class="on"' : '';
  return `<header class="topbar" id="topbar">
  <a class="brand" href="${root || '#top'}">STARNET TERMLINK</a>
  <nav class="topnav" aria-label="Site">
    <a href="${root}#station">WHAT IT IS</a>
    <a href="${root}#difference">FEATURES</a>
    <a href="${h('docs/index.html')}"${dc}>DOCS</a>
    <a href="${h('pricing.html')}"${pr} data-pricing-link${LOADS_SITE_JS.includes(page) ? ' hidden' : ''}>PRICING</a>
    <a href="${root}#download">DOWNLOAD</a>
    <a href="${GITHUB}" target="_blank" rel="noopener">GITHUB</a>
  </nav>
  <span class="topbar-right">
    <a href="${h('docs/help.html')}">HELP</a>
    <span class="live-dot${is404 ? ' signal-lost' : ''}"><span class="dot"></span>${is404 ? 'SIGNAL LOST' : 'OPEN SOURCE'}</span>
  </span>
</header>`;
}
function sidebar(page) {
  const here = (u) => rel(page, u);
  const groups = NAV.map(g => {
    const links = g.items.map(i =>
      `    <a href="${here(i.url)}"${i.url === page ? ' class="active" aria-current="page"' : ''}>${esc(i.title)}</a>`).join('\n');
    return `    <div class="side-group" data-group="${g.group}">\n    <div class="side-title">// ${g.group}</div>\n${links}\n    </div>`;
  }).join('\n');
  return `<aside class="docs-side" id="docs-side">
    <button class="side-toggle" type="button" aria-expanded="false" aria-controls="side-nav">[ MENU ]</button>
    <div class="side-search"><span class="ss-glyph">&gt;</span><input id="docs-search" type="search" placeholder="search docs  ( / )" autocomplete="off" spellcheck="false" aria-label="Search docs"><div class="ss-results" id="docs-results" hidden></div></div>
    <nav id="side-nav" class="side-nav" aria-label="Docs">
${groups}
    </nav>
  </aside>`;
}
function pager(page) {
  const i = FLAT.findIndex(x => x.url === page);
  if (i < 0) return '';
  const prev = FLAT[i - 1], next = FLAT[i + 1];
  const a = (p, dir) => p ? `<a class="pg ${dir}" href="${rel(page, p.url)}"><span class="pg-k">${dir === 'prev' ? '&larr; PREVIOUS' : 'NEXT &rarr;'}</span><span class="pg-t">${esc(p.title)}</span></a>` : '<span></span>';
  return `<nav class="doc-pager" aria-label="Previous and next">${a(prev, 'prev')}${a(next, 'next')}</nav>`;
}
function footer(page) {
  const here = (u) => page === '404.html' ? '/' + u : rel(page, u);
  const home = page === 'index.html' ? '#top' : (page === '404.html' ? '/' : rel(page, 'index.html'));
  return `<footer class="footer">
  <div class="footer-line">STARNET &middot; a living station of AI agents, doing real work in the dark</div>
  <div class="footer-links">
    <a href="${home}">HOME</a>
    <a href="${GITHUB}" target="_blank" rel="noopener">GITHUB</a>
    <a href="${RELEASES}" target="_blank" rel="noopener">RELEASES</a>
    <a href="${here('pricing.html')}" data-pricing-link${LOADS_SITE_JS.includes(page) ? ' hidden' : ''}>PRICING</a>
    <a href="${here('docs/index.html')}">DOCS</a>
    <a href="${here('docs/help.html')}">HELP</a>
    <a href="${GITHUB}/issues" target="_blank" rel="noopener">COMMUNITY</a>
    <a href="${here('legal/privacy.html')}">PRIVACY</a>
    <a href="${here('legal/terms.html')}">TERMS</a>
    <a href="${CONTACT}">CONTACT</a>
  </div>
  <div class="footer-fine">MIT license &middot; ${LOADS_SITE_JS.includes(page) ? '<span id="ver-foot">v0.10.13</span> &middot; ' : ''}&copy; <span id="year">2026</span> StarNet &middot; no telemetry, no tracking &mdash; <a href="${here('legal/privacy.html')}">we collect nothing</a></div>
</footer>`;
}

// ---------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'app' || n === 'assets') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith('.html')) out.push(posix.join(...relative(ROOT, p).split(/[\\/]/)));
  }
  return out;
}
function replaceBlock(html, open, close, replacement, label, page) {
  const s = html.indexOf(open);
  if (s < 0) { if (replacement) throw new Error(`${page}: missing ${label} marker "${open}"`); return html; }
  const e = html.indexOf(close, s);
  if (e < 0) throw new Error(`${page}: unterminated ${label}`);
  return html.slice(0, s) + replacement + html.slice(e + close.length);
}
function textOf(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

const pages = walk(ROOT);
const index = [];
let changed = 0;
for (const page of pages) {
  const file = join(ROOT, page);
  let html = readFileSync(file, 'utf8');
  const before = html;
  const isDoc = FLAT.some(x => x.url === page);
  const isTop = TOP_PAGES.includes(page);
  if (!isDoc && !isTop) { console.warn(`skip (not in manifest): ${page}`); continue; }

  html = replaceBlock(html, '<header class="topbar"', '</header>', topbar(page), 'topbar', page);
  // 404.html deliberately carries no footer (a dead end should stay a dead end); everything else does.
  if (html.includes('<footer class="footer">')) html = replaceBlock(html, '<footer class="footer">', '</footer>', footer(page), 'footer', page);

  if (isDoc) {
    const entry = FLAT.find(x => x.url === page);
    html = replaceBlock(html, '<aside class="docs-side"', '</aside>', sidebar(page), 'sidebar', page);
    // pager: replace a legacy hand-written .doc-next or a previous .doc-pager, else insert before </main>
    if (html.includes('<div class="doc-next">')) html = replaceBlock(html, '<div class="doc-next">', '</div>', pager(page), 'doc-next', page);
    else if (html.includes('<nav class="doc-pager"')) html = replaceBlock(html, '<nav class="doc-pager"', '</nav>', pager(page), 'doc-pager', page);
    else html = html.replace('  </main>', pager(page) + '\n  </main>');
    // body data + docs.js + search index (network-free)
    const depth = page.split('/').length - 1;
    const up = '../'.repeat(depth - 1);                         // docs/x → '', docs/guides/x → '../'
    html = html.replace(/<body[^>]*>/, `<body class="docs-page" data-group="${entry.group}" data-title="${esc(entry.title)}">`);
    html = html.replace(/\n<script src="[^"]*search-index\.js[^"]*"><\/script>\n<script src="[^"]*docs\.js[^"]*"><\/script>/g, '');
    html = html.replace('</body>', `<script src="${up}search-index.js?v=${V}"></script>\n<script src="${up}docs.js?v=${V}"></script>\n</body>`);
    // stylesheet cache-bust
    html = html.replace(/(href="(?:\.\.\/)?(?:docs\.css|guides\.css))\?v=[^"]*"/, `$1?v=${V}"`);
    // search index entry
    const main = html.slice(html.indexOf('<main class="docs-main">'), html.indexOf('</main>'));
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const heads = [...main.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map(m => textOf(m[1]).replace(/^\d\d\s*/, ''));
    index.push({ u: page.replace(/^docs\//, ''), t: entry.title, g: entry.group, d: textOf(desc), h: heads });
  } else {
    html = html.replace(/(href="(?:\.\.\/)?(?:styles\.css|docs\/docs\.css|\/styles\.css))\?v=[^"]*"/, `$1?v=${V}"`);
  }
  if (html !== before) {
    changed++;
    if (!CHECK) writeFileSync(file, html);
    else console.log(`would change: ${page}`);
  }
}

// search index (docs-relative urls; loaded by docs pages only)
const idxJs = `/* generated by scripts/website-shell.mjs — do not edit */\nwindow.SN_DOCS_INDEX=${JSON.stringify(index)};\n`;
const idxPath = join(ROOT, 'docs', 'search-index.js');
let idxOld = ''; try { idxOld = readFileSync(idxPath, 'utf8'); } catch {}
if (idxOld !== idxJs) { changed++; if (!CHECK) writeFileSync(idxPath, idxJs); else console.log('would change: docs/search-index.js'); }

// sitemap
const smPages = pages.filter(p => (FLAT.some(x => x.url === p) || TOP_PAGES.includes(p)) && p !== '404.html' && !posix.basename(p).startsWith('_'));
const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  smPages.map(p => `  <url><loc>${ORIGIN}/${p === 'index.html' ? '' : p}</loc></url>`).join('\n') + '\n</urlset>\n';
const smPath = join(ROOT, 'sitemap.xml');
if (readFileSync(smPath, 'utf8') !== sm) { changed++; if (!CHECK) writeFileSync(smPath, sm); else console.log('would change: sitemap.xml'); }

console.log(`${CHECK ? 'check' : 'stamp'}: ${pages.length} pages, ${changed} ${CHECK ? 'would change' : 'written'}, ${index.length} indexed`);
if (CHECK && changed) process.exit(1);
