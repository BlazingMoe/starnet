'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { desktopClient, loadDesktopClient } = require('../sidecar/mcp/google-client.js');
const { ENDPOINTS, TOOLS, makeGoogleTransport, productForUrl } = require('../sidecar/mcp/transport.google.js');
const { makeMcpClient } = require('../sidecar/mcp/client.js');
const { resolveConnectorOauthTarget } = require('../sidecar/mcp/oauth-target.js');
const { makeMcpToolDef } = require('../sidecar/mcp/translate.js');
const catalog = require('../sidecar/mcp/catalog.js');

(async () => {
  const installed = { installed: { client_id: '123456-starnettest.apps.googleusercontent.com' } };
  assert.equal(desktopClient(installed).tokenEndpointAuthMethod, 'none');
  assert.equal(desktopClient({ installed: { ...installed.installed, client_secret: 'native-metadata' } }).tokenEndpointAuthMethod, 'client_secret_post');
  assert.throws(() => desktopClient({ web: installed.installed }), /Desktop/);
  assert.throws(() => desktopClient({ installed: { client_id: 'bogus' } }), /invalid/);
  assert.throws(() => desktopClient({ installed: { ...installed.installed, token_uri: 'https://evil.invalid' } }), /host/);
  assert.equal(loadDesktopClient({ env: {}, readFile() { throw Error('not configured'); } }), null);
  assert.equal(loadDesktopClient({ env: { STARNET_GOOGLE_DESKTOP_CLIENT_JSON: JSON.stringify(installed) }, readFile() { throw Error('must use publisher environment'); } }).clientId, installed.installed.client_id);
  assert.equal(productForUrl(ENDPOINTS.gmail + '.evil'), null);
  const legacy = resolveConnectorOauthTarget('gmail', catalog, [{ id: 'gmail', oauth: true, transport: 'http', url: 'https://gmailmcp.googleapis.com/mcp/v1' }]);
  assert.equal(legacy.custom, false);
  assert.equal(legacy.entry.url, ENDPOINTS.gmail);
  assert.equal(resolveConnectorOauthTarget('gmail', catalog, [{ id: 'gmail', oauth: true, transport: 'http', url: 'https://custom.example/mcp' }]).custom, true);
  const gmailCatalog = catalog.get('gmail');
  assert.ok(gmailCatalog.staticOauth.scopes.includes('https://www.googleapis.com/auth/gmail.modify'),
    'Gmail requests explicit modify scope before exposing inbox/label mutations');
  const contactsCatalog = catalog.get('google-contacts');
  assert.ok(contactsCatalog.staticOauth.scopes.includes('https://www.googleapis.com/auth/contacts.readonly'),
    'Google Contacts uses read-only address-book authorization');

  const examples = {
    search_messages: { query: 'from:test@example.invalid', pageToken: 'next&evil=1' }, read_message: { messageId: 'message-1' },
    read_thread: { threadId: 'thread-1' }, read_attachment: { messageId: 'message-1', attachmentId: 'attachment-1' },
    list_labels: {},
    mark_read: { messageId: 'message-1' },
    mark_unread: { messageId: 'message-1' },
    archive_message: { messageId: 'message-1' },
    move_to_inbox: { messageId: 'message-1' },
    modify_labels: { messageId: 'message-1', addLabelIds: ['STARRED', 'Label_123', 'Label_123'], removeLabelIds: ['IMPORTANT'] },
    list_contacts: { pageSize: 50 },
    search_contacts: { query: 'Müller', pageSize: 15 },
    get_contact: { resourceName: 'people/c123' },
    compose_draft: { to: ['test@example.invalid'], cc: ['copy@example.invalid'], subject: 'Geschäft €', bodyText: 'Hello\nWorld', threadId: 'thread-1', inReplyTo: '<msg-1@example.invalid>', references: '<root@example.invalid> <msg-1@example.invalid>' },
    reply_draft: { messageId: 'message-1', bodyText: 'Thanks\nConfirmed' },
    create_draft: { raw: Buffer.from('To: test@example.invalid\r\nSubject: Test\r\n\r\nHello').toString('base64url') }, send_draft: { draftId: 'draft-1' },
    list_files: { query: "name contains 'test'" }, get_file: { fileId: 'file-1' }, export_file: { fileId: 'file-1', mimeType: 'text/plain' },
    download_text_file: { fileId: 'file-1' },
    create_text_file: { name: 'pipeline.csv', content: 'company,stage\nAcme,qualified', mimeType: 'text/csv', parentId: 'folder-1' },
    write_text_file: { fileId: 'file-1', content: 'company,stage\nAcme,replied', mimeType: 'text/csv' },
    create_file: { metadata: { name: 'Test' } }, update_file: { fileId: 'file-1', metadata: { name: 'Updated' } },
    list_calendars: {}, list_events: {}, get_event: { eventId: 'event-1' }, free_busy: { timeMin: '2026-09-06T00:00:00Z', timeMax: '2026-09-07T00:00:00Z', calendarIds: ['primary'] },
    create_event: { event: { summary: 'Test event', start: { dateTime: '2026-09-10T14:00:00+02:00' }, end: { dateTime: '2026-09-10T15:00:00+02:00' } }, sendUpdates: 'none' },
    patch_event: { eventId: 'event-1', patch: { location: 'Kassel' }, sendUpdates: 'none' },
    delete_event: { eventId: 'event-1', sendUpdates: 'none' },
    respond_event: { eventId: 'event-1', responseStatus: 'accepted', comment: 'Confirmed' },
    get_document: { documentId: 'document-1' }, create_document: { title: 'Test' },
    append_text: { documentId: 'document-1', text: '\nRevenue summary\n', tabId: 'tab-1', writeControl: { requiredRevisionId: 'rev-1' } },
    get_spreadsheet: { spreadsheetId: 'sheet-1' }, read_values: { spreadsheetId: 'sheet-1', range: "'Sheet 1'!A1:B2" },
    create_spreadsheet: { title: 'Test' }, write_values: { spreadsheetId: 'sheet-1', range: 'A1', values: [['=1+1']] },
    append_values: { spreadsheetId: 'sheet-1', range: "'Pipeline'!A:H", values: [['Acme', 'qualified', 82]], valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }
  };
  let exercised = 0;
  for (const [product, url] of Object.entries(ENDPOINTS)) {
    const calls = [];
    const client = makeMcpClient({ timeoutMs: 1000, transport: makeGoogleTransport({ url, token: 'TEST_TOKEN', fetchImpl: async (target, opts) => {
      calls.push({ target, opts });
      assert.equal(opts.headers.Authorization, 'Bearer TEST_TOKEN');
      assert.equal(opts.redirect, 'error');
      assert.ok(!target.includes('TEST_TOKEN'));
      return new Response(JSON.stringify({
        id: 'fixture',
        mimeType: 'text/csv',
        threadId: 'thread-source-1',
        messages: [{ id: 'message-1' }],
        payload: { headers: [
          { name: 'From', value: 'Sender <sender@example.invalid>' },
          { name: 'Reply-To', value: 'Replies <reply@example.invalid>' },
          { name: 'Subject', value: 'Project update' },
          { name: 'Message-ID', value: '<source-message@example.invalid>' },
          { name: 'References', value: '<root-message@example.invalid>' }
        ] },
        attendees: [{ email: 'self@example.invalid', self: true, responseStatus: 'needsAction' }]
      }), { headers: { 'Content-Type': 'application/json' } });
    } }) });
    await client.initialize();
    assert.equal(calls.length, 1, product + ' verifies Google before connected');
    const defs = await client.listTools();
    assert.equal(defs.length, TOOLS[product].length);
    for (const def of defs) {
      const args = def.name === 'batch_update' ? product === 'google-docs' ? { documentId: 'document-1', requests: [{ insertText: { text: 'hi', endOfSegmentLocation: {} } }] } : { spreadsheetId: 'sheet-1', requests: [{ addSheet: { properties: { title: 'New' } } }] } : examples[def.name];
      const beforeCall = calls.length;
      const response = await client.callTool(def.name, args);
      const toolCalls = calls.slice(beforeCall);
      assert.equal(response.isError, false);
      if (product === 'google-drive' && (def.name === 'create_text_file' || def.name === 'write_text_file')) {
        assert.ok(calls.at(-1).target.startsWith('https://www.googleapis.com/upload/drive/v3/'), def.name + ' uses the Drive upload endpoint');
      } else {
        assert.ok(calls.at(-1).target.startsWith(url));
      }
      if (def.name === 'write_values') assert.equal(new URL(calls.at(-1).target).searchParams.get('valueInputOption'), 'RAW');
      if (def.name === 'append_values') {
        const u = new URL(calls.at(-1).target);
        assert.equal(calls.at(-1).opts.method, 'POST');
        assert.match(u.pathname, /\/spreadsheets\/sheet-1\/values\/.+:append$/);
        assert.equal(u.searchParams.get('valueInputOption'), 'RAW');
        assert.equal(u.searchParams.get('insertDataOption'), 'INSERT_ROWS');
        assert.equal(u.searchParams.get('includeValuesInResponse'), 'false');
        assert.deepEqual(JSON.parse(calls.at(-1).opts.body).values, [['Acme', 'qualified', 82]]);
      }
      if (def.name === 'search_messages') assert.equal(new URL(calls.at(-1).target).searchParams.get('pageToken'), 'next&evil=1');
      if (product === 'google-contacts' && def.name === 'list_contacts') {
        assert.equal(toolCalls.length, 1);
        const u = new URL(toolCalls[0].target);
        assert.equal(toolCalls[0].opts.method, 'GET');
        assert.equal(u.pathname, '/v1/people/me/connections');
        assert.equal(u.searchParams.get('pageSize'), '50');
        assert.equal(u.searchParams.get('personFields'), 'names,emailAddresses,phoneNumbers,organizations,metadata');
      }
      if (product === 'google-contacts' && def.name === 'search_contacts') {
        assert.equal(toolCalls.length, 2, 'contact search performs Google cache warm-up then the real query');
        const warm = new URL(toolCalls[0].target);
        const actual = new URL(toolCalls[1].target);
        assert.equal(warm.pathname, '/v1/people:searchContacts');
        assert.equal(warm.searchParams.has('query'), true, 'warm-up preserves the explicitly empty query parameter');
        assert.equal(warm.searchParams.get('query'), '');
        assert.equal(warm.searchParams.get('pageSize'), '1');
        assert.equal(actual.searchParams.get('query'), 'Müller');
        assert.equal(actual.searchParams.get('pageSize'), '15');
        assert.equal(actual.searchParams.get('readMask'), 'names,emailAddresses,phoneNumbers,organizations,metadata');
      }
      if (product === 'google-contacts' && def.name === 'get_contact') {
        assert.equal(toolCalls.length, 1);
        const u = new URL(toolCalls[0].target);
        assert.equal(u.pathname, '/v1/people/c123');
        assert.equal(u.searchParams.get('personFields'), 'names,emailAddresses,phoneNumbers,organizations,metadata');
      }
      if (def.name === 'list_labels') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'GET');
        assert.match(new URL(toolCalls[0].target).pathname, /\/users\/me\/labels$/);
      }
      if (['mark_read', 'mark_unread', 'archive_message', 'move_to_inbox', 'modify_labels'].includes(def.name)) {
        assert.equal(toolCalls.length, 1, def.name + ' is one reversible Gmail modify request');
        assert.equal(toolCalls[0].opts.method, 'POST');
        assert.match(new URL(toolCalls[0].target).pathname, /\/users\/me\/messages\/message-1\/modify$/);
        const patch = JSON.parse(toolCalls[0].opts.body);
        const expected = {
          mark_read: { removeLabelIds: ['UNREAD'] },
          mark_unread: { addLabelIds: ['UNREAD'] },
          archive_message: { removeLabelIds: ['INBOX'] },
          move_to_inbox: { addLabelIds: ['INBOX'] },
          modify_labels: { addLabelIds: ['STARRED', 'Label_123'], removeLabelIds: ['IMPORTANT'] }
        }[def.name];
        assert.deepEqual(patch, expected, def.name + ' emits only the intended label delta');
      }
      if (def.name === 'compose_draft') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'POST');
        assert.match(new URL(toolCalls[0].target).pathname, /\/users\/me\/drafts$/);
        const message = JSON.parse(toolCalls[0].opts.body).message;
        assert.equal(message.threadId, 'thread-1');
        const mime = Buffer.from(message.raw, 'base64url').toString('utf8');
        assert.match(mime, /To: test@example\.invalid\r\n/);
        assert.match(mime, /Cc: copy@example\.invalid\r\n/);
        assert.match(mime, /Subject: =\?UTF-8\?B\?.+\?=\r\n/);
        assert.match(mime, /In-Reply-To: <msg-1@example\.invalid>\r\n/);
        assert.match(mime, /References: <root@example\.invalid> <msg-1@example\.invalid>\r\n/);
        assert.ok(mime.endsWith('\r\n\r\nHello\r\nWorld'));
      }
      if (def.name === 'reply_draft') {
        assert.equal(toolCalls.length, 2, 'reply draft reads the source before creating a draft');
        assert.equal(toolCalls[0].opts.method, 'GET');
        assert.match(new URL(toolCalls[0].target).pathname, /\/users\/me\/messages\/message-1$/);
        assert.equal(new URL(toolCalls[0].target).searchParams.get('format'), 'full');
        assert.equal(toolCalls[1].opts.method, 'POST');
        assert.match(new URL(toolCalls[1].target).pathname, /\/users\/me\/drafts$/);
        const replyMessage = JSON.parse(toolCalls[1].opts.body).message;
        assert.equal(replyMessage.threadId, 'thread-source-1');
        const mime = Buffer.from(replyMessage.raw, 'base64url').toString('utf8');
        assert.match(mime, /To: Replies <reply@example\.invalid>\r\n/, 'Reply-To wins over From');
        assert.match(mime, /Subject: Project update\r\n/, 'source subject is preserved for Gmail threading');
        assert.match(mime, /In-Reply-To: <source-message@example\.invalid>\r\n/);
        assert.match(mime, /References: <root-message@example\.invalid> <source-message@example\.invalid>\r\n/);
        assert.ok(mime.endsWith('\r\n\r\nThanks\r\nConfirmed'));
        assert.ok(!/Cc:|Bcc:/.test(mime), 'reply_draft is sender-only and cannot silently reply-all');
      }
      if (def.name === 'download_text_file') {
        assert.equal(toolCalls.length, 2, 'text download validates authoritative Drive metadata before reading bytes');
        assert.equal(toolCalls[0].opts.method, 'GET');
        assert.equal(new URL(toolCalls[0].target).searchParams.get('fields'), 'id,name,mimeType,size');
        assert.equal(toolCalls[1].opts.method, 'GET');
        assert.equal(new URL(toolCalls[1].target).searchParams.get('alt'), 'media');
      }
      if (def.name === 'create_text_file') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'POST');
        const u = new URL(toolCalls[0].target);
        assert.equal(u.pathname, '/upload/drive/v3/files');
        assert.equal(u.searchParams.get('uploadType'), 'multipart');
        assert.match(toolCalls[0].opts.headers['Content-Type'], /^multipart\/related; boundary=starnet_drive_/);
        assert.match(toolCalls[0].opts.body, /"name":"pipeline\.csv"/);
        assert.match(toolCalls[0].opts.body, /"parents":\["folder-1"\]/);
        assert.match(toolCalls[0].opts.body, /Content-Type: text\/csv/);
        assert.match(toolCalls[0].opts.body, /company,stage\nAcme,qualified/, 'multipart upload preserves caller text line endings');
      }
      if (def.name === 'write_text_file') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'PATCH');
        const u = new URL(toolCalls[0].target);
        assert.equal(u.pathname, '/upload/drive/v3/files/file-1');
        assert.equal(u.searchParams.get('uploadType'), 'media');
        assert.equal(toolCalls[0].opts.headers['Content-Type'], 'text/csv');
        assert.equal(toolCalls[0].opts.body, 'company,stage\nAcme,replied');
      }
      if (product === 'google-docs' && def.name === 'append_text') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'POST');
        assert.match(new URL(toolCalls[0].target).pathname, /\/documents\/document-1:batchUpdate$/);
        assert.deepEqual(JSON.parse(toolCalls[0].opts.body), {
          requests: [{ insertText: { text: '\nRevenue summary\n', endOfSegmentLocation: { tabId: 'tab-1' } } }],
          writeControl: { requiredRevisionId: 'rev-1' }
        });
      }
      if (def.name === 'create_event') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'POST');
        assert.match(new URL(toolCalls[0].target).pathname, /\/calendars\/primary\/events$/);
        assert.equal(new URL(toolCalls[0].target).searchParams.get('sendUpdates'), 'none');
        assert.equal(JSON.parse(toolCalls[0].opts.body).summary, 'Test event');
      }
      if (def.name === 'patch_event') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'PATCH');
        assert.match(new URL(toolCalls[0].target).pathname, /\/calendars\/primary\/events\/event-1$/);
        assert.deepEqual(JSON.parse(toolCalls[0].opts.body), { location: 'Kassel' });
      }
      if (def.name === 'delete_event') {
        assert.equal(toolCalls.length, 1);
        assert.equal(toolCalls[0].opts.method, 'DELETE');
        assert.equal(toolCalls[0].opts.body, undefined);
      }
      if (def.name === 'respond_event') {
        assert.equal(toolCalls.length, 2, 'RSVP uses read-then-patch so the self attendee is never guessed');
        assert.equal(toolCalls[0].opts.method, 'GET');
        assert.equal(toolCalls[1].opts.method, 'PATCH');
        assert.deepEqual(JSON.parse(toolCalls[1].opts.body), {
          attendeesOmitted: true,
          attendees: [{ email: 'self@example.invalid', responseStatus: 'accepted', comment: 'Confirmed' }]
        });
      }
      if (product === 'google-calendar') {
        const writeNames = new Set(['create_event', 'patch_event', 'delete_event', 'respond_event']);
        assert.equal(def.annotations.readOnlyHint, !writeNames.has(def.name), def.name + ' read-only annotation matches its side-effect class');
        assert.equal(def.annotations.destructiveHint, writeNames.has(def.name), def.name + ' destructive annotation matches its side-effect class');
      }
      exercised++;
    }
    const before = calls.length;
    await assert.rejects(client.callTool('nonexistent', {}), /Unknown/);
    await assert.rejects(client.callTool(defs[0].name, { url: 'https://evil.invalid' }), /Unknown argument/);
    assert.equal(calls.length, before, 'invalid tools never reach the network');
    client.close();
  }
  {
    const driveWrites = new Set(['create_text_file', 'write_text_file', 'create_file', 'update_file']);
    for (const raw of TOOLS['google-drive']) {
      const projected = makeMcpToolDef({
        connectorId: 'google-drive',
        label: 'Google Drive',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains consent-gated at the host boundary');
      assert.equal(projected.scope, driveWrites.has(raw.name) ? 'execute' : 'read', raw.name + ' host scope follows Drive side-effect classification');
      assert.equal(projected.readOnly, !driveWrites.has(raw.name), raw.name + ' read-only projection matches Drive side effects');
    }
  }

  {
    const calls = [];
    const client = makeMcpClient({
      timeoutMs: 1000,
      transport: makeGoogleTransport({
        url: ENDPOINTS['google-drive'],
        token: 'TEST_TOKEN',
        fetchImpl: async (target, opts) => {
          calls.push({ target, opts });
          const u = new URL(target);
          if (u.pathname.endsWith('/files') && !u.pathname.includes('/file-')) {
            return new Response(JSON.stringify({ files: [] }), { headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ id: 'binary-1', name: 'contract.pdf', mimeType: 'application/pdf', size: '1234' }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    });
    await client.initialize();
    const before = calls.length;
    await assert.rejects(
      client.callTool('download_text_file', { fileId: 'binary-1' }),
      /Cannot download as text: Drive file mimeType is application\/pdf/
    );
    assert.equal(calls.length, before + 1, 'binary text read stops after metadata check');
    assert.equal(new URL(calls.at(-1).target).searchParams.get('alt'), null, 'binary file bytes are never fetched through the text tool');
    client.close();
  }

  {
    const names = TOOLS['google-contacts'].map(tool => tool.name);
    assert.deepEqual(names, ['list_contacts', 'search_contacts', 'get_contact'], 'Contacts exposes only read operations in the private operator slice');
    for (const raw of TOOLS['google-contacts']) {
      const projected = makeMcpToolDef({
        connectorId: 'google-contacts',
        label: 'Google Contacts',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains connector-consent gated');
      assert.equal(projected.scope, 'read', raw.name + ' stays read-scoped');
      assert.equal(projected.readOnly, true, raw.name + ' cannot mutate the address book');
    }
  }

  {
    const calls = [];
    const client = makeMcpClient({
      timeoutMs: 1000,
      transport: makeGoogleTransport({
        url: ENDPOINTS['google-contacts'],
        token: 'TEST_TOKEN',
        fetchImpl: async (target, opts) => {
          calls.push({ target, opts });
          return new Response(JSON.stringify({ connections: [] }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    });
    await client.initialize();
    const before = calls.length;
    await assert.rejects(
      client.callTool('search_contacts', { query: '   ' }),
      /search query must not be empty/
    );
    assert.equal(calls.length, before, 'blank contact search fails before warm-up/network');
    await assert.rejects(
      client.callTool('get_contact', { resourceName: 'people/c123/extra' }),
      /Invalid Google contact resourceName/
    );
    assert.equal(calls.length, before, 'unsafe contact resourceName fails before network');
    client.close();
  }

  {
    const gmailWrites = new Set(['mark_read', 'mark_unread', 'archive_message', 'move_to_inbox', 'modify_labels', 'compose_draft', 'reply_draft', 'create_draft', 'send_draft']);
    for (const raw of TOOLS.gmail) {
      const projected = makeMcpToolDef({
        connectorId: 'gmail',
        label: 'Gmail',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains consent-gated at the host boundary');
      assert.equal(projected.scope, gmailWrites.has(raw.name) ? 'execute' : 'read', raw.name + ' host scope follows Gmail side-effect classification');
      if (gmailWrites.has(raw.name)) assert.equal(projected.readOnly, false, raw.name + ' can never be auto-classified as a read');
    }
  }

  {
    const calls = [];
    const client = makeMcpClient({
      timeoutMs: 1000,
      transport: makeGoogleTransport({
        url: ENDPOINTS.gmail,
        token: 'TEST_TOKEN',
        fetchImpl: async (target, opts) => {
          calls.push({ target, opts });
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    });
    await client.initialize();
    const before = calls.length;
    await assert.rejects(
      client.callTool('compose_draft', { to: ['victim@example.invalid\r\nBcc: injected@example.invalid'], subject: 'x', bodyText: 'hello' }),
      /Invalid To header value/
    );
    assert.equal(calls.length, before, 'header injection is rejected locally before Gmail is called');
    await assert.rejects(
      client.callTool('compose_draft', { to: [], subject: 'x', bodyText: 'hello' }),
      /Invalid argument: to/
    );
    assert.equal(calls.length, before, 'empty recipient list is rejected before Gmail is called');
    await assert.rejects(
      client.callTool('modify_labels', { messageId: 'message-1', addLabelIds: [], removeLabelIds: [] }),
      /At least one Gmail label change is required/
    );
    assert.equal(calls.length, before, 'empty Gmail label mutation is rejected before network');
    await assert.rejects(
      client.callTool('modify_labels', { messageId: 'message-1', addLabelIds: ['STARRED'], removeLabelIds: ['STARRED'] }),
      /cannot be added and removed in the same operation/
    );
    assert.equal(calls.length, before, 'contradictory Gmail label mutation is rejected before network');
    await assert.rejects(
      client.callTool('modify_labels', { messageId: 'message-1', addLabelIds: ['ok\r\nINBOX'], removeLabelIds: [] }),
      /Invalid add label id/
    );
    assert.equal(calls.length, before, 'control characters in Gmail label IDs are rejected before network');
    client.close();
  }

  {
    const calls = [];
    const client = makeMcpClient({
      timeoutMs: 1000,
      transport: makeGoogleTransport({
        url: ENDPOINTS.gmail,
        token: 'TEST_TOKEN',
        fetchImpl: async (target, opts) => {
          calls.push({ target, opts });
          if (new URL(target).pathname.endsWith('/profile')) {
            return new Response(JSON.stringify({ emailAddress: 'self@example.invalid' }), { headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            id: 'source-without-message-id',
            threadId: 'thread-source-2',
            payload: { headers: [
              { name: 'From', value: 'Sender <sender@example.invalid>' },
              { name: 'Subject', value: 'Project update' }
            ] }
          }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    });
    await client.initialize();
    const before = calls.length;
    await assert.rejects(
      client.callTool('reply_draft', { messageId: 'source-without-message-id', bodyText: 'reply' }),
      /source message has no Message-ID header/
    );
    assert.equal(calls.length, before + 1, 'unsafe thread metadata stops after source read');
    assert.equal(calls.at(-1).opts.method, 'GET', 'missing reply metadata never creates a draft');
    client.close();
  }

  {
    const docsWrites = new Set(['create_document', 'append_text', 'batch_update']);
    for (const raw of TOOLS['google-docs']) {
      const projected = makeMcpToolDef({
        connectorId: 'google-docs',
        label: 'Google Docs',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains consent-gated at the host boundary');
      assert.equal(projected.scope, docsWrites.has(raw.name) ? 'execute' : 'read', raw.name + ' host scope follows Docs side-effect classification');
      assert.equal(projected.readOnly, !docsWrites.has(raw.name), raw.name + ' read-only projection matches Docs side effects');
    }
  }

  {
    const sheetsWrites = new Set(['create_spreadsheet', 'write_values', 'append_values', 'batch_update']);
    for (const raw of TOOLS['google-sheets']) {
      const projected = makeMcpToolDef({
        connectorId: 'google-sheets',
        label: 'Google Sheets',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains consent-gated at the host boundary');
      assert.equal(projected.scope, sheetsWrites.has(raw.name) ? 'execute' : 'read', raw.name + ' host scope follows Sheets side-effect classification');
      assert.equal(projected.readOnly, !sheetsWrites.has(raw.name), raw.name + ' read-only projection matches Sheets side effects');
    }
  }

  {
    const calendarWrites = new Set(['create_event', 'patch_event', 'delete_event', 'respond_event']);
    for (const raw of TOOLS['google-calendar']) {
      const projected = makeMcpToolDef({
        connectorId: 'google-calendar',
        label: 'Google Calendar',
        mcpTool: raw,
        call: async () => ({ content: [] })
      });
      assert.equal(projected.requiresConsent, true, raw.name + ' remains consent-gated at the host boundary');
      assert.equal(projected.network, true, raw.name + ' remains an external network action');
      assert.equal(projected.scope, calendarWrites.has(raw.name) ? 'execute' : 'read', raw.name + ' host scope follows side-effect classification');
      if (calendarWrites.has(raw.name)) assert.equal(projected.readOnly, false, raw.name + ' can never be auto-classified as a read');
    }
  }

  {
    const calls = [];
    const client = makeMcpClient({
      timeoutMs: 1000,
      transport: makeGoogleTransport({
        url: ENDPOINTS['google-calendar'],
        token: 'TEST_TOKEN',
        fetchImpl: async (target, opts) => {
          calls.push({ target, opts });
          return new Response(JSON.stringify({ id: 'event-no-self', attendees: [{ email: 'other@example.invalid', self: false }] }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    });
    await client.initialize();
    await assert.rejects(
      client.callTool('respond_event', { eventId: 'event-no-self', responseStatus: 'accepted' }),
      /signed-in account is not present as a self attendee/
    );
    assert.equal(calls.length, 2, 'RSVP without a self attendee stops after the read and never patches someone else');
    assert.equal(calls.at(-1).opts.method, 'GET', 'failed self lookup performs no mutation');
    client.close();
  }

  for (const status of [401, 403, 429, 500]) {
    const client = makeMcpClient({ transport: makeGoogleTransport({ url: ENDPOINTS.gmail, token: 'TEST_TOKEN', fetchImpl: async () => new Response('sensitive echoed token', { status }) }), timeoutMs: 1000 });
    await assert.rejects(client.initialize(), e => e.message.includes('HTTP ' + status) && !e.message.includes('sensitive'));
    client.close();
  }
  let cleanupSignal;
  const failedCleanup = makeMcpClient({ transport: makeGoogleTransport({ url: ENDPOINTS.gmail, token: 't', fetchImpl: async (_, opts) => {
    cleanupSignal = opts.signal;
    return { ok: false, status: 401, body: { cancel() { throw new Error('private cleanup details'); } } };
  } }) });
  await assert.rejects(failedCleanup.initialize(), e => e.message.includes('HTTP 401') && !e.message.includes('private'));
  assert.equal(cleanupSignal.aborted, true, 'failed error-body cancellation aborts the request while preserving the API status');
  failedCleanup.close();
  const blocked = makeMcpClient({ timeoutMs: 1000, transport: makeGoogleTransport({ url: ENDPOINTS.gmail, token: 't', timeoutMs: 20, fetchImpl: () => new Promise(() => {}) }) });
  await assert.rejects(blocked.initialize(), /timed out/); blocked.close();
  const oversized = makeMcpClient({ timeoutMs: 1000, transport: makeGoogleTransport({ url: ENDPOINTS.gmail, token: 't', fetchImpl: async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)) }) });
  await assert.rejects(oversized.initialize(), /8 MiB/); oversized.close();
  const ui = fs.readFileSync(path.join(__dirname, '../frontend/app/windows/connectors.js'), 'utf8');
  assert.ok(!/data-cc-oclient|enroll in the preview|placeholder="client secret"/.test(ui));
  assert.ok(ui.includes('SIGN IN WITH GOOGLE'));
  const train = fs.readFileSync(path.join(__dirname, '../.github/workflows/release-train.yml'), 'utf8');
  assert.ok(train.includes('run: node scripts/stage-google-client.mjs\n'));
  assert.ok(!train.includes('stage-google-client.mjs --optional'));
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-google-stage-'));
  try {
    fs.mkdirSync(path.join(stageRoot, 'scripts'));
    fs.mkdirSync(path.join(stageRoot, 'sidecar/mcp'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../scripts/stage-google-client.mjs'), path.join(stageRoot, 'scripts/stage-google-client.mjs'));
    fs.copyFileSync(path.join(__dirname, '../sidecar/mcp/google-client.js'), path.join(stageRoot, 'sidecar/mcp/google-client.js'));
    const stage = (raw, optional = false) => spawnSync(process.execPath, [path.join(stageRoot, 'scripts/stage-google-client.mjs'), ...(optional ? ['--optional'] : [])], {
      encoding: 'utf8', env: { ...process.env, STARNET_GOOGLE_DESKTOP_CLIENT_JSON: raw, NODE_OPTIONS: '' }
    });
    assert.equal(stage('').status, 1, 'public builds refuse absent registration');
    assert.equal(stage(JSON.stringify({ web: installed.installed })).status, 1, 'web secrets never enter a desktop package');
    const malformed = stage('not-json-SENSITIVE-CANARY');
    assert.equal(malformed.status, 1); assert.ok(!malformed.stderr.includes('SENSITIVE-CANARY'));
    assert.equal(stage(JSON.stringify(installed)).status, 0);
    const staged = path.join(stageRoot, 'sidecar/mcp/google-client.json');
    assert.equal(JSON.parse(fs.readFileSync(staged, 'utf8')).installed.client_id, installed.installed.client_id);
    assert.equal(fs.statSync(staged).mode & 0o444, 0o444, 'installed native metadata remains readable across OS accounts');
    assert.equal(stage('', true).status, 0);
    assert.equal(fs.existsSync(staged), false, 'internal builds cannot inherit a stale registration');
  } finally { fs.rmSync(stageRoot, { recursive: true, force: true }); }
  console.log('google-connector: PASS (native registration, legacy routing, ' + exercised + ' real MCP tool paths, validation, API errors, timeout, bounds, customer UI, release gate)');
})().catch(e => { console.error(e); process.exitCode = 1; });
