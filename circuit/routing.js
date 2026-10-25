export function wireCrossings(graph, nearGate = false) {
  const segments = graph.edges.flatMap((edge) =>
    (edge.sections || []).flatMap((section) => {
      const points = [
        section.startPoint,
        ...(section.bendPoints || []),
        section.endPoint,
      ];
      return points
        .slice(1)
        .map((b, i) => ({ a: points[i], b, net: edge.net || edge.sources[0] }));
    }),
  );
  const horizontal = segments.filter((s) => s.a.y === s.b.y),
    vertical = segments.filter((s) => s.a.x === s.b.x);
  let count = 0;
  for (const h of horizontal)
    for (const v of vertical)
      if (
        h.net !== v.net &&
        v.a.x > Math.min(h.a.x, h.b.x) &&
        v.a.x < Math.max(h.a.x, h.b.x) &&
        h.a.y > Math.min(v.a.y, v.b.y) &&
        h.a.y < Math.max(v.a.y, v.b.y)
      ) {
        if (
          !nearGate ||
          graph.children.some(
            (node) =>
              node.ports.some((p) => p.id.includes('-in-')) &&
              v.a.x >= node.x - 48 &&
              v.a.x < node.x &&
              h.a.y >= node.y &&
              h.a.y <= node.y + node.bodyHeight,
          )
        )
          count++;
      }
  return count;
}
export function spreadVerticalLanes(graph, clearance = 16) {
  const collect = () =>
    graph.edges.flatMap((edge) =>
      (edge.sections || []).flatMap((section) => {
        const points = [
          section.startPoint,
          ...(section.bendPoints || []),
          section.endPoint,
        ];
        return points.slice(1).flatMap((b, i) =>
          points[i].x === b.x && points[i].y !== b.y
            ? [
                {
                  edge,
                  points,
                  i,
                  a: points[i],
                  b,
                  net: edge.net || edge.sources[0],
                },
              ]
            : [],
        );
      }),
    );
  const overlaps = (a, b) =>
    Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) >
    Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y));
  let moves = 0;
  for (let pass = 0; pass < 3 && moves < 32; pass++) {
    const lanes = collect();
    let changed = false;
    for (const lane of lanes) {
      const { a, b, points, i, net } = lane;
      if (
        i === 0 ||
        i + 2 >= points.length ||
        points[i - 1].y !== a.y ||
        points[i + 2].y !== b.y
      )
        continue;
      if (
        !lanes.some(
          (other) =>
            other.net !== net &&
            overlaps(lane, other) &&
            Math.abs(a.x - other.a.x) < clearance,
        )
      )
        continue;
      const oldX = a.x,
        minX = Math.min(points[i - 1].x, points[i + 2].x),
        maxX = Math.max(points[i - 1].x, points[i + 2].x);
      let before;
      for (const offset of [
        clearance,
        -clearance,
        2 * clearance,
        -2 * clearance,
        3 * clearance,
        -3 * clearance,
      ]) {
        const x = oldX + offset;
        if (x <= minX + 4 || x >= maxX - 4) continue;
        if (
          lanes.some(
            (other) =>
              other !== lane &&
              other.net !== net &&
              overlaps(lane, other) &&
              Math.abs(x - other.a.x) < clearance,
          )
        )
          continue;
        before ??= wireCrossings(graph);
        a.x = b.x = x;
        const segmentHits = points.slice(i, i + 3).some((end, j) => {
          const start = points[i + j - 1];
          return graph.children.some((node) => {
            const left = node.x + 0.01,
              right = node.x + node.width - 0.01,
              top = node.y + 0.01,
              bottom = node.y + node.height - 0.01;
            return start.y === end.y
              ? start.y > top &&
                  start.y < bottom &&
                  Math.max(start.x, end.x) > left &&
                  Math.min(start.x, end.x) < right
              : start.x > left &&
                  start.x < right &&
                  Math.max(start.y, end.y) > top &&
                  Math.min(start.y, end.y) < bottom;
          });
        });
        if (!segmentHits && wireCrossings(graph) <= before) {
          changed = true;
          moves++;
          break;
        }
        a.x = b.x = oldX;
      }
      if (moves >= 32) break;
    }
    if (!changed) break;
  }
  return graph;
}
export function untangleGateApproaches(graph) {
  const pointsOf = (edge) => {
    const s = edge.sections[0];
    return [s.startPoint, ...(s.bendPoints || []), s.endPoint];
  };
  for (const node of graph.children.filter(
    (n) =>
      !n.tiedInputs && ['AND', 'OR', 'NAND', 'NOR', 'XOR'].includes(n.type),
  )) {
    const incoming = graph.edges.filter((e) =>
      e.targets[0].startsWith(`${node.id}-in-`),
    );
    if (incoming.length < 2) continue;
    const cut = node.x - 16 * (incoming.length + 2),
      routes = [];
    for (const edge of incoming) {
      const points = pointsOf(edge);
      let entry = -1;
      for (let i = 0; i < points.length - 1; i++)
        if (
          points[i].y === points[i + 1].y &&
          points[i].x <= cut &&
          points[i + 1].x >= cut &&
          points.slice(i + 1).every((p) => p.x >= cut)
        )
          entry = i;
      if (entry < 0) break;
      routes.push({ edge, points, entry, y: points[entry].y });
    }
    if (routes.length !== incoming.length) continue;
    routes.sort((a, b) => a.y - b.y);
    const pinY = (r) => node.ports.find((p) => p.id === r.edge.targets[0]).y;
    if (routes.every((r, i) => !i || pinY(routes[i - 1]) <= pinY(r))) continue;
    const saved = routes.map((r) => structuredClone(r.edge.sections)),
      oldPorts = node.ports.map((p) => p.y),
      before = wireCrossings(graph);
    routes.forEach((r, i) => {
      const pin = node.ports.find((p) => p.id === r.edge.targets[0]),
        targetY = node.y + ((i + 1) * node.bodyHeight) / (routes.length + 1);
      pin.y = targetY - node.y;
      const lane = targetY >= r.y ? node.x - 16 * (i + 1) : cut + 16 * (i + 1);
      const points = [
        ...r.points.slice(0, r.entry + 1),
        { x: lane, y: r.y },
        { x: lane, y: targetY },
        { x: node.x, y: targetY },
      ];
      r.edge.sections[0].bendPoints = points.slice(1, -1);
      r.edge.sections[0].endPoint = points.at(-1);
    });
    const hitsNode = routes.some((r) => {
      const p = pointsOf(r.edge);
      return p.slice(1).some((b, i) =>
        graph.children.some((other) => {
          if (other === node) return false;
          const a = p[i],
            left = other.x + 0.01,
            right = other.x + other.width - 0.01,
            top = other.y + 0.01,
            bottom = other.y + other.height - 0.01;
          return a.y === b.y
            ? a.y > top &&
                a.y < bottom &&
                Math.max(a.x, b.x) > left &&
                Math.min(a.x, b.x) < right
            : a.x > left &&
                a.x < right &&
                Math.max(a.y, b.y) > top &&
                Math.min(a.y, b.y) < bottom;
        }),
      );
    });
    if (hitsNode || wireCrossings(graph) >= before) {
      routes.forEach((r, i) => (r.edge.sections = saved[i]));
      node.ports.forEach((p, i) => (p.y = oldPorts[i]));
    }
  }
  return graph;
}
export function alignRailTaps(graph) {
  const bus = graph.children.find((node) => node.type === 'BUS');
  if (!bus || !bus.ports.length) return graph;
  const right = bus.x + bus.width,
    gateLeft = Math.min(
      ...graph.children.filter((node) => node !== bus).map((node) => node.x),
    );
  const namesByPort = new Map(bus.ports.map((p) => [p.id, p.name]));
  const pointsOf = (edge) => [
    edge.sections[0].startPoint,
    ...(edge.sections[0].bendPoints || []),
    edge.sections[0].endPoint,
  ];
  const busEdges = graph.edges.filter((edge) =>
    namesByPort.has(edge.sources[0]),
  );
  const proposals = busEdges.map((edge) => {
    const points = pointsOf(edge),
      name = namesByPort.get(edge.sources[0]);
    let index = 0;
    // Keep ELK's route past the input corridor, but remove the initial vertical
    // detour by extending the corresponding rail to that route's height.
    for (let i = 1; i < points.length - 1; i++)
      if (
        points[i].x >= right &&
        points[i].x < gateLeft - 8 &&
        points[i].y === points[i + 1].y
      )
        index = i;
    return { edge, name, points, index };
  });
  const occupied = graph.edges.flatMap((edge) => {
    const points = pointsOf(edge);
    return points.slice(1).flatMap((b, i) => {
      const a = points[i];
      return a.y === b.y
        ? [
            {
              y: a.y,
              left: Math.min(a.x, b.x),
              right: Math.max(a.x, b.x),
              net: edge.net || edge.sources[0],
            },
          ]
        : [];
    });
  });
  const taps = [];
  for (const proposal of proposals) {
    const { edge, name, points } = proposal;
    let { index } = proposal;
    if (index) {
      const p = points[index];
      if (
        occupied.some(
          (s) =>
            s.net !== name &&
            Math.abs(s.y - p.y) < 4 &&
            s.right > right &&
            s.left < p.x,
        )
      )
        index = 0;
    }
    const p = points[index],
      start = { x: right, y: p.y };
    const route = [
      start,
      ...points.slice(index).filter((point, i) => i !== 0 || point.x !== right),
    ];
    const id = `bus-${name}-level-${edge.id}`;
    edge.sources = [id];
    edge.sections[0].startPoint = start;
    edge.sections[0].bendPoints = route.slice(1, -1);
    taps.push({
      id,
      name,
      x: bus.width,
      y: p.y,
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': 'EAST' },
    });
    occupied.push({ y: p.y, left: right, right: points[index].x, net: name });
  }
  const top = Math.min(bus.y, ...taps.map((p) => p.y - 50)),
    bottom = Math.max(bus.y + bus.height, ...taps.map((p) => p.y + 20));
  bus.y = top;
  bus.height = bus.bodyHeight = bottom - top;
  bus.ports = taps.map((p) => ({ ...p, y: p.y - top }));
  // Leave room above the highest tap for input labels.
  const shift = Math.max(0, 24 - top);
  if (shift) {
    for (const node of graph.children) node.y += shift;
    for (const edge of graph.edges)
      for (const section of edge.sections) {
        section.startPoint.y += shift;
        section.endPoint.y += shift;
        for (const p of section.bendPoints || []) p.y += shift;
      }
  }
  graph.height = Math.max(graph.height + shift, bottom + shift + 24);
  return graph;
}
export function routeInChannels(graph) {
  const gap = 28,
    bus = graph.children.find((n) => n.type === 'BUS'),
    owners = new Map(
      graph.children.flatMap((n) => n.ports.map((p) => [p.id, n])),
    ),
    depths = new Map();
  const isInputInverter = (node) =>
    (node.type === 'NOT' || node.tiedInputs) &&
    graph.edges
      .filter((e) => owners.get(e.targets[0]) === node)
      .every((e) => owners.get(e.sources[0]) === bus);
  const inverterName = (node) => {
    const incoming = graph.edges.find((e) => owners.get(e.targets[0]) === node);
    return (
      incoming?.net ||
      bus?.ports.find((p) => p.id === incoming?.sources[0])?.name ||
      ''
    );
  };
  const depth = (node) => {
    if (depths.has(node.id)) return depths.get(node.id);
    const incoming = graph.edges.filter(
      (e) => owners.get(e.targets[0]) === node,
    );
    const predecessors = incoming.map((e) => owners.get(e.sources[0]));
    const outputDriver = graph.edges.some(
      (e) =>
        owners.get(e.sources[0]) === node &&
        owners.get(e.targets[0])?.type === 'OUTPUT',
    );
    const stage =
      node === bus
        ? 0
        : node.type === 'CONST' || isInputInverter(node)
          ? 1
          : outputDriver &&
              predecessors.some(
                (p) => p !== bus && !isInputInverter(p) && p.type !== 'CONST',
              )
            ? 3
            : 2;
    const value =
      node === bus
        ? 0
        : Math.max(stage, Math.max(0, ...predecessors.map(depth)) + 1);
    depths.set(node.id, value);
    return value;
  };
  graph.children.forEach(depth);
  const nodes = graph.children.filter((n) => n !== bus),
    tracks = new Map(),
    levels = Math.max(...nodes.map(depth));
  if (bus) {
    bus.x = 24;
    bus.y = 24;
  }
  let left = bus ? bus.x + bus.width + 56 : 24,
    top = 64;
  for (let level = 1; level <= levels; level++) {
    const layer = nodes
      .filter((n) => depth(n) === level)
      .sort((a, b) => {
        if (isInputInverter(a) && isInputInverter(b))
          return (
            inverterName(a).localeCompare(inverterName(b)) ||
            a.id.localeCompare(b.id)
          );
        return a.y - b.y || a.id.localeCompare(b.id);
      });
    if (!layer.length) continue;
    const width = Math.max(...layer.map((n) => n.width));
    for (const node of layer) {
      node.x = left;
      node.y = top;
      top += node.height + gap * 2;
    }
    // Higher source gates take the farther lanes. Their wires turn down
    // beyond the lower gates' shorter output runs, rather than crossing them.
    const sources = [
      ...new Set(
        graph.edges
          .filter((e) => depth(owners.get(e.sources[0])) === level)
          .map((e) => e.sources[0]),
      ),
    ].sort((a, b) => {
      const na = owners.get(a),
        nb = owners.get(b);
      return (
        nb.y +
        nb.ports.find((p) => p.id === b).y -
        na.y -
        na.ports.find((p) => p.id === a).y
      );
    });
    sources.forEach((id, i) => tracks.set(id, left + width + gap * (i + 1)));
    left += width + gap * (sources.length + 3);
  }
  // Reorder interchangeable pins by the incoming signal's position. Every
  // gate has its own vertical band, so horizontal branches cannot overlap.
  const lastRailConsumer = new Map();
  for (const edge of graph.edges) {
    if (owners.get(edge.sources[0]) !== bus) continue;
    const target = owners.get(edge.targets[0]),
      name = edge.net || bus.ports.find((p) => p.id === edge.sources[0]).name;
    if (!lastRailConsumer.has(name) || lastRailConsumer.get(name).y < target.y)
      lastRailConsumer.set(name, target);
  }
  for (const node of nodes) {
    if (
      node.tiedInputs ||
      !['AND', 'OR', 'NAND', 'NOR', 'XOR'].includes(node.type)
    )
      continue;
    const inputs = graph.edges
      .filter((e) => owners.get(e.targets[0]) === node)
      .sort((a, b) => {
        const na = owners.get(a.sources[0]),
          nb = owners.get(b.sources[0]);
        // Direct rail inputs belong after gate outputs: their long horizontal
        // runs then pass below the output nets' last branches.
        const ya = na === bus ? Number.MAX_SAFE_INTEGER : na.y,
          yb = nb === bus ? Number.MAX_SAFE_INTEGER : nb.y;
        if (na === bus && nb === bus) {
          const nameA =
              a.net || bus.ports.find((p) => p.id === a.sources[0]).name,
            nameB = b.net || bus.ports.find((p) => p.id === b.sources[0]).name;
          const endsA = lastRailConsumer.get(nameA) === node,
            endsB = lastRailConsumer.get(nameB) === node;
          // Rails ending here take the lower pins, rightmost rail first. The
          // lower, leftward branches then pass beneath the other rail ends.
          if (endsA !== endsB) return endsA ? 1 : -1;
          if (endsA) return nameB.localeCompare(nameA);
        }
        return (
          ya - yb ||
          String(a.net || a.sources[0]).localeCompare(
            String(b.net || b.sources[0]),
          )
        );
      });
    inputs.forEach((e, i) => {
      node.ports.find((p) => p.id === e.targets[0]).y =
        ((i + 1) * node.bodyHeight) / (inputs.length + 1);
    });
  }
  const taps = [];
  for (const edge of graph.edges) {
    const source = owners.get(edge.sources[0]),
      target = owners.get(edge.targets[0]),
      pin = target.ports.find((p) => p.id === edge.targets[0]),
      endPoint = { x: target.x + pin.x, y: target.y + pin.y };
    let startPoint, bendPoints;
    if (source === bus) {
      const old = bus.ports.find((p) => p.id === edge.sources[0]),
        id = `bus-${old.name}-channel-${edge.id}`;
      taps.push({ ...old, id, x: bus.width, y: endPoint.y - bus.y });
      edge.sources = [id];
      startPoint = { x: bus.x + bus.width, y: endPoint.y };
      bendPoints = [];
    } else {
      const port = source.ports.find((p) => p.id === edge.sources[0]),
        x = tracks.get(edge.sources[0]);
      startPoint = { x: source.x + port.x, y: source.y + port.y };
      bendPoints = [
        { x, y: startPoint.y },
        { x, y: endPoint.y },
      ];
    }
    edge.sections = [
      { id: `${edge.id}-channel`, startPoint, bendPoints, endPoint },
    ];
  }
  if (bus) {
    bus.ports = taps;
    bus.height = bus.bodyHeight = top - bus.y;
  }
  graph.width = left + 24;
  graph.height = top + 24;
  return graph;
}
