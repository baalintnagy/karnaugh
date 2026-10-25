import { solve } from './logic.js';
self.onmessage = ({ data: { n, values } }) => {
  try {
    self.postMessage({ result: solve(n, values) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
