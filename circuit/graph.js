// ELK only lays out this netlist. Gate semantics and SVG rendering stay local.
export function circuitGraph(tree, variableCount) {
  const nodes = [],
    intern = new Map(),
    edges = [];
  const port = (id, x, y, side) => ({
    id,
    x,
    y,
    width: 0,
    height: 0,
    layoutOptions: { 'elk.port.side': side },
  });
  function add(t) {
    const children = (t.children || []).map(add),
      key =
        t.type +
        ':' +
        (t.name ?? t.value ?? '') +
        ':' +
        children.map((c) => c.id).join(',');
    if (intern.has(key)) return intern.get(key);
    const tiedInputs =
      ['NAND', 'NOR'].includes(t.type) &&
      children.length === 2 &&
      children[0].id === children[1].id;
    const id = 'n' + nodes.length,
      bodyHeight = children.length
        ? Math.max(48, children.length * 24 + 24)
        : 32,
      width = children.length ? 94 + (tiedInputs ? 24 : 0) : 44;
    const node = {
      id,
      type: t.type,
      name: t.name,
      value: t.value,
      tiedInputs,
      bodyHeight,
      width,
      height: bodyHeight + (children.length ? 24 : 0),
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        ...children.map((_, i) =>
          port(
            `${id}-in-${i}`,
            0,
            tiedInputs
              ? bodyHeight / 2
              : ((i + 1) * bodyHeight) / (children.length + 1),
            'WEST',
          ),
        ),
        port(`${id}-out`, width, bodyHeight / 2, 'EAST'),
      ],
    };
    nodes.push(node);
    intern.set(key, node);
    children.forEach((c, i) =>
      edges.push({
        id: 'e' + edges.length,
        sources: [`${c.id}-out`],
        targets: [`${id}-in-${i}`],
      }),
    );
    return node;
  }
  const root = add(tree),
    output = {
      id: 'output',
      type: 'OUTPUT',
      width: 44,
      height: 32,
      bodyHeight: 32,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [port('output-in', 0, 16, 'WEST')],
    };
  nodes.push(output);
  edges.push({
    id: 'e' + edges.length,
    sources: [`${root.id}-out`],
    targets: ['output-in'],
  });
  const inputs = nodes
    .filter((node) => node.type === 'INPUT')
    .sort((a, b) => a.name.localeCompare(b.name));
  const inputNames = variableCount
    ? Array.from({ length: variableCount }, (_, i) =>
        String.fromCharCode(65 + i),
      )
    : inputs.map((node) => node.name);
  let bus;
  if (inputNames.length) {
    const taps = [];
    for (const name of inputNames) {
      const input = inputs.find((node) => node.name === name);
      if (!input) continue;
      const outgoing = edges.filter(
          (edge) => edge.sources[0] === `${input.id}-out`,
        ),
        batchSize = Math.max(1, Math.ceil(outgoing.length / 4));
      // Large tables share up to four rail taps per input, then fan out through
      // ELK's routed branches. This keeps canonical circuits compact.
      for (let i = 0; i < outgoing.length; i += batchSize) {
        const tapId = `bus-${name}-tap-${taps.length}`;
        taps.push({ id: tapId, name });
        for (const edge of outgoing.slice(i, i + batchSize)) {
          edge.sources = [tapId];
          edge.net = name;
        }
      }
    }
    const width = 48 + inputNames.length * 26,
      height = Math.max(140, 80 + taps.length * 18);
    bus = {
      id: 'input-bus',
      type: 'BUS',
      inputNames,
      width,
      height,
      bodyHeight: height,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        'elk.layered.layering.layerConstraint': 'FIRST',
      },
      ports: taps.map((tap, i) => ({
        ...port(tap.id, width, 60 + i * 18, 'EAST'),
        name: tap.name,
      })),
    };
  }
  return {
    id: 'circuit',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.spacing.nodeNode': '32',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
      'elk.layered.mergeEdges': 'false',
      'elk.randomSeed': '1',
    },
    children: [
      ...(bus ? [bus] : []),
      ...nodes.filter((node) => node.type !== 'INPUT'),
    ],
    edges,
  };
}
