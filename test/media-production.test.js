'use strict';
const A = require('./_assert.js');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { makeMediaProductionTools } = require('../sidecar/tools/builtin/media-production.js');

function pcmWav({ sampleRate = 48000, channels = 2, seconds = 1, amplitude = 0.5 } = {}) {
  const frames = Math.floor(sampleRate * seconds), pcm = Buffer.alloc(frames * channels * 2);
  for (let f = 0; f < frames; f++) {
    const value = Math.round(Math.sin(2 * Math.PI * 440 * f / sampleRate) * amplitude * 32767);
    for (let c = 0; c < channels; c++) pcm.writeInt16LE(value, (f * channels + c) * 2);
  }
  const h = Buffer.alloc(44), block = channels * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * block, 28); h.writeUInt16LE(block, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function box(type, payload) {
  const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(b.length, 0); b.write(type, 4); payload.copy(b, 8); return b;
}
function fakeMp4() {
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\1isom', 'latin1'));
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(2500, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(1920 * 65536, 76); tkhd.writeUInt32BE(1080 * 65536, 80);
  const hdlr = Buffer.alloc(24); hdlr.write('vide', 8);
  const trak = box('trak', Buffer.concat([box('tkhd', tkhd), box('mdia', box('hdlr', hdlr))]));
  return Buffer.concat([ftyp, box('moov', Buffer.concat([box('mvhd', mvhd), trak])), box('mdat', Buffer.from([1, 2, 3, 4]))]);
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'starnet-media-production-'));
  const agentRoot = path.join(root, 'agent'); await fsp.mkdir(path.join(agentRoot, 'source'), { recursive: true });
  await fsp.writeFile(path.join(agentRoot, 'source', 'take.wav'), pcmWav());
  await fsp.writeFile(path.join(agentRoot, 'source', 'edit.mp4'), fakeMp4());
  const made = makeMediaProductionTools({ fsp, pathMod: path, root });
  const ctx = { agentId: 'agent', emit() {} };

  const inspected = JSON.parse((await made.inspectTool.run({ files: [
    { path: 'source/take.wav', role: 'voiceover', expected: { container: 'wav', channels: 2, sampleRate: 48000, minDurationMs: 999, maxDurationMs: 1001 } },
    { path: 'source/edit.mp4', role: 'video', expected: { container: 'mp4', width: 1920, height: 1080, minDurationMs: 2499, maxDurationMs: 2501 } }
  ] }, ctx)).content);
  A.eq(inspected.state, 'TECHNICAL_CHECKS_PASSED_HUMAN_REVIEW_REQUIRED', 'matching bounded audio/video metadata passes only technical checks');
  A.eq(inspected.files[0].technical.peakDbfs, -6.021, 'PCM sample peak measured');
  A.eq(inspected.files[1].technical, { container: 'mp4', majorBrand: 'isom', hasMoov: true, hasMediaData: true, durationMs: 2500, videoTracks: 1, audioTracks: 0, width: 1920, height: 1080 }, 'MP4 structure and track dimensions parsed');
  A.ok(inspected.humanReviewRequired.length >= 5, 'technical pass keeps explicit human review boundary');

  const editedResult = await made.editTool.run({ inputPath: 'source/take.wav', outputPath: 'out/take-v2.wav', trimStartMs: 100, trimEndMs: 900, fadeInMs: 50, fadeOutMs: 50, normalizePeakDbfs: -3 }, ctx);
  const edited = JSON.parse(editedResult.content);
  A.eq(edited.state, 'EDITED_TECHNICALLY_HUMAN_LISTENING_REQUIRED', 'edit never claims listening acceptance');
  A.eq(edited.technical.durationMs, 800, 'trim produces requested duration');
  A.ok(edited.technical.peakDbfs <= -2.99 && edited.technical.peakDbfs >= -3.02, 'peak normalization is bounded');
  A.eq(edited.receipt.state, 'read-back-verified', 'new WAV is byte verified');
  A.eq(editedResult.mutationReceipt.sha256, edited.receipt.sha256, 'mutation receipt is surfaced');

  const clipped = JSON.parse((await made.editTool.run({ inputPath: 'source/take.wav', outputPath: 'out/take-clipped.wav', gainDb: 12 }, ctx)).content);
  A.eq(clipped.state, 'EDITED_WITH_TECHNICAL_GAPS', 'an edit that clips is never reported technically ready');
  A.ok(clipped.clippedDuringEdit > 0 && clipped.technical.clippedSamples > 0, 'clipping evidence is explicit');
  const clippedInspection = JSON.parse((await made.inspectTool.run({ files: [{ path: 'out/take-clipped.wav', role: 'music', expected: { container: 'wav' } }] }, ctx)).content);
  A.eq(clippedInspection.state, 'TECHNICAL_GAPS', 'inspector blocks clipped PCM evidence');
  let conflictingLevel = ''; try { await made.editTool.run({ inputPath: 'source/take.wav', outputPath: 'out/conflict.wav', gainDb: -2, normalizePeakDbfs: -3 }, ctx); } catch (e) { conflictingLevel = e.message; }
  A.ok(/choose gainDb or normalizePeakDbfs/.test(conflictingLevel), 'ambiguous gain plus normalization is refused');
  A.eq(require('node:fs').existsSync(path.join(agentRoot, 'out', 'conflict.wav')), false, 'refused edit creates no output');

  let collision = ''; try { await made.editTool.run({ inputPath: 'source/take.wav', outputPath: 'out/take-v2.wav' }, ctx); } catch (e) { collision = e.message; }
  A.ok(/already exists/.test(collision), 'existing output is never overwritten');
  const sourceBytes = await fsp.readFile(path.join(agentRoot, 'source', 'take.wav'));
  const preview = made._internals.editPcm16(sourceBytes, {}).buffer;
  const pendingName = 'stale.wav.pending-' + crypto.createHash('sha256').update(preview).digest('hex').slice(0, 12);
  await fsp.writeFile(path.join(agentRoot, 'out', pendingName), 'manual-reconciliation');
  let pending = ''; try { await made.editTool.run({ inputPath: 'source/take.wav', outputPath: 'out/stale.wav' }, ctx); } catch (e) { pending = e.code || e.message; }
  A.ok(/EEXIST/.test(pending), 'existing pending output blocks automatic retry');
  A.eq(await fsp.readFile(path.join(agentRoot, 'out', pendingName), 'utf8'), 'manual-reconciliation', 'pre-existing pending evidence is never deleted');
  A.eq(require('node:fs').existsSync(path.join(agentRoot, 'out', 'stale.wav')), false, 'pending collision creates no final file');
  let escape = ''; try { await made.inspectTool.run({ files: [{ path: '../take.wav', role: 'voiceover' }] }, ctx); } catch (e) { escape = e.message; }
  A.ok(/illegal path|escapes/.test(escape), 'media paths cannot escape the workspace');

  const mismatch = JSON.parse((await made.inspectTool.run({ files: [{ path: 'source/take.wav', role: 'music', expected: { channels: 1 } }] }, ctx)).content);
  A.eq(mismatch.state, 'TECHNICAL_GAPS', 'machine-verifiable mismatch blocks technical pass');
  A.ok(mismatch.files[0].checks.some(c => c.field === 'channels' && c.pass === false), 'mismatch evidence is explicit');

  await fsp.rm(root, { recursive: true, force: true });
  A.report('media-production.test');
})().catch(e => { console.log('FAIL: media-production threw — ' + (e && e.stack || e)); process.exit(1); });
