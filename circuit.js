import { layoutCircuit } from './circuit/layout.js';
import { renderCircuit } from './circuit/render.js';

export { circuitGraph } from './circuit/graph.js';
export {
  wireCrossings,
  spreadVerticalLanes,
  untangleGateApproaches,
  alignRailTaps,
  routeInChannels,
} from './circuit/routing.js';
export { layoutCircuit } from './circuit/layout.js';
export { renderCircuit } from './circuit/render.js';

export async function circuitSvg(tree, palette, variableCount) {
  return renderCircuit(await layoutCircuit(tree, variableCount), palette);
}
