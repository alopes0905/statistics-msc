# Statistics Lab · Statistics MSc

An independent coursework website for the Statistics course in an MSc in Cybersecurity. Each homework has a standalone page combining the problem, mathematical reasoning, original JavaScript implementation, interactive demonstration, verification, and sources.

**Current state: Homeworks 1.1, 1.2, and 2 published; Homework 3 implemented locally and ready for publication.** The site is [Statistics Lab](https://alopes0905.github.io/statistics-msc/), with [Homework 1.1](https://alopes0905.github.io/statistics-msc/homework-01/), [Homework 1.2](https://alopes0905.github.io/statistics-msc/homework-02/), and [Homework 2](https://alopes0905.github.io/statistics-msc/homework-2/) at their own URLs. The reusable template remains outside the publishing directory.

Homework 1.1 implements the professor’s [elliptic-curve assignment](https://github.com/alopes0905/statistics-msc/issues/1): repeated point addition on y² = x³ + 7 (mod 17), valid base/scalar selection, intermediate multiples, and a manual discrete SVG visualization. Its exhaustive subgroup experiment covers coordinate and bit frequencies, Pearson correlations, and adjacent-scalar Hamming distances, with explicit limitations. For G = (1, 5), k = 6, the calculated **toy public key is (5, 8)**; G has order 9, while the full curve has 18 elements.

The page has four sections: interactive demonstration, mathematical explanation, statistical exploration, and implementation/conclusions. Core source excerpts and statistical summaries are visible; supporting code and detailed datasets are expandable.

Local page: `/homework-01/` (or `/statistics-msc/homework-01/` with the project-subpath preview). Published page: [Homework 1.1](https://alopes0905.github.io/statistics-msc/homework-01/). This is an educational small-field implementation, not Ethereum-compatible cryptography.

Homework 1.2, **From Mnemonic to Ethereum Address**, implements the professor's [wallet derivation assignment](https://github.com/alopes0905/statistics-msc/issues/2). Its four sections explain BIP-39, BIP-32/BIP-44, secp256k1, Keccak-256, EIP-55, their distinct roles, and historical context. Two original JavaScript demonstrations calculate mnemonic entropy/checksum layouts and count character categories in official EIP-55 examples. The page does not generate wallets or verify arbitrary address checksums.

Local page: `/homework-02/` (or `/statistics-msc/homework-02/` with the project-subpath preview). Published page: [Homework 1.2](https://alopes0905.github.io/statistics-msc/homework-02/). GitHub Pages deployment has completed; browser verification is recorded separately from publication. The existing `npm run check` and `npm test` commands include Homework 1.2.

## Coursework numbering and Homework 2

The first two assignments are **Homework 1.1** and **Homework 1.2**. Their legacy directories stay unchanged to preserve submitted URLs and hash anchors. The original assignment issue links remain intact; their historical titles are not rewritten.

| Course label | Subject | Page path |
|---|---|---|
| Homework 1.1 | Elliptic-Curve Scalar Multiplication | `/homework-01/` |
| Homework 1.2 | From Mnemonic to Ethereum Address | `/homework-02/` |
| Homework 2 | ECC Encryption, Caesar Cipher & Cryptanalysis | `/homework-2/` |

Homework 2 implements authentic secp256k1 with BigInt, distinct from Homework 1.1’s modulo-17 curve. The educational hybrid uses ECDH, native HKDF-SHA-256, and AES-256-GCM, with secure full-domain ephemeral scalars and a deliberately restricted receiver key (default d = 37, K = 256; K ≤ 4,096). Payloads contain the public ephemeral point, salt, IV, and authenticated ciphertext. Both encryption schemes use the same message; the default Caesar example is `MEET ME AT NOON → PHHW PH DW QRRQ` at shift 3.

The statistical attack learns English frequencies from the bundled *Alice’s Adventures in Wonderland* (107,785 ASCII letters) and evaluates against the separate *Through the Looking-Glass* (119,699 letters). Each of six lengths uses 20 deterministic, nonoverlapping windows and all 26 shifts. Actual recovery is 494/520 (95%) at 20 letters and 520/520 (100%) at 50, 100, 300, 1,000, and 3,000 letters: 3,094/3,120 overall. Changing shifts repeats the same histogram problem, so the 520 trials per length are dependent, with only 20 distinct passages. An observed short-text failure and within-author/language-model limitations are explained on the page. A background worker recomputes every trial without blocking the controls. Corpus sources, full notices, byte checksums, and sampling details are in [the data record](docs/homework-2/data/README.md).

The ECC attack takes only public Q, K, and the intercepted payload, enumerates candidate public points, recovers the private scalar, and uses it to authenticate and decrypt the current ciphertext. Default d = 37 takes exactly 37 comparisons. The page contrasts that restricted search with full-domain exhaustive search and generic discrete-logarithm complexity. This is an educational construction with exposed small keys and variable-time arithmetic, unsuitable for real secrets.

Local preview: `/statistics-msc/homework-2/`. Published URL (HTTP 200 and report content verified on 23 October 2026):

`https://alopes0905.github.io/statistics-msc/homework-2/`

Homework 2 is published. It requires a modern browser with BigInt and Web Crypto, served over HTTPS or localhost. All runtime resources, including both texts, are local; there are no dependencies to install.

## Homework 3 — Stochastic penetration models

Homework 3 models n systems/steps per attacker and m attacker trajectories with iid Bernoulli(p) or symmetric Rademacher increments. It computes each attacker’s total Sₙ, average Sₙ/n, and normalized total Sₙ/√n from the same path prefixes. Exact theoretical moments are shown beside empirical means and unbiased sample variances (denominator m−1, using Welford’s method).

Controls select the model, Bernoulli p, m = 100/500/1,000, maximum n = 100/500/1,000/2,000, epsilon, and seed. Compared n values follow [10, 50, 100, 500, 1,000, 2,000] up to that maximum. Defaults are Rademacher, m = 1,000, maximum n = 2,000, epsilon = 0.1, seed = 2026; Bernoulli defaults to p = 0.35. The simulation is capped at 2,000,000 increments and runs in a cancellable worker. Editing parameters clears stale results.

The original JavaScript implements the Park–Miller 16807 PRNG, with a fixed disjoint block of 2,000 draws per attacker and exact jump-ahead initialization. This preserves prefixes as m or n changes. It is a deterministic approximation to the iid model, with finite-period limitations; it is not cryptographic randomness. Only the first 20 paths are drawn (visually downsampled); every statistic uses all simulated attackers and increments.

The page includes three lattice-aligned density histograms, variance comparisons across n, empirical LLN deviation probabilities with capped Chebyshev bounds, and three Rademacher histograms overlaid with N(0,1) density. Descriptive empirical-CDF distances use the validated A&S normal-CDF approximation, without p-values. Bernoulli’s uncentered p√n drift is explicitly distinguished and never receives a standard-normal overlay. A separate aggregate T sums all attacker scores. Native SVG charts have numerical table alternatives; four excerpts load the executed source.

The experiment illustrates probability theory under idealized independence, not calibrated intrusion-risk forecasting. Real attacks may be dependent, heterogeneous, or adaptive. Increasing m improves Monte Carlo precision without changing the one-attacker theoretical law; increasing n changes that law.

Implemented and verified, ready for publication. The public page must be checked after a successful GitHub Pages deployment. Intended URL:

`https://alopes0905.github.io/statistics-msc/homework-3/`

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
    css/home.css              Minimal homepage layout
    js/site.js                Shared progressive enhancement
    js/code-viewer.js         Source extraction, loading, and copying
  homework-01/                Homework 1.1; legacy published path
    index.html                Elliptic-curve report and interactive demonstration
    style.css                 Assignment layout, tables, and discrete SVG styling
    js/statistics.js           Pure field, point, and statistical algorithms
    js/app.js                  Input validation, DOM rendering, and step controls
  homework-02/                Homework 1.2; legacy published path
    index.html                Mnemonic-to-address report and two statistical demos
    style.css                 Assignment presentation
    js/statistics.js           BIP-39 layouts and EIP-55 character counts
    js/app.js                  Selector handling and results
  homework-2/                 Actual Homework 2
    index.html                Four-section report and interactive demonstrations
    style.css                 Scoped layout, inputs, tables, and outputs
    js/ecc.js                  BigInt secp256k1 and restricted-key enumeration
    js/hybrid.js               ECDH/HKDF/AES-GCM and recovered-key decryption
    js/caesar.js               Validated ASCII Caesar encryption/decryption
    js/cryptanalysis.js        Corpus counts, chi-square ranking, length experiments
    js/experiment-worker.js    Background execution of the six experiment lengths
    js/app.js                  DOM controls and results; no private-key attack shortcut
    data/alice.txt             Training text with original publisher notices
    data/looking-glass.txt     Separate evaluation text with original notices
    data/README.md             Provenance, rights, checksums, and sampling method
  homework-3/                 Stochastic penetration models, LLN and CLT
    index.html                Four-section academic report and controls
    style.css                 Scoped report layout and accessible SVG styling
    js/simulation.js          Seeded streams and shared attacker prefixes
    js/statistics.js          Exact moments, sample statistics, histograms, LLN/CLT
    js/charts.js              Native SVG plots with density-scaled comparisons
    js/app.js                 DOM rendering, input validation, and worker lifecycle
    js/simulation-worker.js   Bounded background simulation
templates/homework/           Unpublished reusable assignment template
  index.html                  Academic structure and example form
  style.css                   Assignment presentation
  js/statistics.js            Empty module for future pure algorithms
  js/app.js                   Template input validation and UI
tests/                        Native tests, including homework-01, homework-02, homework-2, homework-3
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

`test` uses `node:test` and `node:assert/strict`. It covers source extraction and fetch failures, template input validation, damaged project fixtures, actual HTTP serving, MIME types, copied-template paths, redirects, traversal, and escaping symlinks. Homework 1.1 adds independent mathematical and statistical acceptance tests, all toy-group associativity cases, generalization to a second curve, and strict private-scalar input tests. HTTP tests need permission to open temporary loopback ports. A restricted execution sandbox may require approval; tests must not be skipped to claim a passing result.

The CI workflow runs these same commands on pushes to `main` and pull requests targeting `main`, using official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) actions with read-only repository permission. It installs nothing, requires no secrets, and does not deploy. If the default branch changes, update both branch filters and the Pages source.

### Foundation verification record

- `npm run check` passed; `npm test` passed all 26 tests on Node.js 22.22.2.
- Local headless Chrome checked both pages at 320, 390, 768, and 1440 CSS pixels without page overflow. Desktop, mobile, and dark-theme screenshots were inspected.
- Browser checks exercised source loading and missing-file feedback, valid/invalid input feedback, result clearing/reset, the copy handler with a test clipboard, actual text-selection fallback, dark mode, reduced motion, and keyboard skip-link focus. No uncaught page exceptions or external page requests were observed.
- Native clipboard permission, screen-reader output, Safari/Firefox, and 200% zoom still need manual verification. Local automated checks used Node.js 22.22.2; the GitHub Actions workflow checks Node.js 22 and 24 after each push. Review its result in the repository’s Actions tab. Pages publication and the public URLs must be verified after manual configuration.

This records the earlier foundation review. Assignment-specific verification is recorded separately below.

### Homework 1.1 verification record

- `npm run check` passed: 3 pages including the virtual template, 14 resources, and 13 JavaScript syntax checks. `npm test` passed all 46 tests on Node.js 22.22.2: 26 existing tests and 20 Homework 1.1 tests.
- Mathematical tests check the supplied sequence through 10G, all 18 group elements, closure/commutativity/associativity, exceptional additions, orders 2/3/6/9/18, a second curve over F₅, and arithmetic at the supported p = 997 boundary. Statistical and input tests cover exact domains, frequencies, bits, distances, correlation, and degenerate cases.
- Local headless Chrome checked landing/homework layouts at 320, 390, 768, and 1440 CSS pixels with no page overflow. It exercised all 17 bases and all 165 valid base/scalar combinations, explicit scalar resets, invalid-input feedback, full-cycle stepping through O, four source excerpts, expandable tables/code, anchor navigation, keyboard controls, dark mode, reduced motion, print controls, and the no-JavaScript fallback. No uncaught exceptions, console errors, failed resources, or external page requests were observed. Desktop/mobile/light/dark screenshots were inspected.
- Copying was checked with a test clipboard and actual text-selection fallback. Native clipboard permission, screen-reader output, Safari/Firefox, and actual 200% browser zoom remain manual checks; automated narrow-viewport reflow is only an approximation of zoom. Verify the deployed homework URL after publication and follow the professor’s submission rules.

The pure core supports nonsingular small prime fields with 5 ≤ p ≤ 997 and nonnegative scalars up to 10,000. It is educational Number arithmetic with repeated addition, not production cryptography. Statistical conclusions describe the enumerated subgroup and encoding; they do not establish randomness or security.

### Homework 2 verification record

- `npm run check` passed: 5 pages including the virtual template, 30 resources, and 23 JavaScript syntax checks. `npm test` passed all 107 tests (65 existing plus 42 new Homework 2 tests), with no skips.
- Independent Node/OpenSSL checks cover secp256k1 multiples, ECDH symmetry, and an exact deterministic hybrid payload using native HKDF and AES-GCM. Additional cases cover nG = O, malformed points/scalars/payloads, wrong keys, authentication failure, fresh randomness, empty/Unicode/bounded inputs, and missing Web Crypto.
- Statistical tests check hand-calculated counts and scores, all Caesar shifts, numerical ties, real held-out recovery, corpus checksums, independent histogram scoring of the measured results, and reproducibility. Search tests cover d = 1, 37, 256, and 4,096, unsuccessful bounded searches, and actual decryption from public information alone.
- Integration checks retain both legacy page paths, all three homepage links, real source excerpts, local corpus loading, and serving beneath the GitHub Pages project subpath. Existing mathematical modules and tests remain unchanged; the old homepage-link assertion now includes the third assignment.
- Local Chrome checked Homework 2 at 320, 390, 768, 1,024, 1,440, and 1,920 CSS pixels in light/dark themes, both initially and with results/details expanded. No page-wide overflow occurred. Desktop/mobile and native 200% zoom screenshots were inspected; zoom was confirmed by a 1,440-pixel window, 720 CSS-pixel viewport, and device pixel ratio 2.
- Browser checks exercised both ciphers, fresh encryption, exact Unicode/empty/leading-U+FEFF recovery, invalid inputs, key changes, both attacks, all 3,120 worker trials, four source excerpts, sidebar links, keyboard skip navigation, and missing-Web-Crypto/no-JavaScript behavior. Both legacy homework controls and homepage navigation still work. Normal loading produced no uncaught exceptions, console errors, failed resources, or external runtime requests.
- Both existing published homework URLs returned HTTP 200 on 15 October 2026. Homework 2’s own published URL was subsequently verified with HTTP 200 and the expected report content on 23 October 2026. This review used Chrome, not Safari or Firefox; screen-reader behavior and native clipboard permissions were not tested in this run.

### Homework 3 verification record

- `npm run check` passed: 6 pages including the virtual template, 37 resources, and 29 JavaScript syntax checks. `npm test` passed all 133 tests: 107 existing and 26 new Homework 3 tests, without skips.
- Numerical checks compare Park–Miller output with the published 10,000-step vector and an independent BigInt recurrence, verify stream separation and prefix reuse, and check hand-worked scores, exact moments, two-pass variance calculations, strict LLN boundaries, histogram area, lattice parity, aggregation, and reference normal PDF/CDF values. Both largest supported model runs (2,000,000 increments each) completed successfully.
- With m = 1,000, seed = 2026, and epsilon = 0.1, Rademacher empirical deviation probabilities were 0.757, 0.489, 0.283, 0.024, 0.001, 0 for n = 10, 50, 100, 500, 1,000, 2,000. Bernoulli(p = 0.35) gave 0.527, 0.154, 0.023, 0, 0, 0. Zero here is an observed fraction, not a claim that the true event is impossible.
- Rademacher descriptive CDF distances for n = 10, 100, 1,000 were 0.1330, 0.0457, 0.0638. The nonmonotonicity is retained and explained. The normalized sample variances were 0.966445, 0.963914, 1.03378, against theoretical variance 1.
- Local Chrome checked 320, 390, 768, 1,024, 1,440, and 1,920 CSS pixels in light/dark themes, expanded source/tables, and native 200% browser zoom (1,440-pixel window, 720 CSS-pixel viewport, device pixel ratio 2). Desktop, mobile, and zoom screenshots were inspected; no page-wide overflow was observed.
- Browser flows exercised both models, p = 0/0.35/1, model switching, m/n/epsilon changes, seed reproduction, all trajectory metrics and distributions, cancellation, stale-job protection, invalid inputs, unavailable-worker feedback, four real excerpts, keyboard skip navigation, sidebar/homepage navigation, no-JavaScript content, and the previous three assignments. Normal loading produced no console errors, uncaught exceptions, failed resources, or external runtime requests. The default Chrome run completed in about 122 ms on the development machine; performance depends on the device.
- All existing homework files and shared assets remain unchanged. Two old homepage-link assertions were updated only to include the fourth card. Safari/Firefox, screen-reader output, and native clipboard permissions were not tested in this run. Homework 3 still needs publication and verification at its deployed URL.

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

Replace `NN` with the actual course assignment identifier and choose an unused path. The legacy `homework-01` and `homework-02` directories already serve Homework 1.1 and 1.2; actual Homework 2 uses `homework-2`. Shared resource links in the template already work at that depth; no username or domain needs editing.

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
  <h3>Homework 1.1</h3>
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

Homework 1.1’s URL is:

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
