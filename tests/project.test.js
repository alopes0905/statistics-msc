import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject, resolveLocalReference, scanHTML } from '../tools/check.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('all local assets, links, fragments, modules, and template source regions resolve', async () => {
  const result = await checkProject();
  assert.deepEqual(result.errors, []);
  assert.ok(result.pages >= 2);
  assert.ok(result.scripts >= 7);
});

test('HTML scanner ignores comments and understands quoted attributes and boolean controls', () => {
  const tags = scanHTML('<!-- <a href="missing"> --> <input id=number disabled><a href="./page/?a=1&amp;b=2" aria-label="A link">Link</a>');
  assert.equal(tags.length, 2);
  assert.equal(tags[0].attributes.get('id'), 'number');
  assert.equal(tags[0].attributes.has('disabled'), true);
  assert.equal(tags[1].attributes.get('aria-label'), 'A link');
});

test('local reference resolution retains project subpaths and rejects domain-root assumptions', () => {
  assert.deepEqual(resolveLocalReference('../#homework', 'homework-01/index.html'), { path: 'index.html', hash: 'homework' });
  assert.deepEqual(resolveLocalReference('./homework-01/', 'index.html'), { path: 'homework-01/index.html', hash: '' });
  for (const reference of ['/assets/main.css', '//example.test/x', '../../outside.html', 'https://other.test/', '', '\\outside']) {
    assert.throws(() => resolveLocalReference(reference, 'index.html'));
  }
});

test('static checks detect broken links, inaccessible markup, unsafe code, and dependencies', async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'statistics-check-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const directory of ['docs', 'templates', 'tools', 'tests']) {
    await cp(resolve(projectRoot, directory), resolve(fixture, directory), { recursive: true });
  }
  const packageData = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  packageData.dependencies = { prohibited: '1.0.0' };
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify(packageData));
  const index = resolve(fixture, 'docs/index.html');
  const html = await readFile(index, 'utf8');
  await writeFile(index, html.replace('</main>', '<a href="./missing/">Broken</a><a href="#missing">Bad fragment</a><img src="https://external.test/a.png"><input id="unlabelled"><button>Missing type</button><p id="main" aria-describedby="absent">Duplicate</p><script>unsafe</script></main>'));
  await writeFile(resolve(fixture, 'docs/assets/js/site.js'), 'import "./missing.js";\nconst text = eval("0");\n');
  await writeFile(resolve(fixture, 'templates/homework/js/statistics.js'), '// #region implementation\nexport {};');
  const { errors } = await checkProject(fixture);
  for (const pattern of [/Missing local target/, /Missing fragment/, /External runtime/, /associated label/, /button type/, /Duplicate id/, /Missing ARIA/, /external ES modules/, /Unsafe or prohibited/, /Unclosed source/, /dependencies must be empty/]) {
    assert.ok(errors.some((error) => pattern.test(error)), `Expected ${pattern}; got ${errors.join('\n')}`);
  }
});

test('the reusable template remains explicitly unpublished and has no statistical algorithm', async () => {
  const template = await readFile(resolve(projectRoot, 'templates/homework/index.html'), 'utf8');
  assert.match(template, /Unpublished template — not a completed assignment/);
  assert.match(template, /name="robots" content="noindex"/);
  const statistics = await import('../templates/homework/js/statistics.js');
  assert.deepEqual(Object.keys(statistics), []);
});
