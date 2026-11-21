'use strict';
// Pure private operator-evidence handoff: no I/O, network or ambient clock.
const str=(maxLength=400)=>({type:'string',minLength:1,maxLength});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const choice=(...values)=>({type:'string',enum:values});
const integer=(maximum,minimum=0)=>({type:'integer',minimum,maximum});
const money={...str(18),pattern:'^(unknown|0|[1-9][0-9]{0,17})$'};
const arr=(items,maxItems=20,minItems=1)=>({type:'array',items,maxItems,minItems});
const status=()=>choice('approved','rejected','unknown');
const record=obj({status:choice('observed','verified','assumption','unknown'),note:str(),receipt:str(),checkedAt:str(24),sourceUrl:str(500)});
const gates=['originality','meaningfulHumanRefinement','customerCustomization','rights','likeness','privacy','noDeception','quality','policy','fees','humanFinalApproval'];
const costs=['fee','generation','labor','other','refund','tax'];
const schema=obj({serviceId:str(48),version:str(48),asOf:str(24),freshnessDays:integer(90,1),title:str(140),scope:str(1200),exclusions:str(800),revisionCap:integer(20),revisionsUsed:integer(100),dueAt:str(24),buyerAiPreference:choice('allowed','prohibited','unknown'),aiUse:choice('none','assisted','unknown'),humanRefinementPlan:str(800),customizationPlan:str(800),
assets:arr(obj({id:str(48),license:str(),permission:status(),likeness:status(),privacy:status(),evidence:record})),
deliverables:arr(obj({id:str(48),width:integer(30000,1),height:integer(30000,1),format:choice('png','jpg','webp'),text:str(800),alpha:choice('required','not-required','unknown'),productFidelity:status(),license:status()})),
order:obj({id:str(48),priorDelivery:choice('none','delivered','ambiguous','unknown'),retry:choice('no','requested','unknown'),reconciliation:choice('confirmed-no-delivery','delivered','unresolved','unknown'),evidence:record}),
finals:arr(obj({deliverableId:str(48),version:str(48),fileName:str(100),bytes:integer(1000000000,1),sha256:{...str(64),pattern:'^[a-f0-9]{64}$'},width:integer(30000,1),height:integer(30000,1),format:choice('png','jpg','webp'),text:status(),alpha:choice('present','absent','unknown'),productFidelity:status(),license:status(),approval:status(),proof:record})),
deliveryState:choice('not-sent','sent','ambiguous','unknown'),supportState:choice('plan-ready','unresolved','unknown'),
review:obj(Object.fromEntries(gates.map(k=>[k,obj({decision:status(),evidence:record})]))),policySnapshot:record,feeSnapshot:record,
economics:obj({currency:choice('EUR','USD','GBP'),feeCurrency:choice('EUR','USD','GBP'),costCurrency:choice('EUR','USD','GBP'),grossMinor:money,costsMinor:obj(Object.fromEntries(costs.map(k=>[k,money]))),minutes:integer(100000),evidence:record})});
function validate(v, r, at = 'input') {
  const fail = () => { throw new Error('Invalid Fiverr handoff field: ' + at); };
  if (Array.isArray(r.type)) { if (v === null) return; r = { ...r, type: r.type[0] }; }
  if (r.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail();
    if (Object.keys(v).some(k => !Object.hasOwn(r.properties, k)) || r.required.some(k => !Object.hasOwn(v, k))) fail();
    for (const [k, s] of Object.entries(r.properties)) validate(v[k], s, at + '.' + k);
  } else if (r.type === 'array') {
    if (!Array.isArray(v) || v.length < r.minItems || v.length > r.maxItems) fail();
    for (let i = 0; i < v.length; i++) validate(v[i], r.items, at + '[' + i + ']');
  } else if (r.type === 'integer') {
    if (!Number.isSafeInteger(v) || v < r.minimum || v > r.maximum) fail();
  } else if (typeof v !== 'string' || !v.trim() || (r.maxLength && v.length > r.maxLength) || (r.enum && !r.enum.includes(v)) || (r.pattern && !new RegExp(r.pattern).test(v)) || /[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/u.test(v)) fail();
}
function time(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) throw new Error('Invalid canonical UTC timestamp');
  return Date.parse(v);
}
function url(v) {
  let u; try { u = new URL(v); } catch { throw new Error('Invalid source URL'); }
  if (!/^https:\/\//.test(v) || u.username || u.password || /[\s\\]/.test(v)) throw new Error('Invalid source URL');
}
const quote = v => '> ' + String(v).replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
const boundary='PRIVATE HUMAN HANDOFF ONLY. Evidence is operator supplied, not independently verified. No earnings or profit guarantee. No paid-generation entitlement assumption. No sending, delivery, publication, order, spending or payment authority. No bots, scraping, mass or promotional messages. File-byte verification does not establish rights or finished-file quality.';
function prepare(input){
 validate(input,schema);const now=time(input.asOf),gaps=[];
 const id=v=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(v))throw Error('Invalid identifier');};
 const evidence=(r,label)=>{url(r.sourceUrl);const t=time(r.checkedAt);if(t>now)throw Error('Evidence postdates asOf');if(!['verified','observed'].includes(r.status)||r.receipt==='unknown'||now-t>input.freshnessDays*86400000)gaps.push(label+': unresolved or stale evidence');};
 id(input.serviceId);id(input.version);id(input.order.id);if(time(input.dueAt)<now)gaps.push('Due date passed');
 evidence(input.policySnapshot,'policy');evidence(input.feeSnapshot,'fees');evidence(input.order.evidence,'order');evidence(input.economics.evidence,'economics');
 for(const k of gates){evidence(input.review[k].evidence,k);if(input.review[k].decision!=='approved')gaps.push(k+': approval unresolved');}
 if(input.buyerAiPreference==='unknown'||input.aiUse==='unknown'||(input.buyerAiPreference==='prohibited'&&input.aiUse!=='none'))gaps.push('Buyer AI preference conflict or unknown');
 if(input.humanRefinementPlan==='unknown'||input.customizationPlan==='unknown')gaps.push('Human refinement/customization unresolved');
 const unique=(items,key)=>{const seen=new Set();for(const a of items){id(a[key]);if(seen.has(a[key]))throw Error('Duplicate identifier');seen.add(a[key]);}};
 unique(input.assets,'id');unique(input.deliverables,'id');unique(input.finals,'deliverableId');
 for(const a of input.assets){evidence(a.evidence,'asset '+a.id);if(a.license==='unknown'||['permission','likeness','privacy'].some(k=>a[k]!=='approved'))gaps.push('Asset rights/likeness/privacy unresolved: '+a.id);}
 if(input.revisionsUsed>input.revisionCap)gaps.push('Revision cap exceeded');
 if(input.order.priorDelivery!=='none'||input.order.reconciliation!=='confirmed-no-delivery'||input.order.retry==='unknown'||input.deliveryState!=='not-sent')gaps.push('Duplicate or ambiguous delivery: freeze handoff and reconcile');
 if(input.supportState!=='plan-ready')gaps.push('Support plan unresolved');
 const finalNames=new Set();
 for(const f of input.finals){id(f.version);if(finalNames.has(f.fileName.toLowerCase()))throw Error('Duplicate final file name');finalNames.add(f.fileName.toLowerCase());if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.(png|jpg|webp)$/.test(f.fileName)||!f.fileName.endsWith('.'+f.format))throw Error('Invalid final file name');if(!input.deliverables.some(d=>d.id===f.deliverableId))throw Error('Unexpected final');evidence(f.proof,'finished file '+f.deliverableId);}
 for(const d of input.deliverables){const f=input.finals.find(f=>f.deliverableId===d.id);if(d.alpha==='unknown'||d.productFidelity!=='approved'||d.license!=='approved'||d.text==='unknown'||!f||f.width!==d.width||f.height!==d.height||f.format!==d.format||['text','productFidelity','license','approval'].some(k=>f[k]!=='approved')||(d.alpha==='required'&&(f.alpha!=='present'||f.format==='jpg'))||f.alpha==='unknown')gaps.push('Incomplete or mismatched final deliverable: '+d.id);}
 const e=input.economics;let payoutMinor=null,contributionMinor=null,hourlyContributionMinor=null;
 if(e.currency!==e.feeCurrency||e.currency!==e.costCurrency)throw Error('Currency mismatch');
 if(e.grossMinor==='unknown'||costs.some(k=>e.costsMinor[k]==='unknown'))gaps.push('Economics unknown');else{const gross=BigInt(e.grossMinor),fee=BigInt(e.costsMinor.fee),total=costs.reduce((n,k)=>n+BigInt(e.costsMinor[k]),0n);payoutMinor=(gross-fee).toString();contributionMinor=(gross-total).toString();if(e.minutes>0)hourlyContributionMinor=((gross-total)*60n/BigInt(e.minutes)).toString();if(gross-total<=0n)gaps.push('Non-positive supplied contribution');}
 if(e.minutes===0)gaps.push('Time assumption unresolved: zero minutes');
 const economics={...e,payoutMinor,contributionMinor,hourlyContributionMinor,rounding:'Exact BigInt minor units; hourly quotient truncates toward zero. Supplied fee only; payout is not net profit.',boundary};
 const state=gaps.length?'NOT_READY':'READY_FOR_HUMAN_HANDOFF';const json=v=>JSON.stringify(v,null,2)+'\n';const md=v=>boundary+'\n\n'+quote(JSON.stringify(v))+'\n';
 return {state,gaps,economics,files:{'gig-draft.md':md({serviceId:input.serviceId,version:input.version,title:input.title,scope:input.scope,exclusions:input.exclusions,revisionCap:input.revisionCap}),'client-intake.json':json({boundary,buyerAiPreference:input.buyerAiPreference,aiUse:input.aiUse,assets:input.assets,deliverables:input.deliverables,humanRefinementPlan:input.humanRefinementPlan,customizationPlan:input.customizationPlan}),'order-workspace.json':json({boundary,state,gaps,order:input.order,dueAt:input.dueAt,revisionsUsed:input.revisionsUsed,deliveryState:input.deliveryState,supportState:input.supportState}),'delivery-manifest.md':md({state,gaps,finals:input.finals}),'economics-and-review.json':json({state,gaps,economics,review:input.review,policySnapshot:input.policySnapshot,feeSnapshot:input.feeSnapshot})}};
}
const tool={name:'fiverr.handoff.prepare',capability:'cabinet',scope:'read',requiresConsent:false,timeoutMs:5000,schema,description:'Pure private Fiverr image-service manual handoff. Five fixed review files from bounded dated operator evidence; no external action or delivery authority.',run:async args=>({content:JSON.stringify(prepare(args)),summary:'Private human handoff prepared; no files written or external action'})};
module.exports={prepare,schema,gates,costs,makeFiverrHandoffTools:()=>({register(reg){reg.register(tool);return reg;}})};
