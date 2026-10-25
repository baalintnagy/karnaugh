import { expression } from '../logic/expressions.js';
import { mathSource } from './math.js';

const descriptions = {
  minimal: [
    'Minimum sum of products',
    'Exact cover: fewest product terms, then fewest literals. Loops on the map correspond to these terms.',
  ],
  dnf: [
    'Canonical disjunctive normal form',
    'One product term for every row whose output is 1. AND is juxtaposition; OR is addition.',
  ],
  cnf: [
    'Canonical conjunctive normal form',
    'One sum clause for every row whose output is 0. AND is juxtaposition; OR is addition.',
  ],
  nand: [
    'NAND-only implementation',
    'The minimized sum of products transformed with De Morgan’s law. A repeated input implements inversion.',
  ],
  nor: [
    'NOR-only implementation',
    'The minimized product of sums transformed with De Morgan’s law. A repeated input implements inversion.',
  ],
};

export function describeForm(form, hasDontCares) {
  let [name, note] = descriptions[form];
  if (hasDontCares) {
    if (form === 'dnf') name = 'Specified-row DNF (X → 0)';
    if (form === 'cnf') name = 'Specified-row CNF (X → 1)';
    note +=
      form === 'dnf'
        ? ' Only specified 1 rows are included; X rows complete to 0.'
        : form === 'cnf'
          ? ' Only specified 0 rows are included; X rows complete to 1.'
          : ' X rows may be either value. This circuit is one valid completion; different forms may choose different values for X.';
  }
  return { name, note };
}

export function renderFormula(element, formulaTree) {
  const formulaSource = 'f = ' + expression(formulaTree);
  // A bar over the entire universal-gate formula is an unbreakable box.
  // Use equivalent prefix negation for that outer operation in the display.
  if (['AND', 'OR', 'NAND', 'NOR'].includes(formulaTree.type)) {
    const negated = ['NAND', 'NOR'].includes(formulaTree.type),
      sum = ['OR', 'NOR'].includes(formulaTree.type);
    const chunks = [
      negated ? 'f = not' : 'f =',
      ...(negated ? ['('] : []),
      ...formulaTree.children.map((child, i) => {
        const source = expression(child),
          term = ['INPUT', 'CONST', 'NOT'].includes(child.type)
            ? source
            : '(' + source + ')';
        return (i && sum ? '+ ' : '') + term;
      }),
      ...(negated ? [')'] : []),
    ];
    element.replaceChildren(
      ...chunks.map((source, i) => {
        const chunk = document.createElement('span');
        chunk.className =
          'formula-chunk' +
          (negated && (i === 1 || i === chunks.length - 1)
            ? ' formula-outer-parenthesis'
            : '');
        chunk.textContent = mathSource(source);
        return chunk;
      }),
    );
  } else element.textContent = mathSource(formulaSource);
  return formulaSource;
}
