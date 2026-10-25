const $ = (id) => document.getElementById(id);

const zoomLevels = { 'truth-table': 100, map: 100, diagram: 100, timing: 100 };
const zoomMin = 10,
  zoomMax = 300;
// A square-root scale keeps extra precision at low zoom without a full log curve.
const zoomPosition = (percent) =>
  (Math.sqrt(percent) - Math.sqrt(zoomMin)) /
  (Math.sqrt(zoomMax) - Math.sqrt(zoomMin));
const zoomPercent = (position) =>
  Math.round(
    (Math.sqrt(zoomMin) +
      position * (Math.sqrt(zoomMax) - Math.sqrt(zoomMin))) **
      2,
  );
export function applyZoom(id) {
  if (id === 'truth-table') {
    $(id).style.zoom = zoomLevels[id] / 100;
    return;
  }
  const image = $(id).querySelector('svg');
  if (!image) return;
  const box = image.viewBox.baseVal,
    scale = zoomLevels[id] / 100;
  Object.assign(image.style, {
    width: `${box.width * scale}px`,
    height: `${box.height * scale}px`,
    minWidth: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    flexShrink: '0',
  });
  // Fit the map to its viewport at 100%; higher zoom can still scroll.
  if (id === 'map') {
    // Base the viewport on the unzoomed map, with padding and scrollbar space.
    $(id).style.height = `${box.height + 28}px`;
    Object.assign(image.style, {
      maxWidth: `${zoomLevels[id]}%`,
      height: 'auto',
      alignSelf: 'safe center',
    });
  }
}
export function setupZoom() {
  for (const [id, name] of [
    ['truth-table', 'Truth table'],
    ['map', 'Karnaugh map'],
    ['diagram', 'Logic circuit'],
    ['timing', 'Timing diagram'],
  ]) {
    const control = document.createElement('div');
    control.className = 'zoom-control';
    control.innerHTML = `<label for="${id}-zoom">Zoom<span class="sr-only"> ${name}</span></label><input id="${id}-zoom" type="range" min="0" max="1" step="any" value="${zoomPosition(100)}" aria-valuetext="100 percent"><output id="${id}-zoom-value" for="${id}-zoom">100%</output><button class="text-button" aria-label="Reset ${name.toLowerCase()} zoom">Reset</button>`;
    (id === 'truth-table' ? $(id).parentElement : $(id)).before(control);
    const slider = control.querySelector('input'),
      output = control.querySelector('output');
    const change = () => {
      const percent = zoomPercent(Number(slider.value));
      zoomLevels[id] = percent;
      output.textContent = `${percent}%`;
      slider.setAttribute('aria-valuetext', `${percent} percent`);
      applyZoom(id);
    };
    slider.addEventListener('input', change);
    control.querySelector('button').onclick = () => {
      slider.value = String(zoomPosition(100));
      change();
    };
  }
}
