import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
export const origin = 'https://uidesigneditor.com';
export const pages = [
  { path: '/', file: 'index.html', source: 'editor/inspector-tabs.html', title: 'UI Design Editor | Free local screen editor', description: 'A simple and free ui design tool. Select, cut, move and resize. Add buttons and rectangles. 100% local, all files stay in your browser. No signup.' },
  { path: '/guide/', file: 'guide/index.html', source: 'site/guide.html', title: 'About UI Design Editor', description: 'Free UI design tool. Your work stays 100% local in your browser. No signup.' },
];
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const header = `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><a class="brand" href="/"><img src="/assets/icon.svg" alt="" width="25" height="25">uidesigneditor.com</a><nav class="site-nav" aria-label="Main"><a href="/guide/">About</a><a class="nav-editor" href="/">Open editor</a></nav></header>`;
const footer = `<footer class="site-footer"><span>UI Design Editor · Your drafts stay on your device.</span><nav aria-label="More"><a href="https://github.com/janpmz/uidesigneditor" target="_blank" rel="noopener noreferrer">GitHub</a><a href="/guide/#save">Saving &amp; privacy</a><a href="/llms.txt">LLMs.txt</a><a href="/sitemap.xml">Sitemap</a></nav></footer>`;
function structuredData(page) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': origin + '/#website', name: 'UI Design Editor', alternateName: 'uidesigneditor.com', url: origin + '/', inLanguage: 'en' },
      { '@type': 'WebApplication', '@id': origin + '/#app', name: 'UI Design Editor', url: origin + '/', description: pages[0].description, applicationCategory: 'DesignApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and browser storage.', isAccessibleForFree: true, image: origin + '/assets/social-card.jpg', featureList: ['Move and resize screen items', 'Edit text, shapes, icons and pictures', 'Save drafts in the browser', 'Copy a full HTML draft with pictures', 'Save a PNG screenshot'] },
      { '@type': 'WebPage', '@id': origin + page.path + '#page', url: origin + page.path, name: page.title, description: page.description, inLanguage: 'en', isPartOf: { '@id': origin + '/#website' }, about: { '@id': origin + '/#app' }, ...(page.path === '/' ? { mainEntity: { '@id': origin + '/#app' } } : {}) },
    ],
  };
}
export function metadata(page, { index = true, schema = true } = {}) {
  return `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="${index ? 'index,follow,max-image-preview:large' : 'noindex,follow'}">
<link rel="canonical" href="${origin + page.path}">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="describedby" href="/llms.txt" type="text/plain">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UI Design Editor">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${origin + page.path}">
<meta property="og:image" content="${origin}/assets/social-card.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta property="og:image:alt" content="Free UI mockup tool. 100% local in your browser. No accounts. Select, cut, move, resize.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${origin}/assets/social-card.jpg">
<meta name="twitter:image:alt" content="Free UI mockup tool. 100% local in your browser. No accounts. Select, cut, move, resize.">
${schema ? `<script type="application/ld+json">\n${JSON.stringify(structuredData(page), null, 2)}\n</script>` : ''}`;
}
function document(page, body, options) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#151517">
${metadata(page, options)}
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${page.path === '/guide/' ? header.replace(/<nav[\s\S]*?<\/nav>/, '') : header}
${body.trim()}
${page.path === '/guide/' ? '' : footer}
</body>
</html>
`;
}
// These pages use a small set of HTML tags. Keep their text available without scripts.
function markdown(body) {
  return body.replace(/<figure\b[\s\S]*?<\/figure>/g, '')
    .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')
    .replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/g, (_, level, text) => '\n\n' + '#'.repeat(Number(level)) + ' ' + text.replace(/<br\s*\/?>/g, ' ') + '\n\n')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => `[${text.trim()}](${new URL(href, origin).href})`)
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<li>/g, '\n- ').replace(/<dt>/g, '\n- ').replace(/<\/dt>\s*<dd>/g, ': ')
    .replace(/<\/(p|section|header|ul|dl)>/g, '\n\n').replace(/<\/div>/g, '\n').replace(/<br\s*\/?>/g, '\n')
    .replace(/\)\[/g, ') [')
    .replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
    .replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
const textPages = [];
for (const page of pages) {
  let body = await readFile(new URL(page.source, root), 'utf8');
  if (page.path === '/') body = body.match(/<section class="inspector-info"[^>]*>([\s\S]*?)<\/section>/)[1];
  await mkdir(new URL('./', new URL(page.file, root)), { recursive: true });
  if (page.path !== '/') await writeFile(new URL(page.file, root), document(page, body));
  const text = markdown(body);textPages.push(text);
}
await writeFile(new URL('robots.txt', root), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(new URL('sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${origin + page.path}</loc></url>`).join('\n')}\n</urlset>\n`);
await writeFile(new URL('llms.txt', root), `# UI Design Editor\n\nSource: ${origin}/\n\n${textPages.join('\n---\n\n')}`);
for (const file of ['llms-full.txt', 'index.md', 'guide/index.md']) await rm(new URL(file, root), { force: true });
const errorPage = { path: '/404.html', title: 'Page not found | UI Design Editor', description: 'This page does not exist. Open UI Design Editor.' };
await writeFile(new URL('404.html', root), document(errorPage, '<main id="main" class="error"><p class="eyebrow">404</p><h1>Page not found.</h1><a class="button primary" href="/">Open editor</a></main>', { index: false, schema: false }));
const drafts = [
  ['dark-player-layout', 'Player layout editor', 'Edit a player screen with text, icons and buttons. Move and resize items, work with pictures and keep the draft in your browser.'],
  ['dark-library-layout', 'Library layout editor', 'Edit the UI design. Draw a rectangle to select items and move them around and resize them.'],
  ['dark-chapter-layout', 'Chapter layout editor', 'Edit a chapter list with text, icons and shapes. Move and resize items and keep the draft in your browser.'],
  ['dark-add-layout', 'Upload screen editor', 'Edit an upload screen, add pictures and arrange screen items. Keep the draft in your browser or copy a full HTML file.'],
];
for (const [name, title, description] of drafts) {
  const file = new URL(`drafts/${name}/index.html`, root);
  let html = await readFile(file, 'utf8');
  const block = `<!-- BEGIN SITE META -->\n${metadata({ path: `/drafts/${name}/`, title: title + ' | UI Design Editor', description }, { index: false, schema: false })}\n<!-- END SITE META -->`;
  if (html.includes('<!-- BEGIN SITE META -->')) html = html.replace(/<!-- BEGIN SITE META -->[\s\S]*?<!-- END SITE META -->/, block);
  else html = html.replace(/<meta name="robots"[^>]*>\s*<title>[^<]*<\/title>/, block);
  await writeFile(file, html);
}
let editorHome = await readFile(new URL('drafts/dark-player-layout/index.html', root), 'utf8');
editorHome = editorHome.replace(/<!-- BEGIN SITE META -->[\s\S]*?<!-- END SITE META -->/, `<!-- BEGIN SITE META -->\n${metadata(pages[0])}\n<!-- END SITE META -->`);
for (const name of ['dark-library-layout', 'dark-chapter-layout', 'dark-add-layout']) editorHome = editorHome.replaceAll(`href="../${name}/"`, `href="/drafts/${name}/"`);
await writeFile(new URL('index.html', root), editorHome);
console.log('Updated public pages, editor metadata and crawler files.');
