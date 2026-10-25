import { matches, popcount } from './boolean.js';

// Quine–McCluskey prime generation followed by an exact prime-chart cover.
// Keep traversal order stable: equally minimal covers must remain deterministic.
export function minimize(variableCount, values, target = 1) {
  const requiredRows = values.flatMap((value, index) =>
    value === target ? [index] : [],
  );
  if (!requiredRows.length) return [];
  const primes = generatePrimes(variableCount, values, target, requiredRows);
  const covers = primes.map((c) =>
    requiredRows.reduce(
      (b, i, j) => (matches(c, i) ? b | (1n << BigInt(j)) : b),
      0n,
    ),
  );
  const literals = primes.map((c) => variableCount - popcount(c.mask));
  const { chart, full, covered, essential } = reduceChart(
    covers,
    literals,
    requiredRows.length,
  );
  if (covered === full) return [...essential].map((index) => primes[index]);
  const selected = exactCover(
    covers,
    literals,
    chart,
    full,
    covered,
    essential,
  );
  return selected
    .map((index) => primes[index])
    .sort((a, b) => a.bits - b.bits || a.mask - b.mask);
}

function generatePrimes(variableCount, values, target, requiredRows) {
  let current = values.flatMap((v, bits) =>
    v === target || v === 'X' ? [{ bits, mask: 0 }] : [],
  );
  const primes = [];
  while (current.length) {
    const used = new Set(),
      next = new Map(),
      lookup = new Map(current.map((c, i) => [`${c.mask}:${c.bits}`, i]));
    current.forEach((c, i) => {
      for (let bit = 1; bit < 2 ** variableCount; bit <<= 1) {
        if (c.mask & bit) continue;
        const j = lookup.get(`${c.mask}:${c.bits ^ bit}`);
        if (j !== undefined) {
          used.add(i);
          used.add(j);
          const merged = { bits: c.bits & ~bit, mask: c.mask | bit };
          next.set(`${merged.mask}:${merged.bits}`, merged);
        }
      }
    });
    current.forEach((c, i) => {
      if (!used.has(i)) primes.push(c);
    });
    current = [...next.values()];
  }
  return primes.filter((c) => requiredRows.some((i) => matches(c, i)));
}

function reduceChart(covers, literals, rowCount) {
  let chart = Array.from({ length: rowCount }, (_, j) =>
    covers.flatMap((b, i) => (b & (1n << BigInt(j)) ? [i] : [])),
  );
  const full = (1n << BigInt(rowCount)) - 1n;
  let covered = 0n;
  const essential = new Set();
  for (const choices of chart)
    if (choices.length === 1) essential.add(choices[0]);
  for (const i of essential) covered |= covers[i];
  let active = covers.map((_, i) => i),
    changed = true;
  while (changed && covered !== full) {
    changed = false;
    const remaining = full & ~covered;
    active = active.filter((i) => !!(covers[i] & remaining));
    const dominated = new Set();
    for (const i of active)
      for (const j of active)
        if (i !== j && literals[j] <= literals[i]) {
          const a = covers[i] & remaining,
            b = covers[j] & remaining;
          if (
            (a & b) === a &&
            (a !== b || literals[j] < literals[i] || j < i)
          ) {
            dominated.add(i);
            break;
          }
        }
    if (dominated.size) {
      active = active.filter((i) => !dominated.has(i));
      changed = true;
    }
    chart = Array.from({ length: rowCount }, (_, j) =>
      active.filter((i) => !!(covers[i] & (1n << BigInt(j)))),
    );
    for (let j = 0; j < rowCount; j++)
      if (remaining & (1n << BigInt(j)) && chart[j].length === 1) {
        const i = chart[j][0];
        essential.add(i);
        covered |= covers[i];
        changed = true;
      }
  }
  return { chart, full, covered, essential };
}

function countBits(b) {
  let s = 0;
  while (b) {
    b &= b - 1n;
    s++;
  }
  return s;
}

function greedyCover(covers, literals, full, covered, essential) {
  let greedyCovered = covered;
  const greedy = [...essential];
  while (greedyCovered !== full) {
    let pick = -1,
      score = -1;
    covers.forEach((c, i) => {
      const gain = countBits(c & ~greedyCovered);
      if (gain > score || (gain === score && literals[i] < literals[pick])) {
        score = gain;
        pick = i;
      }
    });
    greedy.push(pick);
    greedyCovered |= covers[pick];
  }
  return greedy;
}

function exactCover(covers, literals, chart, full, covered, essential) {
  const optionBits = chart.map((options) =>
    options.reduce((bits, i) => bits | (1n << BigInt(i)), 0n),
  );
  const constrained = chart
    .map((_, i) => i)
    .sort((a, b) => chart[a].length - chart[b].length);
  const greedy = greedyCover(covers, literals, full, covered, essential);
  let best = greedy,
    bestLiterals = best.reduce((s, i) => s + literals[i], 0);
  const memo = new Map();
  function visit(cov, selected, cost) {
    if (cov === full) {
      if (
        selected.length < best.length ||
        (selected.length === best.length && cost < bestLiterals)
      ) {
        best = [...selected];
        bestLiterals = cost;
      }
      return;
    }
    if (selected.length >= best.length) return;
    const key = cov.toString(),
      previous = memo.get(key);
    if (
      previous &&
      (previous[0] < selected.length ||
        (previous[0] === selected.length && previous[1] <= cost))
    )
      return;
    memo.set(key, [selected.length, cost]);
    const uncovered = full & ~cov;
    let maxGain = 0;
    for (const c of covers)
      maxGain = Math.max(maxGain, countBits(c & uncovered));
    let lowerBound = Math.ceil(countBits(uncovered) / maxGain),
      packing = 0,
      usedOptions = 0n,
      minCost = 0;
    // Rows whose candidate sets are disjoint must be covered by distinct terms.
    for (const j of constrained)
      if (uncovered & (1n << BigInt(j)) && !(optionBits[j] & usedOptions)) {
        packing++;
        usedOptions |= optionBits[j];
        minCost += Math.min(...chart[j].map((i) => literals[i]));
      }
    lowerBound = Math.max(lowerBound, packing);
    if (selected.length + lowerBound > best.length) return;
    if (
      selected.length + packing === best.length &&
      cost + minCost >= bestLiterals
    )
      return;
    let choices = null;
    for (let j = 0; j < chart.length; j++)
      if (uncovered & (1n << BigInt(j))) {
        if (!choices || chart[j].length < choices.length) choices = chart[j];
      }
    choices = [...choices].sort(
      (a, b) =>
        countBits(covers[b] & uncovered) - countBits(covers[a] & uncovered) ||
        literals[a] - literals[b],
    );
    for (const i of choices)
      visit(cov | covers[i], [...selected, i], cost + literals[i]);
  }
  visit(
    covered,
    [...essential],
    [...essential].reduce((s, i) => s + literals[i], 0),
  );
  return best;
}
