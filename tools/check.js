import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteBase = 'https://checks.invalid/statistics-msc/';

/** A deliberately small scanner for project HTML, not a complete HTML validator. */
export function scanHTML(html) {
  const tags = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const match of withoutComments.matchAll(/<([a-z][\w:-]*)(\s[^<>]*?)?\s*\/?\s*>/gi)) {
    const attributes = new Map();
    for (const attribute of (match[2] ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    tags.push({ name: match[1].toLowerCase(), attributes });
  }
  return tags;
}

export function resolveLocalReference(reference, page) {
  if (!reference || reference.startsWith('/') || reference.includes('\\')) {
    throw new Error(`Use a nonempty relative URL: ${reference}`);
  }
  const url = new URL(reference, new URL(page, siteBase));
  if (url.origin !== new URL(siteBase).origin || !url.pathname.startsWith('/statistics-msc/')) {
    throw new Error(`Reference leaves the project subpath: ${reference}`);
  }
  let path = decodeURIComponent(url.pathname.slice('/statistics-msc/'.length));
  if (path.endsWith('/') || path === '') path += 'index.html';
  return { path, hash: decodeURIComponent(url.hash.slice(1)) };
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${path}`);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

/** Verify real docs files and the template at its intended future destination. */
export async function checkProject(root = projectRoot) {
  const errors = [];
  const docsRoot = resolve(root, 'docs');
  const templateRoot = resolve(root, 'templates/homework');
  const docsFiles = await walk(docsRoot);
  const templateFiles = await walk(templateRoot);
  const publicFiles = new Map();
  for (const file of docsFiles) publicFiles.set(relative(docsRoot, file).replaceAll('\\', '/'), file);
  for (const file of templateFiles) publicFiles.set(`homework-NN/${relative(templateRoot, file).replaceAll('\\', '/')}`, file);
  const content = new Map();
  for (const [path, file] of publicFiles) {
    if (['.html', '.css', '.js'].includes(extname(file))) content.set(path, await readFile(file, 'utf8'));
  }
  const pageTags = new Map([...content].filter(([path]) => path.endsWith('.html')).map(([path, source]) => [path, scanHTML(source)]));

  function verifyReference(reference, page, { externalLink = false } = {}) {
    try {
      if (/^[a-z][a-z\d+.-]*:/i.test(reference ?? '')) {
        if (externalLink && /^https:\/\//i.test(reference)) return;
        throw new Error(`External runtime or unsafe URL: ${reference}`);
      }
      const target = resolveLocalReference(reference, page);
      if (!publicFiles.has(target.path)) throw new Error(`Missing local target: ${reference}`);
      if (target.hash && !pageTags.get(target.path)?.some((tag) => tag.attributes.get('id') === target.hash)) {
        throw new Error(`Missing fragment: ${reference}`);
      }
      return target;
    } catch (error) {
      errors.push(`${page}: ${error.message}`);
    }
  }

  for (const [page, tags] of pageTags) {
    const html = content.get(page);
    if (!/^<!doctype html>/i.test(html.trimStart())) errors.push(`${page}: HTML5 doctype required.`);
    if (!tags.find((tag) => tag.name === 'html')?.attributes.get('lang')) errors.push(`${page}: Language required.`);
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${page}: Document title required.`);
    for (const name of ['viewport', 'description']) {
      if (!tags.some((tag) => tag.name === 'meta' && tag.attributes.get('name') === name && tag.attributes.get('content'))) {
        errors.push(`${page}: ${name} metadata required.`);
      }
    }
    for (const name of ['h1', 'main']) {
      if (tags.filter((tag) => tag.name === name).length !== 1) errors.push(`${page}: Exactly one ${name} required.`);
    }
    let previousHeading = 0;
    const ids = new Set();
    for (const tag of tags) {
      const attrs = tag.attributes;
      const id = attrs.get('id');
      if (id) {
        if (ids.has(id)) errors.push(`${page}: Duplicate id: ${id}.`);
        ids.add(id);
      }
      if (/^h[1-6]$/.test(tag.name)) {
        const level = Number(tag.name[1]);
        if (level > previousHeading + 1) errors.push(`${page}: Heading level skipped at ${tag.name}.`);
        previousHeading = level;
      }
      if ([...attrs.keys()].some((name) => /^on[a-z]+$/.test(name))) errors.push(`${page}: Inline event handler prohibited.`);
      if (tag.name === 'script' && (!attrs.has('src') || attrs.get('type') !== 'module')) errors.push(`${page}: Scripts must be external ES modules.`);
      if (tag.name === 'img' && !attrs.has('alt')) errors.push(`${page}: Image alternative text required.`);
      if (tag.name === 'button' && !['button', 'submit', 'reset'].includes(attrs.get('type'))) errors.push(`${page}: Explicit button type required.`);
      if (['input', 'textarea', 'select'].includes(tag.name) && attrs.get('type') !== 'hidden') {
        if (!id || !tags.some((label) => label.name === 'label' && label.attributes.get('for') === id)) {
          errors.push(`${page}: Form control needs an associated label.`);
        }
      }
      for (const attribute of ['aria-labelledby', 'aria-describedby']) {
        for (const target of (attrs.get(attribute) ?? '').split(/\s+/).filter(Boolean)) {
          if (!tags.some((element) => element.attributes.get('id') === target)) errors.push(`${page}: Missing ARIA target: ${target}.`);
        }
      }
      for (const attribute of ['src', 'href', 'action']) {
        if (attrs.has(attribute)) verifyReference(attrs.get(attribute), page, { externalLink: tag.name === 'a' });
      }
      if (attrs.has('data-source')) {
        const target = verifyReference(attrs.get('data-source'), page);
        if (target) {
          try { extractCodeRegion(content.get(target.path), attrs.get('data-region')); }
          catch (error) { errors.push(`${page}: ${error.message}`); }
        }
      }
    }
  }

  for (const [path, source] of content) {
    if (path.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) verifyReference(match[1], path);
      if (/@import\b/.test(source)) errors.push(`${path}: CSS imports are prohibited; use local stylesheet links.`);
    }
    if (path.endsWith('.js')) {
      if (/\bvar\s+|\beval\s*\(|\b(?:new\s+)?Function\s*\(|\.innerHTML\s*=/.test(source)) errors.push(`${path}: Unsafe or prohibited JavaScript pattern.`);
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)) verifyReference(match[1], path);
    }
  }

  const packageData = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (Object.keys(packageData[field] ?? {}).length) errors.push(`package.json: ${field} must be empty.`);
  }
  const jsFiles = [...docsFiles, ...templateFiles, ...await walk(resolve(root, 'tools')), ...await walk(resolve(root, 'tests'))].filter((file) => file.endsWith('.js'));
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) errors.push(`${relative(root, file)}: ${result.stderr || result.error?.message || 'Syntax check failed.'}`);
  }
  if (!publicFiles.has('.nojekyll')) errors.push('docs/.nojekyll is required.');
  return { errors, pages: pageTags.size, scripts: jsFiles.length, resources: publicFiles.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkProject().then((result) => {
    if (result.errors.length) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`Checks passed: ${result.pages} pages (including the virtually copied template), ${result.resources} resources, ${result.scripts} JavaScript syntax checks.`);
    }
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
