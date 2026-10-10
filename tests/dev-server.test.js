import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer, normalizeBasePath } from '../tools/dev-server.js';
import { loadCodeExcerpt } from '../docs/assets/js/code-viewer.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function request(port, path, method = 'GET') {
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('base paths are deliberate and reject malformed mounts', () => {
  for (const path of ['/', '/statistics-msc/', '/preview/site/']) assert.equal(normalizeBasePath(path), path);
  for (const path of ['statistics-msc', '/statistics-msc', '/../', '/site/?query', '//', null]) assert.throws(() => normalizeBasePath(path));
});

test('development server serves actual site and copied template safely at a project subpath', async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'statistics-server-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const served = resolve(fixture, 'docs');
  await cp(resolve(projectRoot, 'docs'), served, { recursive: true });
  await cp(resolve(projectRoot, 'templates/homework'), resolve(served, 'homework-99'), { recursive: true });
  await mkdir(resolve(served, 'empty'));
  await writeFile(resolve(fixture, 'private.txt'), 'must not be served');
  await writeFile(resolve(served, '.env'), 'must not be served');
  await symlink(resolve(fixture, 'private.txt'), resolve(served, 'escape.txt'));
  await symlink(fixture, resolve(served, 'escape-directory'));
  const unexpectedErrors = [];
  const server = await createDevServer({ root: served, basePath: '/statistics-msc/', onError: (error) => unexpectedErrors.push(error) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())));
  const port = server.address().port;

  await t.test('landing page, styles, scripts, and icon are served with correct MIME types', async () => {
    const page = await request(port, '/statistics-msc/');
    assert.equal(page.status, 200);
    assert.match(page.body, /Statistics, understood/);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    for (const [path, type] of [['assets/css/main.css', 'text/css'], ['assets/js/site.js', 'text/javascript'], ['assets/favicon.svg', 'image/svg+xml']]) {
      const response = await request(port, `/statistics-msc/${path}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers['content-type'].startsWith(type));
      assert.ok(response.body.length > 0);
    }
  });

  await t.test('copied template and real source extraction work without root-relative paths', async () => {
    const page = await request(port, '/statistics-msc/homework-99/');
    assert.equal(page.status, 200);
    assert.match(page.body, /not a completed assignment/);
    assert.equal((await request(port, '/statistics-msc/homework-99/style.css')).status, 200);
    assert.equal((await request(port, '/statistics-msc/homework-99/js/app.js')).status, 200);
    const excerpt = await loadCodeExcerpt('./js/statistics.js', 'implementation', `http://127.0.0.1:${port}/statistics-msc/homework-99/`);
    assert.match(excerpt, /no statistical algorithm is implemented/);
  });

  await t.test('directories redirect to a trailing slash and preserve query strings', async () => {
    const response = await request(port, '/statistics-msc/homework-99?view=source');
    assert.equal(response.status, 308);
    assert.equal(response.headers.location, '/statistics-msc/homework-99/?view=source');
    assert.equal((await request(port, '/statistics-msc')).headers.location, '/statistics-msc/');
  });

  await t.test('HEAD works, unsupported methods and absent files return useful statuses', async () => {
    const head = await request(port, '/statistics-msc/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
    assert.equal((await request(port, '/statistics-msc/', 'POST')).status, 405);
    for (const path of ['/statistics-msc/missing.js', '/statistics-msc/empty/', '/statistics-msc/assets/js/site.js/child', '/outside/']) {
      assert.equal((await request(port, path)).status, 404);
    }
  });

  await t.test('raw and encoded traversal, hidden files, and escaping symlinks are denied', async () => {
    for (const path of ['/statistics-msc/../private.txt', '/statistics-msc/%2e%2e/private.txt', '/statistics-msc/%2e%2e%2fprivate.txt', '/statistics-msc/escape.txt', '/statistics-msc/escape-directory/private.txt']) {
      const response = await request(port, path);
      assert.equal(response.status, 403, path);
      assert.doesNotMatch(response.body, /must not be served/);
    }
    assert.equal((await request(port, '/statistics-msc/.env')).status, 404);
    assert.equal((await request(port, '/statistics-msc/.nojekyll')).status, 200);
  });

  await t.test('malformed paths are rejected without crashing the server', async () => {
    for (const path of ['/statistics-msc/%ZZ', '/statistics-msc/%00', '/statistics-msc/%5cprivate.txt']) {
      assert.equal((await request(port, path)).status, 400);
    }
    assert.equal((await request(port, '/statistics-msc/')).status, 200);
    assert.deepEqual(unexpectedErrors, []);
  });
});

test('default root mount also serves the landing page', async (t) => {
  const server = await createDevServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  assert.equal((await request(server.address().port, '/')).status, 200);
});

test('CLI template preview serves a temporary copy under the requested subpath', { timeout: 10000 }, async (t) => {
  const child = spawn(process.execPath, [resolve(projectRoot, 'tools/dev-server.js'), '--port', '0', '--template', '--base-path', '/statistics-msc/'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    }
  });
  const url = await new Promise((resolveURL, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Template: (http:\/\/127\.0\.0\.1:\d+\/statistics-msc\/homework-template\/)/);
      if (match) resolveURL(match[1]);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Preview exited before serving (code ${code}): ${stderr}`)));
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Unpublished template/);
  assert.equal((await fetch(new URL('../assets/js/site.js', url))).status, 200);
  assert.equal((await fetch(new URL('./js/statistics.js', url))).status, 200);
});
