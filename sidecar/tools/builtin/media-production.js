'use strict';

/* Bounded local media finishing and technical inspection.

   This module deliberately does not call a provider or pretend to replace human listening/playback.
   `media.audio.edit` performs only deterministic PCM16 WAV operations; `media.inspect` verifies bytes,
   container structure and the technical fields the shipped parsers can prove. Both stay inside the same
   per-agent/project jail as fs.* and voice_generate. */

const crypto = require('node:crypto');
const fsMod = require('./fs.js');

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_EDIT_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_EDIT_MS = 30 * 60 * 1000;

const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const round = (v, places = 3) => Number(Number(v).toFixed(places));
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function parseWav(buf, analyseSamples) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let pos = 12, fmt = null, dataOffset = 0, dataBytes = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const start = pos + 8;
    if (start + size > buf.length) throw new Error('WAV chunk exceeds file bounds');
    if (id === 'fmt ' && size >= 16) fmt = {
      format: buf.readUInt16LE(start), channels: buf.readUInt16LE(start + 2), sampleRate: buf.readUInt32LE(start + 4),
      byteRate: buf.readUInt32LE(start + 8), blockAlign: buf.readUInt16LE(start + 12), bitsPerSample: buf.readUInt16LE(start + 14)
    };
    if (id === 'data') { dataOffset = start; dataBytes = size; }
    pos = start + size + (size % 2);
  }
  if (!fmt || !dataOffset || !dataBytes || !fmt.channels || !fmt.sampleRate || !fmt.blockAlign) throw new Error('WAV is missing a usable fmt or data chunk');
  if (dataBytes % fmt.blockAlign) throw new Error('WAV data is not frame-aligned');
  const frames = dataBytes / fmt.blockAlign;
  const out = {
    container: 'wav', codec: fmt.format === 1 ? 'pcm' : (fmt.format === 3 ? 'ieee-float' : 'format-' + fmt.format),
    channels: fmt.channels, sampleRate: fmt.sampleRate, bitsPerSample: fmt.bitsPerSample,
    frames, durationMs: round(frames * 1000 / fmt.sampleRate)
  };
  if (!analyseSamples || !((fmt.format === 1 && fmt.bitsPerSample === 16) || (fmt.format === 3 && fmt.bitsPerSample === 32))) return { ...out, dataOffset, dataBytes, blockAlign: fmt.blockAlign, format: fmt.format };
  let peak = 0, clippedSamples = 0, silentSamples = 0, samples = 0;
  const bytes = fmt.bitsPerSample / 8;
  for (let off = dataOffset; off < dataOffset + dataBytes; off += bytes) {
    let n = fmt.format === 3 ? buf.readFloatLE(off) : buf.readInt16LE(off) / 32768;
    if (!Number.isFinite(n)) n = 0;
    const a = Math.abs(n); peak = Math.max(peak, a); samples++;
    if (a >= 0.999) clippedSamples++;
    if (a <= 0.0000316228) silentSamples++;
  }
  return {
    ...out, dataOffset, dataBytes, blockAlign: fmt.blockAlign, format: fmt.format,
    peakDbfs: peak ? round(20 * Math.log10(peak)) : null,
    clippedSamples, silentPercent: samples ? round(silentSamples * 100 / samples) : 100
  };
}

function boxes(buf, start, end) {
  const out = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos); const type = buf.toString('latin1', pos + 4, pos + 8); let header = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      const big = Number(buf.readBigUInt64BE(pos + 8));
      if (!Number.isSafeInteger(big)) throw new Error('MP4 box is too large');
      size = big; header = 16;
    } else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) throw new Error('MP4 box exceeds file bounds');
    out.push({ type, start: pos + header, end: pos + size, size });
    pos += size;
  }
  return out;
}

function parseMp4(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') return null;
  const top = boxes(buf, 0, buf.length);
  const ftyp = top.find(b => b.type === 'ftyp');
  const moov = top.find(b => b.type === 'moov');
  const mdat = top.find(b => b.type === 'mdat');
  const out = { container: 'mp4', majorBrand: ftyp && ftyp.end - ftyp.start >= 4 ? buf.toString('latin1', ftyp.start, ftyp.start + 4) : null,
    hasMoov: !!moov, hasMediaData: !!mdat, durationMs: null, videoTracks: 0, audioTracks: 0, width: null, height: null };
  if (!moov) return out;
  const children = boxes(buf, moov.start, moov.end);
  const mvhd = children.find(b => b.type === 'mvhd');
  if (mvhd && mvhd.end - mvhd.start >= 20) {
    const version = buf[mvhd.start];
    const tsOff = mvhd.start + (version === 1 ? 20 : 12);
    const durOff = mvhd.start + (version === 1 ? 24 : 16);
    if (durOff + (version === 1 ? 8 : 4) <= mvhd.end) {
      const scale = buf.readUInt32BE(tsOff);
      const dur = version === 1 ? Number(buf.readBigUInt64BE(durOff)) : buf.readUInt32BE(durOff);
      if (scale && Number.isSafeInteger(dur)) out.durationMs = round(dur * 1000 / scale);
    }
  }
  for (const trak of children.filter(b => b.type === 'trak')) {
    const tc = boxes(buf, trak.start, trak.end), tkhd = tc.find(b => b.type === 'tkhd'), mdia = tc.find(b => b.type === 'mdia');
    let handler = null;
    if (mdia) {
      const mc = boxes(buf, mdia.start, mdia.end), hdlr = mc.find(b => b.type === 'hdlr');
      if (hdlr && hdlr.start + 12 <= hdlr.end) handler = buf.toString('latin1', hdlr.start + 8, hdlr.start + 12);
    }
    if (handler === 'vide') out.videoTracks++;
    if (handler === 'soun') out.audioTracks++;
    if (handler === 'vide' && tkhd) {
      const version = buf[tkhd.start], widthOff = tkhd.start + (version === 1 ? 88 : 76), heightOff = widthOff + 4;
      if (heightOff + 4 <= tkhd.end) {
        const width = buf.readUInt32BE(widthOff) / 65536, height = buf.readUInt32BE(heightOff) / 65536;
        if (width > 0 && height > 0) { out.width = round(width); out.height = round(height); }
      }
    }
  }
  return out;
}

function detect(buf) {
  const wav = parseWav(buf, true); if (wav) return wav;
  const mp4 = parseMp4(buf); if (mp4) return mp4;
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === 'OggS') return { container: 'ogg' };
  if (buf.length >= 3 && buf.toString('latin1', 0, 3) === 'ID3') return { container: 'mp3' };
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return { container: 'mp3' };
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return { container: 'webm' };
  return { container: 'unknown' };
}

function machineChecks(meta, expected, role) {
  expected = expected || {};
  const checks = [{ field: 'recognizedContainer', expected: true, actual: meta.container !== 'unknown', pass: meta.container !== 'unknown' }], unresolved = [];
  const audioContainers = ['wav', 'mp3', 'ogg'];
  const videoContainers = ['mp4', 'webm'];
  if (role === 'voiceover' || role === 'music') checks.push({ field: 'audioContainer', expected: true, actual: audioContainers.includes(meta.container), pass: audioContainers.includes(meta.container) });
  if (role === 'video') checks.push({ field: 'videoContainer', expected: true, actual: videoContainers.includes(meta.container), pass: videoContainers.includes(meta.container) });
  if (meta.container === 'mp4') {
    checks.push({ field: 'mp4Moov', expected: true, actual: meta.hasMoov, pass: meta.hasMoov === true });
    checks.push({ field: 'mp4MediaData', expected: true, actual: meta.hasMediaData, pass: meta.hasMediaData === true });
    if (role === 'video') checks.push({ field: 'videoTrack', expected: true, actual: meta.videoTracks > 0, pass: meta.videoTracks > 0 });
  }
  if (meta.container === 'wav' && meta.clippedSamples != null) checks.push({ field: 'clippedSamples', expected: 0, actual: meta.clippedSamples, pass: meta.clippedSamples === 0 });
  const compare = (field, actual, wanted) => {
    if (wanted == null) return;
    if (actual == null) unresolved.push(field + ' could not be proved from this container');
    else checks.push({ field, expected: wanted, actual, pass: actual === wanted });
  };
  compare('container', meta.container, expected.container);
  compare('channels', meta.channels, expected.channels);
  compare('sampleRate', meta.sampleRate, expected.sampleRate);
  compare('width', meta.width, expected.width);
  compare('height', meta.height, expected.height);
  if (expected.minDurationMs != null) meta.durationMs == null ? unresolved.push('minimum duration could not be proved') : checks.push({ field: 'minDurationMs', expected: expected.minDurationMs, actual: meta.durationMs, pass: meta.durationMs >= expected.minDurationMs });
  if (expected.maxDurationMs != null) meta.durationMs == null ? unresolved.push('maximum duration could not be proved') : checks.push({ field: 'maxDurationMs', expected: expected.maxDurationMs, actual: meta.durationMs, pass: meta.durationMs <= expected.maxDurationMs });
  return { checks, unresolved, pass: checks.every(c => c.pass) && !unresolved.length };
}

function wavFromPcm16(pcm, sampleRate, channels) {
  const h = Buffer.alloc(44), blockAlign = channels * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * blockAlign, 28); h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function editPcm16(buf, args) {
  const input = parseWav(buf, true);
  if (!input || input.format !== 1 || input.bitsPerSample !== 16) throw new Error('media.audio.edit accepts only uncompressed PCM16 WAV input');
  if (input.durationMs > MAX_EDIT_MS) throw new Error('WAV exceeds the 30 minute editing limit');
  const startMs = finite(args.trimStartMs, 0), endMs = args.trimEndMs == null ? input.durationMs : finite(args.trimEndMs, -1);
  if (startMs < 0 || endMs <= startMs || endMs > input.durationMs + 0.5) throw new Error('trim range is outside the input duration');
  const startFrame = Math.floor(startMs * input.sampleRate / 1000), endFrame = Math.min(input.frames, Math.ceil(endMs * input.sampleRate / 1000));
  const frames = endFrame - startFrame, channels = input.channels;
  const pcm = Buffer.from(buf.subarray(input.dataOffset + startFrame * input.blockAlign, input.dataOffset + endFrame * input.blockAlign));
  const fadeInFrames = Math.min(frames, Math.floor(Math.max(0, finite(args.fadeInMs, 0)) * input.sampleRate / 1000));
  const fadeOutFrames = Math.min(frames, Math.floor(Math.max(0, finite(args.fadeOutMs, 0)) * input.sampleRate / 1000));
  if (finite(args.fadeInMs, 0) > 30000 || finite(args.fadeOutMs, 0) > 30000) throw new Error('each fade is limited to 30 seconds');
  if (args.gainDb != null && args.normalizePeakDbfs != null) throw new Error('choose gainDb or normalizePeakDbfs, not both');
  let scale = Math.pow(10, finite(args.gainDb, 0) / 20);
  if (finite(args.gainDb, 0) < -60 || finite(args.gainDb, 0) > 12) throw new Error('gainDb must be between -60 and 12');
  if (args.normalizePeakDbfs != null) {
    const target = finite(args.normalizePeakDbfs, NaN);
    if (!Number.isFinite(target) || target < -24 || target > -0.1) throw new Error('normalizePeakDbfs must be between -24 and -0.1');
    let peak = 0;
    for (let off = 0; off < pcm.length; off += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(off) / 32768));
    if (!peak) throw new Error('silent input cannot be peak-normalized');
    scale *= Math.pow(10, target / 20) / peak;
  }
  let clipped = 0;
  for (let frame = 0; frame < frames; frame++) {
    let envelope = scale;
    if (fadeInFrames && frame < fadeInFrames) envelope *= frame / fadeInFrames;
    if (fadeOutFrames && frame >= frames - fadeOutFrames) envelope *= Math.max(0, (frames - 1 - frame) / fadeOutFrames);
    for (let ch = 0; ch < channels; ch++) {
      const off = (frame * channels + ch) * 2, raw = pcm.readInt16LE(off), next = Math.round(raw * envelope);
      if (next > 32767 || next < -32768) clipped++;
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, next)), off);
    }
  }
  return { buffer: wavFromPcm16(pcm, input.sampleRate, channels), input, clippedDuringEdit: clipped };
}

function makeMediaProductionTools(deps = {}) {
  const fsp = deps.fsp, P = deps.pathMod, ROOT = deps.root;
  if (!fsp || !P || !ROOT) throw new Error('media-production.js requires { fsp, pathMod, root }');
  const jail = fsMod.makeFsTools({ fsp, pathMod: P, root: ROOT, pathTrust: deps.pathTrust })._internals;

  const inspectTool = {
    name: 'media.inspect', capability: 'studio', scope: 'read', requiresConsent: false, network: false, timeoutMs: 30000,
    description: 'Inspect up to eight existing workspace media files for bounded byte/container/technical evidence. This never proves rights, originality, subjective quality, accessibility, platform acceptance or human listening/playback.',
    schema: { type: 'object', required: ['files'], additionalProperties: false, properties: { files: { type: 'array', minItems: 1, maxItems: MAX_FILES, items: { type: 'object', required: ['path', 'role'], additionalProperties: false, properties: {
      path: { type: 'string' }, role: { type: 'string', enum: ['voiceover', 'music', 'video'] }, expected: { type: 'object', additionalProperties: false, properties: {
        container: { type: 'string', enum: ['wav', 'mp3', 'ogg', 'mp4', 'webm'] }, channels: { type: 'integer', minimum: 1, maximum: 8 }, sampleRate: { type: 'integer', minimum: 8000, maximum: 192000 },
        width: { type: 'integer', minimum: 16, maximum: 16384 }, height: { type: 'integer', minimum: 16, maximum: 16384 }, minDurationMs: { type: 'number', minimum: 0 }, maxDurationMs: { type: 'number', minimum: 1 }
      } } } } } } },
    run: async (args, ctx) => {
      const aid = (ctx && ctx.agentId) || 'agent', files = args && args.files;
      if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new Error('files must contain 1-' + MAX_FILES + ' entries');
      const results = [];
      for (const item of files) {
        const { abs } = await jail.resolveInside(aid, item.path, { scope: 'read', ctx });
        const st = await fsp.stat(abs);
        if (!st.isFile()) throw new Error('media path is not a file: ' + item.path);
        if (!st.size || st.size > MAX_FILE_BYTES) throw new Error('media file must be between 1 byte and 128 MiB: ' + item.path);
        if (item.expected && item.expected.minDurationMs != null && item.expected.maxDurationMs != null && item.expected.minDurationMs > item.expected.maxDurationMs) throw new Error('minDurationMs exceeds maxDurationMs for ' + item.path);
        const buf = await fsp.readFile(abs), meta = detect(buf), verdict = machineChecks(meta, item.expected, item.role);
        results.push({ path: item.path, role: item.role, bytes: buf.length, sha256: sha256(buf), technical: meta, ...verdict });
      }
      const pass = results.every(r => r.pass);
      return { content: JSON.stringify({ state: pass ? 'TECHNICAL_CHECKS_PASSED_HUMAN_REVIEW_REQUIRED' : 'TECHNICAL_GAPS', files: results,
        humanReviewRequired: ['rights/provenance and permitted use', 'full listening or playback', 'editorial accuracy and accessibility', 'subjective quality and customer approval', 'target-platform import or upload acceptance'],
        limits: ['No codec decode for MP3/Ogg/WebM', 'No LUFS, true-peak, colour, safe-area or corruption proof', 'Container metadata is not human review'] }), summary: pass ? 'Media technical checks passed; human review required' : 'Media technical gaps found' };
    }
  };

  const editTool = {
    name: 'media.audio.edit', capability: 'studio', scope: 'write', requiresConsent: true, network: false, timeoutMs: 45000,
    description: 'Create one new PCM16 WAV by bounded trim, fade, gain and optional peak normalization inside the workspace. Refuses overwrite. No mixing, resampling, denoise, compression, LUFS normalization, music generation or provider call; human listening and rights review remain mandatory.',
    schema: { type: 'object', required: ['inputPath', 'outputPath'], additionalProperties: false, properties: {
      inputPath: { type: 'string' }, outputPath: { type: 'string' }, trimStartMs: { type: 'number', minimum: 0 }, trimEndMs: { type: 'number', minimum: 0 }, fadeInMs: { type: 'number', minimum: 0, maximum: 30000 }, fadeOutMs: { type: 'number', minimum: 0, maximum: 30000 }, gainDb: { type: 'number', minimum: -60, maximum: 12 }, normalizePeakDbfs: { type: 'number', minimum: -24, maximum: -0.1 }
    } },
    run: async (args, ctx) => {
      const aid = (ctx && ctx.agentId) || 'agent';
      if (!args || !/\.wav$/i.test(String(args.outputPath || ''))) throw new Error('outputPath must end in .wav');
      const input = await jail.resolveInside(aid, args.inputPath, { scope: 'read', ctx });
      const output = await jail.resolveInside(aid, args.outputPath, { scope: 'write', ctx });
      const st = await fsp.stat(input.abs);
      if (!st.isFile() || !st.size || st.size > MAX_EDIT_BYTES) throw new Error('input WAV must be a file between 1 byte and 64 MiB');
      try { await fsp.lstat(output.abs); throw new Error('outputPath already exists; choose a new versioned filename'); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
      const source = await fsp.readFile(input.abs), edited = editPcm16(source, args), digest = sha256(edited.buffer);
      await fsp.mkdir(P.dirname(output.abs), { recursive: true });
      const pending = output.abs + '.pending-' + digest.slice(0, 12);
      let pendingCreated = false, committed = false, pendingCleanupRequired = false;
      try {
        const fh = await fsp.open(pending, 'wx');
        pendingCreated = true;
        try { await fh.writeFile(edited.buffer); await fh.sync(); } finally { await fh.close(); }
        // A hard link is the atomic no-overwrite commit: unlike rename on POSIX it cannot replace a file
        // created between the earlier existence check and this final step.
        await fsp.link(pending, output.abs);
        committed = true;
        try { await fsp.unlink(pending); } catch (_) { pendingCleanupRequired = true; }
      } catch (e) {
        if (pendingCreated && !committed) {
          try { await fsp.unlink(pending); }
          catch (cleanupError) {
            const err = new Error('audio edit failed and pending cleanup also failed; manual reconciliation is required', { cause: e });
            err.code = 'MEDIA_PENDING_CLEANUP_FAILED';
            err.pendingPath = String(args.outputPath) + '.pending-' + digest.slice(0, 12);
            err.cleanupCode = cleanupError && cleanupError.code ? cleanupError.code : 'UNKNOWN';
            throw err;
          }
        }
        throw e;
      }
      const readback = await fsp.readFile(output.abs), actual = sha256(readback);
      if (actual !== digest || readback.length !== edited.buffer.length) throw new Error('audio write read-back verification failed');
      const technical = parseWav(readback, true);
      if (ctx && typeof ctx.emit === 'function') ctx.emit('deliverable', { id: 'media_' + digest.slice(0, 16), agentId: aid, kind: 'file', title: String(args.outputPath), ...(ctx.room ? { room: ctx.room } : {}) });
      const receipt = { operation: 'media-audio-edit', path: String(args.outputPath), state: 'read-back-verified', writtenBytes: readback.length, verifiedBytes: readback.length, sha256: digest, pendingCleanupRequired };
      const state = edited.clippedDuringEdit || technical.clippedSamples ? 'EDITED_WITH_TECHNICAL_GAPS' : 'EDITED_TECHNICALLY_HUMAN_LISTENING_REQUIRED';
      return { content: JSON.stringify({ state, inputPath: args.inputPath, outputPath: args.outputPath, technical, clippedDuringEdit: edited.clippedDuringEdit,
        receipt, limits: ['PCM16 WAV only', 'No resampling, mixing, denoise, dynamics processing or LUFS normalization', 'Rights, subjective quality and customer approval remain unverified'] }),
        summary: 'Edited WAV → ' + args.outputPath + (state === 'EDITED_WITH_TECHNICAL_GAPS' ? '; clipping requires correction' : '; human listening required'), mutationReceipt: receipt, receipt };
    }
  };

  const tools = [inspectTool, editTool];
  return { tools, inspectTool, editTool, register(reg) { tools.forEach(t => reg.register(t)); return reg; }, _internals: { parseWav, parseMp4, detect, editPcm16, machineChecks } };
}

module.exports = { makeMediaProductionTools, constants: { MAX_FILE_BYTES, MAX_EDIT_BYTES, MAX_FILES, MAX_EDIT_MS } };
