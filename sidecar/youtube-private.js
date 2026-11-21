'use strict';
const { sessionUrl } = require('./youtube-upload-transaction');
const { readGoogleAccount } = require('./mcp/account');
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const API = 'https://www.googleapis.com/youtube/v3';
// Host-only adapter: the existing OAuth connector supplies/refreshes the bearer.
// No POST/PUT retries, even for 401. The transaction owns reconciliation.
function makeYoutubePrivate({ fetch, credential, clock, signal }) {
  let boundGrant = null;
  if (![fetch, credential, clock].every(f => typeof f === 'function')) throw Error('YouTube connector unavailable');
  async function grant() {
    if (signal?.aborted) throw Error('Upload cancelled');
    const g = await credential();
    if (!g || !g.token || g.refreshError || !Array.isArray(g.scopes) || !g.scopes.includes(SCOPE)
      || g.scopes.some(s => ![SCOPE, 'openid', 'https://www.googleapis.com/auth/userinfo.email'].includes(s))) throw Error('YouTube upload-only OAuth grant required');
    return g;
  }
  async function request(url, method, headers = {}, body) {
    const g = boundGrant || await grant();
    if (signal?.aborted) throw Error('Upload cancelled');
    try { return await fetch(url, { method, redirect: 'error', signal: signal || AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + g.token, ...headers }, ...(body !== undefined ? { body } : {}) }); }
    catch (_) { throw Error('YouTube request outcome unknown'); }
  }
  async function json(r) {
    if (!r?.ok) throw Error('YouTube readback denied');
    // API responses are bounded; never propagate remote error text or headers.
    let text = '', length = 0;
    if (!r.body || typeof r.body[Symbol.asyncIterator] !== 'function') throw Error('YouTube response stream required');
    for await (const chunk of r.body) { length += chunk.length; if (length > 65536) throw Error('YouTube response too large'); text += Buffer.from(chunk).toString('utf8'); }
    try { return JSON.parse(text); } catch (_) { throw Error('Malformed YouTube response'); }
  }
  async function progress(r) {
    if (r?.status === 308) return { status: 308, range: r.headers.get('range') };
    if ([200, 201].includes(r?.status)) { const j = await json(r); return { status: r.status, videoId: j.id }; }
    return { status: r?.status || 0 };
  }
  return {
    async identity() {
      const g = await grant();
      boundGrant = g; // Pin this step's account/channel preflight and mutation to one bearer.
      const account = await readGoogleAccount({ authorizationServer: 'https://accounts.google.com', tokenEndpoint: 'https://oauth2.googleapis.com/token', accessToken: g.token, fetchImpl: fetch, now: clock() });
      if (!account) throw Error('Google account readback failed');
      const data = await json(await request(API + '/channels?part=id&mine=true', 'GET'));
      if (!Array.isArray(data.items) || data.items.length !== 1 || data.nextPageToken) throw Error('Exact YouTube channel readback required');
      return { account, channelId: data.items[0].id };
    },
    async initiate(i) {
      const r = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false', 'POST',
        { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(i.bytes), 'X-Upload-Content-Type': 'video/mp4' },
        JSON.stringify({ snippet: { title: i.title, description: i.description, categoryId: i.categoryId }, status: { privacyStatus: 'private', selfDeclaredMadeForKids: i.selfDeclaredMadeForKids, containsSyntheticMedia: i.containsSyntheticMedia } }));
      if (!r?.ok) throw Error('YouTube initiation outcome unknown');
      return { location: r.headers.get('location') };
    },
    async status(session, total) {
      if (!sessionUrl(session)) throw Error('Invalid upload session');
      return progress(await request(session, 'PUT', { 'Content-Length': '0', 'Content-Range': 'bytes */' + total }, Buffer.alloc(0)));
    },
    async upload(session, bytes, offset, total) {
      if (!sessionUrl(session) || !Buffer.isBuffer(bytes) || bytes.length !== total - offset || !bytes.length) throw Error('Invalid upload range');
      return progress(await request(session, 'PUT', { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), 'Content-Range': 'bytes ' + offset + '-' + (total - 1) + '/' + total }, bytes));
    },
    async verify(id) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw Error('Invalid video ID');
      const j = await json(await request(API + '/videos?part=snippet,status&id=' + id, 'GET'));
      if (!Array.isArray(j.items) || j.items.length !== 1) throw Error('Exact video readback required');
      const v = j.items[0];
      return { id: v.id, channelId: v.snippet?.channelId, privacyStatus: v.status?.privacyStatus, publishAt: v.status?.publishAt,
        selfDeclaredMadeForKids: v.status?.selfDeclaredMadeForKids, containsSyntheticMedia: v.status?.containsSyntheticMedia };
    }
  };
}
module.exports = { makeYoutubePrivate, SCOPE };
