const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { readdir, mkdtemp, rm } = require('node:fs/promises');
const fileSystem = require('node:fs/promises');
const { syncBuiltinESMExports } = require('node:module');
const { join, sep } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { gunzipSync } = require('node:zlib');

const root = join(__dirname, '..');
const origin = 'https://uidesigneditor.com';
const read = name => readFileSync(join(root, name), 'utf8');
const publicPages = [['/', 'index.html'], ['/guide/', 'guide/index.html']];
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
const meta = (html, key) => tags(html, 'meta').find(tag => tag.name === key || tag.property === key)?.content;

test('public pages have readable content and one matching title, canonical and share preview', () => {
  const titles = [];
  for (const [path, file] of publicPages) {
    const html = read(file), title = html.match(/<title>([^<]+)<\/title>/)[1];titles.push(title);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(meta(html, 'robots'), /^index,follow/);
    assert.equal(meta(html, 'description'), meta(html, 'og:description'));
    assert.equal(meta(html, 'description'), meta(html, 'twitter:description'));
    assert.equal(meta(html, 'description'), path === '/'
      ? 'A simple and free ui design tool. Select, cut, move and resize. Work together with your AI. No signup.'
      : 'Free UI design tool. No signup. A canvas for your AI. Share your work.');
    assert.equal(meta(html, 'og:title'), title);
    assert.equal(meta(html, 'twitter:title'), title);
    assert.equal(meta(html, 'og:url'), origin + path);
    assert.deepEqual(tags(html, 'link').filter(tag => tag.rel === 'canonical').map(tag => tag.href), [origin + path]);
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'og:image'), meta(html, 'twitter:image'));
    assert.equal(meta(html, 'og:image:type'), 'image/jpeg');
    assert.ok(meta(html, 'og:image:alt'));
    assert.doesNotMatch(html, /http-equiv="refresh"/);
    if (path === '/') assert.match(html, /Free design editor/);
    else assert.match(html, /This is a free design tool/);
    const image = readFileSync(join(root, new URL(meta(html, 'og:image')).pathname));
    assert.equal(image.readUInt16BE(0), 0xffd8);
  }
  assert.notEqual(titles[0], titles[1]);
});

test('JSON-LD describes the app and page without made-up ratings or prices', () => {
  for (const [path, file] of publicPages) {
    const payloads = [...read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(payloads.length, 1);
    const data = JSON.parse(payloads[0][1]), graph = data['@graph'];
    assert.equal(data['@context'], 'https://schema.org');
    assert.equal(graph.find(node => node['@type'] === 'WebApplication').applicationCategory, 'DesignApplication');
    assert.equal(graph.find(node => node['@type'] === 'WebPage').url, origin + path);
    assert.equal(graph.find(node => node['@type'] === 'WebPage').description, meta(read(file), 'description'));
    assert.equal(graph.find(node => node['@type'] === 'WebApplication').description, meta(read('index.html'), 'description'));
    const ids = new Set(graph.map(node => node['@id']));
    for (const node of graph) for (const key of ['about', 'mainEntity', 'isPartOf']) if (node[key]) assert.ok(ids.has(node[key]['@id']));
    assert.doesNotMatch(JSON.stringify(data), /aggregateRating|ratingCount|reviewCount|price|offers/);
  }
});

test('the first 2 MB include the editor text and complete editor script', () => {
  for (const file of ['index.html', 'drafts/dark-library-layout/index.html']) {
    const html = read(file), prefix = Buffer.from(html).subarray(0, 2_000_000).toString('utf8');
    assert.match(prefix, /<section class="inspector-info"[^>]*>[\s\S]*?Free design editor[\s\S]*?<\/section>/);
    assert.match(prefix, /<script>\s*[\s\S]*?syncToolLayout\(\);render\(\);\s*(?:const projectsReady=initializeProjects\(\);\s*)?<\/script>/);
    assert.equal((html.match(/<style data-picture-drop>/g) || []).length, 1);
    assert.equal((html.match(/<script data-vendor="heic-to"/g) || []).length, 1);
    assert.ok(html.indexOf('<script data-vendor="heic-to"') > html.indexOf('syncToolLayout();render();'));
  }
});

test('public links and images point to real shipped files and sections', () => {
  for (const [, file] of publicPages) {
    const html = read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
    for (const tag of [...tags(html, 'a'), ...tags(html, 'img'), ...tags(html, 'link')]) {
      const href = tag.href || tag.src;if (!href || href.startsWith('data:')) continue;
      const url = new URL(href, origin + '/' + file);
      if (url.origin !== origin) continue;
      const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      assert.ok(existsSync(join(root, path)), `${file}: ${href}`);
      if (url.hash) assert.match(read(path), new RegExp(`id="${url.hash.slice(1)}"`));
    }
  }
});

test('robots and sitemap allow the public pages and omit the noindex editors', () => {
  const robots = read('robots.txt'), sitemap = read('sitemap.xml');
  assert.match(robots, /User-agent: \*\nAllow: \/\n/);
  assert.match(robots, /Sitemap: https:\/\/uidesigneditor.com\/sitemap.xml/);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  assert.deepEqual(urls, publicPages.map(([path]) => origin + path));
  assert.equal(existsSync(join(root, 'drafts/dark-player-layout/index.html')), false);
  for (const name of ['dark-library-layout', 'dark-chapter-layout', 'dark-add-layout']) {
    const html = read(`drafts/${name}/index.html`);
    assert.equal(meta(html, 'robots'), 'noindex,follow');
    assert.equal(meta(html, 'og:url'), `${origin}/drafts/${name}/`);
    assert.equal((html.match(/<!-- BEGIN SITE META -->/g) || []).length, 1);
    assert.doesNotMatch(sitemap, new RegExp(name));
  }
});

test('one LLM file holds the text from Info and About without extra copies', () => {
  const text = read('llms.txt');
  assert.match(text, /^# UI Design Editor\n\nSource: https:\/\/uidesigneditor.com\//);
  assert.match(text, /Free design editor/);
  assert.match(text, /This is a free design tool/);
  assert.match(text, /Copy the prompt from the editor into your AI terminal/);
  assert.match(text, /When you first visit the website, it creates and saves a "space" for you/);
  assert.doesNotMatch(text, /<script|<style|<main|<div|\)\[|llms-full\.txt|index\.md/);
  for (const file of ['llms-full.txt', 'index.md', 'guide/index.md']) assert.equal(existsSync(join(root, file)), false);
});

test('the build ships only public files, with gzip copies that keep the same contents', async () => {
  const { buildSite, publicFiles } = await import('../scripts/build-site.mjs');
  const folder = await mkdtemp(join(tmpdir(), 'uidesigneditor-site-test-'));
  const destination = join(folder, 'site');
  try {
    await buildSite(pathToFileURL(destination));
    const actual = (await readdir(destination, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(destination.length + 1)).sort();
    const compressed = publicFiles.filter(file => /\.(html|css|svg|txt|xml|md)$/.test(file));
    assert.deepEqual(actual, [...publicFiles, ...compressed.map(file => file + '.gz')].sort());
    for (const file of publicFiles) assert.deepEqual(readFileSync(join(destination, file)), readFileSync(join(root, file)));
    for (const file of compressed) assert.deepEqual(gunzipSync(readFileSync(join(destination, file + '.gz'))), readFileSync(join(root, file)));
    for (const privateFile of ['.git', '.env', 'README.md', 'package.json', 'scripts', 'editor', 'deploy', 'tests', 'site', 'llms-full.txt', 'index.md', 'guide/index.md', 'drafts']) assert.equal(existsSync(join(destination, privateFile)), false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('build succeeds when the output uses another file system', async context => {
  const { buildSite } = await import('../scripts/build-site.mjs');
  const folder = await mkdtemp(join(tmpdir(), 'uidesigneditor-other-disk-'));
  const destination = join(folder, 'site'), originalRename = fileSystem.rename;
  let moves = 0;
  context.mock.method(fileSystem, 'rename', async (source, target) => {
    moves++;
    if (!source.startsWith(folder + sep)) throw Object.assign(new Error('Cannot rename across file systems'), { code: 'EXDEV' });
    return originalRename(source, target);
  });
  syncBuiltinESMExports();
  try {
    await buildSite(pathToFileURL(destination));
    assert.equal(moves, 1);
    assert.ok(existsSync(join(destination, 'index.html')));
    assert.deepEqual(await readdir(folder), ['site']);
  } finally {
    context.mock.restoreAll();syncBuiltinESMExports();
    await rm(folder, { recursive: true, force: true });
  }
});
