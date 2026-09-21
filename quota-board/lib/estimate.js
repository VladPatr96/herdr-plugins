'use strict';

// "How much more of this model can I run?" — answered from the person's own
// history, never from a price list we do not have.
//
// Two cases, and both are estimates, marked as such wherever they are shown:
//
//   balance  — DeepSeek sells credit, so the answer is money left divided by
//              what a request of that model has cost on average.
//   plan     — a subscription reports a percentage, not money. The spend that
//              OpenCode recorded inside the same window is what that used
//              percentage cost, which gives the remaining percentage a price.

function averageCost(model) {
  if (!model || !model.requests || !model.cost) return null;
  const average = model.cost / model.requests;
  return average > 0 ? average : null;
}

// The window whose remaining share is the binding one.
function tightestWindow(windows = []) {
  const usable = windows.filter((window) => typeof window.usedPercent === 'number');
  if (!usable.length) return null;
  return usable.reduce((a, b) => (a.usedPercent >= b.usedPercent ? a : b));
}

// What the rest of the plan's window is worth, priced by what this window's
// used share actually cost. Needs a used share big enough to divide by.
function remainingBudget(snapshot) {
  if (snapshot.balance) {
    const total = Number(snapshot.balance.total);
    return Number.isFinite(total) && total > 0 ? { amount: total, basis: 'balance' } : null;
  }
  const window = tightestWindow(snapshot.windows);
  const spent = snapshot.usage?.cost;
  if (!window || !spent) return null;
  const used = window.usedPercent;
  if (!(used >= 5)) return null; // too little history to extrapolate from
  const left = Math.max(0, 100 - used);
  return { amount: (spent / used) * left, basis: `${window.label} window`, window: window.label };
}

// A count worth printing: rounded to something that does not pretend to be exact.
function roundCount(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 10) return Math.floor(value);
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 10) * 10;
  return Math.round(value / 100) * 100;
}

// Requests of `model` the remaining budget would pay for.
function estimateRequests(model, budget) {
  const average = averageCost(model);
  if (!average || !budget) return null;
  return roundCount(budget.amount / average);
}

module.exports = { averageCost, tightestWindow, remainingBudget, estimateRequests, roundCount };
