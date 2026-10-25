import { gray, matches } from '../logic/boolean.js';
import { colors, groupOutline } from './group-style.js';
import { escapeXml as esc } from './xml.js';

export function mapSvg(n, values, cubes = []) {
  const rb = Math.floor(n / 2),
    cb = n - rb,
    rows = gray(rb),
    cols = gray(cb),
    cell = 52,
    left = 66,
    top = 48,
    width = left + cols.length * cell + 20,
    height = top + rows.length * cell + 20;
  const label = (i, b) => (b ? i.toString(2).padStart(b, '0') : '–');
  let body = `<text x="12" y="19" fill="var(--muted)" font-size="10">${esc(Array.from({ length: rb }, (_, i) => String.fromCharCode(65 + i)).join('') || '–')} / ${esc(Array.from({ length: cb }, (_, i) => String.fromCharCode(65 + rb + i)).join(''))}</text>`;
  cols.forEach(
    (c, j) =>
      (body += `<text x="${left + (j + 0.5) * cell}" y="30" text-anchor="middle" fill="var(--muted)" font-size="11">${label(c, cb)}</text>`),
  );
  rows.forEach((r, k) => {
    body += `<text x="45" y="${top + (k + 0.5) * cell + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${label(r, rb)}</text>`;
    cols.forEach((c, j) => {
      const i = (r << cb) | c;
      body += `<g class="map-cell" role="button" tabindex="0" data-index="${i}" aria-label="Minterm ${i}, output ${values[i]}. Cycle 0, 1, X."><title>m${i}: ${label(i, n)} → ${values[i]}</title><rect class="cell-bg" x="${left + j * cell}" y="${top + k * cell}" width="${cell}" height="${cell}" fill="var(--panel)" stroke="var(--line)"/><text x="${left + j * cell + 7}" y="${top + k * cell + 12}" font-size="8" fill="var(--muted)">${i}</text><text x="${left + (j + 0.5) * cell}" y="${top + (k + 0.5) * cell + 7}" text-anchor="middle" font-size="20" fill="${values[i] === 1 ? 'var(--accent)' : values[i] === 'X' ? 'var(--dont-care)' : 'var(--muted)'}">${values[i]}</text></g>`;
    });
  });
  const runs = (indices) => {
    const result = [];
    for (const i of indices) {
      const last = result.at(-1);
      if (last && last[1] === i - 1) last[1] = i;
      else result.push([i, i]);
    }
    return result;
  };
  cubes.forEach((cube, index) => {
    const rs = rows.flatMap((r, k) =>
        cols.some((c) => matches(cube, (r << cb) | c)) ? [k] : [],
      ),
      cs = cols.flatMap((c, j) =>
        rows.some((r) => matches(cube, (r << cb) | c)) ? [j] : [],
      );
    const rr = runs(rs),
      cr = runs(cs),
      split = rr.length > 1 || cr.length > 1,
      inset = 4 + (index % 4) * 3,
      color = colors[index % colors.length],
      outline = groupOutline(index);
    for (const [r0, r1] of rr)
      for (const [c0, c1] of cr) {
        // Open the outline toward the other fragments of this implicant. At
        // opposite map edges this produces matching half-loops; internal gaps
        // in larger Gray-code maps use the same continuation convention.
        const wrapX =
            cr.length > 1 && cs[0] === 0 && cs.at(-1) === cols.length - 1,
          wrapY = rr.length > 1 && rs[0] === 0 && rs.at(-1) === rows.length - 1;
        const west = cr.length > 1 && (wrapX ? c0 === 0 : c0 > cs[0]);
        const east =
          cr.length > 1 && (wrapX ? c1 === cols.length - 1 : c1 < cs.at(-1));
        const north = rr.length > 1 && (wrapY ? r0 === 0 : r0 > rs[0]);
        const south =
          rr.length > 1 && (wrapY ? r1 === rows.length - 1 : r1 < rs.at(-1));
        const x = left + c0 * cell + (west ? 0 : inset),
          y = top + r0 * cell + (north ? 0 : inset),
          right = left + (c1 + 1) * cell - (east ? 0 : inset),
          bottom = top + (r1 + 1) * cell - (south ? 0 : inset);
        const radius = Math.min(
          17,
          cell / 2 - inset,
          (right - x) / 2,
          (bottom - y) / 2,
        );
        let d = '';
        if (!north)
          d += `M${x + (west ? 0 : radius)},${y} H${right - (east ? 0 : radius)} `;
        if (!east)
          d += `M${right},${y + (north ? 0 : radius)} V${bottom - (south ? 0 : radius)} `;
        if (!south)
          d += `M${right - (east ? 0 : radius)},${bottom} H${x + (west ? 0 : radius)} `;
        if (!west)
          d += `M${x},${bottom - (south ? 0 : radius)} V${y + (north ? 0 : radius)} `;
        if (!north && !west)
          d += `M${x},${y + radius} A${radius},${radius} 0 0 1 ${x + radius},${y} `;
        if (!north && !east)
          d += `M${right - radius},${y} A${radius},${radius} 0 0 1 ${right},${y + radius} `;
        if (!south && !east)
          d += `M${right},${bottom - radius} A${radius},${radius} 0 0 1 ${right - radius},${bottom} `;
        if (!south && !west)
          d += `M${x + radius},${bottom} A${radius},${radius} 0 0 1 ${x},${bottom - radius} `;
        body += `<g pointer-events="none" data-map-group="${index + 1}" data-continuation="${[north ? 'north' : '', east ? 'east' : '', south ? 'south' : '', west ? 'west' : ''].filter(Boolean).join(' ')}"><title>Group ${index + 1}${split ? ' (matching open ends belong to the same term)' : ''}</title><rect x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" rx="${split ? 0 : radius}" fill="${color}" fill-opacity=".055"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${outline.attributes}/></g>`;
      }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="min-width:${Math.min(width, 950)}px" role="img" aria-label="${n} variable Karnaugh map with ${cubes.length} implicant groups" font-family="monospace">${body}</svg>`;
}
