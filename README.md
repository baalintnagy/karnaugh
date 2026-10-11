# Karnaugh Studio

A single-page Boolean logic workbench for 1–8 variables. Plain HTML, CSS, and ES modules; no build step or backend.

## Run locally

Requires Node.js 18 or later for the development server and tests:

```sh
npm run dev
npm test
```

Open http://127.0.0.1:4173. Serve over HTTP rather than opening `index.html` directly because the solver uses an ES module worker. Run `npm ci` once before running tests to install the pinned ELK development dependency.

## GitHub Pages

After adding your remote, push this repository. In GitHub **Settings → Pages**, select **Deploy from a branch**, your branch, and **/ (root)**. All asset paths are relative, so both repository and user Pages work. `.nojekyll` disables Jekyll processing. No credentials, install, or build are required for deployment.

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
- Inputs use separate vertical rails ordered A–H from left to right. Each used rail has marked taps feeding the gates; unused inputs remain labeled. ELK first lays out the circuit using a compact input bank. A final pass extends rails and aligns taps to outgoing routes near gate input heights, removing unnecessary initial vertical detours when the corridor is clear. Gate positions and the rest of ELK's routes are preserved.
- Exact minimization is exponential in the worst case. A worker keeps the page interactive; changing the truth table cancels the previous solve.

ASCIIMath is rendered by MathJax 3.2.2 from jsDelivr. Fonts load from Google Fonts. When offline, raw ASCIIMath and system fonts remain available; solving and SVG generation are entirely local. The Copy ASCIIMath button copies the source of the selected formula.

Circuit layout uses the committed ELK 0.12.0 runtime and a local worker. GitHub Pages still needs no build step or npm installation. See [vendor/README.md](vendor/README.md) for library source and licensing.
