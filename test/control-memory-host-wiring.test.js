/* Source-level contract for content-free Control Mode memory wiring. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');

A.ok(/makeMemoryControlHttp\s*}\s*=\s*require\('\.\/control\/memory-http\.js'\)/.test(src),
  'sidecar imports the memory metadata HTTP composer');
A.ok(/memoryControlHttp\s*=\s*makeMemoryControlHttp\(\{[\s\S]{0,900}roster:\s*\(\)\s*=>\s*agentRoster[\s\S]{0,900}notebookStore\.readKey\('notebook:'\s*\+\s*agentId\)[\s\S]{0,900}memcore\.projectRecord/.test(src),
  'Control Mode memory reads the same authoritative notebook store and memcore projection');
A.ok(/\{\s*m:\s*'GET',\s*exact:\s*'\/api\/control\/memory',\s*h:\s*memoryControlHttp\.serve\s*}/.test(src),
  'sidecar exposes exactly the read-only Control Mode memory endpoint');
A.ok(!/\{\s*m:\s*'(?:POST|PUT|PATCH|DELETE)',\s*(?:prefix|exact|qsplit):\s*'\/api\/control\/memory/.test(src),
  'Control Mode memory surface has no mutation route');
A.report('control-memory-host-wiring.test');
