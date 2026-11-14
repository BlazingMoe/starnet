/* node test/voice-tool.test.js — the STUDIO's third skill: voice_generate (sidecar/tools/builtin/voice.js).
   Offline + deterministic (the synthesizer is injected; a real temp workspace on disk). Verifies: the clip is
   written into the JAILED workspace with a content-addressed name, the deliverable is emitted as kind 'file'
   (the only kind chat.js's deliverable filter passes — the extension is what makes it render as a player), the
   ext/mime agreement whichever half the synthesizer reports, jail-escape refusal, an over-cap script REFUSED
   rather than truncated, an honest error (and NO file) when synthesis fails, and the CAP_REGISTRY wiring. */
'use strict';
const A = require('./_assert.js');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { makeVoiceTools } = require('../sidecar/tools/builtin/voice.js');
const { CAP_REGISTRY } = require('../sidecar/capability/registry.js');
const { makeMediaService, constants: mediaConstants } = require('../sidecar/media-service.js');

// per-process root: two gates running at once must not race on a content-addressed path (see image.test.js)
const ROOT = path.join(os.tmpdir(), 'starnet-voice-test-' + process.pid);
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x21, 0x22, 0x23]);   // 'ID3' + filler: real-shaped mp3 bytes

function ctxOf() {
  const emitted = [];
  return { ctx: { agentId: 'agent', emit: (name, payload) => emitted.push({ name, payload }) }, emitted };
}
function toolWith(synth) {
  return makeVoiceTools({ synth, fsp, pathMod: path, root: ROOT }).generateTool;
}
const okSynth = (over) => async (o) => Object.assign({ ok: true, buf: MP3, ext: 'mp3', mime: 'audio/mpeg', provider: 'edge', _got: o }, over || {});

(async () => {
  try { await fsp.rm(ROOT, { recursive: true, force: true }); } catch (_) {}

  /* ---- A. the happy path: jailed write + content-addressed name + deliverable ---- */
  let seen = null;
  const tool = toolWith(async (o) => { seen = o; return { ok: true, buf: MP3, ext: 'mp3', mime: 'audio/mpeg', provider: 'edge' }; });
  const { ctx, emitted } = ctxOf();
  const r = await tool.run({ text: '  Station   report:  all systems nominal. ', voice: 'Umbriel', style: 'calm' }, ctx);

  A.eq(seen.text, 'Station report: all systems nominal.', 'whitespace is collapsed before synthesis');
  A.eq(seen.voice, 'Umbriel', 'the requested voice reaches the synthesizer');
  A.eq(seen.style, 'calm', 'the delivery style reaches the synthesizer');
  A.ok(/audio\/voice-[0-9a-f]{12}\.mp3/.test(r.summary), 'saves to a content-addressed audio/voice-<hash>.mp3');
  const rel = r.summary.replace('voice → ', '');
  const onDisk = await fsp.readFile(path.join(ROOT, 'agent', rel));
  A.ok(onDisk.equals(MP3), 'the real synthesized bytes are on disk in the agent workspace');
  A.ok(/Play: \/api\/file\?agent=agent&path=/.test(r.content), 'returns the jailed viewer URL');
  A.ok(/via edge/.test(r.content), 'names which leg of the ladder actually spoke');

  A.eq(emitted.length, 1, 'exactly one deliverable emitted');
  A.eq(emitted[0].name, 'deliverable', 'it is a deliverable event');
  A.eq(emitted[0].payload.kind, 'file', 'kind is FILE — chat.js only renders deliverables of kind file|image, and picks the audio player from the extension');
  A.eq(emitted[0].payload.title, rel, 'the deliverable titles the saved path (the extension drives the player)');
  A.eq(emitted[0].payload.agentId, 'agent', 'scoped to the agent');

  /* ---- B. determinism: the same words produce the same path, not a pile of takes ---- */
  const again = await tool.run({ text: 'Station report: all systems nominal.' }, ctxOf().ctx);
  A.eq(again.summary, r.summary, 'identical audio re-uses the same content-addressed path');

  /* ---- C. a caller-named path, with and without an extension ---- */
  const named = await tool.run({ text: 'hello', path: 'takes/intro' }, ctxOf().ctx);
  A.ok(/takes\/intro\.mp3$/.test(named.summary), 'a bare filename gains the real extension');
  const namedExt = await tool.run({ text: 'hello', path: 'takes/intro.mp3' }, ctxOf().ctx);
  A.ok(/takes\/intro\.mp3$/.test(namedExt.summary), 'an explicit extension is kept');

  /* ---- D. ext/mime agreement from whichever half the synthesizer reports ---- */
  const wavByExt = await toolWith(okSynth({ ext: 'wav', mime: 'audio/wav' })).run({ text: 'wav please' }, ctxOf().ctx);
  A.ok(/\.wav \(/.test(wavByExt.content) || /\.wav$/.test(wavByExt.summary), 'a wav-reporting synthesizer writes .wav');
  const wavByMime = await toolWith(okSynth({ ext: '', mime: 'audio/wav' })).run({ text: 'wav by mime' }, ctxOf().ctx);
  A.ok(/\.wav$/.test(wavByMime.summary), 'with no ext reported the mime decides the extension');
  const legacyOutType = await toolWith(okSynth({ ext: '', mime: '', outType: 'audio/wav' })).run({ text: 'legacy field' }, ctxOf().ctx);
  A.ok(/\.wav$/.test(legacyOutType.summary), 'ttsSynthKeyed\'s outType field is understood too');

  /* ---- E. refusals: jail escape, empty text, over-cap script ---- */
  let threw = '';
  try { await tool.run({ text: 'nope', path: '../escape.mp3' }, ctxOf().ctx); } catch (e) { threw = String(e.message || e); }
  A.ok(threw.length > 0, 'a path escaping the workspace jail is refused');
  threw = '';
  try { await tool.run({ text: '   ' }, ctxOf().ctx); } catch (e) { threw = String(e.message || e); }
  A.ok(/text is required/.test(threw), 'empty text is refused');
  threw = '';
  try { await tool.run({ text: 'x'.repeat(4001) }, ctxOf().ctx); } catch (e) { threw = String(e.message || e); }
  A.ok(/cap is 4000/.test(threw) && /Split the script/.test(threw), 'an over-cap script is REFUSED with the fix, never silently truncated');

  /* ---- F. failure is honest, and writes nothing ---- */
  const before = (await fsp.readdir(path.join(ROOT, 'agent', 'audio'))).length;
  threw = '';
  try { await toolWith(async () => ({ ok: false, reason: 'openrouter 402 — out of credits; edge: disabled' })).run({ text: 'try me' }, ctxOf().ctx); }
  catch (e) { threw = String(e.message || e); }
  A.ok(/402/.test(threw) && /no audio was written/.test(threw), 'a failed synthesis surfaces the real reason from every leg tried');
  const after = (await fsp.readdir(path.join(ROOT, 'agent', 'audio'))).length;
  A.eq(after, before, 'a failed synthesis leaves NO file behind');
  threw = '';
  try { await toolWith(async () => ({ ok: true, buf: Buffer.alloc(0) })).run({ text: 'silence' }, ctxOf().ctx); }
  catch (e) { threw = String(e.message || e); }
  A.ok(/failed/.test(threw), 'zero-length audio counts as a failure, not a silent success');
  threw = '';
  try { await makeVoiceTools({ fsp, pathMod: path, root: ROOT }).generateTool.run({ text: 'anyone there' }, ctxOf().ctx); }
  catch (e) { threw = String(e.message || e); }
  A.ok(/no speech synthesizer wired/.test(threw), 'a station with no synthesizer says so instead of writing a silent file');

  /* ---- G. CAP_REGISTRY + tool def ---- */
  // Reuse the real media ladder's configuration probe without a network request.
  let edgeEnabled = false, provider = '', synthesisCalls = 0;
  const media = makeMediaService({ workspaces: ROOT,
    providerRuntimeKey: name => name === provider ? 'test-key' : '',
    edgetts: { enabled: () => edgeEnabled, synth: async () => { synthesisCalls++; return MP3; } }
  });
  A.eq(media.voiceRouteAvailable(), false, 'no provider key and disabled Edge means no configured route');
  for (const name of mediaConstants.TTS_KEY_PROVIDERS) {
    provider = name;
    A.eq(media.voiceRouteAvailable(), true, name + ' is recognized by the real synthesis provider list');
  }
  provider = 'unsupported-provider';
  A.eq(media.voiceRouteAvailable(), false, 'an unrelated provider does not imply voice support');
  provider = '';
  const unavailable = makeVoiceTools({ synth: media.synthesizeForAgent, routeAvailable: media.voiceRouteAvailable, fsp, pathMod: path, root: ROOT }).generateTool;
  A.ok(unavailable.description.includes('no configured voice-generation route'), 'the advertised tool explains the host-proven setup gap');
  A.eq(synthesisCalls, 0, 'configuration inspection never synthesizes or spends a request');
  edgeEnabled = true;
  A.eq(media.voiceRouteAvailable(), true, 'enabling keyless Edge immediately supplies a configured route');
  const afterSetup = await unavailable.run({ text: 'Configuration changed.' }, ctxOf().ctx);
  A.ok(afterSetup.content.includes('via edge'), 'registration-time warning does not freeze or block later real synthesis');
  A.eq(synthesisCalls, 1, 'later execution uses the existing synthesis ladder exactly once');
  edgeEnabled = false;
  A.eq(media.voiceRouteAvailable(), false, 'disabling the last route immediately revokes readiness');
  const failopen = require('../sidecar/failopen.js');
  const probeFailuresBefore = failopen.counts()['voice.routeAvailable'] || 0;
  for (const probe of [undefined, () => undefined, () => null, () => { throw new Error('unknown'); }, () => true]) {
    const described = makeVoiceTools({ synth: okSynth(), routeAvailable: probe, fsp, pathMod: path, root: ROOT }).generateTool;
    A.ok(!described.description.includes('no configured voice-generation route'), 'unknown or configured status never invents an outage');
  }
  A.eq(failopen.counts()['voice.routeAvailable'], probeFailuresBefore + 1, 'a failed configuration probe is recorded in shared diagnostics exactly once');
  const host = await fsp.readFile(path.join(__dirname, '../sidecar/index.js'), 'utf8');
  A.ok(/makeVoiceTools\(\{ synth: media\.synthesizeForAgent, routeAvailable: media\.voiceRouteAvailable/.test(host), 'production registration passes the authoritative probe with its synthesis function');

  const grant = (CAP_REGISTRY.studio || []).find(g => g.tool === 'voice_generate');
  A.ok(!!grant, 'voice_generate is granted by the studio object');
  A.eq(grant.capId, 'studio', 'it rides the studio capId beside image_generate');
  A.eq(grant.scope, 'write', 'it writes a file');
  A.eq(grant.requiresConsent, true, 'consent-gated exactly like image_generate — it writes into the workspace');
  A.eq(tool.name, 'voice_generate', 'tool name');
  A.eq(tool.capability, 'studio', 'tool def capability matches the grant capId');
  A.eq(tool.schema.required, ['text'], 'text is the one required argument');

  try { await fsp.rm(ROOT, { recursive: true, force: true }); } catch (_) {}
  A.report('voice-tool');
})();
