import { minimize } from './logic/minimize.js';
import { sop, pos, anf, universal } from './logic/expressions.js';

// Keep the public logic API stable while each module owns one responsibility.
export {
  names,
  popcount,
  matches,
  orderNumber,
  gray,
} from './logic/boolean.js';
export { minimize } from './logic/minimize.js';
export {
  sop,
  pos,
  anf,
  universal,
  expression,
  evaluate,
} from './logic/expressions.js';

export function solve(n, values) {
  const ones = minimize(n, values),
    zeros = minimize(n, values, 0),
    minimal = sop(n, ones),
    minimalPos = pos(n, zeros);
  return {
    ones,
    zeros,
    forms: {
      minimal,
      dnf: sop(
        n,
        values.flatMap((v, bits) => (v === 1 ? [{ bits, mask: 0 }] : [])),
      ),
      cnf: pos(
        n,
        values.flatMap((v, bits) => (v === 0 ? [{ bits, mask: 0 }] : [])),
      ),
      nand: universal(minimal, 'NAND'),
      nor: universal(minimalPos, 'NOR'),
      xor: anf(
        n,
        values.map((v) => (v === 'X' ? 0 : v)),
      ),
    },
  };
}
