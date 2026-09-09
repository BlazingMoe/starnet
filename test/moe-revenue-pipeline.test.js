/* node test/moe-revenue-pipeline.test.js — private operator revenue workflow contract. */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');
const Recipes = require('../frontend/app/recipes.js');
const Classify = require('../frontend/app/classify.js');
const Skills = require('../sidecar/skills/catalog.js');

const recipe = Recipes.get('revenue-pipeline');
A.ok(!!recipe, 'revenue pipeline is available as a built-in recipe');
A.eq(recipe.source, 'builtin', 'revenue pipeline ships as a built-in');
A.eq(recipe.category, 'business', 'revenue pipeline is grouped with business workflows');
A.eq(recipe.cadence, 'weekly', 'pipeline is naturally repeatable instead of a one-shot prompt');
A.ok(recipe.gear.includes('dish'), 'pipeline declares live-web research');
A.ok(recipe.gear.includes('notebook'), 'pipeline declares durable memory');
A.ok(recipe.gear.includes('cabinet'), 'pipeline declares durable file output');
A.ok(recipe.skills.includes('revenue-pipeline'), 'recipe references the dedicated method skill');
A.ok(recipe.skills.includes('lead-scouting'), 'recipe composes the existing lead-scouting method');
A.ok(recipe.skills.includes('web-research'), 'recipe composes the existing web-research method');

const filled = Recipes.fillTask('revenue-pipeline', {
  offer: 'managed security monitoring',
  market: 'small businesses in Germany'
});
A.ok(Classify.isTaskDirective(filled), 'filled revenue pipeline launches as real work');
A.eq(Classify.getTag(filled), 'research', 'live evidence pipeline routes through research-capable work');
A.ok(/FIRST read the pipeline you saved/i.test(filled), 'recurring run loads prior state before expanding');
A.ok(/CURRENT, sourceable reason/i.test(filled), 'lead qualification requires current evidence');
A.ok(/De-duplicate/i.test(filled), 'pipeline explicitly prevents duplicate recurring leads');
A.ok(/fit, evidence strength, urgency/i.test(filled), 'pipeline uses multi-factor qualification');
A.ok(/evidence URL and as-of date/i.test(filled), 'pipeline preserves source provenance and freshness');
A.ok(/engagement-value band with its assumptions/i.test(filled), 'opportunity value is assumption-backed instead of fabricated precision');
A.ok(/stage \(researched \/ qualified \/ drafted \/ contacted \/ replied \/ meeting \/ won \/ lost \/ parked\)/i.test(filled),
  'pipeline preserves an explicit revenue funnel lifecycle');
A.ok(/NEVER send, publish, purchase, or commit money/i.test(filled), 'pipeline cannot silently cross external-send or financial commitment boundaries');
A.ok(/STAGE drafts for review/i.test(filled), 'connected Gmail may be used for reversible draft staging');
A.ok(/replies\/wins\/losses/i.test(filled), 'later runs learn from observed funnel outcomes');
A.ok(/three actions most likely to create revenue next/i.test(filled), 'output ends in prioritized revenue actions');

const dir = path.join(__dirname, '..', 'sidecar', 'skills', 'library');
const skills = Skills.loadDir(dir, fs, path);
const skill = skills.find(s => s.slug === 'revenue-pipeline');
A.ok(!!skill, 'dedicated revenue-pipeline skill loads from bundled library');
A.eq(skill.default, false, 'revenue method is opt-in and does not inflate every agent prompt');
A.ok(skill.requires.includes('dish') && skill.requires.includes('notebook') && skill.requires.includes('cabinet'),
  'skill is capability-gated by research, memory and durable files');
A.ok(/No source means no factual claim/i.test(skill.body), 'skill forbids unsupported lead claims');
A.ok(/Prefer five defensible opportunities over fifty weak names/i.test(skill.body), 'skill optimizes lead quality over list volume');
A.ok(/Sending, publishing, purchasing, or committing money remains a distinct authorized action/i.test(skill.body),
  'skill preserves irreversible-action approval boundary');
A.ok(/Learn from outcomes/i.test(skill.body), 'skill explicitly compounds from observed results');

A.report('moe-revenue-pipeline.test');
