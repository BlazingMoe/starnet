'use strict';
// Pure operator-evidence planner: no I/O, network, accounts or ambient clock.
const str=(maxLength=400)=>({type:'string',minLength:1,maxLength});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const choice=(...values)=>({type:'string',enum:values});
const integer=(maximum,minimum=1)=>({type:'integer',minimum,maximum});
const arr=(items,maxItems=20,minItems=1)=>({type:'array',items,maxItems,minItems});
const status=()=>choice('approved','rejected','unknown');
const record=obj({status:choice('observed','verified','assumption','unknown'),note:str(),receipt:str(),checkedAt:str(24),sourceUrl:str(500)});
const gates=['originality','accuracy','rights','disclosure','safety','finalEditorialApproval'];
const platforms=['youtube-long','youtube-short','instagram-reel','tiktok','facebook','linkedin','x'];
const schema=obj({campaignId:str(48),contentId:str(48),version:str(48),asOf:str(24),freshnessDays:integer(90),
brief:obj({audience:str(800),need:str(800),originalThesis:str(1200),editorialContribution:str(1200),valuePromise:str(800),nonGoals:str(800)}),
claims:arr(obj({id:str(48),text:str(1200),support:choice('supported','unsupported','unknown'),evidence:record}),30,0),
priorContent:obj({comparison:str(1200),repetitionRisk:choice('low','high','unknown'),evidence:record}),
script:arr(obj({id:str(48),text:str(2400),claimIds:arr(str(48),30,0)}),30),
shots:arr(obj({id:str(48),sectionId:str(48),assetIds:arr(str(48),20),description:str(1200),durationSeconds:integer(3600)}),40),
captions:obj({plan:str(1200),language:str(40),qc:status(),evidence:record}),
audio:obj({plan:str(1200),language:str(40),qc:status(),evidence:record}),
assets:arr(obj({id:str(48),ownership:choice('owned','licensed','unknown'),license:str(800),rights:status(),likeness:status(),privacy:status(),evidence:record})),
ai:obj({usage:choice('none','assisted','generated','unknown'),description:str(800),realistic:choice('yes','no','unknown'),meaningfullyAltered:choice('yes','no','unknown'),disclosure:choice('required','not-required','unknown'),disclosureText:str(800),evidence:record}),
variants:arr(obj({platform:choice(...platforms),title:str(200),copy:str(2400),cta:str(400),width:integer(30000),height:integer(30000),durationSeconds:integer(14400),captionNeeds:choice('required','unknown'),thumbnailNeeds:choice('required','not-required','unknown'),thumbnailPlan:str(800),spec:obj({platform:choice(...platforms),width:integer(30000),height:integer(30000),minDurationSeconds:integer(14400),maxDurationSeconds:integer(14400),titleMaxLength:integer(200),copyMaxLength:integer(2400),captionRequired:choice('yes','unknown'),thumbnailRequired:choice('yes','no','unknown'),evidence:record}),policyEvidence:record}),7,2),
review:obj(Object.fromEntries(gates.map(k=>[k,obj({decision:status(),evidence:record})]))),
metrics:obj({status:choice('planned'),hypothesis:str(1200),metricNames:arr(str(80),10),observationWindowDays:integer(365),successCriterion:str(800),measurementPlan:str(1200)})});
function validate(v, r, at = 'input') {
  const fail = () => { throw new Error('Invalid channel production field: ' + at); };
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
const boundary='PRIVATE PRODUCTION PLAN ONLY. All evidence is operator supplied, not independently researched or verified. Planned metrics are hypotheses, not actual analytics. No views, revenue, earnings or monetization guarantee. No render, upload, schedule, publish, notify, account, payment or other external action authority. Later upload requires separately authorized identity/scopes and remote-ID reconciliation. File-byte verification does not establish source truth, rights or editorial quality.';
function prepare(input){
 validate(input,schema);const now=time(input.asOf),gaps=[];
 const unknown=v=>v.trim().toLowerCase()==='unknown';
 const id=v=>{if(unknown(v)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(v))throw Error('Invalid identifier');};
 const evidence=(r,label)=>{url(r.sourceUrl);const t=time(r.checkedAt);if(t>now)throw Error('Evidence postdates asOf');if(!['observed','verified'].includes(r.status)||unknown(r.receipt)||unknown(r.note)||now-t>input.freshnessDays*86400000)gaps.push(label+': missing, unknown or stale evidence');};
 const unique=(items,key)=>{const seen=new Set();for(const a of items){id(a[key]);if(seen.has(a[key]))throw Error('Duplicate identifier or platform');seen.add(a[key]);}};
 for(const v of [input.campaignId,input.contentId,input.version])id(v);
 for(const key of ['claims','script','shots','assets'])unique(input[key],'id');unique(input.variants,'platform');
 const references=(values,items,label)=>{if(new Set(values).size!==values.length)throw Error('Duplicate reference');for(const v of values){id(v);if(!items.some(a=>a.id===v))throw Error('Unknown '+label+' reference');}};
 for(const [k,v] of Object.entries(input.brief))if(unknown(v))gaps.push(k+': editorial input unresolved');
 evidence(input.priorContent.evidence,'prior content');if(unknown(input.priorContent.comparison)||input.priorContent.repetitionRisk!=='low')gaps.push('Originality or repetitive-content risk unresolved');
 for(const c of input.claims){evidence(c.evidence,'claim '+c.id);if(c.support!=='supported'||unknown(c.text))gaps.push('Unsupported claim: '+c.id);}
 const scriptTexts=input.script.map(s=>s.text.trim().toLowerCase().replace(/\s+/g,' '));if(new Set(scriptTexts).size!==scriptTexts.length)gaps.push('Repetitive script sections require editorial revision');
 for(const s of input.script){references(s.claimIds,input.claims,'claim');if(unknown(s.text))gaps.push('Script unresolved: '+s.id);}
 for(const s of input.shots){references([s.sectionId],input.script,'section');references(s.assetIds,input.assets,'asset');if(unknown(s.description))gaps.push('Shot unresolved: '+s.id);}
 for(const a of input.assets){evidence(a.evidence,'asset '+a.id);if(a.ownership==='unknown'||unknown(a.license)||['rights','likeness','privacy'].some(k=>a[k]!=='approved'))gaps.push('Asset rights/likeness/privacy unresolved: '+a.id);}
 for(const k of ['captions','audio']){const p=input[k];evidence(p.evidence,k);if(p.qc!=='approved'||unknown(p.plan)||unknown(p.language))gaps.push(k+': plan/language/QC unresolved');}
 const ai=input.ai;evidence(ai.evidence,'AI disclosure');
 const needsDisclosure=[ai.usage,ai.realistic,ai.meaningfullyAltered].includes('unknown')?null:ai.usage!=='none'&&(ai.realistic==='yes'||ai.meaningfullyAltered==='yes');
 if(ai.usage==='unknown'||ai.realistic==='unknown'||ai.meaningfullyAltered==='unknown'||ai.disclosure==='unknown'||unknown(ai.description)||unknown(ai.disclosureText)||(needsDisclosure&&ai.disclosure!=='required')||(ai.usage==='none'&&(ai.realistic==='yes'||ai.meaningfullyAltered==='yes')))gaps.push('AI classification or disclosure unresolved');
 for(const p of ['youtube-long','youtube-short'])if(!input.variants.some(v=>v.platform===p))gaps.push('Missing required variant: '+p);
 const shotDuration=input.shots.reduce((total,s)=>total+s.durationSeconds,0);
 for(const v of input.variants){const s=v.spec;evidence(s.evidence,v.platform+' specification');evidence(v.policyEvidence,v.platform+' policy');if(s.minDurationSeconds>s.maxDurationSeconds)throw Error('Invalid specification duration range');if(s.platform!==v.platform||v.width!==s.width||v.height!==s.height||v.durationSeconds<s.minDurationSeconds||v.durationSeconds>s.maxDurationSeconds||v.durationSeconds>shotDuration||v.title.length>s.titleMaxLength||v.copy.length>s.copyMaxLength||v.captionNeeds!=='required'||s.captionRequired!=='yes'||s.thumbnailRequired==='unknown'||v.thumbnailNeeds==='unknown'||(s.thumbnailRequired==='yes'&&v.thumbnailNeeds!=='required')||['title','copy','cta','thumbnailPlan'].some(k=>unknown(v[k])))gaps.push('Variant/specification mismatch or unresolved needs: '+v.platform);}
 for(const k of gates){evidence(input.review[k].evidence,k);if(input.review[k].decision!=='approved')gaps.push(k+': human approval unresolved');}
 if(new Set(input.metrics.metricNames.map(v=>v.trim().toLowerCase())).size!==input.metrics.metricNames.length)throw Error('Duplicate metric name');
 if(input.metrics.metricNames.some(unknown)||['hypothesis','successCriterion','measurementPlan'].some(k=>unknown(input.metrics[k])))gaps.push('Measurement hypothesis unresolved');
 const state=gaps.length?'NOT_READY':'READY_FOR_PRIVATE_PRODUCTION';const json=v=>JSON.stringify(v,null,2)+'\n';const md=v=>boundary+'\n\n'+quote(JSON.stringify(v))+'\n';
 const identity={campaignId:input.campaignId,contentId:input.contentId,version:input.version,asOf:input.asOf,freshnessDays:input.freshnessDays};
 return {state,gaps,files:{'content-brief.md':md({identity,brief:input.brief,claims:input.claims,priorContent:input.priorContent}),'script-and-shots.md':md({script:input.script,shots:input.shots,captions:input.captions,audio:input.audio}),'rights-and-disclosure.json':json({boundary,identity,assets:input.assets,ai:input.ai,needsDisclosure,review:input.review}),'channel-variants.json':json({boundary,identity,variants:input.variants}),'readiness-and-metrics.md':md({identity,state,gaps,review:input.review,metrics:input.metrics})}};
}
const tool={name:'channel.content.prepare',capability:'cabinet',scope:'read',requiresConsent:false,timeoutMs:5000,schema,description:'Pure private cross-channel production planner. Five fixed review files from bounded dated operator evidence; no research, render or external action authority.',run:async args=>({content:JSON.stringify(prepare(args)),summary:'Private production plan prepared; no files written or external action'})};
module.exports={prepare,schema,gates,platforms,makeChannelContentTools:()=>({register(reg){reg.register(tool);return reg;}})};
