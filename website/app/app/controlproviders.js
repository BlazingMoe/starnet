/* Moe AI Station — read-only Provider Signals pane for Control Mode.
   Reads only /api/control/providers. Registry metadata is not a health probe; quota is shown only when observed. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeProviders) return;

  const ENDPOINT = '/api/control/providers';
  const POLL_MS = 5000;
  let host = null, timer = 0, refreshing = false, generation = 0;

  function make(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : []; }
  function label(value, fallback) {
    const text = value == null ? '' : String(value).trim();
    return text || (fallback || '—');
  }
  function tri(value) { return value === true ? 'YES' : (value === false ? 'NO' : 'UNKNOWN'); }
  function num(value) { return value == null || !Number.isFinite(Number(value)) ? '—' : String(Number(value)); }

  function installStyle() {
    if (document.getElementById('control-provider-style')) return;
    const style = document.createElement('style');
    style.id = 'control-provider-style';
    style.textContent = `
.cm-provider-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-provider-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-provider-title{font-size:1rem;letter-spacing:.08em}.cm-provider-proof,.cm-provider-meta{opacity:.65;font-size:.8em}.cm-provider-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:10px;margin-top:10px}.cm-provider-card{border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:10px;background:rgba(255,255,255,.02);min-width:0}.cm-provider-card h4{margin:0 0 7px}.cm-provider-line{border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);padding:6px 0;overflow-wrap:anywhere}.cm-provider-line:first-of-type{border-top:0}.cm-provider-warning,.cm-provider-error,.cm-provider-empty{opacity:.7;padding:9px 10px}.cm-provider-warning{border:1px solid color-mix(in srgb,currentColor 42%,transparent);margin-top:10px}@media(max-width:760px){.cm-provider-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function getPanel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const panel = getPanel(); return !!(panel && !panel.hidden); }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-provider-shell');
    host.id = 'cm-provider-signals';
    host.setAttribute('aria-label', 'Provider signals overview');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }
  function header(root, verified) {
    const head = make('div', 'cm-provider-head');
    head.append(make('div', 'cm-provider-title', 'PROVIDER SIGNALS'), make('div', 'cm-provider-proof', verified ? 'REGISTRY + OBSERVED QUOTA · READ ONLY' : 'READ ONLY'));
    root.appendChild(head);
  }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-provider-error', message || 'Provider signals unavailable — health, credentials, availability, and quota state are not inferred.'));
  }
  function quotaLine(quota) {
    const buckets = quota && quota.buckets && typeof quota.buckets === 'object' ? quota.buckets : {};
    const keys = Object.keys(buckets);
    if (!keys.length) return 'QUOTA · OBSERVED, NO BUCKET VALUES EXPOSED';
    return keys.map((key) => {
      const bucket = buckets[key] || {};
      return key.toUpperCase() + ' ' + num(bucket.remaining) + ' / ' + num(bucket.limit) + ' · RESET IN ' + num(bucket.resetInMs) + ' ms';
    }).join(' · ');
  }
  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const overview = body && body.ok && body.overview && body.overview.schemaVersion === 'moe.control-providers.v1' ? body.overview : null;
    header(root, !!overview);
    if (!overview) {
      root.appendChild(make('div', 'cm-provider-error', 'Provider signals unavailable — health, credentials, availability, and quota state are not inferred.'));
      return;
    }
    const providers = rows(overview.rows);
    if (!providers.length) root.appendChild(make('div', 'cm-provider-empty', 'No provider registry rows are present.'));
    else {
      const grid = make('div', 'cm-provider-grid');
      providers.forEach((provider) => {
        const card = make('section', 'cm-provider-card');
        card.appendChild(make('h4', '', label(provider.name, provider.id)));
        card.appendChild(make('div', 'cm-provider-meta', 'ID · ' + label(provider.id) + ' · AUTH · ' + label(provider.authType, 'UNKNOWN')));
        card.appendChild(make('div', 'cm-provider-line', 'KEY REQUIRED · ' + tri(provider.keyRequired) + ' · BASE URL REQUIRED · ' + tri(provider.requiresBaseUrl)));
        card.appendChild(make('div', 'cm-provider-line', 'TOOLS · ' + tri(provider.supportsTools) + ' · REASONING · ' + tri(provider.supportsReasoning) + ' · UNMETERED · ' + tri(provider.unmetered)));
        if (provider.quotaObserved && provider.quota) {
          card.appendChild(make('div', 'cm-provider-line', quotaLine(provider.quota)));
          card.appendChild(make('div', 'cm-provider-meta', 'QUOTA EVIDENCE OBSERVED · AGE ' + num(provider.quota.ageMs) + ' ms' + (provider.quota.model ? ' · MODEL ' + label(provider.quota.model) : '')));
        } else card.appendChild(make('div', 'cm-provider-line', 'QUOTA · NOT OBSERVED'));
        grid.appendChild(card);
      });
      root.appendChild(grid);
    }
    const evidence = overview.evidence || {};
    root.appendChild(make('div', 'cm-provider-meta', 'PROVIDERS ' + num(evidence.providerCount) + ' · QUOTA OBSERVED ' + num(evidence.quotaObservedProviders) + ' · SOURCES ' + label(evidence.profileSource) + ' + ' + label(evidence.quotaSource)));
    root.appendChild(make('div', 'cm-provider-warning', 'OBSERVE ONLY · Registry metadata is not a liveness probe. Control Mode does not infer health, availability, credential validity, uptime, latency, success rate, or a health score.'));
  }
  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Provider signals unavailable — health, credentials, availability, and quota state are not inferred.');
    } finally { refreshing = false; }
  }
  function start() {
    ensureHost();
    if (timer) clearInterval(timer);
    refresh();
    timer = setInterval(() => { if (isOpen()) refresh(); }, POLL_MS);
  }
  function stop() {
    generation++;
    if (timer) { clearInterval(timer); timer = 0; }
  }
  function watchPanel() {
    const panel = getPanel();
    if (!panel || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => { if (isOpen()) start(); else stop(); }).observe(panel, { attributes:true, attributeFilter:['hidden'] });
    if (isOpen()) start();
  }

  installStyle();
  watchPanel();
  window.ControlModeProviders = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
