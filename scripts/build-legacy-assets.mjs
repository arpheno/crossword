import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(projectRoot, 'src/crossword/static/lib');

// These are the browser distributions consumed by the legacy Jinja templates.
// Their versions are pinned in package.json and package-lock.json. Keeping the
// copy step explicit makes a clean checkout reproducible without checking in
// generated or hand-vendored files.
const assets = [
  ['node_modules/vue/dist/vue.js', 'vue.js'],
  ['node_modules/axios/dist/axios.min.js', 'axios.min.js'],
  ['node_modules/socket.io-client/dist/socket.io.min.js', 'socket.io.min.js'],
];

mkdirSync(outputRoot, { recursive: true });

for (const [source, destination] of assets) {
  const sourcePath = resolve(projectRoot, source);
  const destinationPath = resolve(outputRoot, destination);
  if (!existsSync(sourcePath)) {
    console.error(`Missing ${source}. Run ` +
      '`npm ci` before building legacy browser assets.');
    process.exit(1);
  }
  copyFileSync(sourcePath, destinationPath);
  console.log(`legacy asset: ${source} -> ${destinationPath}`);
}
