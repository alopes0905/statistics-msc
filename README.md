# Statistics Lab · Statistics MSc

An independent coursework website for the Statistics course in an MSc in Cybersecurity. Each homework has a standalone page combining the problem, mathematical reasoning, original JavaScript implementation, interactive demonstration, verification, and sources.

**Current state: Homework 01 complete.** The site is [Statistics Lab](https://alopes0905.github.io/statistics-msc/), with [Homework 01](https://alopes0905.github.io/statistics-msc/homework-01/) at its own URL. The reusable template remains outside the publishing directory.

Homework 01 implements the professor’s [elliptic-curve assignment](https://github.com/alopes0905/statistics-msc/issues/1): repeated point addition on y² = x³ + 7 (mod 17), valid base/scalar selection, intermediate multiples, and a manual discrete SVG visualization. Its exhaustive subgroup experiment covers coordinate and bit frequencies, Pearson correlations, and adjacent-scalar Hamming distances, with explicit limitations. For G = (1, 5), k = 6, the calculated **toy public key is (5, 8)**; G has order 9, while the full curve has 18 elements.

The page has four sections: interactive demonstration, mathematical explanation, statistical exploration, and implementation/conclusions. Core source excerpts and statistical summaries are visible; supporting code and detailed datasets are expandable.

Local page: `/homework-01/` (or `/statistics-msc/homework-01/` with the project-subpath preview). Published page: [Homework 01](https://alopes0905.github.io/statistics-msc/homework-01/). This is an educational small-field implementation, not Ethereum-compatible cryptography.

## Academic constraints

- Use modern standard JavaScript with ES modules; modules are strict by specification. Prefer `const`, use `let` when needed, and never use `var`.
- Implement statistical algorithms from scratch, with general inputs and independent mathematical reasoning. Do not use third-party statistical, numerical, or visualization libraries.
- Do not use Python, R, MATLAB, SAS, or other external languages to implement or generate statistical solutions.
- Show and explain important implementation code directly on each homework page.
- Quote accurately and attribute sources. Follow the professor’s academic-integrity requirements and independently explain all submitted work.

Assessment consists of weekly homework and a final written project/thesis. An oral exam is generally required for requested grades above 27/30 and may also be required at the professor’s discretion. Late homework incurs a one-point penalty. Homework URLs are submitted in the Excel spreadsheet provided by the professor. Confirm assignment-specific directions against the actual brief.

## Technology and structure

The website is static HTML5, CSS3, and vanilla JavaScript. It uses system fonts, native browser APIs, and no external runtime resources. Future graphs must use native SVG or Canvas. Development and testing use Node.js built-ins, with no dependencies, installation, framework, bundler, or build step.

Shared CSS custom properties define colors, typography, spacing, borders, radii, shadows, and container widths. The two layout breakpoints, `56rem` and `40rem`, use literal media-query values because native CSS custom properties cannot define media-query thresholds. Light/dark appearance follows the operating system; reduced motion and print layouts are supported.

```text
docs/                         GitHub Pages publishing directory
  .nojekyll                   Disable Jekyll processing
  index.html                  Course landing page and homework list
  assets/
    favicon.svg               Local site icon
    css/main.css              Shared design system, themes, code blocks
    js/site.js                Shared progressive enhancement
    js/code-viewer.js         Source extraction, loading, and copying
  homework-01/
    index.html                Elliptic-curve report and interactive demonstration
    style.css                 Assignment layout, tables, and discrete SVG styling
    js/statistics.js           Pure field, point, and statistical algorithms
    js/app.js                  Input validation, DOM rendering, and step controls
templates/homework/           Unpublished reusable assignment template
  index.html                  Academic structure and example form
  style.css                   Assignment presentation
  js/statistics.js            Empty module for future pure algorithms
  js/app.js                   Template input validation and UI
tests/                        Native Node.js tests, including homework-01.test.js
tools/
  dev-server.js               Loopback static server and template preview
  check.js                    Syntax, links, assets, and structural checks
.github/workflows/ci.yml       Checks and tests; no deployment
package.json                  Native tooling commands; no dependencies
```

## Local development

Use a supported **Node.js 22 or 24 LTS** runtime and its bundled npm. CI exercises both lines. No `npm install` is required. Open a terminal in this repository:

```sh
npm run dev
```

Open the printed URL, normally `http://127.0.0.1:4173/`. The server binds only to `127.0.0.1` and serves `docs/`. Stop it with Ctrl+C. It serves appropriate MIME types, handles GET/HEAD and missing files, rejects traversal and escaping symlinks, and avoids browser caching during development. Open pages over HTTP; opening HTML as `file://` does not support this module/fetch workflow reliably.

To exercise the GitHub Pages project subpath:

```sh
npm run dev -- --base-path /statistics-msc/
```

To inspect the unpublished template without putting it in `docs/`:

```sh
npm run dev -- --template --base-path /statistics-msc/
```

Open the printed template URL, normally `http://127.0.0.1:4173/statistics-msc/homework-template/`. This mode stages a temporary snapshot of the site and template, then removes it when the server stops. **Restart it after editing files.** Normal development serves live files. Use `--port 4174` if the default port is occupied.

## Verification

```sh
npm run check
npm test
```

`check` checks JavaScript syntax, relative local links and fragments, stylesheet/script references, CSS URLs, module imports, source region names, selected semantic/labeling invariants, and absence of package dependencies. It resolves the template as if copied to `docs/homework-NN/`, under a simulated project subpath. It also flags selected prohibited JavaScript patterns. Its small HTML scanner and pattern checks are **not a complete HTML validator, linter, or security audit**; they complement review and browser checks.

`test` uses `node:test` and `node:assert/strict`. It covers source extraction and fetch failures, template input validation, damaged project fixtures, actual HTTP serving, MIME types, copied-template paths, redirects, traversal, and escaping symlinks. Homework 01 adds independent mathematical and statistical acceptance tests, all toy-group associativity cases, generalization to a second curve, and strict private-scalar input tests. HTTP tests need permission to open temporary loopback ports. A restricted execution sandbox may require approval; tests must not be skipped to claim a passing result.

The CI workflow runs these same commands on pushes to `main` and pull requests targeting `main`, using official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) actions with read-only repository permission. It installs nothing, requires no secrets, and does not deploy. If the default branch changes, update both branch filters and the Pages source.

### Foundation verification record

- `npm run check` passed; `npm test` passed all 26 tests on Node.js 22.22.2.
- Local headless Chrome checked both pages at 320, 390, 768, and 1440 CSS pixels without page overflow. Desktop, mobile, and dark-theme screenshots were inspected.
- Browser checks exercised source loading and missing-file feedback, valid/invalid input feedback, result clearing/reset, the copy handler with a test clipboard, actual text-selection fallback, dark mode, reduced motion, and keyboard skip-link focus. No uncaught page exceptions or external page requests were observed.
- Native clipboard permission, screen-reader output, Safari/Firefox, and 200% zoom still need manual verification. Local automated checks used Node.js 22.22.2; the GitHub Actions workflow checks Node.js 22 and 24 after each push. Review its result in the repository’s Actions tab. Pages publication and the public URLs must be verified after manual configuration.

This records the earlier foundation review. Assignment-specific verification is recorded separately below.

### Homework 01 verification record

- `npm run check` passed: 3 pages including the virtual template, 14 resources, and 13 JavaScript syntax checks. `npm test` passed all 46 tests on Node.js 22.22.2: 26 existing tests and 20 Homework 01 tests.
- Mathematical tests check the supplied sequence through 10G, all 18 group elements, closure/commutativity/associativity, exceptional additions, orders 2/3/6/9/18, a second curve over F₅, and arithmetic at the supported p = 997 boundary. Statistical and input tests cover exact domains, frequencies, bits, distances, correlation, and degenerate cases.
- Local headless Chrome checked landing/homework layouts at 320, 390, 768, and 1440 CSS pixels with no page overflow. It exercised all 17 bases and all 165 valid base/scalar combinations, explicit scalar resets, invalid-input feedback, full-cycle stepping through O, four source excerpts, expandable tables/code, anchor navigation, keyboard controls, dark mode, reduced motion, print controls, and the no-JavaScript fallback. No uncaught exceptions, console errors, failed resources, or external page requests were observed. Desktop/mobile/light/dark screenshots were inspected.
- Copying was checked with a test clipboard and actual text-selection fallback. Native clipboard permission, screen-reader output, Safari/Firefox, and actual 200% browser zoom remain manual checks; automated narrow-viewport reflow is only an approximation of zoom. Verify the deployed homework URL after publication and follow the professor’s submission rules.

The pure core supports nonsingular small prime fields with 5 ≤ p ≤ 997 and nonnegative scalars up to 10,000. It is educational Number arithmetic with repeated addition, not production cryptography. Statistical conclusions describe the enumerated subgroup and encoding; they do not establish randomness or security.

## Add a homework after its release

1. Read the professor’s actual brief and identify its mathematical requirements. Start a local branch if useful.
2. Copy the template into the next assignment directory. Confirm that the target does not already exist before copying:

   ```sh
   cp -R templates/homework docs/homework-NN
   ```

3. Replace the homework number, title, metadata, breadcrumb, summary, all bracketed placeholders, source labels, and footer. Fill in the actual statement, objectives, reasoning, assumptions, formulas, algorithm explanation, verification, interpretation, limitations, and references. Remove the unpublished notice and `noindex` metadata only when the assignment is ready to publish. Remove the template-only input example and replace it with the actual demonstration.
4. Implement pure mathematical functions in `docs/homework-NN/js/statistics.js`. Keep DOM access, input controls, event handlers, rendering, and graphs in `js/app.js`. Import the required functions there using relative ES module paths.
5. Create `tests/homework-NN.test.js`, importing the pure functions directly. Run checks and tests, then inspect the actual assignment in the browser.
6. Append a real homework card in `docs/index.html`, using the pattern below. Link assignments only when they are ready.
7. Review, commit, and push when you choose to publish. Do not push an unfinished template into the branch serving Pages: branch publication includes everything in `docs/`, even if it is not linked from the landing page.

Replace `NN` with the next two-digit assignment number; `homework-01` already exists. Shared resource links in the template already work at that depth; no username or domain needs editing.

### Mathematical module contracts

For each future export, document accepted input types, required assumptions, output shape, validation behavior, invalid and degenerate cases, and precision considerations. Avoid DOM access, global mutable state, hardcoded exercise data, and hidden rounding. Return consistent results; distinguish presentation formatting from mathematical computation. Add abstractions only when actual assignments justify them.

Use semantic HTML for simple notation and native MathML for structured formulas. Define symbols in nearby prose. Check formula rendering in the browsers used for submission. Use SVG or Canvas for charts, with text descriptions and accessible result/table equivalents; Canvas pixels alone are not accessible.

### Display the actual implementation

Reserve standalone marker lines in the source file:

```js
// #region descriptive-name
// Place the actual implementation here, with a clear function contract.
// #endregion descriptive-name
```

Region names start with a letter and contain letters, digits, underscores, or hyphens. Every opening marker needs a matching named closing marker. Regions must not nest or repeat. Marker lines are reserved: do not embed them inside multiline strings or comments. Formatting is preserved, with line endings normalized to LF.

Reuse the template’s source block. Set `data-source="./js/statistics.js"` and `data-region="descriptive-name"`, update its visible label and caption, and keep the direct source-file link. Add a nearby explanation connecting the code to the mathematics. Multiple separately labelled source blocks are supported.

The viewer loads relative files from the same HTTP(S) origin, refuses redirects, extracts the named region deterministically, and uses `textContent`. It never evaluates source. Missing, duplicate, or malformed markers and loading failures have explicit feedback. The copy button uses the Clipboard API; when access is unavailable, it selects the code for manual copying. Without JavaScript, the direct source link remains usable. Do not maintain a second handwritten copy of the implementation in HTML.

### Write homework tests

Use `tests/homework-NN.test.js` with imports from `node:test`, `node:assert/strict`, and that assignment’s `statistics.js`. The native runner discovers these files through `npm test`.

Derive expected values independently of the implementation. Cover known mathematical results, invalid inputs, boundary and degenerate cases, numerical precision, relevant invariants, generalization to different inputs, and regressions. Justify tolerances from the algorithm’s numerical behavior; do not compare floating-point results through arbitrary rounding. The webpage’s verification section must report the cases and outcomes actually checked. Prompt 0 intentionally contains no mathematical test results.

### Link the completed homework

Add one card per completed assignment inside the landing page’s `.homework-list`:

```html
<a class="homework-card" href="./homework-01/">
  <h3>Homework 01</h3>
  <p>[Actual assigned title]</p>
  <span class="homework-arrow" aria-hidden="true">→</span>
</a>
```

This is a documentation pattern, not an assignment. Replace its bracketed content before use. Do not add fabricated titles, deadlines, grades, or results. Keep paths relative: `./homework-01/` on the landing page and `../` back from an assignment. Domain-root paths such as `/assets/` break project sites.

## Configure GitHub Pages manually

The site is configured through GitHub Pages to publish `docs/` from `main`. Pushing changes to that branch triggers publication. The following settings describe the existing branch-based setup or future reconfiguration.

In the repository on GitHub:

1. **Settings → Pages**.
2. Under **Build and deployment**, set **Source → Deploy from a branch**.
3. Set **Branch → main** (or the actual default branch).
4. Set **Folder → /docs**.
5. Select **Save**.
6. Wait for the Pages build/deployment to succeed and use the URL displayed by GitHub. Check the Actions page if publication fails.

These steps follow the official [GitHub Pages publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Pages availability for private repositories depends on the account plan; consult those settings rather than assuming access. No custom deployment workflow is needed.

The project site address is:

```text
https://alopes0905.github.io/statistics-msc/
```

Homework 01’s URL is:

```text
https://alopes0905.github.io/statistics-msc/homework-01/
```

Use the actual URL shown in Pages settings if a custom domain or another configuration changes it. Subsequent pushes to the selected Pages branch publish changes in `docs/`. The check/test workflow does not gate or perform that branch-based deployment, so run both commands before pushing.

### Verify the published submission

Open the individual assignment URL directly in a fresh browser session. Confirm HTTPS, correct title/content, working navigation and assets, readable formulas, source excerpts and copying, invalid-input feedback, valid results, and accessible chart/table alternatives. Check the browser console and network panel for errors or unexpected external requests. Verify on a narrow phone-sized viewport, at 200% zoom, with keyboard navigation, and in light/dark modes. Test with reduced motion and inspect the page without JavaScript: prose and direct source links should remain readable. Only then enter the individual homework URL in the professor’s Excel sheet before the deadline.

## Sources and submission checklist

Cite claims near their explanation. Give author, title, publication date or version, relevant page/section, and a working URL where available in the references. Clearly mark quotations; distinguish the assignment’s derivation, implementation, and interpretation from external material. Record only sources actually used.

- [ ] Correct mathematical results and a clear derivation with explicit assumptions.
- [ ] Original, general JavaScript algorithms with deliberate invalid/degenerate behavior.
- [ ] Meaningful tests pass; precision and limitations are explained.
- [ ] Responsive webpage works from its direct URL with accessible controls and results.
- [ ] Important source excerpts match the implementation and are explained on the page.
- [ ] Quotations and sources are accurately attributed.
- [ ] Pages deployment succeeded and the published homework was verified.
- [ ] Correct individual URL entered in the professor’s spreadsheet before the deadline.
- [ ] You can independently explain every submitted method and line of important code.
