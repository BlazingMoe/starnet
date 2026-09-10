'use strict';

const { ok, eq, report } = require('./_assert');
const recipes = require('../frontend/app/recipe-catalog/index.js');

const opportunity = recipes.find(r => r && r.id === 'opportunity-discovery');
ok(opportunity, 'opportunity-discovery is registered in the canonical recipe catalog');
if (opportunity) {
  eq(opportunity.category, 'business', 'opportunity discovery is a business recipe');
  ok(Array.isArray(opportunity.skills) && opportunity.skills.includes('web-research'), 'opportunity discovery requires the existing web-research skill');
  ok(/multiple independent sources/i.test(opportunity.task), 'task requires source-diverse external evidence');
  ok(/OBSERVED FACTS/.test(opportunity.task) && /ESTIMATES/.test(opportunity.task) && /ASSUMPTIONS/.test(opportunity.task), 'task separates facts from estimates and assumptions');
  ok(/unknown instead of inventing one/i.test(opportunity.task), 'task fails closed when a metric is unsupported');
  ok(/rejected candidates/i.test(opportunity.task), 'task preserves rejected candidates for decision auditability');
  ok(/success\/failure criteria/i.test(opportunity.task), 'task produces explicit experiment acceptance criteria');
  ok(/must not publish listings, contact prospects, buy inventory, spend money, place orders or make a financial commitment/i.test(opportunity.task), 'discovery cannot cross into consequential execution');
  ok(/later execution capabilities governed by their own permissions and spending policy/i.test(opportunity.task), 'current discovery boundary does not permanently remove future transaction capability');
}

report('moe opportunity discovery recipe');
