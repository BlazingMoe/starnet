'use strict';

// Local MCP adapter over Google's stable APIs. No hosted intermediary, preview
// enrollment, arbitrary URL, or bearer in a query string. The existing connector
// manager owns permissions, refresh, reconnect, cancellation and tool projection.
const ENDPOINTS = Object.freeze({
  gmail: 'https://gmail.googleapis.com/gmail/v1/users/me',
  'google-drive': 'https://www.googleapis.com/drive/v3',
  'google-calendar': 'https://www.googleapis.com/calendar/v3',
  'google-docs': 'https://docs.googleapis.com/v1/documents',
  'google-sheets': 'https://sheets.googleapis.com/v4/spreadsheets'
});
const STR = { type: 'string' };
function tool(name, description, properties, required, readOnly) {
  return { name, description, inputSchema: { type: 'object', properties, required: required || [], additionalProperties: false },
    annotations: { readOnlyHint: !!readOnly, destructiveHint: !readOnly, openWorldHint: true } };
}
const TOOLS = {
  gmail: [
    tool('search_messages', 'Search Gmail using Gmail search syntax. Returns message IDs; use read_message for contents.', { query: STR, pageToken: STR, maxResults: { type: 'integer', minimum: 1, maximum: 100 } }, [], true),
    tool('read_message', 'Read a Gmail message, including its MIME headers and base64url-encoded body parts.', { messageId: STR }, ['messageId'], true),
    tool('read_thread', 'Read the messages in a Gmail thread.', { threadId: STR }, ['threadId'], true),
    tool('read_attachment', 'Read a Gmail attachment as base64url data (bounded to 8 MiB).', { messageId: STR, attachmentId: STR }, ['messageId', 'attachmentId'], true),
    tool('compose_draft', 'Create a plain-text Gmail draft from structured recipients, subject and body. The host builds the RFC 2822 MIME message and base64url encoding. This does NOT send the email.', {
      to: { type: 'array', items: STR, minItems: 1, maxItems: 50 },
      cc: { type: 'array', items: STR, maxItems: 50 },
      bcc: { type: 'array', items: STR, maxItems: 50 },
      subject: STR, bodyText: STR, threadId: STR, inReplyTo: STR, references: STR
    }, ['to', 'subject', 'bodyText']),
    tool('reply_draft', 'Create a plain-text reply DRAFT to the sender of an existing Gmail message. The host reads the real threadId, Subject, Message-ID and Reply-To/From headers so threading metadata is not guessed. This is sender-only, not reply-all, and does NOT send.', {
      messageId: STR, bodyText: STR
    }, ['messageId', 'bodyText']),
    tool('create_draft', 'Advanced: save an email draft from an already base64url-encoded RFC 2822 MIME message. Prefer compose_draft for normal email drafting.', { raw: STR, threadId: STR }, ['raw']),
    tool('send_draft', 'SEND an existing draft to its recipients. This is an external message; obtain the user’s authorization before sending.', { draftId: STR }, ['draftId'])
  ],
  'google-drive': [
    tool('list_files', 'Search Drive with a Drive query; follows pageToken for pagination.', { query: STR, pageToken: STR, pageSize: { type: 'integer', minimum: 1, maximum: 100 } }, [], true),
    tool('get_file', 'Get Drive file metadata.', { fileId: STR }, ['fileId'], true),
    tool('export_file', 'Export a Google Workspace file as text/plain, text/csv, or text/html. Binary exports are not supported by this tool.', { fileId: STR, mimeType: { type: 'string', enum: ['text/plain', 'text/csv', 'text/html'] } }, ['fileId', 'mimeType'], true),
    tool('download_text_file', 'Read the content of a non-Google-Workspace text/CSV/Markdown/JSON Drive file. Use export_file for Docs/Sheets. Response size remains bounded by the connector.', { fileId: STR }, ['fileId'], true),
    tool('create_text_file', 'Create a small text/Markdown/CSV/JSON file in Drive with metadata and content in one multipart upload.', {
      name: STR, content: STR, mimeType: { type: 'string', enum: ['text/plain', 'text/markdown', 'text/csv', 'application/json'] }, parentId: STR
    }, ['name', 'content', 'mimeType']),
    tool('write_text_file', 'Replace the content of an existing Drive text/Markdown/CSV/JSON file accessible to StarNet. File metadata such as its name is preserved.', {
      fileId: STR, content: STR, mimeType: { type: 'string', enum: ['text/plain', 'text/markdown', 'text/csv', 'application/json'] }
    }, ['fileId', 'content', 'mimeType']),
    tool('create_file', 'Create Drive file metadata, including folders. File access follows the permissions granted to StarNet.', { metadata: { type: 'object' } }, ['metadata']),
    tool('update_file', 'Update metadata for a Drive file accessible to StarNet, including name or description.', { fileId: STR, metadata: { type: 'object' } }, ['fileId', 'metadata'])
  ],
  'google-calendar': [
    tool('list_calendars', 'List the signed-in account’s calendars.', { pageToken: STR }, [], true),
    tool('list_events', 'Read calendar events. Dates are RFC3339; calendarId defaults to primary.', { calendarId: STR, timeMin: STR, timeMax: STR, pageToken: STR, query: STR }, [], true),
    tool('get_event', 'Read one calendar event.', { calendarId: STR, eventId: STR }, ['eventId'], true),
    tool('free_busy', 'Read free/busy availability for calendar IDs between two RFC3339 timestamps.', { timeMin: STR, timeMax: STR, calendarIds: { type: 'array', items: STR, minItems: 1, maxItems: 50 } }, ['timeMin', 'timeMax', 'calendarIds'], true),
    tool('create_event', 'Create a calendar event. event is a Google Calendar Event resource. Invitations are not emailed unless sendUpdates is explicitly set to all or externalOnly.', {
      calendarId: STR, event: { type: 'object' }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'] },
      conferenceDataVersion: { type: 'integer', minimum: 0, maximum: 1 }
    }, ['event']),
    tool('patch_event', 'Partially update a calendar event. Array fields replace the existing array; read the event first before changing attendees or recurrence. Notifications are sent only when sendUpdates is explicitly requested.', {
      calendarId: STR, eventId: STR, patch: { type: 'object' }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'] },
      conferenceDataVersion: { type: 'integer', minimum: 0, maximum: 1 }
    }, ['eventId', 'patch']),
    tool('delete_event', 'Delete a calendar event. This is destructive. Attendee cancellation emails are sent only when sendUpdates is explicitly requested.', {
      calendarId: STR, eventId: STR, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }
    }, ['eventId']),
    tool('respond_event', 'Accept, tentatively accept, decline, or reset YOUR OWN attendee response on an invitation. The connector reads the event, finds the attendee marked self:true, then patches only that attendee response.', {
      calendarId: STR, eventId: STR, responseStatus: { type: 'string', enum: ['accepted', 'tentative', 'declined', 'needsAction'] }, comment: STR
    }, ['eventId', 'responseStatus'])
  ],
  'google-docs': [
    tool('get_document', 'Read a Google document and its structured content.', { documentId: STR }, ['documentId'], true),
    tool('create_document', 'Create a Google document with a title.', { title: STR }, ['title']),
    tool('append_text', 'Append plain text to the end of a Google document body (or a specific tab when tabId is supplied) without requiring raw Docs API request construction.', {
      documentId: STR, text: STR, tabId: STR, writeControl: { type: 'object' }
    }, ['documentId', 'text']),
    tool('batch_update', 'Edit a Google document using Docs API batchUpdate requests. Use writeControl to avoid overwriting concurrent edits.', { documentId: STR, requests: { type: 'array', items: { type: 'object' }, minItems: 1, maxItems: 100 }, writeControl: { type: 'object' } }, ['documentId', 'requests'])
  ],
  'google-sheets': [
    tool('get_spreadsheet', 'Read spreadsheet metadata, sheets and named ranges.', { spreadsheetId: STR }, ['spreadsheetId'], true),
    tool('read_values', 'Read cells from an A1 range.', { spreadsheetId: STR, range: STR }, ['spreadsheetId', 'range'], true),
    tool('create_spreadsheet', 'Create a spreadsheet with a title.', { title: STR }, ['title']),
    tool('write_values', 'Write cell values to an A1 range. Uses RAW values by default; USER_ENTERED evaluates formulas.', { spreadsheetId: STR, range: STR, values: { type: 'array', items: { type: 'array' }, maxItems: 10000 }, valueInputOption: { type: 'string', enum: ['RAW', 'USER_ENTERED'] } }, ['spreadsheetId', 'range', 'values']),
    tool('append_values', 'Append rows after the existing table found in an A1 range, so callers do not need to guess the next empty row. Uses RAW values by default.', {
      spreadsheetId: STR, range: STR, values: { type: 'array', items: { type: 'array' }, minItems: 1, maxItems: 10000 },
      valueInputOption: { type: 'string', enum: ['RAW', 'USER_ENTERED'] },
      insertDataOption: { type: 'string', enum: ['OVERWRITE', 'INSERT_ROWS'] }
    }, ['spreadsheetId', 'range', 'values']),
    tool('batch_update', 'Edit spreadsheet structure and formatting with Sheets API batchUpdate requests.', { spreadsheetId: STR, requests: { type: 'array', items: { type: 'object' }, minItems: 1, maxItems: 100 } }, ['spreadsheetId', 'requests'])
  ]
};
function productForUrl(url) { return Object.keys(ENDPOINTS).find(id => ENDPOINTS[id] === url) || null; }
function segment(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\x00-\x1f]/.test(value) || value === '.' || value === '..') throw new Error('Invalid Google resource identifier');
  return encodeURIComponent(value);
}
function validate(def, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
  for (const k of Object.keys(args)) {
    const schema = def.inputSchema.properties[k], v = args[k];
    if (!schema) throw new Error('Unknown argument: ' + k);
    const good = schema.type === 'array' ? Array.isArray(v) : schema.type === 'integer' ? Number.isInteger(v) : schema.type === 'object' ? v && typeof v === 'object' && !Array.isArray(v) : typeof v === schema.type;
    if (!good || (schema.enum && !schema.enum.includes(v)) || (schema.minimum != null && v < schema.minimum) || (schema.maximum != null && v > schema.maximum) || (schema.minItems != null && v.length < schema.minItems) || (schema.maxItems != null && v.length > schema.maxItems)) throw new Error('Invalid argument: ' + k);
    if (typeof v === 'string' && v.length > 1024 * 1024) throw new Error('Argument is too large');
  }
  for (const k of def.inputSchema.required) if (!(k in args)) throw new Error('Missing argument: ' + k);
}
function headerValue(value, label, allowEmpty) {
  if (typeof value !== 'string') throw new Error(label + ' must be a string');
  const s = value.trim();
  if (!allowEmpty && !s) throw new Error(label + ' must not be empty');
  if (s.length > 998 || /[\r\n\x00]/.test(s)) throw new Error('Invalid ' + label + ' header value');
  return s;
}
function recipientHeader(values, label) {
  if (!Array.isArray(values) || !values.length || values.length > 50) throw new Error('Invalid ' + label + ' recipients');
  return values.map(v => headerValue(v, label, false)).join(', ');
}
function optionalRecipientHeader(values, label) {
  if (values == null) return '';
  if (!Array.isArray(values) || values.length > 50) throw new Error('Invalid ' + label + ' recipients');
  return values.map(v => headerValue(v, label, false)).join(', ');
}
function subjectHeader(value) {
  const s = headerValue(value, 'subject', true);
  if (!s || /^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}
function composeDraftRaw(a) {
  const to = recipientHeader(a.to, 'To');
  const cc = optionalRecipientHeader(a.cc, 'Cc');
  const bcc = optionalRecipientHeader(a.bcc, 'Bcc');
  const lines = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'To: ' + to
  ];
  if (cc) lines.push('Cc: ' + cc);
  if (bcc) lines.push('Bcc: ' + bcc);
  lines.push('Subject: ' + subjectHeader(a.subject));
  if (a.inReplyTo) lines.push('In-Reply-To: ' + headerValue(a.inReplyTo, 'In-Reply-To', false));
  if (a.references) lines.push('References: ' + headerValue(a.references, 'References', false));
  const body = String(a.bodyText == null ? '' : a.bodyText).replace(/\r?\n/g, '\r\n');
  const mime = lines.join('\r\n') + '\r\n\r\n' + body;
  return Buffer.from(mime, 'utf8').toString('base64url');
}
function messageHeader(message, name) {
  const headers = message && message.payload && Array.isArray(message.payload.headers) ? message.payload.headers : [];
  const wanted = String(name || '').toLowerCase();
  const row = headers.find(h => h && String(h.name || '').toLowerCase() === wanted);
  return row && typeof row.value === 'string' ? row.value : '';
}
function replyDraftSpec(message, bodyText) {
  if (!message || typeof message !== 'object') throw new Error('Cannot draft reply: source message is unavailable');
  const threadId = typeof message.threadId === 'string' ? message.threadId.trim() : '';
  if (!threadId || threadId.length > 2048 || /[\x00-\x1f]/.test(threadId)) throw new Error('Cannot draft reply: source message has no valid threadId');
  const to = messageHeader(message, 'Reply-To') || messageHeader(message, 'From');
  const subject = messageHeader(message, 'Subject');
  const messageId = messageHeader(message, 'Message-ID');
  const priorRefs = messageHeader(message, 'References');
  if (!to) throw new Error('Cannot draft reply: source message has no Reply-To or From header');
  if (!subject) throw new Error('Cannot draft reply: source message has no Subject header');
  if (!messageId) throw new Error('Cannot draft reply: source message has no Message-ID header');
  const references = priorRefs ? (priorRefs.trim() + ' ' + messageId.trim()) : messageId.trim();
  const raw = composeDraftRaw({
    to: [to],
    subject,
    bodyText: String(bodyText == null ? '' : bodyText),
    inReplyTo: messageId,
    references
  });
  return { url: ENDPOINTS.gmail + '/drafts', method: 'POST', body: { message: { raw, threadId } } };
}
function driveTextMultipart(a) {
  const name = typeof a.name === 'string' ? a.name.trim() : '';
  if (!name || name.length > 500 || /[\x00-\x1f]/.test(name)) throw new Error('Invalid Drive file name');
  const content = String(a.content == null ? '' : a.content);
  const parentId = a.parentId ? String(a.parentId) : '';
  if (parentId) segment(parentId);
  const metadata = { name, mimeType: a.mimeType };
  if (parentId) metadata.parents = [parentId];
  let hash = 2166136261;
  const seed = name + '\n' + a.mimeType + '\n' + content;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  let boundary = 'starnet_drive_' + (hash >>> 0).toString(16);
  const collisionSurface = JSON.stringify(metadata) + '\n' + content;
  while (collisionSurface.includes(boundary)) boundary += '_x';
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    '--' + boundary,
    'Content-Type: ' + a.mimeType,
    '',
    content,
    '--' + boundary + '--',
    ''
  ].join('\r\n');
  return {
    url: 'https://www.googleapis.com/upload/drive/v3/files',
    method: 'POST',
    query: { uploadType: 'multipart', fields: 'id,name,mimeType,modifiedTime,webViewLink,parents,size' },
    rawBody: body,
    contentType: 'multipart/related; boundary=' + boundary
  };
}
function requestFor(product, name, a) {
  const base = ENDPOINTS[product];
  const get = (path, query) => ({ url: base + path, query, method: 'GET' });
  const write = (path, body, method = 'POST', query) => ({ url: base + path, body, method, query });
  if (product === 'gmail') {
    if (name === 'search_messages') return get('/messages', { q: a.query, maxResults: a.maxResults || 25, pageToken: a.pageToken });
    if (name === 'read_message') return get('/messages/' + segment(a.messageId), { format: 'full' });
    if (name === 'read_thread') return get('/threads/' + segment(a.threadId), { format: 'full' });
    if (name === 'read_attachment') return get('/messages/' + segment(a.messageId) + '/attachments/' + segment(a.attachmentId));
    if (name === 'compose_draft') {
      const raw = composeDraftRaw(a);
      return write('/drafts', { message: { raw, ...(a.threadId ? { threadId: a.threadId } : {}) } });
    }
    if (name === 'create_draft') {
      if (!/^[A-Za-z0-9_-]+={0,2}$/.test(a.raw)) throw new Error('raw must be a base64url MIME message');
      return write('/drafts', { message: { raw: a.raw, ...(a.threadId ? { threadId: a.threadId } : {}) } });
    }
    if (name === 'send_draft') return write('/drafts/send', { id: a.draftId });
  }
  if (product === 'google-drive') {
    if (name === 'list_files') return get('/files', { q: a.query, pageToken: a.pageToken, pageSize: a.pageSize || 25, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)' });
    if (name === 'get_file') return get('/files/' + segment(a.fileId), { fields: 'id,name,mimeType,description,modifiedTime,webViewLink,parents,size' });
    if (name === 'export_file') return { ...get('/files/' + segment(a.fileId) + '/export', { mimeType: a.mimeType }), text: true };
    if (name === 'download_text_file') return { ...get('/files/' + segment(a.fileId), { alt: 'media' }), text: true };
    if (name === 'create_text_file') return driveTextMultipart(a);
    if (name === 'write_text_file') return {
      url: 'https://www.googleapis.com/upload/drive/v3/files/' + segment(a.fileId),
      method: 'PATCH',
      query: { uploadType: 'media', fields: 'id,name,mimeType,modifiedTime,webViewLink,size' },
      rawBody: String(a.content == null ? '' : a.content),
      contentType: a.mimeType
    };
    if (name === 'create_file') return write('/files', a.metadata);
    if (name === 'update_file') return write('/files/' + segment(a.fileId), a.metadata, 'PATCH');
  }
  if (product === 'google-calendar') {
    const calendarId = segment(a.calendarId || 'primary');
    const eventPath = a.eventId ? '/calendars/' + calendarId + '/events/' + segment(a.eventId) : '';
    if (name === 'list_calendars') return get('/users/me/calendarList', { pageToken: a.pageToken, maxResults: 100 });
    if (name === 'list_events') return get('/calendars/' + calendarId + '/events', { timeMin: a.timeMin, timeMax: a.timeMax, pageToken: a.pageToken, q: a.query, maxResults: 100, singleEvents: true, orderBy: 'startTime' });
    if (name === 'get_event') return get(eventPath);
    if (name === 'free_busy') return write('/freeBusy', { timeMin: a.timeMin, timeMax: a.timeMax, items: a.calendarIds.map(id => ({ id })) });
    if (name === 'create_event') return write('/calendars/' + calendarId + '/events', a.event, 'POST', { sendUpdates: a.sendUpdates, conferenceDataVersion: a.conferenceDataVersion });
    if (name === 'patch_event') return write(eventPath, a.patch, 'PATCH', { sendUpdates: a.sendUpdates, conferenceDataVersion: a.conferenceDataVersion });
    if (name === 'delete_event') return write(eventPath, undefined, 'DELETE', { sendUpdates: a.sendUpdates });
  }
  if (product === 'google-docs') {
    if (name === 'get_document') return get('/' + segment(a.documentId));
    if (name === 'create_document') return write('', { title: a.title });
    if (name === 'append_text') {
      if (!String(a.text == null ? '' : a.text).length) throw new Error('text must not be empty');
      const end = a.tabId ? { tabId: a.tabId } : {};
      return write('/' + segment(a.documentId) + ':batchUpdate', {
        requests: [{ insertText: { text: a.text, endOfSegmentLocation: end } }],
        ...(a.writeControl ? { writeControl: a.writeControl } : {})
      });
    }
    if (name === 'batch_update') return write('/' + segment(a.documentId) + ':batchUpdate', { requests: a.requests, ...(a.writeControl ? { writeControl: a.writeControl } : {}) });
  }
  if (product === 'google-sheets') {
    const sheet = a.spreadsheetId ? '/' + segment(a.spreadsheetId) : '';
    if (name === 'get_spreadsheet') return get(sheet, { includeGridData: false });
    if (name === 'read_values') return get(sheet + '/values/' + segment(a.range));
    if (name === 'create_spreadsheet') return write('', { properties: { title: a.title } });
    if (name === 'write_values') return write(sheet + '/values/' + segment(a.range), { range: a.range, values: a.values }, 'PUT', { valueInputOption: a.valueInputOption || 'RAW' });
    if (name === 'append_values') return write(sheet + '/values/' + segment(a.range) + ':append', { range: a.range, values: a.values }, 'POST', {
      valueInputOption: a.valueInputOption || 'RAW',
      insertDataOption: a.insertDataOption || 'INSERT_ROWS',
      includeValuesInResponse: false
    });
    if (name === 'batch_update') return write(sheet + ':batchUpdate', { requests: a.requests });
  }
  throw new Error('Unknown Google tool');
}

function makeGoogleTransport({ url, token, fetchImpl = fetch, timeoutMs = 30000 }) {
  const product = productForUrl(url);
  if (!product) throw new Error('Unknown Google connector');
  let receive = () => {}, closed = false;
  const controllers = new Set();
  async function request(spec) {
    if (!token) throw new Error('connector HTTP 401 — sign in to Google');
    const target = new URL(spec.url);
    for (const [k, v] of Object.entries(spec.query || {})) if (v !== undefined && v !== '') target.searchParams.set(k, String(v));
    const ctrl = new AbortController(); controllers.add(ctrl);
    let timer;
    try {
      return await Promise.race([new Promise((_, reject) => { timer = setTimeout(() => { ctrl.abort(); reject(new Error('Google request timed out')); }, timeoutMs); }), (async () => {
        const body = spec.rawBody != null ? String(spec.rawBody) : (spec.body ? JSON.stringify(spec.body) : undefined);
        if (body && Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('Google request exceeds 2 MiB; split the edit');
        let r;
        try { r = await fetchImpl(target.href, { method: spec.method || 'GET', headers: { Authorization: 'Bearer ' + token, Accept: spec.text ? 'text/plain' : 'application/json', 'Content-Type': spec.contentType || 'application/json' }, body, redirect: 'error', signal: ctrl.signal }); }
        catch (_) { throw new Error('Google request failed or was cancelled'); }
        if (!r.ok) { try { await r.body?.cancel(); } catch (_) { ctrl.abort(); } throw new Error('connector HTTP ' + r.status + (r.status === 403 ? ' — Google denied access; check the permissions granted to StarNet' : '')); }
        const reader = r.body?.getReader(); let text = '';
        if (reader) {
          const chunks = []; let size = 0;
          try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Google response exceeds 8 MiB; narrow the request'); } chunks.push(Buffer.from(value)); } }
          finally { reader.releaseLock(); }
          text = Buffer.concat(chunks).toString('utf8');
        } else { text = await r.text(); if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Google response exceeds 8 MiB'); }
        if (spec.text) return text;
        try { return text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Google returned invalid JSON'); }
      })()]);
    } finally { clearTimeout(timer); controllers.delete(ctrl); }
  }
  async function send(msg) {
    if (msg.id == null) return;
    try {
      if (closed) throw new Error('Google connector closed');
      let result;
      if (msg.method === 'initialize') {
        // Prove the account/service responds before publishing connected status.
        const probe = product === 'gmail' ? { url: url + '/profile' } : product === 'google-calendar' ? { url: url + '/users/me/calendarList', query: { maxResults: 1 } }
          : { url: ENDPOINTS['google-drive'] + '/files', query: { pageSize: 1, fields: 'files(id)' } };
        await request(probe);
        result = { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'StarNet Google API connector', version: '1' } };
      } else if (msg.method === 'tools/list') result = { tools: TOOLS[product] };
      else if (msg.method === 'tools/call') {
        const def = TOOLS[product].find(t => t.name === msg.params?.name);
        if (!def) throw new Error('Unknown Google tool');
        const args = msg.params.arguments || {}; validate(def, args);
        let value;
        if (product === 'google-drive' && def.name === 'download_text_file') {
          const fileId = segment(args.fileId);
          const meta = await request({
            url: url + '/files/' + fileId,
            method: 'GET',
            query: { fields: 'id,name,mimeType,size' }
          });
          const mime = String(meta && meta.mimeType || '').toLowerCase();
          const allowed = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
          if (!allowed.has(mime)) {
            throw new Error('Cannot download as text: Drive file mimeType is ' + (mime || 'unknown') + '; use export_file for Google Workspace files');
          }
          value = await request({ url: url + '/files/' + fileId, method: 'GET', query: { alt: 'media' }, text: true });
        } else if (product === 'gmail' && def.name === 'reply_draft') {
          const source = await request({ url: url + '/messages/' + segment(args.messageId), method: 'GET', query: { format: 'full' } });
          value = await request(replyDraftSpec(source, args.bodyText));
        } else if (product === 'google-calendar' && def.name === 'respond_event') {
          const calendarId = segment(args.calendarId || 'primary');
          const eventPath = '/calendars/' + calendarId + '/events/' + segment(args.eventId);
          const event = await request({ url: url + eventPath, method: 'GET' });
          const self = Array.isArray(event && event.attendees) ? event.attendees.find(a => a && a.self === true && typeof a.email === 'string' && a.email) : null;
          if (!self) throw new Error('Cannot respond to event: the signed-in account is not present as a self attendee');
          const attendee = { email: self.email, responseStatus: args.responseStatus };
          if (args.comment) attendee.comment = args.comment;
          value = await request({
            url: url + eventPath,
            method: 'PATCH',
            body: { attendeesOmitted: true, attendees: [attendee] }
          });
        } else {
          value = await request(requestFor(product, def.name, args));
        }
        result = { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError: false };
      } else if (msg.method === 'ping') result = {};
      else throw new Error('Unsupported Google MCP method');
      if (!closed) receive({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      // These are local validation/transport errors with sanitized API status,
      // not remote JSON-RPC prose. Rejection preserves the manager's 401 recovery.
      throw e;
    }
  }
  return { send, onMessage(cb) { receive = cb; }, close() { closed = true; for (const ctrl of controllers) ctrl.abort(); controllers.clear(); } };
}
module.exports = { ENDPOINTS, TOOLS, productForUrl, makeGoogleTransport, requestFor, validate, composeDraftRaw, messageHeader, replyDraftSpec, driveTextMultipart };
