import { names } from '../logic/boolean.js';

export function timingSignals(n, values) {
  return [
    ...names(n).map((name, j) => ({
      name,
      values: values.map((_, i) => (i >> (n - 1 - j)) & 1),
    })),
    { name: 'f', values: [...values] },
  ];
}
export function timingSvg(n, values, palette) {
  const { text, muted, line, accent, bg } = palette,
    signals = timingSignals(n, values);
  const left = 66,
    top = 52,
    slot = 40,
    row = 60,
    width = left + slot * values.length + 24,
    height = top + signals.length * row + 26;
  let body = `<rect width="100%" height="100%" fill="${bg}"/><text x="12" y="25" fill="${muted}" font-size="10">Row i</text>`;
  for (let i = 0; i <= values.length; i++) {
    const x = left + i * slot;
    body += `<path d="M${x},35 V${height - 30}" stroke="${line}" stroke-dasharray="3 5" stroke-width="1"/>`;
    if (i < values.length)
      body += `<text x="${x + slot / 2}" y="25" text-anchor="middle" fill="${muted}" font-size="10">${i}</text>`;
  }
  signals.forEach((signal, j) => {
    const high = top + j * row,
      low = high + 28,
      color = signal.name === 'f' ? accent : text;
    body += `<text x="20" y="${high + 19}" fill="${color}" font-size="14" font-weight="600">${signal.name}</text><text x="48" y="${high + 4}" fill="${muted}" font-size="8">1</text><text x="48" y="${low + 4}" fill="${muted}" font-size="8">0</text>`;
    let path = '',
      unknown = '';
    signal.values.forEach((v, i) => {
      const x = left + i * slot;
      if (v === 'X') {
        unknown += `<g data-unknown-row="${i}"><rect x="${x}" y="${high}" width="${slot}" height="28" fill="${color}" fill-opacity=".1"/><path d="M${x},${high} L${x + slot},${low} M${x},${low} L${x + slot},${high}" stroke="${color}" stroke-width="1"/><text x="${x + slot / 2}" y="${low + 13}" text-anchor="middle" fill="${color}" font-size="9">X</text></g>`;
        return;
      }
      const y = v === 1 ? high : low;
      if (i === 0 || signal.values[i - 1] === 'X') path += ` M${x},${y}`;
      else if (v !== signal.values[i - 1]) path += ` V${y}`;
      path += ` H${x + slot}`;
    });
    body += `<g data-signal="${signal.name}"><title>${signal.name}: ${signal.values.join(' ')}</title>${unknown}<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></g>`;
  });
  body += `<text x="${left}" y="${height - 8}" fill="${muted}" font-size="10">Time → (equal intervals, ascending truth-table rows)</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Timing diagram of ${names(n).join(', ')} and output f across all ${values.length} truth-table rows" font-family="system-ui,sans-serif"><desc>Ideal signals with no propagation delay. Each interval corresponds to one truth-table row in binary input order. High is 1 and low is 0. Crossed X bands indicate unspecified outputs.</desc>${body}</svg>`;
}
