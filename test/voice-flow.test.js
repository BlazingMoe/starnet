'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app/voice-live.js'), 'utf8');

function harness() {
  const nodes = new Map(), requests = [], sent = [], stops = [], interruptions = [], streams = [];
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
    VoiceStream: {open:hooks=>{streams.push(hooks);return {push(){},cancel(){}};}},
    Voice: { isSpeaking: () => false, stopSpeaking() { interruptions.push('speech'); } },
    Chat: { isBusy:()=>true, stopActive:()=>stops.push('cancel'), sendOrQueue: text => { sent.push(text); return { state: 'sent' }; } },
    fetch: (url, opts) => new Promise(resolve => requests.push({ url, opts, resolve: text => resolve({ ok: true, json: async () => ({ text }) }) }))
  };
  const expose = `
    _test: {
      boot() { active = true; paused = false; sessionSeq++; context = {sampleRate:16000}; calibratedUntil = 0; },
      take(frames) { recording = true; utteranceSeq++; utterance = frames; utteranceSamples = frames.reduce((n,f)=>n+f.length,0); lastVoicedSamples = utteranceSamples; },
      partial() { requestPartial(utterance, utteranceSeq); },
      stream(frames, text) {streamAvailable = true;beginStream(frames, utteranceSeq, text);},
      handleTranscript, endpointSilenceMs, frame: processFrame, transcribe, finishUtterance, togglePause, closeMicrophone,
      inspect: () => ({recording, transcriptionPending, queued:queuedAudio.length, paused, samples:utteranceSamples})
    }, `;
  vm.runInNewContext(source.replace('return { init, start, end, isActive:', 'return { ' + expose + 'init, start, end, isActive:') + '\nthis.live = VoiceLive;', sandbox);
  const api = sandbox.live._test;
  api.boot();
  return { api, requests, sent, stops, interruptions, streams, node, tick: () => { now += 1000; }, frame: level => {
    now += 128; api.frame({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(level)}});
  } };
}
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
const audio = () => Array.from({length:8}, () => new Float32Array(1000).fill(0.1));

(async () => {
  {
    const h=harness();h.api.take(audio());
    h.node('lv-heard').textContent='Keep this complete first phrase';
    h.api.stream(audio(),'Keep this complete first phrase');
    h.streams[0].onUpdate({text:'Keep this',stable:'',partial:'Keep this'});
    assert.equal(h.node('lv-heard').textContent,'Keep this complete first phrase','continued recognition does not rewind the visible caption');
  }
  {
    const h = harness();h.frame(.1);h.frame(.1);h.frame(.1);
    assert.equal(h.interruptions.length,1,'speech onset interrupts even before the old reply has audio');
  }
  {
    const h = harness();
    h.api.handleTranscript('stop speaking');
    assert.equal(h.stops.length,0,'stopping speech keeps the task running');
    assert.equal(h.sent.length,0,'speech control is not sent as a new task');
    h.api.handleTranscript('cancel the task');
    assert.equal(h.stops.length,1,'explicit cancellation stops the task');
  }
  {
    const h = harness();
    assert.equal(h.api.endpointSilenceMs('Please do this.',0),800);
    assert.equal(h.api.endpointSilenceMs('Please do this and',0),1800);
    assert.equal(h.api.endpointSilenceMs('',0),1200);
    assert.equal(h.api.endpointSilenceMs('Please do this.',2600),2600);
  }
  {
    const h = harness(); let cancelled=false;
    const recognizer={failed:false,finish:async()=>{throw new Error('connection dropped');},cancel:()=>{cancelled=true;}};
    const turn=h.api.transcribe(audio(), undefined, true, recognizer);await flush();
    assert.ok(cancelled, 'failed stream is released');
    assert.equal(h.requests.length,1,'original audio is retained for recorded fallback');
    h.requests[0].resolve('the complete recovered turn');await turn;
    assert.deepEqual(h.sent,['the complete recovered turn']);
  }
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
  console.log('voice-flow.test.js: adaptive timing and 6 voice flow scenarios passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
