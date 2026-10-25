import { escapeXml as esc } from '../rendering/xml.js';

export function renderCircuit(graph, palette) {
  const { muted, bg } = palette;
  const { paths, branchDots } = collectPaths(graph);
  protectJunctions(paths, graph);
  const segments = collectSegments(paths);
  const wires = renderWires(paths, palette);
  const crossings = renderCrossings(segments, palette);
  const junctions = findJunctions(segments);
  const symbols = renderSymbols(graph, palette);
  const dots = [...junctions.values(), ...branchDots]
    .map(
      (p) =>
        `<circle data-junction="true" cx="${p.x}" cy="${p.y}" r="3" fill="${muted}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}" role="img" aria-label="Logic circuit for the selected expression" font-family="system-ui,sans-serif"><desc>Signals flow left to right. Dots mark connected wire branches; wire jumps mark crossings without connections. Small output circles indicate inversion.</desc><rect width="100%" height="100%" fill="${bg}"/>${wires}${crossings}${dots}${symbols}</svg>`;
}

const netOf = (edge) => edge.net || edge.sources[0];

function collectSegments(paths) {
  return paths.flatMap(({ points, edge }) =>
    points
      .slice(1)
      .map((end, index) => ({ a: points[index], b: end, net: netOf(edge) })),
  );
}

function connectedDirections(point, net, segments) {
  const directions = new Set();
  for (const { a, b, net: segmentNet } of segments) {
    if (segmentNet !== net) continue;
    if (
      a.y === b.y &&
      point.y === a.y &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x)
    ) {
      if (point.x > Math.min(a.x, b.x)) directions.add('W');
      if (point.x < Math.max(a.x, b.x)) directions.add('E');
    }
    if (
      a.x === b.x &&
      point.x === a.x &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    ) {
      if (point.y > Math.min(a.y, b.y)) directions.add('N');
      if (point.y < Math.max(a.y, b.y)) directions.add('S');
    }
  }
  return directions;
}

function collectPaths(graph) {
  const paths = graph.edges
    .filter((edge) => !edge.sharedFeed)
    .flatMap((edge) =>
      (edge.sections || []).map((section) => ({
        edge,
        points: [
          section.startPoint,
          ...(section.bendPoints || []),
          section.endPoint,
        ],
      })),
    );
  const bus = graph.children.find((node) => node.type === 'BUS'),
    branchDots = [];
  if (bus) {
    bus.inputNames.forEach((name, i) => {
      const x = bus.x + 24 + i * 26,
        taps = bus.ports.filter((p) => p.name === name);
      const bottom = taps.length
        ? Math.max(...taps.map((p) => bus.y + p.y))
        : bus.y + 56;
      paths.push({
        edge: { id: `rail-${name}`, sources: [name], targets: [], net: name },
        points: [
          { x, y: bus.y + 40 },
          { x, y: bottom },
        ],
      });
      for (const p of taps) {
        const y = bus.y + p.y;
        paths.push({
          edge: {
            id: `tap-${p.id}`,
            sources: [name],
            targets: [p.id],
            net: name,
          },
          points: [
            { x, y },
            { x: bus.x + p.x, y },
          ],
        });
        if (y < bottom) branchDots.push({ x, y });
      }
    });
  }
  return { paths, branchDots };
}

function protectJunctions(paths, graph) {
  // Reserve space around real branch points. A different net must detour
  // around a junction before crossing its rail, never jump over its dot.
  const initialSegments = collectSegments(paths);
  const protectedJunctions = [];
  for (const s of initialSegments)
    for (const p of [s.a, s.b]) {
      const directions = connectedDirections(p, s.net, initialSegments);
      if (
        directions.size >= 3 &&
        !protectedJunctions.some(
          (j) => j.net === s.net && j.x === p.x && j.y === p.y,
        )
      )
        protectedJunctions.push({ ...p, net: s.net });
    }
  for (const path of paths) {
    if (path.edge.id.startsWith('rail-') || path.edge.id.startsWith('tap-'))
      continue;
    for (const junction of protectedJunctions) {
      if (junction.net === netOf(path.edge)) continue;
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1],
          b = path.points[i],
          horizontal = a.y === b.y;
        const along = horizontal ? 'x' : 'y',
          across = horizontal ? 'y' : 'x';
        if (
          Math.abs(a[across] - junction[across]) > 8 ||
          junction[along] <= Math.min(a[along], b[along]) + 12 ||
          junction[along] >= Math.max(a[along], b[along]) - 12
        )
          continue;
        const direction = Math.sign(b[along] - a[along]);
        for (const offset of [-18, 18, -30, 30]) {
          const q1 = { ...a, [along]: junction[along] - 12 * direction },
            q2 = { ...q1, [across]: junction[across] + offset },
            q3 = { ...q2, [along]: junction[along] + 12 * direction },
            q4 = { ...q3, [across]: b[across] },
            detour = [q1, q2, q3, q4];
          if (
            detour.some(
              (p) =>
                p.x < 0 || p.y < 0 || p.x > graph.width || p.y > graph.height,
            )
          )
            continue;
          const blocked = detour.slice(1).some((end, k) => {
            const start = detour[k];
            return (
              graph.children.some((node) => {
                const x0 = node.x + 0.01,
                  x1 = node.x + node.width - 0.01,
                  y0 = node.y + 0.01,
                  y1 = node.y + node.height - 0.01;
                return start.y === end.y
                  ? start.y > y0 &&
                      start.y < y1 &&
                      Math.max(start.x, end.x) > x0 &&
                      Math.min(start.x, end.x) < x1
                  : start.x > x0 &&
                      start.x < x1 &&
                      Math.max(start.y, end.y) > y0 &&
                      Math.min(start.y, end.y) < y1;
              }) ||
              protectedJunctions.some(
                (j) =>
                  j.net !== netOf(path.edge) &&
                  (start.y === end.y
                    ? Math.abs(start.y - j.y) < 10 &&
                      j.x >= Math.min(start.x, end.x) &&
                      j.x <= Math.max(start.x, end.x)
                    : Math.abs(start.x - j.x) < 10 &&
                      j.y >= Math.min(start.y, end.y) &&
                      j.y <= Math.max(start.y, end.y)),
              )
            );
          });
          if (!blocked) {
            path.points.splice(i, 0, ...detour);
            i += 4;
            break;
          }
        }
      }
    }
  }
}

function renderWires(paths, palette) {
  const { muted } = palette;
  // Crossing nets get a visible wire jump; only actual same-net branches get dots.
  let wires = '';
  for (const { edge, points } of paths) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const b = points[i];
      d += ` L${b.x},${b.y}`;
    }
    wires += `<path data-edge="${edge.id}" data-source="${edge.sources[0]}" data-target="${edge.targets[0] || ''}" d="${d}" fill="none" stroke="${muted}" stroke-width="1.7" stroke-linejoin="round"><title>${esc(edge.sources[0])}${edge.targets[0] ? ' → ' + esc(edge.targets[0]) : ' input rail'}</title></path>`;
  }
  return wires;
}

function renderCrossings(segments, palette) {
  const { muted, bg } = palette;
  const horizontal = segments.filter((s) => s.a.y === s.b.y && s.a.x !== s.b.x),
    vertical = segments.filter((s) => s.a.x === s.b.x && s.a.y !== s.b.y);
  // Paint bridges above every wire, with a background knockout underneath.
  // This avoids later paths painting over jumps, and handles vertical jumps
  // when the intersection is too close to a horizontal bend.
  const crossings = new Map();
  for (const h of horizontal)
    for (const v of vertical) {
      const x = v.a.x,
        y = h.a.y;
      if (
        h.net === v.net ||
        x < Math.min(h.a.x, h.b.x) ||
        x > Math.max(h.a.x, h.b.x) ||
        y < Math.min(v.a.y, v.b.y) ||
        y > Math.max(v.a.y, v.b.y)
      )
        continue;
      const key = `${x}:${y}`;
      if (crossings.has(key)) continue;
      const hx = Math.min(Math.abs(x - h.a.x), Math.abs(x - h.b.x)),
        vy = Math.min(Math.abs(y - v.a.y), Math.abs(y - v.b.y));
      let d, under;
      if (hx > 1) {
        const r = Math.min(5, hx / 2);
        d = `M${x - r},${y} Q${x},${y - 8} ${x + r},${y}`;
        under = `M${x},${Math.max(y - 5, Math.min(v.a.y, v.b.y))} V${Math.min(y + 5, Math.max(v.a.y, v.b.y))}`;
      } else if (vy > 1) {
        const r = Math.min(5, vy / 2);
        d = `M${x},${y - r} Q${x + 8},${y} ${x},${y + r}`;
        under = `M${Math.max(x - 5, Math.min(h.a.x, h.b.x))},${y} H${Math.min(x + 5, Math.max(h.a.x, h.b.x))}`;
      } else {
        // Two bends touching: round one bend away from the contact point.
        const turn = vertical.find(
          (s) => s.net === h.net && s.a.x === x && (s.a.y === y || s.b.y === y),
        );
        if (!turn) continue;
        const dx = h.a.x === x ? 1 : -1,
          dy =
            turn.a.y === y ? Math.sign(turn.b.y - y) : Math.sign(turn.a.y - y);
        d = `M${x + dx * 5},${y} Q${x + dx * 5},${y + dy * 5} ${x},${y + dy * 5}`;
      }
      crossings.set(
        key,
        `<g data-wire-crossing="true"><circle cx="${x}" cy="${y}" r="4" fill="${bg}"/>${under ? `<path d="${under}" fill="none" stroke="${muted}" stroke-width="1.7"/>` : ''}<path d="${d}" fill="none" stroke="${bg}" stroke-width="5"/><path d="${d}" fill="none" stroke="${muted}" stroke-width="1.7"/></g>`,
      );
    }
  return [...crossings.values()].join('');
}

function findJunctions(segments) {
  const junctions = new Map();
  for (const s of segments)
    for (const p of [s.a, s.b]) {
      const key = `${s.net}:${p.x}:${p.y}`;
      if (junctions.has(key)) continue;
      const directions = connectedDirections(p, s.net, segments);
      if (directions.size >= 3) junctions.set(key, p);
    }
  return junctions;
}

function renderSymbols(graph, palette) {
  const { text, muted, accent, bg } = palette;
  let symbols = '';
  for (const node of graph.children) {
    const { id, x, y, width, bodyHeight: h, type } = node,
      cy = h / 2;
    let body = '';
    if (type === 'BUS') {
      body = node.inputNames
        .map(
          (name, i) =>
            `<text data-input-rail="${name}" x="${24 + i * 26}" y="22" text-anchor="middle" fill="${accent}" stroke="none" font-size="14">${name}</text>`,
        )
        .join('');
    } else if (type === 'INPUT' || type === 'CONST' || type === 'OUTPUT') {
      body = `<rect width="${width}" height="${h}" rx="6" fill="${bg}" stroke="${type === 'OUTPUT' ? accent : text}"/><text x="${width / 2}" y="${cy + 5}" text-anchor="middle" fill="${accent}" stroke="none" font-size="14">${esc(type === 'OUTPUT' ? 'f' : (node.name ?? node.value))}</text>`;
    } else {
      const inverted = ['NOT', 'NAND', 'NOR'].includes(type),
        isOr = ['OR', 'NOR', 'XOR'].includes(type);
      if (['AND', 'NAND'].includes(type))
        body = `<path d="M12,0 H42 A30,${cy} 0 0 1 42,${h} H12 Z"/>`;
      else if (type === 'NOT') body = `<path d="M12,0 L72,${cy} L12,${h} Z"/>`;
      else
        body = `<path d="M12,0 Q52,0 72,${cy} Q52,${h} 12,${h} Q32,${cy} 12,0 Z"/>${type === 'XOR' ? `<path d="M7,0 Q27,${cy} 7,${h}" fill="none"/>` : ''}`;
      for (const [i, p] of node.ports
        .filter((p) => p.id.includes('-in-'))
        .entries()) {
        const pinY = node.tiedInputs ? ((i + 1) * h) / 3 : p.y;
        const boundary = isOr ? 12 + 40 * (pinY / h) * (1 - pinY / h) : 12;
        body += `<path d="M0,${pinY} H${boundary}" fill="none"/>`;
      }
      body += inverted
        ? `<path d="M72,${cy} H74 M82,${cy} H94" fill="none"/><circle cx="78" cy="${cy}" r="4"/>`
        : `<path d="M72,${cy} H94" fill="none"/>`;
      body += `<text x="42" y="${h + 17}" text-anchor="middle" fill="${muted}" stroke="none" font-size="10">${type}</text>`;
      if (node.tiedInputs)
        body = `<g transform="translate(24,0)">${body}</g><path data-local-split="true" d="M0,${cy} H12 M12,${h / 3} V${(2 * h) / 3} M12,${h / 3} H24 M12,${(2 * h) / 3} H24" fill="none" stroke="${muted}"/><circle data-junction="true" cx="12" cy="${cy}" r="3" fill="${muted}" stroke="none"/>`;
    }
    symbols += `<g data-node="${id}" data-type="${type}" transform="translate(${x},${y})" fill="${bg}" stroke="${text}" stroke-width="1.7"><title>${esc(type === 'INPUT' ? node.name : type)}</title>${body}</g>`;
  }
  return symbols;
}
