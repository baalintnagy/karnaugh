import { circuitGraph } from './graph.js';
import { routeInChannels } from './routing.js';

let elk;
const layouts = new WeakMap();
export async function layoutCircuit(tree, variableCount) {
  const cacheKey = variableCount || 0;
  if (layouts.get(tree)?.has(cacheKey)) return layouts.get(tree).get(cacheKey);
  if (!elk) {
    if (typeof window === 'undefined') {
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
      elk = new ELK();
    } else
      elk = new window.ELK({
        workerUrl: new URL('../vendor/elk-worker.min.js', import.meta.url).href,
      });
  }
  const graph = circuitGraph(tree, variableCount),
    aliases = [];
  for (const node of graph.children.filter((node) => node.tiedInputs)) {
    const first = graph.edges.find(
      (edge) => edge.targets[0] === `${node.id}-in-0`,
    );
    const duplicate = graph.edges.find(
      (edge) => edge.targets[0] === `${node.id}-in-1`,
    );
    aliases.push({ first: first.id, duplicate });
    graph.edges = graph.edges.filter((edge) => edge !== duplicate);
  }
  const pending = elk
    .layout(graph)
    .then(routeInChannels)
    .then((placed) => {
      for (const { first, duplicate } of aliases) {
        const feed = placed.edges.find((edge) => edge.id === first);
        placed.edges.push({
          ...structuredClone(feed),
          id: duplicate.id,
          targets: duplicate.targets,
          sharedFeed: true,
        });
      }
      return placed;
    });
  if (!layouts.has(tree)) layouts.set(tree, new Map());
  layouts.get(tree).set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    layouts.get(tree).delete(cacheKey);
    throw error;
  }
}
