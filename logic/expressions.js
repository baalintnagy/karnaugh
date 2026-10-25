import { names } from './boolean.js';

const constant = (value) => ({ type: 'CONST', value });
const variable = (name) => ({ type: 'INPUT', name });
const gate = (type, children) => ({ type, children });
const combine = (type, children, empty) =>
  children.length === 0
    ? constant(empty)
    : children.length === 1
      ? children[0]
      : gate(type, children);
function cubeLiterals(n, c, invert = false) {
  return names(n).flatMap((name, j) => {
    const bit = 1 << (n - j - 1);
    if (c.mask & bit) return [];
    const positive = !!(c.bits & bit) !== invert;
    return [positive ? variable(name) : gate('NOT', [variable(name)])];
  });
}
export function sop(n, cubes) {
  return combine(
    'OR',
    cubes.map((c) => combine('AND', cubeLiterals(n, c), 1)),
    0,
  );
}
export function pos(n, cubes) {
  return combine(
    'AND',
    cubes.map((c) => combine('OR', cubeLiterals(n, c, true), 0)),
    1,
  );
}
export function anf(n, values) {
  const coefficients = [...values];
  for (let bit = 1; bit < values.length; bit <<= 1)
    for (let i = 0; i < values.length; i++)
      if (i & bit) coefficients[i] ^= coefficients[i ^ bit];
  return combine(
    'XOR',
    coefficients.flatMap((v, i) =>
      v
        ? [
            combine(
              'AND',
              names(n).flatMap((name, j) =>
                i & (1 << (n - j - 1)) ? [variable(name)] : [],
              ),
              1,
            ),
          ]
        : [],
    ),
    0,
  );
}
export function universal(tree, type) {
  if (tree.type === 'INPUT' || tree.type === 'CONST') return tree;
  const inv = (x) =>
    x.type === type &&
    x.children.length === 2 &&
    x.children[0] === x.children[1]
      ? x.children[0]
      : gate(type, [x, x]);
  const children = tree.children.map((c) => universal(c, type));
  if (tree.type === 'NOT') return inv(children[0]);
  if (type === 'NAND')
    return tree.type === 'AND'
      ? inv(gate(type, children))
      : gate(type, children.map(inv));
  return tree.type === 'OR'
    ? inv(gate(type, children))
    : gate(type, children.map(inv));
}
export function expression(tree) {
  if (tree.type === 'INPUT') return tree.name;
  if (tree.type === 'CONST') return String(tree.value);
  if (tree.type === 'NOT') return `bar(${expression(tree.children[0])})`;
  const kids = tree.children.map(expression);
  const op = { AND: ' ', OR: ' + ', XOR: ' oplus ', NAND: ' ', NOR: ' + ' }[
    tree.type
  ];
  const body = kids
    .map((s, i) =>
      ['INPUT', 'CONST', 'NOT'].includes(tree.children[i].type) ? s : `(${s})`,
    )
    .join(op);
  return ['NAND', 'NOR'].includes(tree.type) ? `bar(${body})` : body;
}
export function evaluate(tree, n, i) {
  if (tree.type === 'CONST') return tree.value;
  if (tree.type === 'INPUT')
    return (i >> (n - 1 - (tree.name.charCodeAt(0) - 65))) & 1;
  const v = tree.children.map((c) => evaluate(c, n, i));
  switch (tree.type) {
    case 'NOT':
      return 1 - v[0];
    case 'AND':
      return +v.every(Boolean);
    case 'OR':
      return +v.some(Boolean);
    case 'XOR':
      return v.reduce((a, b) => a ^ b, 0);
    case 'NAND':
      return +!v.every(Boolean);
    case 'NOR':
      return +!v.some(Boolean);
  }
}
