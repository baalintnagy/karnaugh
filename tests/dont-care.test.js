import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solve,
  evaluate,
  minimize,
  matches,
  popcount,
  orderNumber,
  expression,
} from '../logic.js';
import { timingSvg, mapSvg } from '../svg.js';
test('every partially specified truth table through three variables: all forms satisfy defined rows', () => {
  for (let n = 1; n <= 3; n++)
    for (let code = 0; code < 3 ** (2 ** n); code++) {
      let remaining = code;
      const values = Array.from({ length: 2 ** n }, () => {
        const v = [0, 1, 'X'][remaining % 3];
        remaining = Math.floor(remaining / 3);
        return v;
      });
      const result = solve(n, values);
      for (const tree of Object.values(result.forms))
        for (let i = 0; i < values.length; i++)
          if (values[i] !== 'X') assert.equal(evaluate(tree, n, i), values[i]);
      for (const target of [0, 1]) {
        const cubes = target === 1 ? result.ones : result.zeros;
        for (const c of cubes) {
          assert.ok(values.some((v, i) => v === target && matches(c, i)));
          assert.ok(
            values.every((v, i) => v === 'X' || v === target || !matches(c, i)),
          );
        }
      }
    }
});
test('minimum partial-function covers agree with exhaustive cube-cover oracle', () => {
  const n = 3,
    cubes = [];
  for (let mask = 0; mask < 8; mask++)
    for (let bits = 0; bits < 8; bits++)
      if (!(bits & mask)) cubes.push({ bits, mask });
  for (let code = 0; code < 6561; code++) {
    let remaining = code;
    const values = Array.from({ length: 8 }, () => {
      const v = [0, 1, 'X'][remaining % 3];
      remaining = Math.floor(remaining / 3);
      return v;
    });
    const required = values.reduce(
        (a, v, i) => (v === 1 ? a | (1 << i) : a),
        0,
      ),
      dp = new Map([[0, [0, 0]]]);
    for (const c of cubes) {
      if (values.some((v, i) => v === 0 && matches(c, i))) continue;
      let cover = 0;
      values.forEach((v, i) => {
        if (v === 1 && matches(c, i)) cover |= 1 << i;
      });
      if (!cover) continue;
      for (const [state, cost] of [...dp]) {
        const next = state | cover,
          nc = [cost[0] + 1, cost[1] + n - popcount(c.mask)],
          old = dp.get(next);
        if (!old || nc[0] < old[0] || (nc[0] === old[0] && nc[1] < old[1]))
          dp.set(next, nc);
      }
    }
    const actual = minimize(n, values);
    assert.deepEqual(
      [actual.length, actual.reduce((s, c) => s + n - popcount(c.mask), 0)],
      dp.get(required),
    );
  }
});
test('X enlarges groups; canonical forms choose explicit completions; all-X tables are valid', () => {
  assert.equal(expression(solve(2, [0, 1, 0, 'X']).forms.minimal), 'B');
  const result = solve(2, [0, 1, 0, 'X']);
  assert.equal(evaluate(result.forms.dnf, 2, 3), 0);
  assert.equal(evaluate(result.forms.cnf, 2, 3), 1);
  for (const n of [1, 8]) {
    const values = Array(2 ** n).fill('X');
    assert.equal(orderNumber(values), null);
    const forms = solve(n, values).forms;
    assert.equal(expression(forms.minimal), '0');
    assert.equal(expression(forms.nor), '1');
  }
});
test('SVG timing outputs use X bands and restart the trace after unspecified rows', () => {
  const svg = timingSvg(2, [1, 'X', 'X', 0], {
    text: '#fff',
    muted: '#999',
    line: '#555',
    accent: '#afa',
    bg: '#111',
  });
  assert.equal((svg.match(/data-unknown-row=/g) || []).length, 2);
  assert.ok(svg.includes('f: 1 X X 0'));
  const map = mapSvg(2, [1, 'X', 'X', 0]);
  assert.ok(map.includes('var(--dont-care)'));
  assert.equal((map.match(/>X<\/text>/g) || []).length, 2);
});
