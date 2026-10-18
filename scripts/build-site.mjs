import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
export const publicFiles = [
  'index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'instructions.txt',
  'guide/index.html',
  'assets/site.css', 'assets/icon.svg', 'assets/social-card.jpg',
  'assets/landing-screen-recording-10s.mp4', 'assets/landing-untitled-10s.mp4',
  'assets/landing-screen-recording-153438-10s.mp4', 'assets/landing-screenshotcutmov-10s.mp4',
];

export async function buildSite(destination = new URL('dist/', root)) {
  const outputPath = resolve(fileURLToPath(destination));
  const parent = dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, '.site-build-'));
  const folder = pathToFileURL(temporary + '/');
  let bytes = 0, compressedBytes = 0;
  try {
    for (const file of publicFiles) {
      const data = await readFile(new URL(file, root));
      const output = new URL(file, folder);
      await mkdir(new URL('./', output), { recursive: true });
      await writeFile(output, data);
      bytes += data.length;
      if (/\.(html|css|svg|txt|xml|md)$/.test(file)) {
        const compressed = gzipSync(data, { level: 9 });
        await writeFile(new URL(file + '.gz', folder), compressed);
        compressedBytes += compressed.length;
      } else compressedBytes += data.length;
    }
    await rm(outputPath, { recursive: true, force: true });
    await rename(temporary, outputPath);
    console.log(`Built ${publicFiles.length} public files in ${destination.pathname}`);
    console.log(`${(bytes / 1048576).toFixed(2)} MB, ${(compressedBytes / 1048576).toFixed(2)} MB with gzip.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await buildSite();
