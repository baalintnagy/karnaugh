import { describeForm, renderFormula } from './ui/formula.js';
import { mathSource, clearTypesetting, createTypesetter } from './ui/math.js';
import { copyText, downloadSvg } from './ui/export.js';
import { applyZoom, setupZoom } from './ui/zoom.js';
import { setupTheme } from './ui/theme.js';
import { names, orderNumber, expression, sop, matches } from './logic.js';
import { mapSvg, circuitSvg, timingSvg, colors, groupOutline } from './svg.js';
const $ = (id) => document.getElementById(id);
let variableCount = 3,
  values = [0, 1, 1, 1, 0, 0, 1, 1],
  result = null,
  form = 'minimal',
  worker = null,
  revision = 0,
  svg = '';
let diagramRevision = 0;
let formulaSource = '';
function renderTruthTable() {
  $('truth-table').querySelector('thead').innerHTML =
    `<tr><th scope="col">i</th>${names(variableCount)
      .map((v) => `<th scope="col">${v}</th>`)
      .join('')}<th scope="col">f</th></tr>`;
  $('truth-table').querySelector('tbody').innerHTML = values
    .map(
      (v, i) =>
        `<tr><td>${i}</td>${names(variableCount)
          .map((_, j) => `<td>${(i >> (variableCount - 1 - j)) & 1}</td>`)
          .join(
            '',
          )}<td><button class="bit ${v === 1 ? 'on' : v === 'X' ? 'dont-care' : ''}" data-index="${i}" aria-label="Row ${i}, output ${v === 'X' ? 'X (don’t care)' : v}. Cycle 0, 1, X.">${v}</button></td></tr>`,
    )
    .join('');
  $('row-count').textContent = `${values.length} rows`;
  $('variables').value = variableCount;
  $('minus').disabled = variableCount === 1;
  $('plus').disabled = variableCount === 8;
}
const legendResize = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const border = target.querySelector('.legend-outline rect');
    if (border) {
      border.setAttribute('width', Math.max(0, target.offsetWidth - 3));
      border.setAttribute('height', Math.max(0, target.offsetHeight - 3));
    }
  }
});
function highlightTerms(indices = []) {
  const selected = new Set(indices),
    cubes = result?.ones || [];
  $('map').classList.toggle('has-term-highlight', selected.size > 0);
  $('map')
    .querySelectorAll('[data-map-group]')
    .forEach((group) =>
      group.classList.toggle(
        'term-highlight',
        selected.has(Number(group.dataset.mapGroup) - 1),
      ),
    );
  $('map')
    .querySelectorAll('.map-cell')
    .forEach((cell) =>
      cell.classList.toggle(
        'term-highlight',
        indices.some((i) => matches(cubes[i], Number(cell.dataset.index))),
      ),
    );
  $('legend')
    .querySelectorAll('.legend-item')
    .forEach((item, i) =>
      item.classList.toggle('term-highlight', selected.has(i)),
    );
}
function renderMap() {
  $('map').classList.remove('has-term-highlight');
  $('map').innerHTML = mapSvg(variableCount, values, result?.ones || []);
  applyZoom('map');
  $('map')
    .querySelectorAll('.map-cell')
    .forEach((cell) => {
      const highlight = () =>
        highlightTerms(
          (result?.ones || []).flatMap((cube, i) =>
            matches(cube, Number(cell.dataset.index)) ? [i] : [],
          ),
        );
      cell.addEventListener('mouseenter', highlight);
      cell.addEventListener('mouseleave', () => highlightTerms());
      cell.addEventListener('focus', highlight);
      cell.addEventListener('blur', () => highlightTerms());
    });
  clearTypesetting([$('legend')]);
  $('legend')
    .querySelectorAll('.legend-item')
    .forEach((item) => legendResize.unobserve(item));
  $('legend').replaceChildren();
  if (result)
    result.ones.forEach((c, i) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.tabIndex = 0;
      item.setAttribute(
        'aria-label',
        `Highlight term ${i + 1} on the Karnaugh map`,
      );
      item.addEventListener('mouseenter', () => highlightTerms([i]));
      item.addEventListener('mouseleave', () => highlightTerms());
      item.addEventListener('focus', () => highlightTerms([i]));
      item.addEventListener('blur', () => highlightTerms());
      const dot = document.createElement('span'),
        outline = groupOutline(i);
      dot.title = outline.name + ' outline';
      dot.innerHTML = `<svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true"><path d="M2,6 H30" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2" ${outline.attributes}/></svg>`;
      const term = document.createElement('span');
      term.textContent = mathSource(expression(sop(variableCount, [c])));
      const border = document.createElement('span');
      border.innerHTML = `<svg class="legend-outline" aria-hidden="true"><rect x="1.5" y="1.5" rx="5" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2" ${outline.attributes}/></svg>`;
      item.append(dot, term, border);
      $('legend').append(item);
      legendResize.observe(item);
    });
}
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    ['text', 'muted', 'line', 'accent', 'bg'].map((k) => [
      k,
      style.getPropertyValue('--' + (k === 'bg' ? 'panel' : k)).trim(),
    ]),
  );
}
function renderTiming() {
  $('timing').innerHTML = timingSvg(variableCount, values, readPalette());
  applyZoom('timing');
}
const typeset = createTypesetter(() => [
  $('formula'),
  $('legend'),
  $('order-note'),
]);
async function renderForm() {
  const drawing = ++diagramRevision;
  $('expression-content').setAttribute('aria-labelledby', 'tab-' + form);
  document.querySelectorAll('[data-form]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.form === form));
    b.tabIndex = b.dataset.form === form ? 0 : -1;
  });
  const description = describeForm(form, values.includes('X'));
  $('form-name').textContent = description.name;
  $('form-note').textContent = description.note;
  $('copy').disabled = !result;
  $('download').disabled = true;
  clearTypesetting([$('formula')]);
  if (!result) {
    $('formula').textContent = 'Computing exact cover…';
    formulaSource = '';
    $('diagram').replaceChildren();
    return;
  }
  formulaSource = renderFormula($('formula'), result.forms[form]);
  typeset();
  $('diagram').textContent = 'Routing circuit wires…';
  try {
    const rendered = await circuitSvg(
      result.forms[form],
      readPalette(),
      variableCount,
    );
    if (drawing !== diagramRevision) return;
    svg = rendered;
    $('diagram').innerHTML = svg;
    applyZoom('diagram');
    $('download').disabled = false;
  } catch (error) {
    if (drawing !== diagramRevision) return;
    $('diagram').textContent = 'Circuit layout failed. Reload to retry.';
    console.error(error);
  }
}
function update() {
  const id = ++revision;
  worker?.terminate();
  result = null;
  renderTruthTable();
  renderMap();
  renderTiming();
  renderForm();
  const unspecified = values.filter((v) => v === 'X').length;
  $('order').textContent = orderNumber(values) ?? 'Partially specified';
  clearTypesetting([$('order-note')]);
  $('order-note').textContent = unspecified
    ? `${unspecified} don't-care row${unspecified === 1 ? '' : 's'} · no unique function order number`
    : mathSource('N = sum f(i) 2^i') +
      ' / row 0 means the least significant bit';
  $('dont-cares').textContent = unspecified;
  $('ones').textContent = values.filter((v) => v === 1).length;
  $('groups').textContent = '…';
  $('status').textContent = 'Finding exact minimum…';
  try {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }) => {
      if (id !== revision) return;
      if (data.error) {
        fail(data.error);
        return;
      }
      result = data.result;
      $('groups').textContent = result.ones.length;
      $('status').textContent = 'Exact solution';
      renderMap();
      renderForm();
      worker.terminate();
    };
    worker.onerror = () =>
      fail('Solver could not start. Serve this folder over HTTP.');
    worker.postMessage({ n: variableCount, values });
  } catch (error) {
    fail(error.message);
  }
}
function fail(message) {
  $('status').textContent = message;
  $('formula').textContent =
    'Unable to solve. Reload the page or use a local HTTP server.';
  $('groups').textContent = '–';
}
function setVariableCount(value) {
  const next = Math.max(1, Math.min(8, Math.round(Number(value) || 1)));
  if (next === variableCount) {
    $('variables').value = variableCount;
    return;
  }
  variableCount = next;
  values = Array.from({ length: 2 ** variableCount }, (_, i) => values[i] || 0);
  $('preset').value = '';
  update();
}
function cycleOutput(i) {
  const focused = document.activeElement?.dataset?.index === String(i),
    inTable = $('truth-table').contains(document.activeElement);
  values[i] = values[i] === 0 ? 1 : values[i] === 1 ? 'X' : 0;
  $('preset').value = '';
  update();
  if (focused)
    (inTable ? $('truth-table') : $('map'))
      .querySelector(`[data-index="${i}"]`)
      ?.focus();
}
$('variables').addEventListener('input', (e) => {
  if (
    e.target.value !== '' &&
    Number.isInteger(+e.target.value) &&
    +e.target.value >= 1 &&
    +e.target.value <= 8
  )
    setVariableCount(e.target.value);
});
$('variables').addEventListener('change', (e) =>
  setVariableCount(e.target.value),
);
$('minus').onclick = () => setVariableCount(variableCount - 1);
$('plus').onclick = () => setVariableCount(variableCount + 1);
$('truth-table').onclick = (e) => {
  const button = e.target.closest('[data-index]');
  if (button) cycleOutput(+button.dataset.index);
};
$('map').onclick = (e) => {
  const cell = e.target.closest('[data-index]');
  if (cell) cycleOutput(+cell.dataset.index);
};
$('map').onkeydown = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const cell = e.target.closest('[data-index]');
    if (cell) {
      e.preventDefault();
      const i = +cell.dataset.index;
      cycleOutput(i);
      $('map').querySelector(`[data-index="${i}"]`)?.focus();
    }
  }
};
$('clear').onclick = () => {
  values.fill(0);
  $('preset').value = '';
  update();
};
$('invert').onclick = () => {
  values = values.map((v) => (v === 'X' ? 'X' : 1 - v));
  $('preset').value = '';
  update();
};
$('random').onclick = () => {
  values = values.map(() => (Math.random() < 0.5 ? 0 : 1));
  $('preset').value = '';
  update();
};
$('preset').onchange = (e) => {
  const preset = e.target.value;
  if (!preset) return;
  values = values.map((_, i) => {
    const bits = i.toString(2).split('1').length - 1;
    return preset === 'majority'
      ? +(bits > variableCount / 2)
      : preset === 'parity'
        ? bits % 2
        : (i >> (variableCount - 1)) & 1;
  });
  update();
};
document.querySelector('.tabs').onclick = (e) => {
  const button = e.target.closest('[data-form]');
  if (button) {
    form = button.dataset.form;
    renderForm();
  }
};
document.querySelector('.tabs').onkeydown = (e) => {
  const buttons = [...document.querySelectorAll('[data-form]')];
  const i = buttons.indexOf(document.activeElement);
  if (i < 0) return;
  let next;
  if (e.key === 'ArrowRight') next = (i + 1) % buttons.length;
  if (e.key === 'ArrowLeft') next = (i + buttons.length - 1) % buttons.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = buttons.length - 1;
  if (next !== undefined) {
    e.preventDefault();
    form = buttons[next].dataset.form;
    renderForm();
    buttons[next].focus();
  }
};
$('copy').onclick = async () => {
  const copied = await copyText(formulaSource, $('copy'));
  if (copied) {
    $('copy').textContent = 'Copied';
    setTimeout(() => ($('copy').textContent = 'Copy ASCIIMath'), 1500);
  } else
    $('status').textContent =
      'Copy failed. Check your browser clipboard permissions.';
};
$('download').onclick = () =>
  downloadSvg(svg, `karnaugh-${variableCount}-${form}.svg`);
$('download-timing').onclick = () =>
  downloadSvg(
    timingSvg(variableCount, values, readPalette()),
    `karnaugh-${variableCount}-timing.svg`,
  );
setupZoom();
setupTheme(() => {
  renderTiming();
  if (result) renderForm();
}, savedTheme);
update();
window.addEventListener('load', () => {
  if (result) typeset();
});
