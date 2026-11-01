import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { getVersion } from '../src/db/repos.ts';
import { qaReport } from '../src/engine/qa/service.ts';
import { sniffImage } from '../src/engine/references/images.ts';
import {
  importReferenceImage, importReferenceText, createProductFromReferences, deleteReference, referenceLabel, updateReference,
} from '../src/engine/references/service.ts';
import { styleExamplesBrief } from '../src/engine/references/examples.ts';
import { AssetStore, localDay } from '../src/storage/assetStore.ts';
import { planTidy, applyTidy } from '../src/ops/tidyFolders.ts';
import { sha256 } from '../src/core/hash.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

// Tiny 96x96 line-art circles in three formats.
const WEBP = Buffer.from('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', 'base64');
const JPEG = Buffer.from('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', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAADcUlEQVR4nO1cwXLFIAhMOv3/X04PmUlT05ddYEEP7PFVATeIq7HZj+PYGp/xNTuA1dEEATRBAE0QQBME0AQBNEEATRBAEwTwPdf9vu9Ms4lyf6/3TZLyCcUB1xH0Ly+k90jfICoIGoYX9Ki1ht2lOrgPRu4o1fivlyTTNdEXONITVEZNjVMxQVegUxbmDO9KoTiXnbvfoJK4Q5NB06kZIIxHQFAwGvi0g2ajqkKlSkx23FPA5yUyxhBBjgie1MC+ji7Pvu5h+gmy+o4rYJ+FaAUIEsR0l4sUq0E+1H/6RkqgiZ08RZrKkUcHrcDOZlQ9Z2PH4mDOIHLMlcooNSSnkl6HnY1OJV8wNoKYyTVFVZs4Mk20rDNplW7k7RzHIdyCXTDUID59Igepn2CyKQxSmUE+ZfTe5WpJGj/zaN9lxzhsDYLx8ekwyLz3kQwNfF6eNnlT4heH/MYKUjOY5VXPhBNFMn1IdiTnB3FfpJ26V88SdjbXUh2BgCD5wgHBcKTiERMUH5uWnRPx8ZMWohkEHWTPhewANDqIkSfQiPU8DEpnibbOLdJkfKe0Y36MePEBECQpH/zm9o7hrw7LZGDvLkIZJKzfTyPXjwWV+AWJU0wi1eAIs2VR31EEmEYQPz2LpfOAziCAJgigCQJoggCmEcSX3oy9Lo/OIIBEgiQaT3Uw6EaIIOFW4GWzOvcoChAkEWnkhnP/i+GvDstkYO8ucmsQ+ejeN6sqLz5oDszgizrmTZ77nom7AYNoBsmHvVoAmKAVDmWeKKvfghpU+RLmROWLpjqhqOKoWFiztyC0b5+ZlpG+QnkpziD+ZgH/0mJozD8DCViCyH0Db+oEpGlo4PPytMmbUl6gOujLSwPdzDNXlQIrbDexkpYPSWKSrq3hZV3iZPLoguSBJ53q24o0L3lgMy1Mm1vT83CuYktxlLr199wG5Z9DRPXwkZiCsUbiySBeE6emUgE7my+DrC59QkZoMLL2938cou7xEwOT7+dcc2wdHO78eRDMeV8E7pLk8xJKgnhRiOZwzs151QLaX15AppT7ugVoksegPA+assm4I+MJ9feDkOXsTcCWTFO2o/6GGfJSMAviGjrPGnY3pUxc8G1TTH2D6C9xAkwg6I97jqyZwmoR7bss+o4iQBME0AQBNEEATRBAEwTQBAE0QQA/UJ8waelu2L4AAAAASUVORK5CYII=', 'base64');

let app: App;
let worker: Worker;

before(() => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  worker = createWorker(app);
  worker.start();
});

after(async () => {
  await worker.stop();
  await app.close();
});

const imported = (o: ReturnType<typeof importReferenceImage>) => {
  assert.equal(o.status, 'imported', JSON.stringify(o));
  return (o as Extract<typeof o, { status: 'imported' }>).item;
};

test('images are recognised by their bytes, not their file names', () => {
  assert.deepEqual(sniffImage(WEBP), { format: 'webp', mime: 'image/webp', ext: 'webp', widthPx: 96, heightPx: 96 });
  assert.equal(sniffImage(JPEG)?.format, 'jpeg');
  assert.equal(sniffImage(PNG)?.format, 'png');
  assert.equal(sniffImage(Buffer.from('{"installed":{"client_id":"x","project_id":"y","auth_uri":"z"}}')), null);
  assert.equal(referenceLabel('0182989f-6aed-4d40-b956-9c86b22e61d3.webp'), 'image');
  assert.equal(referenceLabel('flux-2-pro_a_An_intricate_and_ext.jpeg'), 'flux-2-pro-a-an-intricate-and-ext');
  assert.equal(referenceLabel('whatever.png', 'Mandala'), 'mandala');
});

test('importing images: readable names, exact duplicates skipped, non-images and key files refused', () => {
  const day = localDay(new Date());
  const a = imported(importReferenceImage(app, { fileName: '643a88a2-2091-4deb-a044-682a3fa6ca41.webp', data: WEBP, label: 'mandala', sourceTool: 'Grok Imagine' }));
  assert.equal(a.rel_path, `references/images/mandala_${day}.webp`);
  assert.ok(existsSync(app.assets.resolve(a.rel_path!)));
  assert.equal(a.source_tool, 'Grok Imagine');
  // A JPEG saved with a .png name keeps its real format.
  const b = imported(importReferenceImage(app, { fileName: 'mandala2.png', data: JPEG, label: 'mandala' }));
  assert.equal(b.rel_path, `references/images/mandala_${day}-2.jpg`);
  assert.equal(b.mime, 'image/jpeg');

  const dup = importReferenceImage(app, { fileName: 'copy-of-it.webp', data: WEBP });
  assert.equal(dup.status, 'duplicate');
  assert.equal(dup.status === 'duplicate' && dup.existing.id, a.id);

  const secret = importReferenceImage(app, { fileName: 'client_secret_123.apps.googleusercontent.com.json', data: Buffer.from('{"installed":{}}') });
  assert.equal(secret.status, 'rejected');
  assert.match(secret.status === 'rejected' ? secret.reason : '', /password or key/);
  const notImage = importReferenceImage(app, { fileName: 'notes.docx', data: Buffer.alloc(200, 7) });
  assert.equal(notImage.status, 'rejected');
  assert.equal(app.db.value<number>("SELECT count(*) FROM reference_items WHERE kind = 'image'"), 2);
});

test('imported images become a coloring product stored in a readable folder', async () => {
  const p = imported(importReferenceImage(app, { fileName: 'mandala1.png', data: PNG, label: 'mandala', sourceTool: 'ChatGPT images', prompt: 'intricate mandala line art' }));
  const ids = app.db.all<{ id: string }>("SELECT id FROM reference_items WHERE kind = 'image' ORDER BY created_at").map((r) => r.id);
  assert.equal(ids.length, 3);
  const { product, version } = createProductFromReferences(app, { referenceIds: ids });
  assert.equal(product.title, 'Mandala Coloring Pages');
  startPipeline(app, version.id);
  await idle(app);

  const v = getVersion(app.db, version.id);
  assert.equal(v.status, 'ready', `${v.status}: ${v.error} ${JSON.stringify(qaReport(app, v.id).flatMap((r) => (r.results as any[]).filter((x) => !x.passed && x.severity === 'hard')))}`);
  assert.equal(v.asset_dir, `products/coloring-pages/mandala-coloring-pages_${localDay(v.created_at)}`);
  const files = app.assets.forVersion(v.id);
  assert.ok(files.every((f) => f.rel_path.startsWith(`${v.asset_dir}/`)), 'every file is inside the readable folder');
  assert.ok(files.every((f) => !/\/v\d+\//.test(f.rel_path) && !f.rel_path.includes(product.id)), 'no id or v1 folders');
  const art = files.filter((f) => f.kind === 'artwork_png').sort((x, y) => (x.page_index ?? 0) - (y.page_index ?? 0));
  assert.equal(art.length, 3);
  for (const f of art) assert.equal(sniffImage(app.assets.read(f))?.format, 'png', `${f.rel_path} is a real PNG`);
  assert.equal(art[0].provenance.sourceTool, 'Grok Imagine');
  assert.equal(art[0].provenance.convertedFrom, 'image/webp');
  assert.equal(art[2].provenance.prompt, 'intricate mandala line art');
  const pdf = files.find((f) => f.kind === 'pdf')!;
  assert.equal(pdf.page_count, 4, 'cover + 3 pages');

  assert.throws(() => deleteReference(app, p.id), /used by "Mandala Coloring Pages"/);
  assert.throws(() => createProduct(app, { productType: 'imported-coloring' }), /made from the Imports screen/);
});

test('text examples reach the AI calls they fit, without duplicates', () => {
  assert.equal(styleExamplesBrief(app, 'listing:etsy'), '');
  const t = importReferenceText(app, { field: 'title', text: 'Midnight Garden Mandalas: 30 Calm Pages for Night Owls', sourceTool: 'ChatGPT' });
  assert.equal(t.status, 'imported');
  assert.equal(importReferenceText(app, { field: 'title', text: '  midnight garden mandalas:  30 calm pages for night owls ' }).status, 'duplicate');
  importReferenceText(app, { field: 'page_text', text: 'Today I noticed one small thing that made me smile.' });

  const listing = styleExamplesBrief(app, 'listing:etsy');
  assert.match(listing, /preferred style/);
  assert.match(listing, /Title: Midnight Garden Mandalas/);
  assert.doesNotMatch(listing, /made me smile/);
  assert.match(styleExamplesBrief(app, 'content:guided-journal'), /Page text: Today I noticed/);
  assert.equal(styleExamplesBrief(app, 'provider-test'), '');

  updateReference(app, t.status === 'imported' ? t.item.id : '', { useAsExample: false });
  assert.doesNotMatch(styleExamplesBrief(app, 'listing:etsy'), /Midnight Garden/);
});

test('tidy-folders moves old products/<id>/v<n> folders and keeps hashes and approvals valid', async () => {
  const { product, version } = createProduct(app, { productType: 'todo-checklist' });
  startPipeline(app, version.id);
  await idle(app);
  let v = getVersion(app.db, version.id);
  assert.equal(v.status, 'ready', String(v.error));
  const hashBefore = v.deliverable_hash;

  // Put it back the way the old app stored it.
  const legacy = AssetStore.legacyVersionDir(product.id, v.version_no);
  mkdirSync(dirname(app.assets.resolve(legacy)), { recursive: true });
  renameSync(app.assets.resolve(v.asset_dir!), app.assets.resolve(legacy));
  app.db.run('UPDATE assets SET rel_path = ? || substr(rel_path, ?) WHERE version_id = ?', legacy, v.asset_dir!.length + 1, v.id);
  const manifest = app.assets.forVersion(v.id).find((a) => a.kind === 'manifest')!;
  const { writeFileSync } = await import('node:fs');
  const legacyManifest = app.assets.read(manifest).toString('utf8').split(`"${v.asset_dir}/`).join(`"${legacy}/`);
  writeFileSync(app.assets.pathOf(manifest), legacyManifest);
  app.db.run('UPDATE assets SET sha256 = ?, size_bytes = ? WHERE id = ?', sha256(Buffer.from(legacyManifest)), Buffer.byteLength(legacyManifest), manifest.id);
  app.db.run('UPDATE product_versions SET asset_dir = NULL WHERE id = ?', v.id);
  // A stray old folder the database knows nothing about.
  app.assets.writeRaw('products/prd_unknown/v1/stray.pdf', Buffer.from('%PDF-1.4'));

  const plan = planTidy(app.db, app.assets);
  const move = plan.moves.find((m) => m.versionId === v.id)!;
  assert.ok(move, JSON.stringify(plan));
  assert.equal(move.from, legacy);
  assert.equal(move.to, `products/productivity/${product.slug}_${localDay(v.created_at)}`);
  assert.deepEqual(plan.unknownFolders, ['products/prd_unknown/v1']);

  const r = applyTidy(app.db, app.assets, plan);
  assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
  v = getVersion(app.db, version.id);
  assert.equal(v.asset_dir, move.to);
  for (const a of app.assets.forVersion(v.id)) {
    assert.ok(a.rel_path.startsWith(`${move.to}/`), a.rel_path);
    assert.equal(sha256(app.assets.read(a)), a.sha256, `${a.rel_path} matches its stored hash`);
  }
  assert.doesNotMatch(app.assets.read(app.assets.forVersion(v.id).find((a) => a.kind === 'manifest')!).toString(), new RegExp(product.id + '/v1'));
  assert.equal(existsSync(app.assets.resolve(`products/${product.id}`)), false, 'empty old folder removed');
  assert.ok(existsSync(app.assets.resolve('products/prd_unknown/v1/stray.pdf')), 'unknown folders are left alone');
  assert.equal(getVersion(app.db, v.id).deliverable_hash, hashBefore);
  const { recomputeHash } = { recomputeHash: (await import('../src/engine/packaging/service.ts')).deliverableHash };
  assert.equal(recomputeHash(app.assets.forVersion(v.id)), hashBefore, 'deliverable hash unchanged, so approvals stay valid');
  assert.equal(planTidy(app.db, app.assets).moves.length, 0, 'running it again moves nothing');
  assert.ok(readdirSync(app.assets.resolve('products/productivity')).length >= 1);
});
