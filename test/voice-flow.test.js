'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app/voice-live.js'), 'utf8');

function harness() {
  const nodes = new Map(), requests = [], sent = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', dataset: {}, hidden: false,
      style: { setProperty() {} }, setAttribute(k, v) { this[k] = v; }, classList: { toggle() {}, add() {}, remove() {} } });
    return nodes.get(id);
  };
  let now = 10000;
  const sandbox = { console, AbortController, Float32Array, Uint8Array, DataView, ArrayBuffer,
    document: { getElementById: node, addEventListener() {}, querySelectorAll: () => [] },
    window: {}, navigator: {}, localStorage: { getItem: () => null },
    performance: { now: () => now }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Voice: { isSpeaking: () => false, stopSpeaking() {} },
    Chat: { sendOrQueue: text => { sent.push(text); return { state: 'sent' }; } },
    fetch: (url, opts) => new Promise(resolve => requests.push({ url, opts, resolve: text => resolve({ ok: true, json: async () => ({ text }) }) }))
  };
  const expose = `
    _test: {
      boot() { active = true; paused = false; sessionSeq++; context = {sampleRate:16000}; calibratedUntil = 0; },
      take(frames) { recording = true; utteranceSeq++; utterance = frames; utteranceSamples = frames.reduce((n,f)=>n+f.length,0); lastVoicedSamples = utteranceSamples; },
      partial() { requestPartial(utterance, utteranceSeq); },
      frame: processFrame, transcribe, finishUtterance, togglePause, closeMicrophone,
      inspect: () => ({recording, transcriptionPending, queued:queuedAudio.length, paused, samples:utteranceSamples})
    }, `;
  vm.runInNewContext(source.replace('return { init, start, end, isActive:', 'return { ' + expose + 'init, start, end, isActive:') + '\nthis.live = VoiceLive;', sandbox);
  const api = sandbox.live._test;
  api.boot();
  return { api, requests, sent, node, tick: () => { now += 1000; }, frame: level => {
    now += 128; api.frame({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(level)}});
  } };
}
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
const audio = () => Array.from({length:8}, () => new Float32Array(1000).fill(0.1));

(async () => {
  {
    const h = harness();
    h.api.take(audio()); h.api.partial();
    h.requests[0].resolve('words appear while I speak'); await flush();
    assert.equal(h.node('lv-heard').textContent, 'words appear while I speak');
    assert.equal(h.sent.length, 0, 'interim text is visible without sending a task');
    h.api.finishUtterance(false); await flush();
    assert.deepEqual(h.sent, ['words appear while I speak']);
    assert.equal(h.requests.length, 1, 'an exact preview is reused, avoiding a second recognition wait');
  }
  {
    const h = harness();
    h.api.transcribe(audio());
    h.frame(.1); h.frame(.1); h.frame(.1);
    assert.equal(h.requests[0].opts.signal.aborted, true, 'resumed speech cancels the premature final');
    assert.ok(h.api.inspect().samples > 8000, 'the first phrase remains attached to the continuation');
    h.requests[0].resolve('incomplete phrase'); await flush();
    assert.equal(h.sent.length, 0, 'late aborted responses cannot submit half a thought');
    h.api.finishUtterance(false);
    h.requests[1].resolve('complete phrase with continuation'); await flush();
    assert.deepEqual(h.sent, ['complete phrase with continuation']);
  }
  {
    const h = harness();
    h.api.transcribe(audio(), undefined, false);
    h.api.transcribe(audio(), undefined, false);
    h.api.transcribe(audio(), undefined, false);
    assert.equal(h.requests.length, 1);
    for (const [i, text] of ['first','second','third'].entries()) {
      h.requests[i].resolve(text); await flush();
    }
    assert.deepEqual(h.sent, ['first','second','third'], 'queued turns are FIFO, not overwritten');
  }
  {
    const h = harness();
    h.api.transcribe(audio(), undefined, false);
    h.api.closeMicrophone(); h.api.boot();
    h.api.transcribe(audio(), undefined, false);
    h.requests[0].resolve('old call'); await flush();
    assert.equal(h.api.inspect().transcriptionPending, true, 'old finally cannot clear the new call');
    assert.equal(h.sent.length, 0);
    h.requests[1].resolve('new call'); await flush();
    assert.deepEqual(h.sent, ['new call']);
  }
  {
    const h = harness();
    h.api.transcribe(audio(), undefined, false);
    h.api.take(audio()); h.api.togglePause();
    h.requests[0].resolve('discarded'); await flush();
    h.frame(.1); h.frame(.1); h.frame(.1);
    assert.equal(h.sent.length, 0);
    assert.equal(h.api.inspect().recording, false);
    assert.equal(h.node('lv-state').textContent, 'PAUSED');
    h.api.togglePause(); h.frame(.1); h.frame(.1); h.frame(.1);
    assert.equal(h.api.inspect().recording, true, 'resume accepts a fresh utterance');
  }
  console.log('voice-flow.test.js: 5 behavioral scenarios passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
