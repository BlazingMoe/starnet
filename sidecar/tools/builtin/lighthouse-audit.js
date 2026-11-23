'use strict';

/* Local synthetic Lighthouse QA only. A host-owned loopback server supplies one bounded HTML document with
   a restrictive response CSP. Chromium receives resolver/background-network flags and no target outside
   loopback. No URL, CLI option, config/plugin, credentials or external fetch is model-controlled. */
const HTTP = require('node:http');
const FS = require('node:fs');
const P = require('node:path');
const CRYPTO = require('node:crypto');
const { fenceExternal } = require('../fence.js');

const MAX_HTML_BYTES = 48 * 1024;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = ['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'speed-index', 'total-blocking-time', 'interactive'];
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const clamp = (value, n = 500) => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n);
const finite = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);

function validateHtml(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Lighthouse fixture HTML is required');
  if (Buffer.byteLength(value, 'utf8') > MAX_HTML_BYTES) throw Error('Lighthouse fixture HTML exceeds 48 KiB');
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(value)) throw Error('Lighthouse fixture meta refresh is not allowed');
  return value;
}

function compactReport(raw, expectedUrl, fixtureHash, checkedAt, requests) {
  let data;
  try { data = JSON.parse(raw); } catch (_) { throw Error('Lighthouse did not produce valid JSON'); }
  if (!plain(data) || !plain(data.categories) || !plain(data.audits)) throw Error('Lighthouse JSON shape is unsupported');
  if (data.runtimeError) throw Error('Lighthouse reported a runtime error');
  for (const key of ['requestedUrl', 'finalUrl', 'finalDisplayedUrl']) {
    if (data[key] && String(data[key]) !== expectedUrl) throw Error('Lighthouse navigated outside the local fixture');
  }
  const categories = {};
  for (const id of CATEGORIES) {
    const category = data.categories[id];
    categories[id] = { score: category && category.score != null ? finite(Number(category.score) * 100, 0, 100) : null, title: clamp(category && category.title, 100) };
  }
  const metrics = {};
  for (const id of METRICS) {
    const audit = data.audits[id];
    if (audit) metrics[id] = { score: audit.score == null ? null : finite(Number(audit.score) * 100, 0, 100), numericValue: finite(audit.numericValue, 0, 1e12), displayValue: clamp(audit.displayValue, 120) };
  }
  const findings = Object.entries(data.audits)
    .filter(([, audit]) => audit && audit.scoreDisplayMode !== 'notApplicable' && audit.score != null && Number(audit.score) < 1)
    .slice(0, 40)
    .map(([id, audit]) => ({ id: clamp(id, 100), title: clamp(audit.title, 160), score: finite(Number(audit.score) * 100, 0, 100), displayValue: clamp(audit.displayValue, 160) }));
  return {
    schemaVersion: 1,
    evidenceState: 'UNTRUSTED_SYNTHETIC_LIGHTHOUSE_REVIEW_REQUIRED', checkedAt,
    lighthouseVersion: clamp(data.lighthouseVersion, 40), userAgent: clamp(data.userAgent, 300),
    fixture: { url: expectedUrl, sha256: fixtureHash, requests },
    report: { sha256: CRYPTO.createHash('sha256').update(raw, 'utf8').digest('hex'), bytes: Buffer.byteLength(raw, 'utf8') },
    categories, metrics, findings,
    review: 'Synthetic local Lighthouse indicators are not proof of real-user performance, production hosting, security, accessibility, legal compliance, customer acceptance or revenue. Review the rendered page and test the deployed target separately.'
  };
}

async function makeFixtureServer(html, http = HTTP) {
  let requests = 0;
  let failure = null;
  const server = http.createServer((req, res) => {
    requests++;
    const address = server.address();
    const host = String(req.headers.host || '');
    if (req.method !== 'GET' || !address || host !== '127.0.0.1:' + address.port) { res.writeHead(404, { Connection: 'close' }); res.end(); return; }
    if (req.url === '/favicon.ico') { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return; }
    if (req.url !== '/') { res.writeHead(404, { 'Cache-Control': 'no-store', Connection: 'close' }); res.end(); return; }
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(body);
  });
  server.on('error', error => { failure = error; });
  await new Promise((resolve, reject) => {
    const fail = error => reject(error);
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', fail); resolve(); });
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  return { url, requests: () => requests, failure: () => failure, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

function requiredFile(fs, file, missingCode, missingMessage) {
  let stat;
  try { stat = fs.statSync(file); }
  catch (error) {
    if (error && ['ENOENT', 'ENOTDIR'].includes(error.code)) { const unavailable = Error(missingMessage); unavailable.code = missingCode; throw unavailable; }
    throw error;
  }
  if (!stat.isFile()) throw Error('configured path is not a regular file: ' + file);
  return file;
}

function makeLighthouseAuditTools(deps = {}) {
  const governor = deps.governor;
  const fs = deps.fs || FS;
  if (!governor || typeof governor.run !== 'function' || !governor.root) throw Error('lighthouse audit requires the external tool governor');
  if (!deps.clock || typeof deps.clock.now !== 'function') throw Error('lighthouse audit requires an injected clock');
  const hash = deps.hash || (text => CRYPTO.createHash('sha256').update(text, 'utf8').digest('hex'));
  const chromeSetting = String(deps.chromePath || '').trim();
  const tool = {
    name: 'website.audit.lighthouse_fixture', capability: 'cabinet', scope: 'execute', requiresConsent: true, network: false, timeoutMs: 510000,
    description: 'Run consent-gated Lighthouse desktop QA on one bounded synthetic HTML document served only from loopback. No external URL, install, download, credentials, plugin, config, publish or write. Returns compact review-required evidence.',
    schema: { type: 'object', additionalProperties: false, required: ['html'], properties: { html: { type: 'string', minLength: 1, maxLength: 49152 } } },
    run: async args => {
      const html = validateHtml(args && args.html);
      if (!chromeSetting) { const error = Error('approved Chromium path is not configured'); error.code = 'LIGHTHOUSE_CHROMIUM_NOT_READY'; throw error; }
      const chrome = P.resolve(chromeSetting);
      if (!P.isAbsolute(chrome)) throw Error('configured Chromium path must be absolute');
      requiredFile(fs, chrome, 'LIGHTHOUSE_CHROMIUM_NOT_READY', 'approved Chromium is not installed at the configured path');
      const cli = P.join(governor.root, 'lighthouse', 'node_modules', 'lighthouse', 'cli', 'index.js');
      requiredFile(fs, cli, 'LIGHTHOUSE_PACKAGE_NOT_READY', 'Lighthouse package is not installed under the optional tool root');
      const fixture = await makeFixtureServer(html, deps.http || HTTP);
      try {
        const flags = ['--headless=new', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--metrics-recording-only', '--safebrowsing-disable-auto-update', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'].join(' ');
        const result = await governor.run('lighthouse', {
          inputBytes: Buffer.byteLength(html, 'utf8'), timeoutMs: 480000, env: { CHROME_PATH: chrome },
          argsFactory: ({ temp }) => [cli, fixture.url, '--output=json', '--output-path=' + P.join(temp, 'report.json'), '--quiet', '--preset=desktop', '--only-categories=' + CATEGORIES.join(','), '--max-wait-for-load=45000', '--chrome-flags=' + flags, '--no-enable-error-reporting'],
          collectFiles: [{ name: 'report', path: 'report.json', maxBytes: MAX_REPORT_BYTES }]
        });
        if (fixture.failure()) throw fixture.failure();
        if (result.state !== 'PROCESS_COMPLETED_UNREVIEWED' || !result.files || !result.files.report) throw Error('Lighthouse did not complete with a bounded JSON report');
        const raw = result.files.report.text;
        const checkedAt = new Date(deps.clock.now()).toISOString();
        const evidence = compactReport(raw, fixture.url, hash(html), checkedAt, fixture.requests());
        const payload = JSON.stringify({ file: 'lighthouse-fixture-evidence.json', content: JSON.stringify(evidence, null, 2) + '\n', limits: { externalNetwork: false, write: false, send: false, publish: false } });
        return { content: fenceExternal(payload, 'local synthetic Lighthouse report (automated evidence)'), summary: 'Local Lighthouse fixture evidence prepared; visual and production review still required' };
      } finally { await fixture.close(); }
    }
  };
  return { tool, register(registry) { registry.register(tool); return registry; }, _internals: { validateHtml, compactReport, makeFixtureServer, requiredFile } };
}

module.exports = { makeLighthouseAuditTools, _internals: { validateHtml, compactReport, makeFixtureServer, requiredFile }, constants: { MAX_HTML_BYTES, MAX_REPORT_BYTES, CATEGORIES, METRICS, CSP } };
