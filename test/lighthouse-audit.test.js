'use strict';
const A = require('./_assert.js');
const FS = require('node:fs');
const FSP = require('node:fs/promises');
const HTTP = require('node:http');
const OS = require('node:os');
const P = require('node:path');
const { makeLighthouseAuditTools, _internals, constants } = require('../sidecar/tools/builtin/lighthouse-audit.js');
const { CAP_REGISTRY } = require('../sidecar/capability/registry.js');

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = HTTP.get(url, { headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject);
  });
}

(async () => {
  const html = '<!doctype html><html><head><title>Fixture</title></head><body><main><h1>Local QA</h1></main></body></html>';
  A.eq(_internals.validateHtml(html), html, 'bounded fixture HTML is accepted');
  A.throws(() => _internals.validateHtml('<meta http-equiv="refresh" content="0;url=https://example.com">'), 'meta refresh is refused');
  A.throws(() => _internals.validateHtml('x'.repeat(constants.MAX_HTML_BYTES + 1)), 'oversized HTML is refused');

  const fixture = await _internals.makeFixtureServer(html);
  const served = await request(fixture.url);
  A.eq(served.status, 200, 'fixture is served from loopback');
  A.eq(served.body, html, 'fixture body is exact');
  A.ok(String(served.headers['content-security-policy']).includes("default-src 'none'") && served.headers['cache-control'] === 'no-store', 'fixture blocks active/external content and cache');
  A.eq((await request(fixture.url, { Host: 'example.com' })).status, 404, 'foreign Host header is refused');
  await fixture.close();

  const root = await FSP.mkdtemp(P.join(OS.tmpdir(), 'starnet-lighthouse-'));
  const chrome = P.join(root, 'approved-chrome');
  const cli = P.join(root, 'lighthouse', 'node_modules', 'lighthouse', 'cli', 'index.js');
  await FSP.mkdir(P.dirname(cli), { recursive: true });
  await FSP.writeFile(chrome, 'fixture');
  await FSP.writeFile(cli, 'fixture');
  let captured = null;
  const governor = {
    root,
    run: async (profile, spec) => {
      const args = spec.argsFactory({ temp: P.join(root, 'job') });
      captured = { profile, spec, args };
      const url = args[1];
      const raw = JSON.stringify({
        lighthouseVersion: '13.0.0', requestedUrl: url, finalUrl: url, finalDisplayedUrl: url, userAgent: 'fixture-agent',
        categories: {
          performance: { score: 0.91, title: 'Performance' }, accessibility: { score: 0.88, title: 'Accessibility' },
          'best-practices': { score: 1, title: 'Best Practices' }, seo: { score: 0.95, title: 'SEO' }
        },
        audits: {
          'first-contentful-paint': { score: 0.8, numericValue: 1000, displayValue: '1.0 s', scoreDisplayMode: 'numeric', title: 'First Contentful Paint' },
          'color-contrast': { score: 0.5, displayValue: 'Review contrast', scoreDisplayMode: 'binary', title: 'Background and foreground colors' }
        }
      });
      return { state: 'PROCESS_COMPLETED_UNREVIEWED', files: { report: { text: raw, bytes: Buffer.byteLength(raw) } } };
    }
  };
  const tools = makeLighthouseAuditTools({ governor, fs: FS, chromePath: chrome, hash: () => 'a'.repeat(64), clock: { now: () => 1700000000000 } });
  const output = (await tools.tool.run({ html })).content;
  A.ok(output.includes('BEGIN EXTERNAL WEB CONTENT') && output.includes('lighthouse-fixture-evidence.json'), 'one fixed fenced evidence file is returned');
  A.ok(output.includes('UNTRUSTED_SYNTHETIC_LIGHTHOUSE_REVIEW_REQUIRED') && output.includes('2023-11-14T22:13:20.000Z'), 'evidence remains synthetic and review-required');
  A.eq(captured.profile, 'lighthouse', 'only the Lighthouse governor profile is invoked');
  A.eq(captured.spec.env.CHROME_PATH, chrome, 'only the exact approved Chromium path is injected');
  A.eq(captured.spec.collectFiles, [{ name: 'report', path: 'report.json', maxBytes: constants.MAX_REPORT_BYTES }], 'only one bounded report is collected');
  for (const fixed of ['--output=json', '--quiet', '--preset=desktop', '--only-categories=performance,accessibility,best-practices,seo', '--max-wait-for-load=45000', '--no-enable-error-reporting']) A.ok(captured.args.includes(fixed), fixed + ' is fixed by the host');
  A.ok(captured.args[1].startsWith('http://127.0.0.1:') && captured.args.some(value => value.includes('MAP * ~NOTFOUND') && value.includes('EXCLUDE 127.0.0.1')), 'navigation is fixed to loopback and foreign DNS is disabled');
  A.eq(tools.tool.scope, 'execute', 'local external process execution is labeled honestly');
  A.eq(tools.tool.requiresConsent, true, 'each optional Lighthouse run requires consent');
  A.eq(tools.tool.network, false, 'external network authority is not granted');

  const report = JSON.stringify({ categories: {}, audits: {}, requestedUrl: 'http://127.0.0.1:1/', finalUrl: 'https://example.com/' });
  A.throws(() => _internals.compactReport(report, 'http://127.0.0.1:1/', 'x', '2026-01-01T00:00:00.000Z', 1), 'foreign final navigation fails closed');
  A.throws(() => _internals.compactReport('{', 'http://127.0.0.1:1/', 'x', '2026-01-01T00:00:00.000Z', 1), 'malformed report fails closed');
  let notReady = null;
  try { await makeLighthouseAuditTools({ governor, clock: { now: () => 0 } }).tool.run({ html }); } catch (error) { notReady = error; }
  A.eq(notReady && notReady.code, 'LIGHTHOUSE_CHROMIUM_NOT_READY', 'missing optional Chromium fails closed at use, not station startup');
  let permission = null;
  try { _internals.requiredFile({ statSync() { const error = Error('denied'); error.code = 'EACCES'; throw error; } }, chrome, 'MISSING', 'missing'); } catch (error) { permission = error; }
  A.eq(permission && permission.code, 'EACCES', 'unexpected filesystem errors are never disguised as not-ready');

  A.ok(CAP_REGISTRY.cabinet.some(row => row.tool === 'website.audit.lighthouse_fixture' && row.scope === 'execute' && row.requiresConsent && !row.network && row.deferred), 'cabinet grant preserves consent, local-only and deferred labels');
  A.eq(require('../frontend/app/toolprops.js').toolPropType('website.audit.lighthouse_fixture'), 'cabinet', 'Ingame UI shows the cabinet capability');
  A.eq(require('../website/app/app/toolprops.js').toolPropType('website.audit.lighthouse_fixture'), 'cabinet', 'website mirror shows the same capability');
  const recipe = require('../frontend/app/recipe-catalog/business.js').find(row => row.id === 'website-lighthouse-fixture');
  const mirror = require('../website/app/app/recipe-catalog/business.js').find(row => row.id === 'website-lighthouse-fixture');
  A.ok(recipe && recipe.gear.includes('cabinet') && recipe.task.includes('website.audit.lighthouse_fixture') && recipe.task.includes('127.0.0.1') && recipe.task.includes('must never install'), 'workflow exposes only local synthetic attended QA');
  A.eq(mirror, recipe, 'website recipe mirror matches the Ingame catalog');
  const index = FS.readFileSync(require.resolve('../sidecar/index.js'), 'utf8');
  A.ok(index.includes('makeLighthouseAuditTools({') && index.includes("chromePath: ENV('CHROME')") && index.includes("process.platform === 'win32'"), 'production registration uses explicit env override and approved Windows fallback');

  await FSP.rm(root, { recursive: true, force: true });
  A.report('lighthouse-audit.test');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
