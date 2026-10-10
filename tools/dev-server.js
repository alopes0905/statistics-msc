import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.pdf', 'application/pdf'],
]);

function isWithin(root, candidate) {
  const remainder = relative(root, candidate);
  return remainder === '' || (!isAbsolute(remainder) && remainder !== '..' && !remainder.startsWith(`..${sep}`));
}

export function normalizeBasePath(basePath) {
  if (typeof basePath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) {
    throw new Error('Base path must be / or a path such as /statistics-msc/.');
  }
  return basePath;
}

/**
 * Create a static development server. The caller binds it to loopback.
 * Both lexical traversal and symlinks escaping the served root are rejected.
 * @param {{root?: string, basePath?: string, onError?: (error: Error) => void}} options
 * @returns {Promise<import('node:http').Server>}
 */
export async function createDevServer({ root = resolve(projectRoot, 'docs'), basePath = '/', onError = console.error } = {}) {
  const canonicalRoot = await realpath(root);
  normalizeBasePath(basePath);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    function send(status, message, headers = {}) {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      response.end(request.method === 'HEAD' ? undefined : `${message}\n`);
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      send(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
      return;
    }

    try {
      const rawPath = request.url.split('?')[0];
      let pathname;
      try {
        pathname = decodeURIComponent(rawPath);
      } catch {
        send(400, 'Malformed URL encoding.');
        return;
      }
      if (!pathname.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(pathname)) {
        send(400, 'Invalid request path.');
        return;
      }
      const segments = pathname.split('/');
      if (segments.some((segment) => segment === '..' || segment === '.')) {
        send(403, 'Path traversal is not allowed.');
        return;
      }
      if (segments.some((segment) => segment.startsWith('.') && segment !== '.nojekyll')) {
        send(404, 'Not found.');
        return;
      }
      if (basePath !== '/' && pathname === basePath.slice(0, -1)) {
        send(308, 'Use the trailing-slash URL.', { Location: basePath });
        return;
      }
      if (!pathname.startsWith(basePath)) {
        send(404, 'Not found.');
        return;
      }

      let target = resolve(canonicalRoot, pathname.slice(basePath.length));
      if (!isWithin(canonicalRoot, target) || !isWithin(canonicalRoot, await realpath(target))) {
        send(403, 'Requested file is outside the served directory.');
        return;
      }
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        if (!pathname.endsWith('/')) {
          const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
          send(308, 'Use the trailing-slash URL.', { Location: `${rawPath}/${query}` });
          return;
        }
        target = resolve(target, 'index.html');
        if (!isWithin(canonicalRoot, await realpath(target))) {
          send(403, 'Requested file is outside the served directory.');
          return;
        }
      } else if (!targetStat.isFile()) {
        send(404, 'Not found.');
        return;
      }
      const content = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mimeTypes.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
        'Content-Length': content.length,
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) send(404, 'Not found.');
      else if (error.code === 'EACCES') send(403, 'File cannot be read.');
      else {
        onError(error);
        send(500, 'The development server could not read this resource.');
      }
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  let port = 4173;
  let basePath = '/';
  let previewTemplate = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--template') {
      previewTemplate = true;
      continue;
    }
    const value = args[index + 1];
    if (option === '--port' && /^\d+$/.test(value ?? '') && Number(value) <= 65535) port = Number(value);
    else if (option === '--base-path' && value) basePath = normalizeBasePath(value);
    else throw new Error('Usage: npm run dev -- [--port 4173] [--base-path /statistics-msc/] [--template]');
    index += 1;
  }
  let stagingDirectory;
  let server;
  try {
    let root = resolve(projectRoot, 'docs');
    if (previewTemplate) {
      stagingDirectory = await mkdtemp(resolve(tmpdir(), 'statistics-preview-'));
      root = resolve(stagingDirectory, 'docs');
      await cp(resolve(projectRoot, 'docs'), root, { recursive: true });
      await cp(resolve(projectRoot, 'templates/homework'), resolve(root, 'homework-template'), { recursive: true });
    }
    server = await createDevServer({ root, basePath });
  } catch (error) {
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  async function removeStagingDirectory() {
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
  }
  server.on('error', (error) => {
    console.error(`Development server failed: ${error.message}`);
    process.exitCode = 1;
    removeStagingDirectory().catch(console.error);
  });
  server.once('close', () => removeStagingDirectory().catch(console.error));
  server.listen(port, '127.0.0.1', () => {
    const localURL = `http://127.0.0.1:${server.address().port}${basePath}`;
    console.log(`Local: ${localURL}`);
    if (previewTemplate) {
      console.log(`Template: ${localURL}homework-template/`);
      console.log('Serving a temporary snapshot. Restart after edits. No template was added to docs/.');
    } else console.log('Serving docs/ only.');
    console.log('Press Ctrl+C to stop.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
