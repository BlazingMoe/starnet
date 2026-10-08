/* node test/fs.jail.test.js — the fs.* tools' path jail (the security spine) + a real
   write→read→list roundtrip + the size cap + the deliverable emit. Uses a real temp dir
   so the jail is proven against the actual filesystem, including Windows-specific inputs. */
'use strict';
const A = require('./_assert.js');
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');

const ROOT = path.join(os.tmpdir(), 'starnet-fs-test-' + process.pid);
const { writeTool, readTool, profileCsvTool, listTool, appendTool, editTool, searchTool, _internals } = makeFsTools({ fsp, pathMod: path, root: ROOT, limits: { writeBytes: 32, readReturn: 1000 } });

async function rejects(promise, msg) { try { await promise; A.ok(false, msg + ' — did NOT reject'); } catch (e) { A.ok(true, msg); } }

(async () => {
  // ---- path jail: every escape attempt is rejected before any I/O ----
  for (const bad of ['../secret', '../../etc/passwd', 'a/../../b', '..\\win', 'sub/../../up', '/abs/unix', 'C:\\windows\\x', '\\\\server\\share']) {
    await rejects(_internals.resolveInside('ag', bad), 'rejects escape: ' + bad);
  }
  // a legitimate nested path is allowed and lands inside the workspace
  {
    const { abs, base } = await _internals.resolveInside('ag', 'reports/q3.md');
    A.ok(abs.indexOf(base + path.sep) === 0, 'legit nested path stays inside the jail');
  }
  // a bad agentId is rejected (no path traversal via the agent segment)
  await rejects(_internals.resolveInside('../evil', 'x.txt'), 'rejects path-traversal agentId');
  // symlink/junction-style escapes: the string path stays under the jail, but the real target does not.
  {
    const outside = path.join(os.tmpdir(), 'starnet-fs-outside-' + process.pid);
    try {
      await fsp.mkdir(path.join(ROOT, 'ag'), { recursive: true });
      await fsp.mkdir(outside, { recursive: true });
      await fsp.writeFile(path.join(outside, 'pwn.txt'), 'nope');
      await fsp.symlink(outside, path.join(ROOT, 'ag', 'link'), 'dir');
      await rejects(_internals.resolveInside('ag', 'link/pwn.txt'), 'rejects symlink escape to an outside directory');
    } catch (e) {
      A.ok(true, 'symlink escape regression skipped because this filesystem disallows symlinks');
    } finally {
      try { fs.rmSync(outside, { recursive: true, force: true }); } catch (e) {}
    }
  }

  // ---- write -> read -> list roundtrip (real disk) ----
  {
    const captured = [];
    const ctx = { agentId: 'ag', room: 'office', emit: (name, p) => captured.push({ name, p }) };
    const w = await writeTool.run({ path: 'note.md', content: 'hello world' }, ctx);
    A.ok(/wrote note\.md/.test(w.summary), 'write summary');
    A.eq(w.mutationReceipt.state, 'read-back-verified', 'write success is backed by an exact read-back receipt');
    A.eq(w.mutationReceipt.verifiedBytes, 11, 'write receipt reports the verified byte count');
    A.ok(/^[a-f0-9]{64}$/.test(w.mutationReceipt.sha256), 'write receipt carries the intended byte digest');
    const dl = captured.find(c => c.name === 'deliverable');
    A.ok(dl && dl.p.kind === 'file' && dl.p.title === 'note.md' && dl.p.room === 'office', 'write emits a deliverable');

    const r = await readTool.run({ path: 'note.md' }, ctx);
    A.eq(r.content, 'hello world', 'read returns what was written');

    await writeTool.run({ path: 'sub/deep.txt', content: 'x' }, ctx);
    const ls = await listTool.run({}, ctx);
    A.ok(ls.content.indexOf('note.md') >= 0 && ls.content.indexOf('sub') >= 0, 'list shows files + subdir');
  }

  // ---- bounded CSV profiling through the registered read-only file tool ----
  {
    const csvRoot = path.join(ROOT, 'csv-agent');
    await fsp.mkdir(csvRoot, { recursive:true });
    const raw = '\uFEFFname,amount,note,formula,,name\r\nAlice,2,"say ""hi"", ok","=1+1",,dup\r\nBob,,"line one\r\nline two",=SUM(A1:A2),,dup\r\n';
    await fsp.writeFile(path.join(csvRoot,'report-secret.csv'),raw,'utf8');
    const profiled = makeFsTools({ fsp, pathMod:path, root:ROOT, redact:s=>String(s).replace(/secret/g,'[redacted]') });
    const reg = makeRegistry(); profiled.register(reg);
    const tool = reg.get('fs.profile_csv');
    A.ok(tool && tool.scope==='read' && tool.requiresConsent===false && tool.readOnly===true,'CSV profiler is registered as an ordinary read-only cabinet tool');
    const dispatch = async (args,agentId='csv-agent') => reg.dispatch({id:'csv-profile',name:'fs.profile_csv',args,argsRaw:JSON.stringify(args),parseError:null},{agentId});
    let result = await dispatch({path:'report-secret.csv'});
    A.ok(result.ok,'registered profile_csv runs through scoped file dispatch');
    let report = JSON.parse(result.content);
    A.eq(report.status,'complete','quoted CRLF CSV reports complete'); A.eq(report.assumptions,{delimiter:',',hasHeader:true},'default parser assumptions are explicit');
    A.eq(report.rows.data,2,'quoted newline remains within one logical record'); A.eq(report.rows.rowWidthMismatches,0,'well-formed uniform rows have no width mismatch');
    A.eq(report.columns.length,6,'BOM, duplicate and empty headers preserve column positions');
    A.eq(report.columns[0].name,'name','first header retained'); A.eq(report.columns[4].name,'column_5','empty header gets positional label'); A.eq(report.columns[5].name,'name [2]','duplicate header is disambiguated');
    A.eq(report.columns[1].numeric,{count:1,min:2,max:2,mean:2},'numeric summaries use finite data values only'); A.eq(report.columns[1].missing,1,'empty field counted missing, never converted to zero');
    A.eq(report.columns[3].formulaLike,2,'formula-like cells are counted as text and never executed');
    A.ok(report.source.path.includes('[redacted]'),'source path passes through existing redaction');    const stalePath=path.join(csvRoot,'stale.csv'); await fsp.writeFile(stalePath,'a,b\n1,2\n','utf8');
    await profiled.readTool.run({path:'stale.csv'},{agentId:'csv-agent'});
    await fsp.writeFile(stalePath,'a,b\n3,4\n','utf8');
    const future1=new Date(Date.now()+5000); await fsp.utimes(stalePath,future1,future1);
    let staleWriteError=null; try { await profiled.writeTool.run({path:'stale.csv',content:'replacement'},{agentId:'csv-agent'}); } catch(e) { staleWriteError=e; }
    A.ok(staleWriteError && /stale write refused/.test(staleWriteError.message),'first changed-file write consumes the fs.read freshness stamp');
    await profiled.profileCsvTool.run({path:'stale.csv'},{agentId:'csv-agent'});
    await fsp.writeFile(stalePath,'a,b\n5,6\n','utf8');
    const future2=new Date(Date.now()+10000); await fsp.utimes(stalePath,future2,future2);
    const afterProfileWrite=await profiled.writeTool.run({path:'stale.csv',content:'fresh replacement'},{agentId:'csv-agent'});
    A.eq(afterProfileWrite.receipt.state,'read-back-verified','aggregate profiling does not rearm the fs.read freshness stamp');
    A.ok(!result.content.includes('say "hi"') && !result.content.includes('line one'),'profile output does not expose data rows');

    await fsp.writeFile(path.join(csvRoot,'semicolon.csv'),'a;b\n1;2\n3;4\n','utf8');
    result=await dispatch({path:'semicolon.csv',delimiter:';',hasHeader:false}); report=JSON.parse(result.content);
    A.eq(report.assumptions,{delimiter:';',hasHeader:false},'explicit non-default delimiter/header choice is echoed'); A.eq(report.rows.data,3,'headerless semicolon data counts every row');
    A.eq(report.columns[0].numeric.count,2,'headerless column numeric count is accurate');
    await fsp.writeFile(path.join(csvRoot,'tab.tsv'),'left\tright\n1\t2\n','utf8');
    result=await dispatch({path:'tab.tsv',delimiter:'\t'}); report=JSON.parse(result.content);
    A.eq(report.columns.length,2,'explicit tab delimiter produces two columns');
    await fsp.writeFile(path.join(csvRoot,'strict.csv'),'date,hex,overflow\n2025-01-01,0x10,1e9999\n','utf8');
    result=await dispatch({path:'strict.csv'}); report=JSON.parse(result.content);
    A.eq(report.columns.map(c=>c.numeric),[null,null,null],'dates, hex and non-finite numbers are not misreported as numeric summaries');
    await fsp.writeFile(path.join(csvRoot,'ragged.csv'),'a,b\n1\n2,3,extra\n','utf8');
    result=await dispatch({path:'ragged.csv'}); report=JSON.parse(result.content);
    A.eq(report.rows.rowWidthMismatches,2,'row width anomalies are explicit'); A.eq(report.columns.length,3,'extra cells retain their positional column');    A.eq(report.columns[2].missing+report.columns[2].nonMissing,report.rows.data,'new ragged column counts sum to all rows');
    A.eq(report.columns[2].missing,1,'new column is structurally missing from preceding shorter row');
    for(const c of report.columns) A.eq(c.types.number+c.types.boolean+c.types.string,c.nonMissing,'type counts sum to observed nonmissing cells');
    await fsp.writeFile(path.join(csvRoot,'unsafe-int.csv'),'n\n9007199254740993\n','utf8');
    result=await dispatch({path:'unsafe-int.csv'}); report=JSON.parse(result.content);
    A.ok(/IEEE-754 binary64/.test(report.numericSemantics) && /rounded/.test(report.numericSemantics),'numeric summaries disclose binary64 approximation and unsafe integer rounding');
    A.eq(report.columns[0].numeric.min,9007199254740992,'unsafe integer example exposes the actual rounded binary64 summary');

    await fsp.writeFile(path.join(csvRoot,'utf-boundary.csv'),'h1,h2\n'+'x,'.repeat(0)+'a,'.concat('q'.repeat(65527),'€','\n'),'utf8');
    result=await dispatch({path:'utf-boundary.csv'}); report=JSON.parse(result.content);
    A.eq(report.status,'complete','UTF-8 character split across stream chunks parses correctly'); A.eq(report.rows.data,1,'UTF-8 boundary does not fabricate a row');

    await fsp.writeFile(path.join(csvRoot,'malformed.csv'),'h1,h2\n1,"SECRET_RAW_VALUE','utf8');
    result=await dispatch({path:'malformed.csv'}); A.ok(!result.ok && /malformed CSV input/.test(result.content) && !result.content.includes('SECRET_RAW_VALUE'),'malformed quoted field is rejected with category-only error, never raw row data');


    await fsp.writeFile(path.join(csvRoot,'many.csv'),'h,v\n'+Array.from({length:700},(_,i)=>i+',1').join('\n')+'\n','utf8');
    result=await dispatch({path:'many.csv',maxBytes:1024}); report=JSON.parse(result.content);
    A.eq(report.status,'partial','byte budget is disclosed as partial'); A.eq(report.source.bytesRead,1024,'byte scan stops at the requested bound'); A.eq(report.limits.byteLimitReached,true,'byte bound is reported'); A.ok(report.rows.data<700,'incomplete trailing record is not counted');
    result=await dispatch({path:'many.csv',maxRows:1}); report=JSON.parse(result.content);
    A.eq(report.status,'partial','row budget is disclosed as partial'); A.eq(report.rows.data,1,'row limit counts only completed data rows'); A.eq(report.limits.rowLimitReached,true,'row bound is reported');

    const exact='a\n'.repeat(512); A.eq(Buffer.byteLength(exact),1024,'exact-boundary fixture size');
    await fsp.writeFile(path.join(csvRoot,'exact.csv'),exact,'utf8');
    result=await dispatch({path:'exact.csv',hasHeader:false,maxBytes:1024}); report=JSON.parse(result.content);
    A.eq(report.status,'complete','exact EOF at byte boundary is complete'); A.eq(report.rows.data,512,'exact boundary retains final complete row'); A.eq(report.limits.byteLimitReached,true,'exact boundary still discloses the byte cap');
    result=await dispatch({path:'../outside.csv'}); A.ok(!result.ok,'registered profiler cannot escape workspace');
  }
  // ---- size cap rejects oversize writes ----
  await rejects(writeTool.run({ path: 'big.txt', content: 'x'.repeat(64) }, { agentId: 'ag' }), 'oversize write rejected by cap');

  // ---- reading a missing file is a clean error (not a crash) ----
  await rejects(readTool.run({ path: 'nope.md' }, { agentId: 'ag' }), 'missing file -> clean error');

  // ---- large durable text can be recovered in exact ranges without rerunning its producer ----
  {
    const large = 'A'.repeat(1000) + 'MIDDLE' + 'Z'.repeat(1200);
    const dir = path.join(ROOT, 'paged');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'large.txt'), large, 'utf8');
    const p0 = await readTool.run({ path: 'large.txt', offset: 0, limit: 1000 }, { agentId: 'paged' });
    const p1 = await readTool.run({ path: 'large.txt', offset: 1000, limit: 1000 }, { agentId: 'paged' });
    const p2 = await readTool.run({ path: 'large.txt', offset: 2000, limit: 1000 }, { agentId: 'paged' });
    const payload = r => r.content.split('\n[showing characters ')[0];
    A.eq(payload(p0) + payload(p1) + payload(p2), large, 'paged fs.read reconstructs every original character exactly once');
    A.ok(/"offset":1000,"limit":1000/.test(p0.content), 'the truncation receipt gives the exact next read call');
    A.ok(/end of file/.test(p2.content), 'the final page states the durable output is exhausted');
    const beyond = await readTool.run({ path: 'large.txt', offset: large.length + 50, limit: 1000 }, { agentId: 'paged' });
    A.ok(new RegExp('characters ' + large.length + '-' + large.length + ' of ' + large.length).test(beyond.content), 'a continuation beyond EOF clamps to an honest empty terminal range');
  }

  // ---- one agent cannot read another agent's workspace via the path ----
  await rejects(readTool.run({ path: '../other/note.md' }, { agentId: 'ag' }), 'cannot escape to a sibling agent workspace');

  // ---- a blessed project session makes relative paths project-native without weakening the jail ----
  {
    const project = path.join(os.tmpdir(), 'starnet-fs-project-' + process.pid);
    await fsp.mkdir(project, { recursive: true });
    await fsp.writeFile(path.join(project, 'incident.log'), 'PROJECT_LOG', 'utf8');
    await fsp.writeFile(path.join(project,'data.csv'),'amount\n2\n','utf8');
    const guarded = [];
    const guard = async (abs, o) => {
      guarded.push({ abs, scope: o.scope });
      if (!_internals.pathInside(abs, project)) throw new Error('not blessed');
      return { base: project, abs };
    };
    const PT = makeFsTools({ fsp, pathMod: path, root: ROOT, pathTrust: guard, limits: { writeBytes: 64, readReturn: 1000 } });
    const ctx = { agentId: 'project-agent', projectRoot: project };
    A.eq((await PT.readTool.run({ path: 'incident.log' }, ctx)).content, 'PROJECT_LOG', 'project-scoped fs.read resolves a relative path at projectRoot');
    const projectProfile=await PT.profileCsvTool.run({path:'data.csv'},ctx); A.eq(JSON.parse(projectProfile.content).rows.data,1,'CSV profile uses the same blessed project-relative read scope');
    await PT.writeTool.run({ path: 'fix.txt', content: 'PROJECT_FIX' }, ctx);
    A.eq(await fsp.readFile(path.join(project, 'fix.txt'), 'utf8'), 'PROJECT_FIX', 'project-scoped fs.write lands in projectRoot');
    A.ok(!fs.existsSync(path.join(ROOT, 'project-agent', 'fix.txt')), 'project write does not silently land in the private workspace');
    A.ok(guarded.some(x => x.scope === 'read') && guarded.some(x => x.scope === 'write'), 'project-relative reads and writes still pass through path trust');
    await rejects(PT.readTool.run({ path: '../outside.txt' }, ctx), 'project-relative traversal remains illegal');
    const unscoped = await PT._internals.resolveInside('project-agent', 'plain.txt', { scope: 'read', ctx: { agentId: 'project-agent' } });
    A.ok(unscoped.abs.indexOf(path.join(ROOT, 'project-agent')) === 0, 'an unscoped session keeps the historic private-workspace root');
    try { fs.rmSync(project, { recursive: true, force: true }); } catch (_) {}
  }

  // ---- fs.append: creates then adds without clobbering; respects the combined-size cap ----
  {
    const ctx = { agentId: 'ag2' };
    await appendTool.run({ path: 'log.txt', content: 'a' }, ctx);
    const appended = await appendTool.run({ path: 'log.txt', content: 'b' }, ctx);
    A.eq(appended.mutationReceipt.state, 'read-back-verified', 'append is not reported successful until combined bytes are reread');
    A.eq((await readTool.run({ path: 'log.txt' }, ctx)).content, 'ab', 'append creates then adds without clobbering');
    await rejects(appendTool.run({ path: 'log.txt', content: 'x'.repeat(64) }, ctx), 'append respects the combined-size cap');
  }
  // ---- fs.edit: exact replace + replacement count; errors when find is absent ----
  {
    const ctx = { agentId: 'ag3' };
    await writeTool.run({ path: 'e.txt', content: 'foo bar' }, ctx);
    const e = await editTool.run({ path: 'e.txt', find: 'foo', replace: 'baz' }, ctx);
    A.ok(/1 replacement/.test(e.content), 'edit reports the replacement count');
    A.eq(e.mutationReceipt.state, 'read-back-verified', 'edit carries a verified mutation receipt');
    A.eq((await readTool.run({ path: 'e.txt' }, ctx)).content, 'baz bar', 'edit applied to disk');
    await rejects(editTool.run({ path: 'e.txt', find: 'nope', replace: 'x' }, ctx), 'edit errors when "find" is absent');
  }
  // ---- fs.list recursive: nested tree with dir markers ----
  {
    const ctx = { agentId: 'ag4' };
    await writeTool.run({ path: 'a.txt', content: '1' }, ctx);
    await writeTool.run({ path: 'sub/b.txt', content: '2' }, ctx);
    const tree = await listTool.run({ recursive: true }, ctx);
    A.ok(tree.content.indexOf('sub/') >= 0 && tree.content.indexOf('sub/b.txt') >= 0, 'recursive list shows the nested tree');
  }

  // ---- two concurrent agents writing the SAME relative path do NOT collide (per-agent jail roots) ----
  {
    const a = { agentId: 'alpha' }, b = { agentId: 'beta' };
    await writeTool.run({ path: 'note.md', content: 'A-content' }, a);
    await writeTool.run({ path: 'note.md', content: 'B-content' }, b);
    A.eq((await readTool.run({ path: 'note.md' }, a)).content, 'A-content', 'alpha reads its own note.md');
    A.eq((await readTool.run({ path: 'note.md' }, b)).content, 'B-content', 'beta reads its own note.md (no clobber by alpha)');
    const ra = await _internals.resolveInside('alpha', 'note.md');
    const rb = await _internals.resolveInside('beta', 'note.md');
    A.ok(ra.base !== rb.base, 'each agent resolves under a DISTINCT per-agent jail base');
    A.ok(ra.abs !== rb.abs, 'the same relative path lands at different absolute paths per agent');
  }

  // ---- fs.search: content grep over the workspace (path:line: text), bounded + jailed ----
  {
    const ctx = { agentId: 'srch' };
    await writeTool.run({ path: 'a.txt', content: 'alpha TODO one' }, ctx);   // <=32 bytes
    await writeTool.run({ path: 'sub/b.txt', content: 'beta todo two' }, ctx);
    await writeTool.run({ path: 'c.txt', content: 'no marker here' }, ctx);

    // substring is case-sensitive by default: only a.txt's "TODO" matches
    const s1 = await searchTool.run({ query: 'TODO' }, ctx);
    A.ok(s1.content.indexOf('a.txt:1: alpha TODO one') >= 0, 'search finds the substring with workspace-relative path:line');
    A.ok(s1.content.indexOf('b.txt') < 0, 'case-sensitive substring does NOT match lowercase "todo"');

    // ignoreCase catches both
    const s2 = await searchTool.run({ query: 'todo', ignoreCase: true }, ctx);
    A.ok(s2.content.indexOf('a.txt:1:') >= 0 && s2.content.indexOf('sub/b.txt:1:') >= 0, 'ignoreCase matches both files');

    // regex
    const s3 = await searchTool.run({ query: 'beta|gamma', regex: true }, ctx);
    A.ok(s3.content.indexOf('sub/b.txt:1:') >= 0, 'regex alternation matches');
    await rejects(searchTool.run({ query: '(unclosed', regex: true }, ctx), 'invalid regex -> clean error');

    // path scope limits the search to a subdirectory (paths stay workspace-root-relative)
    const s4 = await searchTool.run({ query: 'todo', ignoreCase: true, path: 'sub' }, ctx);
    A.ok(s4.content.indexOf('sub/b.txt:1:') >= 0 && s4.content.indexOf('a.txt:') < 0, 'path scopes the search to the subdir');

    // no matches is a clean (non-error) result
    const s5 = await searchTool.run({ query: 'zzz-nope' }, ctx);
    A.ok(/0 matches/.test(s5.summary), 'no matches -> clean "0 matches" result');

    // empty query is rejected; the jail still applies to the start path
    await rejects(searchTool.run({ query: '' }, ctx), 'empty query rejected');
    await rejects(searchTool.run({ query: 'x', path: '../other' }, ctx), 'search cannot escape the workspace jail');
  }

  // ---- fs.search v2 (parity with the reference harness): targets, output modes, file_glob, context, densify, paging, redact ----
  {
    const SX = path.join(ROOT, 'sx');
    await fsp.mkdir(path.join(SX, 'lib'), { recursive: true });
    await fsp.mkdir(path.join(SX, '.secret'), { recursive: true });
    await fsp.mkdir(path.join(SX, 'node_modules'), { recursive: true });
    // fixtures written directly (bypass the 32-byte tool cap) — content search is read-only anyway
    await fsp.writeFile(path.join(SX, 'app.js'), 'function alpha() {\n  // TODO refactor alpha\n  return 1\n}\n');
    await fsp.writeFile(path.join(SX, 'lib', 'util.js'), '// TODO test util\nfunction beta() {\n  return alpha() // TODO wire\n}\n');
    await fsp.writeFile(path.join(SX, 'notes.md'), '# Notes\nTODO write docs\nTODO ship it\nTODO review\n');
    await fsp.writeFile(path.join(SX, '.secret', 'h.js'), 'TODO hidden\n');            // hidden dir -> skipped
    await fsp.writeFile(path.join(SX, 'node_modules', 'dep.js'), 'TODO dep\n');         // node_modules -> skipped
    await fsp.writeFile(path.join(SX, 'data.bin'), Buffer.from([0, 84, 79, 68, 79]));   // NUL -> binary, skipped
    const ctx = { agentId: 'sx' };
    const lines = s => s.content.split('\n');

    // content mode, 6 matches across 3 files -> DENSIFIED (path header once, then "  <line>: text")
    const c = await searchTool.run({ query: 'TODO' }, ctx);
    A.ok(c.content.indexOf('TODO hidden') < 0, 'hidden dirs are skipped (rg default)');
    A.ok(c.content.indexOf('TODO dep') < 0, 'node_modules is skipped');
    A.ok(/6 matches in 3 file/.test(c.summary), 'counts true matches across files (binary/hidden/node_modules excluded)');
    A.ok(lines(c).indexOf('app.js') >= 0 && lines(c).indexOf('lib/util.js') >= 0 && lines(c).indexOf('notes.md') >= 0, 'densified: each file path on its own header line');
    A.ok(lines(c).some(l => /^ {2}\d+: .*TODO/.test(l)), 'densified: indented "  <line>: <content>" match rows');

    // count mode -> matches per file
    const cnt = await searchTool.run({ query: 'TODO', output_mode: 'count' }, ctx);
    A.ok(/app\.js: 1/.test(cnt.content) && /lib\/util\.js: 2/.test(cnt.content) && /notes\.md: 3/.test(cnt.content), 'count mode reports matches per file');

    // files_only -> just the paths with matches
    const fo = await searchTool.run({ query: 'TODO', output_mode: 'files_only' }, ctx);
    A.eq(lines(fo).filter(Boolean).sort(), ['app.js', 'lib/util.js', 'notes.md'], 'files_only lists the matching file paths');

    // file_glob restricts which files are searched
    const fg = await searchTool.run({ query: 'TODO', output_mode: 'count', file_glob: '*.md' }, ctx);
    A.ok(/notes\.md: 3/.test(fg.content) && fg.content.indexOf('app.js') < 0, 'file_glob limits the search to matching files');

    // context lines: a match row (":") plus neighbouring context rows ("-")
    const cc = await searchTool.run({ query: 'beta', file_glob: '*.js', context: 1 }, ctx);
    A.ok(/^ {2}2: function beta/m.test(cc.content), 'context: the match line is shown with ":"');
    A.ok(/^ {2}1- /m.test(cc.content) && /^ {2}3- /m.test(cc.content), 'context: surrounding lines are shown with "-"');

    // target 'files': glob over names
    const ff = await searchTool.run({ query: '*.js', target: 'files' }, ctx);
    A.eq(lines(ff).filter(Boolean).sort(), ['app.js', 'lib/util.js'], 'target files: glob matches both .js files (hidden/node_modules excluded)');
    const fmd = await searchTool.run({ query: '*.md', target: 'files' }, ctx);
    A.eq(lines(fmd).filter(Boolean), ['notes.md'], 'target files: *.md finds the markdown file');
    const fu = await searchTool.run({ query: '*util*', target: 'files' }, ctx);
    A.eq(lines(fu).filter(Boolean), ['lib/util.js'], 'target files: substring glob finds the nested file');

    // paging: limit + offset + an actionable next-offset hint
    const p1 = await searchTool.run({ query: 'TODO', limit: 2, offset: 0 }, ctx);
    A.ok(/\[truncated/.test(p1.content) && /offset=2/.test(p1.content), 'paging: truncation hint names the next offset');
    A.ok(/showing 2/.test(p1.summary), 'paging: summary reports the shown count');

    // redaction: surfaced lines are scrubbed (separate instance with a redact dep)
    const RID = makeFsTools({ fsp, pathMod: path, root: ROOT, redact: s => String(s).replace(/sk-secret-\d+/g, '[REDACTED]') });
    await fsp.mkdir(path.join(ROOT, 'sxr'), { recursive: true });
    await fsp.writeFile(path.join(ROOT, 'sxr', 'creds.md'), 'TODO use key sk-secret-123 here\n');
    const rr = await RID.searchTool.run({ query: 'TODO' }, { agentId: 'sxr' });
    A.ok(rr.content.indexOf('[REDACTED]') >= 0 && rr.content.indexOf('sk-secret-123') < 0, 'fs.search redacts secrets out of surfaced lines (§5.6)');
  }

  // ---- NS-5: an absolute path is ILLEGAL when no pathTrust is wired, and ROUTED to it when it is ----
  {
    // unwired (this file's default tools): every absolute form stays illegal (the historic jail invariant)
    for (const abs of ['/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share\\y']) {
      await rejects(_internals.resolveInside('ag', abs), 'unwired: absolute path stays illegal: ' + abs);
    }
    // wired: an absolute path is handed to the injected guard verbatim, with the tool's scope threaded
    const seen = [];
    const guard = async (abs, o) => { seen.push({ abs, scope: o.scope, agentId: o.agentId }); return { base: '/blessed', abs: abs }; };
    const WT = makeFsTools({ fsp, pathMod: path, root: ROOT, pathTrust: guard });
    const rr = await WT._internals.resolveInside('agz', '/outside/project/file.txt', { scope: 'read', ctx: { agentId: 'agz' } });
    A.ok(rr.abs === '/outside/project/file.txt' && rr.base === '/blessed', 'wired: absolute path is resolved via the injected guard');
    A.ok(seen.length === 1 && seen[0].scope === 'read' && seen[0].agentId === 'agz', 'guard receives the absolute path with scope + agentId');
    // a write tool threads scope:'write' to the guard (so writes can stay consent-gated by the caller)
    const checkpoints = [];
    await WT.writeTool.run({ path: '/outside/project/w.txt', content: 'x' }, {
      agentId: 'agz', checkpointMutation: async (root, label, opts) => checkpoints.push({ root, label, opts })
    }).catch(() => {});
    A.ok(seen.some(s => s.scope === 'write'), 'a write tool threads scope:"write" to the guard');
    A.eq(checkpoints.length, 1, 'external fs write asks the host to checkpoint before filesystem mutation');
    A.eq(checkpoints[0].root, '/blessed', 'checkpoint binds to the root resolved by path trust, not the agent jail');
    A.eq(checkpoints[0].opts.resolvedRoot, true, 'one-time path authorization is explicitly host-marked for snapshot creation');
    // NUL is illegal even with a guard wired (never reaches the guard)
    await rejects(WT._internals.resolveInside('agz', '/a/\0/b', { scope: 'read' }), 'NUL stays illegal even when pathTrust is wired');
    // a relative path is UNAFFECTED by the guard — still jailed, guard never consulted for it
    const before = seen.length;
    await WT._internals.resolveInside('agz', 'inside/rel.txt', { scope: 'read' });
    A.ok(seen.length === before, 'a relative path never reaches the guard (jail path unchanged)');
  }

  /* ---- fs.search obeys the SAME jail as fs.read ----
     resolveInside's realpath proof only covers the path the CALLER names; the walk that follows never
     re-proved what it reached, so fs.read refused a jail-escaping symlink while fs.search grepped its
     CONTENTS and printed the matching line. Simulated over an injected POSIX fs so it runs on a host that
     cannot create symlinks (Windows without developer mode). ---- */
  {
    const P = require('node:path').posix;
    const PM = Object.assign({}, P, { sep: '/', win32: require('node:path').win32, posix: P });
    const LINK = '/ws/agent/leak.txt', TARGET = '/outside/.ssh/id_rsa', SECRET = 'BEGIN PRIVATE KEY SUPER_SECRET';
    const dirent = (name, kind) => ({ name, isDirectory: () => kind === 'dir', isSymbolicLink: () => kind === 'link', isFile: () => kind === 'file' });
    const fakeFsp = {
      async mkdir() {},
      async readdir(dir) { return dir === '/ws/agent' ? [dirent('leak.txt', 'link'), dirent('notes.md', 'file')] : []; },
      async stat() { return { mtimeMs: 1, isFile: () => true, isDirectory: () => false }; },
      async lstat() { return {}; },
      async realpath(p) { return p === LINK ? TARGET : p; },
      async readFile(p, enc) {
        if (p === LINK) return enc ? SECRET : Buffer.from(SECRET);
        if (p === '/ws/agent/notes.md') return enc ? 'hello' : Buffer.from('hello');
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
    };
    const T = makeFsTools({ fsp: fakeFsp, pathMod: PM, root: '/ws' });
    const c = { agentId: 'agent' };
    await rejects(T.readTool.run({ path: 'leak.txt' }, c), 'fs.read refuses a symlink that escapes the jail');
    const hit = await T.searchTool.run({ query: 'SUPER_SECRET' }, c);
    A.ok(hit.content.indexOf(SECRET) < 0, 'fs.search does NOT read through the same escaping symlink');
    A.eq(hit.summary.indexOf('0 matches'), 0, 'and reports no match rather than the jailbroken line');
  }

  /* ---- a path-shaped file_glob must actually filter by PATH ----
     It was built from the full pattern but tested against the basename, so "src/*.js" matched nothing and
     returned a clean "0 matches" — indistinguishable from "the text isn't there". ---- */
  {
    const dir = path.join(ROOT, 'globby');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'needle here\n');
    fs.writeFileSync(path.join(dir, 'top.js'), 'needle here\n');
    const T = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: ROOT });
    const c = { agentId: 'globby' };
    const scoped = await T.searchTool.run({ query: 'needle', file_glob: 'src/*.js' }, c);
    A.ok(/src\/a\.js/.test(scoped.content), 'a path-shaped file_glob matches inside the named directory');
    A.ok(!/top\.js/.test(scoped.content), 'and excludes files outside it');
    const bare = await T.searchTool.run({ query: 'needle', file_glob: '*.js' }, c);
    A.eq(bare.summary.indexOf('2 matches'), 0, 'a bare name glob still matches by basename everywhere');
  }

  /* ---- a model-supplied regex must never be able to freeze the station ----
     fs.search { regex:true } compiles the MODEL's string and runs it synchronously over every line of every
     candidate file. StarNet is ONE process — UI, API, SSE bus, every agent run — so a backtracking blow-up
     pegged the event loop indefinitely: measured, `(a|a)+$` against a 41-character line never returned and
     the tool's own timeoutMs could not help (withTimeout rejects the promise; it cannot stop synchronous
     work). Only killing the process recovered. ---- */
  {
    const dir = path.join(ROOT, 'redos');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.js'), 'const x = "' + 'a'.repeat(40) + 'b";\nfunction handler() {}\n');
    const T = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: ROOT });
    const c = { agentId: 'redos' };
    const refused = async (q) => {
      try { await T.searchTool.run({ query: q, regex: true }, c); return false; }
      catch (e) { return /backtrack catastrophically/.test(e.message); }
    };
    for (const q of ['(a|a)+$', '(\\s+)+$', '(.*)*x', '(a+)+', '(ab|abc)+'])
      A.ok(await refused(q), 'catastrophic pattern refused (fast, not hung): ' + q);
    // ...and the floor must not eat ordinary search patterns
    for (const q of ['function\\s+\\w+', '(ab|cd)+', '^const\\s', 'handler|x', '(?:foo|bar)baz'])
      A.ok(!(await refused(q)), 'ordinary pattern still allowed: ' + q);
    const hit = await T.searchTool.run({ query: 'handler', regex: true }, c);
    A.ok(/handler/.test(hit.content), 'a real regex search still returns its matches');
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) {}
  A.report('fs.jail.test');
})();
