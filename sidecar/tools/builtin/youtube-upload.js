'use strict';
const { makeYoutubeUploadTransaction } = require('../../youtube-upload-transaction');
const operations = ['prepare', 'initiate', 'status', 'upload', 'verify'];
function makeYoutubeUploadTools(deps = {}) {
  const tools = operations.map(operation => ({
    name: 'channel.youtube.' + operation, capability: 'cabinet', scope: 'write', requiresConsent: true, timeoutMs: 45000,
    network: operation !== 'prepare', impact: operation === 'prepare' ? 'none' : ['initiate', 'upload'].includes(operation) ? 'external-unknown' : 'external-credentialed',
    description: 'Explicit private YouTube upload step: ' + operation + '. Requires a verified render receipt, exact account/channel, private status, explicit made-for-kids and synthetic declarations, rights/editorial/quality/humanReview/disclosure gates. No publication or scheduling. Ambiguous initiation requires operator review. After ambiguous byte transfer call status before upload. Session capabilities never leave host storage.',
    schema: { type: 'object', additionalProperties: false, required: [operation === 'prepare' ? 'intent' : 'id'], properties: operation === 'prepare' ? { intent: { type: 'object' } } : { id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$' } } },
    async run(args, ctx) {
      if (!ctx?.agentId || typeof ctx.consent !== 'function' || typeof deps.service !== 'function') throw Error('Host upload service and consent required');
      const authorize = async intent => {
        const c = await ctx.consent({ name: 'channel.youtube.' + operation, args: { intent }, argsRaw: JSON.stringify({ intent }) }, { name: 'channel.youtube.' + operation, capability: 'cabinet', scope: 'write', requiresConsent: true });
        return c?.allow === true;
      };
      const svc = makeYoutubeUploadTransaction({ ...deps.service(ctx), authorize, signal: ctx.signal });
      const result = await svc[operation](operation === 'prepare' ? args.intent : args.id);
      return { content: JSON.stringify(result), summary: 'Private YouTube upload: ' + result.state };
    }
  }));
  return { tools, register(reg) { tools.forEach(t => reg.register(t)); return reg; } };
}
module.exports = { makeYoutubeUploadTools, operations };
