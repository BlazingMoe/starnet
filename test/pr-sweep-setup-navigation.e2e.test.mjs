/* Real-Chromium, seeded-local regression for the PR Sweep connector setup handoff.
   Drives the actual recipe dossier button into the actual connector catalog. No provider login or writes. */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectCDP, evalJS, findChrome, sleep } from '../scripts/lib/cdp.mjs';
import { materializeSeedWorkspace, bootSeededSidecar, waitUp, waitDevReady } from '../scripts/lib/seed.mjs';

const failures = [];
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
  if (!ok) failures.push(name);
};
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const stopChild = child => new Promise(resolve => {
  if (!child || child.exitCode != null) return resolve();
  const timer = setTimeout(resolve, 3000);
  child.once('exit', () => { clearTimeout(timer); resolve(); });
  try { child.kill('SIGKILL'); } catch { clearTimeout(timer); resolve(); }
});

const scratch = mkdtempSync(join(tmpdir(), 'starnet-pr-sweep-navigation-'));
const workspace = join(scratch, 'workspace'), profile = join(scratch, 'profile');
mkdirSync(profile, { recursive: true });
const appPort = await freePort(), cdpPort = await freePort();
const appUrl = `http://127.0.0.1:${appPort}/`;
materializeSeedWorkspace(workspace);
const sidecar = bootSeededSidecar({ port: appPort, scratchDir: workspace });
const chromePath = findChrome();
const chrome = spawn(chromePath, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${cdpPort}`, '--window-size=1280,900', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.once('error', error => console.log('Chromium spawn error: ' + error.message));
chrome.stderr.on('data', chunk => console.log('Chromium stderr: ' + String(chunk).trim()));
let cdp = null;
try {
  check('isolated seeded sidecar starts', await waitUp(appUrl));
  cdp = await connectCDP(cdpPort);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__prSweepWrites = [];
    window.fetch = (input, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) window.__prSweepWrites.push({ method, url: String(input) });
      return nativeFetch(input, init);
    };
  })();` });
  await cdp.send('Page.navigate', { url: appUrl });
  check('station reaches its seeded local floor', await waitDevReady(cdp, evalJS, { url: appUrl }));
  const opened = await evalJS(cdp, `(() => {
    if (typeof Marketplace === 'undefined') return false;
    Marketplace.open({ tab: 'recipes' }); return true;
  })()`);
  check('recipe marketplace module opens', opened === true);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await evalJS(cdp, `!!document.querySelector('.mkt-card[data-id="pr-sweep"]')`);
    if (ready) break;
    await sleep(250);
  }
  check('PR Sweep recipe card is rendered', ready);
  if (ready) {
    await evalJS(cdp, `document.querySelector('.mkt-card[data-id="pr-sweep"]').click()`);
    const buttonReady = await evalJS(cdp, `!!document.querySelector('.mkt-pr-sweep-connector')`);
    check('PR Sweep dossier setup button is rendered', buttonReady);
    const writesBefore = await evalJS(cdp, `window.__prSweepWrites.length`);
    if (buttonReady) await evalJS(cdp, `document.querySelector('.mkt-pr-sweep-connector').click()`);
    let destination = null;
    for (let i = 0; i < 40; i++) {
      destination = await evalJS(cdp, `(() => {
        const card = document.querySelector('.cc-card[data-id="github-readonly"]');
        const catalogTab = document.querySelector('#con-tab-connectors-catalog');
        const marketplace = document.querySelector('.mkt-host');
        return { card: !!card, highlighted: !!card && card.classList.contains('cc-jump'),
          catalogTab: !!catalogTab && (catalogTab.getAttribute('aria-selected') === 'true' || catalogTab.classList.contains('active')),
          catalogVisible: !!card && !!card.offsetParent, dossierClosed: !marketplace || !marketplace.isConnected };
      })()`);
      if (destination && destination.highlighted) break;
      await sleep(250);
    }
    check('real click opens catalog and highlights exact GitHub (read-only) card', !!destination && destination.card && destination.highlighted && destination.catalogVisible, JSON.stringify(destination));
    check('recipe dossier closes before the catalog is shown', !!destination && destination.dossierClosed, JSON.stringify(destination));
    const writeDelta = await evalJS(cdp, `window.__prSweepWrites.slice(${Number(writesBefore)})`);
    console.log('non-read requests during navigation: ' + JSON.stringify(writeDelta));
    check('button does not connect, sign in, or mutate connector setup', !writeDelta.some(row => /\/api\/connectors(?:\/|$)|oauth|signin|sign-in/i.test(row.url)));
  }
} catch (error) {
  console.log('FAIL harness :: ' + (error && error.stack || error)); failures.push('harness');
} finally {
  try { cdp?.ws.close(); } catch {}
  await Promise.all([stopChild(chrome), stopChild(sidecar)]);
  const normalized = scratch.replace(/\\/g, '/'), root = tmpdir().replace(/\\/g, '/') + '/';
  if (normalized.startsWith(root) && /starnet-pr-sweep-navigation-/.test(normalized)) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try { rmSync(scratch, { recursive: true, force: true }); break; }
      catch (error) { if (attempt === 9) throw error; await sleep(200); }
    }
  }
}
console.log('\n=== ' + (failures.length ? 'FAILURES: ' + failures.join(', ') : 'ALL CHECKS PASSED') + ' ===');
process.exit(failures.length ? 1 : 0);
