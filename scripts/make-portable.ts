import { resolvePaths } from '../src/config/paths.ts';
import { makePortablePackage } from '../src/ops/portable.ts';

const args = process.argv.slice(2);
const noDeps = args.includes('--no-deps');
const withData = args.includes('--with-data');
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;

const paths = resolvePaths();
console.log(`Packaging a portable copy of Digital Asset Factory (deps: ${noDeps ? 'excluded' : 'included'}, data: ${withData ? 'included' : 'excluded'})…`);
const result = makePortablePackage(paths, { includeDeps: !noDeps, includeData: withData, outPath });
for (const w of result.warnings) console.log(`Note: ${w}`);
console.log(`Portable package ready: ${result.zipPath}`);
console.log(`  ${result.files} files, ${(result.bytes / 1048576).toFixed(1)} MB`);
console.log('Unzip it anywhere, install Node.js 26+, and run "npm start" (see PORTABLE-README.txt inside).');
