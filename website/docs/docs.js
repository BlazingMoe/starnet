/* StarNet docs — reading aids. NETWORK-FREE BY CONSTRUCTION: this file must never fetch,
   ping, or load anything remote. legal/privacy.html promises that only the download page
   makes an outbound request (api.github.com); the docs keep that promise by loading this
   script instead of site.js. Everything below is DOM-only.

   What it adds: a live search over a static index, an on-page table of contents that tracks
   scroll, a reading-progress bar, copy buttons on code blocks, a collapsible sidebar on
   phones, breadcrumbs, and reveal-on-scroll for sections. Every enhancement is additive —
   with scripts off the page reads exactly as authored. */
(function(){
  'use strict';
  var d = document;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var main = d.querySelector('.docs-main');
  if(!main) return;

  /* ---------- year in footer ---------- */
  var y = d.getElementById('year'); if(y) y.textContent = String(new Date().getFullYear());

  /* ---------- reading progress + sticky topbar state ---------- */
  var bar = d.createElement('div'); bar.className = 'read-progress'; bar.setAttribute('aria-hidden','true');
  d.body.appendChild(bar);
  var topbar = d.getElementById('topbar') || d.querySelector('.topbar');
  function progress(){
    var h = d.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, h.scrollTop / max) : 0) + ')';
    if(topbar) topbar.classList.toggle('scrolled', h.scrollTop > 24);
  }
  addEventListener('scroll', progress, { passive:true }); progress();

  /* ---------- breadcrumbs ---------- */
  var group = d.body.getAttribute('data-group'), title = d.body.getAttribute('data-title');
  var h1 = main.querySelector('h1');
  if(group && title && h1){
    var crumbs = d.createElement('div'); crumbs.className = 'crumbs';
    var up = location.pathname.indexOf('/docs/guides/') !== -1 ? '../' : '';
    var groupHref = group === 'FIELD MANUAL' ? (up ? 'index.html' : 'guides/index.html') : (up + 'index.html');
    crumbs.innerHTML = '<a href="' + up + 'index.html">DOCS</a><span class="sep">/</span>' +
      '<a href="' + groupHref + '">' + group + '</a><span class="sep">/</span><span class="here">' + title + '</span>';
    var hero = h1.closest('.fm-hero');
    (hero || h1).parentNode.insertBefore(crumbs, hero || h1);
  }

  /* ---------- table of contents (h2 → right rail) ---------- */
  var heads = Array.prototype.slice.call(main.querySelectorAll('h2'));
  function slug(s){ return s.toLowerCase().replace(/^\d+\s*/, '').replace(/&[a-z]+;/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'section'; }
  var seen = {};
  heads.forEach(function(h){
    if(!h.id){ var s = slug(h.textContent); while(seen[s]) s += '-2'; h.id = s; }
    seen[h.id] = 1;
    // anchor glyph
    var a = d.createElement('a'); a.className = 'h-anchor'; a.href = '#' + h.id; a.textContent = '#'; a.setAttribute('aria-label','Link to this section');
    h.appendChild(a);
  });
  if(heads.length >= 3){
    var shell = main.parentNode;
    var toc = d.createElement('aside'); toc.className = 'docs-toc'; toc.setAttribute('aria-label','On this page');
    var html = '<div class="toc-title">// ON THIS PAGE</div><ol>';
    heads.forEach(function(h){
      var label = h.textContent.replace(/#$/, '').replace(/^\d+\s*/, '').trim();
      html += '<li><a href="#' + h.id + '">' + label + '</a></li>';
    });
    toc.innerHTML = html + '</ol><a class="toc-top" href="#top">&uarr; TOP</a>';
    shell.appendChild(toc); shell.classList.add('has-toc');
    var links = toc.querySelectorAll('a[href^="#"]');
    var current = null;
    function spy(){
      var y = scrollY + 120, best = heads[0];
      for(var i = 0; i < heads.length; i++) if(heads[i].offsetTop <= y) best = heads[i];
      if(best === current) return; current = best;
      for(var j = 0; j < links.length; j++) links[j].classList.toggle('on', links[j].getAttribute('href') === '#' + best.id);
    }
    addEventListener('scroll', spy, { passive:true }); spy();
  }
  if(!d.getElementById('top')){ var top = d.createElement('span'); top.id = 'top'; d.body.insertBefore(top, d.body.firstChild); }

  /* ---------- copy buttons on code blocks ---------- */
  main.querySelectorAll('pre').forEach(function(pre){
    if(!navigator.clipboard) return;
    var wrap = d.createElement('div'); wrap.className = 'pre-wrap';
    pre.parentNode.insertBefore(wrap, pre); wrap.appendChild(pre);
    var b = d.createElement('button'); b.type = 'button'; b.className = 'pre-copy'; b.textContent = '[ COPY ]';
    b.addEventListener('click', function(){
      navigator.clipboard.writeText(pre.textContent.replace(/^\$\s?/gm,'')).then(function(){
        b.textContent = '[ COPIED ]'; b.classList.add('ok');
        setTimeout(function(){ b.textContent = '[ COPY ]'; b.classList.remove('ok'); }, 1400);
      });
    });
    wrap.appendChild(b);
  });

  /* ---------- sidebar: phone toggle ---------- */
  var side = d.getElementById('docs-side');
  var toggle = side && side.querySelector('.side-toggle');
  if(toggle){
    toggle.addEventListener('click', function(){
      var open = side.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? '[ CLOSE ]' : '[ MENU ]';
    });
  }
  /* keep the active link in view inside a tall sidebar */
  var act = side && side.querySelector('a.active');
  if(act && act.scrollIntoView && side.scrollHeight > side.clientHeight){ try{ act.scrollIntoView({ block:'center' }); }catch(e){} }

  /* ---------- search over the static index ---------- */
  var input = d.getElementById('docs-search'), results = d.getElementById('docs-results');
  var INDEX = window.SN_DOCS_INDEX || [];
  var up2 = location.pathname.indexOf('/docs/guides/') !== -1 ? '../' : '';
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
  function mark(s, q){ var i = s.toLowerCase().indexOf(q); return i < 0 ? esc(s) : esc(s.slice(0,i)) + '<mark>' + esc(s.slice(i, i+q.length)) + '</mark>' + esc(s.slice(i+q.length)); }
  function search(q){
    q = q.trim().toLowerCase();
    if(q.length < 2){ results.hidden = true; results.innerHTML = ''; return; }
    var terms = q.split(/\s+/);
    var hits = [];
    INDEX.forEach(function(p){
      var score = 0, where = null;
      terms.forEach(function(t){
        if(p.t.toLowerCase().indexOf(t) !== -1) score += 6;
        if(p.d.toLowerCase().indexOf(t) !== -1) score += 2;
        for(var i = 0; i < p.h.length; i++) if(p.h[i].toLowerCase().indexOf(t) !== -1){ score += 3; if(!where) where = p.h[i]; }
      });
      if(score) hits.push({ p:p, s:score, w:where });
    });
    hits.sort(function(a,b){ return b.s - a.s; });
    hits = hits.slice(0, 8);
    if(!hits.length){ results.innerHTML = '<div class="ss-none">// no match — try the <a href="' + up2 + 'help.html">help center</a></div>'; results.hidden = false; return; }
    results.innerHTML = hits.map(function(h){
      var sub = h.w ? mark(h.w, terms[0]) : mark(h.p.d.slice(0, 90), terms[0]);
      return '<a class="ss-hit" href="' + up2 + h.p.u + '"><span class="ss-g">' + h.p.g + '</span><span class="ss-t">' + mark(h.p.t, terms[0]) + '</span><span class="ss-s">' + sub + '</span></a>';
    }).join('');
    results.hidden = false;
  }
  if(input && results){
    input.addEventListener('input', function(){ search(input.value); });
    input.addEventListener('focus', function(){ if(input.value) search(input.value); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ input.value = ''; results.hidden = true; input.blur(); }
      if(e.key === 'Enter'){ var first = results.querySelector('a'); if(first) location.href = first.href; }
      if(e.key === 'ArrowDown'){ var f = results.querySelector('a'); if(f){ f.focus(); e.preventDefault(); } }
    });
    results.addEventListener('keydown', function(e){
      var items = Array.prototype.slice.call(results.querySelectorAll('a')), i = items.indexOf(d.activeElement);
      if(e.key === 'ArrowDown' && items[i+1]){ items[i+1].focus(); e.preventDefault(); }
      if(e.key === 'ArrowUp'){ (items[i-1] || input).focus(); e.preventDefault(); }
      if(e.key === 'Escape'){ input.focus(); results.hidden = true; }
    });
    d.addEventListener('click', function(e){ if(!e.target.closest('.side-search')) results.hidden = true; });
    d.addEventListener('keydown', function(e){
      if(e.key === '/' && !/INPUT|TEXTAREA/.test(d.activeElement.tagName)){ e.preventDefault(); if(side) side.classList.add('open'); input.focus(); input.select(); }
    });
  }

  /* ---------- reveal on scroll (additive: only applied when JS runs) ---------- */
  if(!reduce && 'IntersectionObserver' in window){
    var items = Array.prototype.slice.call(main.children).filter(function(el){ return !/H1|NAV/.test(el.tagName) && !el.classList.contains('crumbs'); });
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin:'0px 0px -8% 0px', threshold:0.05 });
    items.forEach(function(el){ el.classList.add('rv'); io.observe(el); });
    // anything already above the fold on load should not wait for a scroll event
    setTimeout(function(){ items.forEach(function(el){ if(el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }); }, 60);
    // safety net: nothing that has scrolled into view may stay hidden, whatever the observer did
    var sweep = function(){
      var left = 0;
      items.forEach(function(el){ if(el.classList.contains('in')) return; if(el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); else left++; });
      if(!left) clearInterval(sweepTimer);
    };
    var sweepTimer = setInterval(sweep, 450);
    addEventListener('scroll', sweep, { passive:true });
  }

  /* ---------- keyboard: [ and ] page through the pager ---------- */
  d.addEventListener('keydown', function(e){
    if(/INPUT|TEXTAREA/.test(d.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    var a = e.key === '[' ? d.querySelector('.doc-pager .prev') : e.key === ']' ? d.querySelector('.doc-pager .next') : null;
    if(a) location.href = a.href;
  });
})();
