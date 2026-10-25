# Karnaugh Solver

A single-page Boolean logic workbench for 1–8 variables. Plain HTML, CSS, and ES modules; no build step or backend.

## Run locally

Requires Node.js 18 or later for the development server and tests:

```sh
npm run dev
npm test
```

Open http://127.0.0.1:4173. Serve over HTTP rather than opening `index.html` directly because the solver uses an ES module worker. Run `npm ci` once before running tests to install the pinned ELK development dependency.

Run `npm run format` to format first-party JavaScript and CSS, or `npm run format:check` to check formatting without changing files. Vendored libraries and generated files are excluded.

## Code organization

- `app.js` coordinates application state, user actions, and rendering.
- `logic/` contains Boolean utilities, exact minimization, and expression construction, conversion, formatting, and evaluation. The minimizer separates prime generation, chart reduction, greedy bounds, and exact cover search.
- `circuit/` separates netlist construction, wire routing, cached ELK layout, and SVG rendering.
- `rendering/` contains Karnaugh map and timing SVG renderers, group styles, and shared XML escaping.
- `ui/` handles formula presentation, MathJax integration, zoom, themes, clipboard access, and SVG downloads.
- `logic.js`, `circuit.js`, and `svg.js` retain the public exports used by the application, worker, and tests.

Pure logic and SVG generation do not depend on the DOM. Browser integrations stay in `ui/` and the application controller. New runtime modules must also be included in the static-site copy step in `.github/workflows/pages.yml`.

## GitHub Pages

The `Deploy GitHub Pages` workflow tests and publishes the site on every push to `main`. It can also be run manually from the Actions tab. Deployment uses the repository's GitHub token; no secrets are required. Only the static page, JavaScript modules, styles, and vendored ELK runtime/license are published.

One-time repository setup: in GitHub **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. Then commit and push:

```sh
git add .github/workflows/pages.yml .gitignore README.md
git commit -m "Configure automatic GitHub Pages deployment"
git push -u origin main
```

The site will be available at https://baalintnagy.github.io/karnaugh/ after the workflow succeeds. All asset and worker paths are relative, so repository Pages work without configuration. If the default branch is renamed, update the workflow's branch filter too.

## Conventions

- A is the most significant input bit; rows ascend from 0 to 2ⁿ−1.
- Outputs cycle 0 → 1 → X in the truth table and map. X means don't care. Invert preserves X, while Clear and presets replace it with defined values.
- Function order: N = Σ f(i)2ⁱ, computed exactly with BigInt (including 256-bit orders). Tables containing X show “Partially specified” because there is no unique order number.
- DNF and CNF are canonical for complete tables. For partial tables, DNF includes only specified 1 rows (X completes to 0), and CNF includes only specified 0 rows (X completes to 1). Constants are reduced to 0 or 1.
- Minimal SOP and the POS used for NOR use Quine–McCluskey plus exact branch-and-bound cover selection. The objective is fewest terms, then fewest literals. This is a two-level minimum, not a globally minimum gate network.
- Don't-care rows participate in prime generation but are not required in the cover. All displayed circuits satisfy the specified 0/1 rows, while different forms may choose different completions of X. An all-X table can complete to constant 0 or constant 1.
- K-map axes use reflected Gray code. Colored outlines show SOP implicants. Dashed fragments with the same color continue across opposite boundaries; a group can appear in several fragments for large maps.
- NAND is a NAND-only conversion of the minimal SOP. NOR is a NOR-only conversion of the minimal POS. Inverters tie both gate inputs together. Constants are supply inputs.
- AND in formulas is denoted by juxtaposition, with OR denoted by +.
- The timing diagram shows all inputs and output f across ascending truth-table rows, with equal ideal time intervals and no propagation delay. Crossed X bands show unspecified outputs rather than choosing a circuit completion. It updates immediately and can be downloaded as SVG.
- Diagrams use SVG with shared identical subexpressions and multi-input gates. ELK routes orthogonal wires between explicit, fixed pins around gate bodies. Dots mark connected branches; wire jumps mark crossings without connections. Download the selected circuit from any expression tab.
- Gate inputs may reorder because AND, OR, NAND, and NOR are commutative. ELK provides the initial gate order; deterministic channel routing then places gates in separate vertical bands and reserves a 28-unit channel for each gate output net. Input rails remain 26 units apart. This keeps unrelated vertical routes separated, and prevents crossings from coinciding with junctions. Circuits use more space to preserve readability.
- Inputs use separate vertical rails ordered A–H from left to right. Each used rail has marked taps aligned with its destination pins; unused inputs remain labeled. Gates are arranged in columns by dependency depth, with enough room between columns for the reserved signal channels.
- Exact minimization is exponential in the worst case. A worker keeps the page interactive; changing the truth table cancels the previous solve.

ASCIIMath is rendered by MathJax 3.2.2 from jsDelivr. Fonts load from Google Fonts. When offline, raw ASCIIMath and system fonts remain available; solving and SVG generation are entirely local. The Copy ASCIIMath button copies the source of the selected formula.

Circuit layout uses the committed ELK 0.12.0 runtime and a local worker. GitHub Pages still needs no build step or npm installation. See [vendor/README.md](vendor/README.md) for library source and licensing.
