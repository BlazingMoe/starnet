'use strict';

// Edit API contract: https://shotstack.io/docs/api/ (stage, never v1).
// No ambient fetch, credentials, timers, paid generation, destinations or lookup guesses.
const ENDPOINT = 'https://api.shotstack.io/edit/stage';
const OUTPUT_HOST = 'shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com';
function outputUrl(value, renderId) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.host !== OUTPUT_HOST || u.username || u.password || u.search || u.hash || !/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.mp4$/.test(u.pathname) || u.pathname.split('/').pop() !== renderId + '.mp4' || u.href !== value) throw Error('Shotstack output host/path denied');
  return value;
}
function makeShotstackStage({ fetch, apiKey, clock, endpoint = ENDPOINT, signal }) {
  if (endpoint !== ENDPOINT) throw Error('Shotstack production/unknown endpoint denied');
  if (typeof fetch !== 'function' || typeof clock !== 'function' || typeof apiKey !== 'string' || !apiKey) throw Error('Shotstack stage is unavailable: host SHOTSTACK_API_KEY and transport are required');
  async function request(path, method, body) {
    if (signal && signal.aborted) throw Error('Render cancelled');
    const r = await fetch(ENDPOINT + path, { method, redirect: 'error', signal: signal || AbortSignal.timeout(10000),
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r || !r.ok) { const e = Error('Shotstack stage request failed'); e.retryable = method === 'GET' && r && [429, 502, 503, 504].includes(r.status); throw e; }
    const data = await r.json();
    if (!data || data.success !== true || !data.response) throw Error('Malformed Shotstack response');
    return data.response;
  }
  function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw Error('Invalid Shotstack render ID'); return value; }
  function validateIntent(intent) {
    const edit = intent.edit;
    if (!edit || Object.keys(edit).some(k => !['timeline', 'output'].includes(k)) || !edit.output || edit.output.format !== 'mp4' || edit.output.destinations || JSON.stringify(edit).length > 100000) throw Error('Only bounded private MP4 edits are allowed');
    function inspect(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (/^(destinations|callback|webhook|credentials|generate|generation)$/i.test(key)) throw Error('External delivery or generation denied');
        if (/(api.?key|token|secret|password|authorization|cookie)/i.test(key)) throw Error('Credentials may not be embedded in a render edit');
        if (key === 'src') {
          const u = new URL(item);
          if (u.protocol !== 'https:' || u.username || u.password || u.hash || /(?:token|secret|password|signature|api.?key)=/i.test(u.search)) throw Error('Only public HTTPS source URLs are allowed');
        }
        if (key === 'asset' && (!item || !['image', 'video', 'audio', 'title', 'text', 'rich-text', 'shape'].includes(item.type))) throw Error('Unsupported asset type');
        inspect(item);
      }
    }
    inspect(edit);
  }
  return {
    environment: 'stage', validateIntent,
    async submit(intent, fingerprint) {
      const edit = intent.edit;
      validateIntent(intent);
      const result = await request('/render', 'POST', edit);
      return { id: id(result.id), intentFingerprint: fingerprint };
    },
    // Shotstack's documented GET-by-ID is NOT an authoritative lookup-by-intent API.
    // No lookup method: lost submit responses remain ambiguous for operator review.
    async poll(renderId, fingerprint) {
      const result = await request('/render/' + id(renderId), 'GET');
      if (result.id !== renderId) throw Error('Wrong Shotstack render ID');
      const state = { queued: 'queued', fetching: 'rendering', rendering: 'rendering', saving: 'rendering', done: 'succeeded', failed: 'failed' }[result.status];
      if (!state) throw Error('Unknown Shotstack status');
      let output;
      if (state === 'succeeded') {
        const url = outputUrl(result.url, renderId);
        output = { url, allowlist: [url], renderId };
      }
      return { id: renderId, intentFingerprint: fingerprint, state, observedAt: clock(), output };
    },
    async download(output, maxBytes) {
      if (!output || !Array.isArray(output.allowlist) || output.allowlist.length !== 1 || output.allowlist[0] !== output.url) throw Error('Download URL not allowed');
      const url = new URL(output.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Invalid download URL');
      outputUrl(output.url, output.renderId);
      if (signal && signal.aborted) throw Error('Render cancelled');
      const r = await fetch(output.url, { method: 'GET', redirect: 'error', signal: signal || AbortSignal.timeout(10000) });
      if (!r || !r.ok || r.url !== output.url || String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'video/mp4' || !r.body || typeof r.body[Symbol.asyncIterator] !== 'function') throw Error('Invalid video response');
      const lengthHeader = r.headers.get('content-length');
      const expected = lengthHeader == null ? null : Number(lengthHeader);
      if (expected != null && (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(expected) || expected < 16 || expected > maxBytes)) throw Error('Invalid video length');
      const chunks = []; let length = 0;
      for await (const part of r.body) {
        const chunk = Buffer.from(part); length += chunk.length;
        if (length > maxBytes || (expected != null && length > expected)) throw Error('Video exceeds byte bound');
        chunks.push(chunk);
      }
      if (!length || (expected != null && length !== expected)) throw Error('Truncated or empty video');
      return { url: output.url, mime: 'video/mp4', bytes: Buffer.concat(chunks, length) };
    }
  };
}
module.exports = { makeShotstackStage, ENDPOINT, OUTPUT_HOST };
