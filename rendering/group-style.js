export const colors = [
  '#9dca6b',
  '#8ab9ee',
  '#e8a57d',
  '#c09ce8',
  '#6ac7bb',
  '#df92b4',
  '#d6c76b',
  '#acb7bf',
  '#f28c8c',
  '#69bde0',
  '#b9b66a',
  '#a699ed',
  '#66bf95',
  '#e5a4cc',
  '#dfb16a',
  '#83a3ce',
  '#c5a779',
  '#b2cf87',
  '#77b7b3',
  '#d88fbf',
  '#a8aee7',
  '#e2ba8c',
  '#96bca4',
  '#c0a0b4',
];
const outlineStyles = [
  ['solid', ''],
  ['dashed', '7 4'],
  ['dotted', '0 5'],
  ['dash-dot', '9 4 0 4'],
  ['dash-dot-dot', '9 4 0 4 0 4'],
  ['short-dash', '3 4'],
  ['long-dash', '14 5'],
  ['dense-dot', '0 3.5'],
  ['sparse-dot', '0 8'],
  ['long-dash-dot', '15 5 0 5'],
  ['alternating-dash', '12 4 3 4'],
  ['dash-three-dots', '10 4 0 4 0 4 0 4'],
  ['short-dash-dot', '4 4 0 4'],
];
export function groupOutline(index) {
  const [name, dash] = outlineStyles[index % outlineStyles.length];
  return {
    name,
    attributes: `stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`,
  };
}
