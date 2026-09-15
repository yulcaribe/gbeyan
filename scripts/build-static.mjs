import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');

// Publish browser assets only. Backend code and local credentials stay outside dist.
const files = [
  'index.html',
  'style.css',
  'cargo/cargo-core.js',
  'datas/countries.js',
  'gendec/fhy.js',
  'gendec/gendec-core.js',
  'gendec/noz.js',
  'gendec/rys.js',
  'gendec/sxs.js',
  'otobeyan/config.js',
  'otobeyan/loader.js',
  'otobeyan/quickbeyan.js',
  'otobeyan/client/api.js',
  'vendor/pdfjs/3.11.174/pdf.min.js',
  'vendor/pdfjs/3.11.174/pdf.worker.min.js',
  'vendor/pdfjs/3.11.174/LICENSE',
  'vendor/xlsx/0.18.5/xlsx.full.min.js',
  'vendor/xlsx/0.18.5/LICENSE'
];

await rm(output, { recursive: true, force: true });
for (const file of files) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, file), target);
}
console.log(`Published ${files.length} browser files to dist.`);
