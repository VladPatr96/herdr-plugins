'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { averageCost, remainingBudget, estimateRequests, roundCount } = require('../lib/estimate');

test('a model with no cost recorded has no average to estimate from', () => {
  assert.strictEqual(averageCost({ requests: 19, cost: 0 }), null);
  assert.strictEqual(averageCost({ requests: 0, cost: 1 }), null);
  assert.strictEqual(averageCost({ requests: 4, cost: 0.02 }), 0.005);
});

test('a balance is the budget as it stands', () => {
  const budget = remainingBudget({ balance: { total: '7.23' } });
  assert.deepStrictEqual(budget, { amount: 7.23, basis: 'balance' });
});

test("a plan's remaining share is priced by what the used share cost", () => {
  const budget = remainingBudget({
    windows: [{ label: '30d', usedPercent: 20 }, { label: '7d', usedPercent: 0 }],
    usage: { cost: 0.08 },
  });
  // 20% cost $0.08, so the 80% left is worth about $0.32.
  assert.strictEqual(budget.window, '30d', 'the window with the least left is the binding one');
  assert.ok(Math.abs(budget.amount - 0.32) < 1e-9);
});

test('too little history is not extrapolated', () => {
  assert.strictEqual(remainingBudget({ windows: [{ label: '30d', usedPercent: 2 }], usage: { cost: 0.01 } }), null);
  assert.strictEqual(remainingBudget({ windows: [{ label: '30d', usedPercent: 40 }] }), null, 'no spend recorded');
});

test('counts are rounded to something that does not look exact', () => {
  assert.strictEqual(roundCount(7.8), 7);
  assert.strictEqual(roundCount(63), 65);
  assert.strictEqual(roundCount(247), 250);
  assert.strictEqual(roundCount(8734), 8700);
  assert.strictEqual(roundCount(-5), 0);
});

test('the estimate is the budget divided by this model average', () => {
  const budget = { amount: 7.23, basis: 'balance' };
  assert.strictEqual(estimateRequests({ requests: 222, cost: 0.1855 }, budget), 8700);
  assert.strictEqual(estimateRequests({ requests: 0, cost: 0 }, budget), null, 'no history, no estimate');
  assert.strictEqual(estimateRequests({ requests: 3, cost: 0.022 }, null), null, 'no budget, no estimate');
});
