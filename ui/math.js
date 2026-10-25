export const mathSource = (source) => '`' + source + '`';

export function clearTypesetting(elements) {
  try {
    window.MathJax?.typesetClear?.(elements);
  } catch {
    // Cached typesetting is optional when MathJax is unavailable.
  }
}

export function createTypesetter(getElements) {
  let mathQueue = Promise.resolve();
  return function typeset() {
    mathQueue = mathQueue
      .then(async () => {
        if (window.MathJax?.startup?.promise) {
          await window.MathJax.startup.promise;
          await window.MathJax.typesetPromise?.(getElements());
        }
      })
      .catch(() => {
        /* Source remains readable if the CDN is unavailable. */
      });
    return mathQueue;
  };
}
