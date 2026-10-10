const regionNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const markerPattern = /^\s*\/\/\s+#(region|endregion)\s+([A-Za-z][A-Za-z0-9_-]*)\s*$/;
const markerPrefixPattern = /^\s*\/\/\s*#(?:end)?region\b/;

/**
 * Parse standalone `// #region name` / `// #endregion name` markers.
 * Regions cannot nest or repeat. Formatting is preserved; CRLF becomes LF.
 * @param {string} source JavaScript source text, never executed.
 * @returns {Map<string, string>} Region names and their literal source excerpts.
 * @throws {TypeError|Error} For invalid source or ambiguous/malformed markers.
 */
export function parseSourceRegions(source) {
  if (typeof source !== 'string') throw new TypeError('Source must be a string.');
  const regions = new Map();
  let activeRegion = null;
  let lines = [];

  for (const [index, line] of source.split(/\r\n|\n|\r/).entries()) {
    const marker = line.match(markerPattern);
    if (!marker) {
      if (markerPrefixPattern.test(line)) {
        throw new Error(`Malformed region marker at line ${index + 1}.`);
      }
      if (activeRegion !== null) lines.push(line);
      continue;
    }

    const [, kind, name] = marker;
    if (kind === 'region') {
      if (activeRegion !== null) throw new Error('Nested source regions are not supported.');
      if (regions.has(name)) throw new Error(`Duplicate source region: ${name}.`);
      activeRegion = name;
      lines = [];
    } else {
      if (activeRegion !== name) throw new Error(`Unmatched closing source region: ${name}.`);
      regions.set(name, lines.join('\n'));
      activeRegion = null;
    }
  }

  if (activeRegion !== null) throw new Error(`Unclosed source region: ${activeRegion}.`);
  return regions;
}

/** @returns {string} The exact body of a uniquely named source region. */
export function extractCodeRegion(source, name) {
  if (typeof name !== 'string' || !regionNamePattern.test(name)) {
    throw new TypeError('A valid source region name is required.');
  }
  const regions = parseSourceRegions(source);
  if (!regions.has(name)) throw new Error(`Source region not found: ${name}.`);
  return regions.get(name);
}

/** Resolve only relative, same-origin HTTP(S) source references. */
export function resolveSourceURL(reference, baseURL) {
  if (typeof reference !== 'string' || !/^(?:\.\/|\.\.\/)/.test(reference)) {
    throw new Error('Source paths must begin with ./ or ../.');
  }
  const base = new URL(baseURL);
  const url = new URL(reference, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) {
    throw new Error('Source files must use the same HTTP(S) origin as the page.');
  }
  return url;
}

/** Fetch a source excerpt with a bounded wait; never execute its content. */
export async function loadCodeExcerpt(reference, region, baseURL, fetchSource = globalThis.fetch) {
  const url = resolveSourceURL(reference, baseURL);
  const response = await fetchSource(url.href, {
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Source request failed (HTTP ${response.status}).`);
  return extractCodeRegion(await response.text(), region);
}

function selectSource(code) {
  const selection = code.ownerDocument.getSelection();
  if (!selection) return false;
  const range = code.ownerDocument.createRange();
  range.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(range);
  code.parentElement.focus();
  return true;
}

async function initializeViewer(viewer) {
  const code = viewer.querySelector('[data-source-code]');
  const status = viewer.querySelector('[data-source-status]');
  const button = viewer.querySelector('[data-copy-source]');
  if (!code || !status || !button) {
    throw new Error('Source viewer markup needs code, status, and copy controls.');
  }
  button.disabled = true;
  status.textContent = 'Loading source excerpt…';
  try {
    code.textContent = await loadCodeExcerpt(viewer.dataset.source, viewer.dataset.region, viewer.ownerDocument.baseURI);
    status.textContent = 'Excerpt loaded from the source file. Formatting is preserved.';
    status.dataset.state = 'ready';
    button.disabled = false;
  } catch (error) {
    code.textContent = 'Source excerpt unavailable.';
    status.textContent = `Could not display the excerpt: ${error.message} Use the source-file link below.`;
    status.dataset.state = 'error';
    return;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const clipboard = viewer.ownerDocument.defaultView.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await clipboard.writeText(code.textContent);
      status.textContent = 'Code copied to the clipboard.';
    } catch {
      const selected = selectSource(code);
      status.textContent = selected
        ? 'Clipboard access is unavailable. Code selected; press Ctrl+C or ⌘C to copy.'
        : 'Clipboard access is unavailable. Select the code manually to copy it.';
    } finally {
      button.disabled = false;
    }
  });
}

/** Enhance existing semantic source blocks. Initial HTML retains a direct source link. */
export async function initializeCodeViewers(root) {
  const results = await Promise.allSettled([...root.querySelectorAll('[data-source]')].map(initializeViewer));
  for (const result of results) {
    if (result.status === 'rejected') console.error('Source viewer could not initialize:', result.reason);
  }
}
