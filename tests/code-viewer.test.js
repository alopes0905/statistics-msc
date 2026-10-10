import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCodeRegion, loadCodeExcerpt, parseSourceRegions, resolveSourceURL } from '../docs/assets/js/code-viewer.js';

test('region extraction preserves indentation, blank lines, and literal content', () => {
  const source = '// outside\r\n  // #region example\r\n\r\n  const text = "<script>never executed</script>";\r\n    // explanatory comment\r\n\r\n  // #endregion example\r\n// outside';
  assert.equal(extractCodeRegion(source, 'example'), '\n  const text = "<script>never executed</script>";\n    // explanatory comment\n');
});

test('multiple independent regions are extracted by exact name', () => {
  const source = '// #region first\nfirst body\n// #endregion first\n// #region second-2\nsecond body\n// #endregion second-2';
  assert.deepEqual([...parseSourceRegions(source)], [['first', 'first body'], ['second-2', 'second body']]);
  assert.equal(extractCodeRegion(source, 'second-2'), 'second body');
  assert.throws(() => extractCodeRegion(source, 'missing'), /not found/);
});

test('ambiguous, nested, mismatched, malformed, and incomplete regions fail explicitly', () => {
  const cases = [
    ['// #region a\n// #endregion a\n// #region a\n// #endregion a', /Duplicate/],
    ['// #region a\n// #region b\n// #endregion b\n// #endregion a', /Nested/],
    ['// #region a\n// #endregion b', /Unmatched/],
    ['// #endregion a', /Unmatched/],
    ['// #region a\nbody', /Unclosed/],
    ['// #region', /Malformed/],
    ['// #region invalid name', /Malformed/],
    ['// #region a\n// #endregion', /Malformed/],
  ];
  for (const [source, expected] of cases) assert.throws(() => parseSourceRegions(source), expected);
  assert.throws(() => parseSourceRegions(null), TypeError);
  assert.throws(() => extractCodeRegion('', '../bad'), TypeError);
  assert.throws(() => extractCodeRegion('', ''), TypeError);
});

test('empty regions and marker-like strings have deterministic behavior', () => {
  assert.equal(extractCodeRegion('// #region empty\n// #endregion empty', 'empty'), '');
  assert.equal(parseSourceRegions('const text = "// #region fake";').size, 0);
});

test('source URLs work in a project subdirectory and reject remote or non-HTTP references', () => {
  const base = 'https://example.test/statistics-msc/homework-01/';
  assert.equal(resolveSourceURL('./js/statistics.js', base).href, `${base}js/statistics.js`);
  assert.equal(resolveSourceURL('../assets/js/site.js', base).href, 'https://example.test/statistics-msc/assets/js/site.js');
  for (const reference of ['https://other.test/code.js', '//other.test/code.js', '/code.js', 'data:text/plain,x', 'javascript:alert(1)', 'code.js', null]) {
    assert.throws(() => resolveSourceURL(reference, base), /paths must/);
  }
  assert.throws(() => resolveSourceURL('./code.js', 'file:///home/index.html'), /HTTP/);
});

test('loading uses same-origin fetch, prohibits redirects, and returns only source text', async () => {
  let requested = false;
  const result = await loadCodeExcerpt('./source.js', 'a', 'https://example.test/course/', async (url, options) => {
    requested = true;
    assert.equal(url, 'https://example.test/course/source.js');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('// #region a\nthrow new Error("do not execute");\n// #endregion a');
  });
  assert.equal(requested, true);
  assert.equal(result, 'throw new Error("do not execute");');
});

test('HTTP, network, and parsing failures propagate to the viewer error state', async () => {
  const args = ['./source.js', 'a', 'https://example.test/course/'];
  await assert.rejects(loadCodeExcerpt(...args, async () => new Response('Not found', { status: 404 })), /HTTP 404/);
  await assert.rejects(loadCodeExcerpt(...args, async () => { throw new Error('Network unavailable'); }), /Network unavailable/);
  await assert.rejects(loadCodeExcerpt(...args, async () => new Response('// #region a')), /Unclosed/);
  await assert.rejects(loadCodeExcerpt('/external.js', 'a', args[2], async () => assert.fail('Unsafe URL must not be fetched')), /paths must/);
});
