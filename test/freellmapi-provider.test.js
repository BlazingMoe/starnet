/* node test/freellmapi-provider.test.js - dedicated local gateway UI/security contract. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('./_assert.js');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('frontend/app/app.js');
const harness = read('frontend/app/harness.js');
const dock = read('frontend/app/modeldock.js');
const html = read('frontend/index.html');
const settings = read('frontend/app/stationui.js');

for (const [file, src] of [['app.js', app], ['harness.js', harness], ['modeldock.js', dock]]) {
  A.ok(src.includes("return 'freellmapi'"), file + ' preserves the canonical FreeLLMAPI provider id');
}
A.ok(html.includes('data-prov="freellmapi"'), 'connect screen offers the FreeLLMAPI provider');
A.ok(html.includes('id="freellmapi-block"'), 'connect screen contains a provider-specific disclosure');
A.ok(html.includes('may forward them to external model providers'), 'disclosure names possible external forwarding');
A.ok(html.includes('Free access, model availability and upstream cost are not guaranteed'), 'disclosure makes free/cost availability honest');
A.ok(app.includes("freeLlmBlock.classList.toggle('hidden', pickedProvider !== 'freellmapi')"), 'disclosure becomes visible exactly when FreeLLMAPI is selected');
A.ok(app.includes("freellmapi: ['auto:balanced']"), 'cold catalog has one gateway-owned fallback alias');
A.ok(!app.includes("normalizeProviderId(provider) === 'freellmapi'"), 'FreeLLMAPI never uses the custom base URL field');
A.ok(settings.includes("{ id: 'freellmapi'"), 'Settings exposes the local gateway connection and recovery row');

A.report('freellmapi-provider.test');
