'use strict';
const { makeVideoRenderTransaction } = require('../../video-render-transaction');
const operations = ['prepare', 'submit', 'reconcile', 'finalize'];
const caveat = 'Stage sandbox only. No upload, schedule or channel publication. Shotstack temporary output URLs are publicly downloadable; private means a local production workflow, not provider access control. Lost submission responses require review and are never resubmitted.';
function makeVideoRenderTools(deps = {}) {
  const tools = operations.map(operation => ({
    name: 'channel.render.' + operation, capability: 'cabinet', scope: 'write', requiresConsent: true, timeoutMs: 45000,
    description: ({ prepare: 'Freeze a bounded render intent (id, environment=stage, deadline epoch milliseconds, path ending .mp4, gates rights/disclosure/quality booleans, known costMicros and budgetMicros, edit timeline/output).', submit: 'Submit a previously prepared intent once; never retries network mutation.', reconcile: 'Perform one bounded status poll using the persisted provider ID; no submission.', finalize: 'Download the exact verified stage result and save an atomic byte-verified local MP4 artifact.' })[operation] + ' ' + caveat,
    schema: operation === 'prepare'
      ? { type: 'object', required: ['intent'], additionalProperties: false, properties: { intent: { type: 'object' } } }
      : { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$' } } },
    async run(args, ctx) {
      if (!ctx || !ctx.agentId || typeof ctx.consent !== 'function') throw Error('Explicit host consent unavailable');
      if (typeof deps.service !== 'function') throw Error('Shotstack stage rendering is not configured');
      const authorize = async intent => {
        const consent = await ctx.consent({ name: 'channel.render.' + operation, args: { intent }, argsRaw: JSON.stringify({ intent }) }, { name: 'channel.render.' + operation, capability: 'cabinet', scope: 'write', requiresConsent: true, description: caveat });
        return !!consent && consent.allow === true;
      };
      const service = makeVideoRenderTransaction({ ...deps.service(ctx), authorize });
      const result = operation === 'prepare' ? await service.prepare(args.intent)
        : operation === 'finalize' ? await service.finalize(args.id, { ...ctx, videoArtifactConsent: true }) : await service[operation](args.id);
      // A provider URL is never itself an artifact. Only the committed writer receipt crosses this seam.
      return { content: JSON.stringify(result), summary: 'Private stage render: ' + result.state,
        ...(result.state === 'verified' ? { mutationReceipt: result.mutationReceipt } : {}) };
    }
  }));
  return { tools, register(reg) { tools.forEach(tool => reg.register(tool)); return reg; } };
}
module.exports = { makeVideoRenderTools, operations };
