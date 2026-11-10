import { createReadStream, existsSync } from 'node:fs';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { notFound } from '../../core/errors.ts';
import {
  listReferences, getReference, importReferenceImage, importReferenceText, updateReference, deleteReference,
  createProductFromReferences, productsUsingReference, MAX_IMAGE_BYTES, type ImportOutcome,
  tagsFor, listTags, tagReferences,
} from '../../engine/references/service.ts';
import { createBatch, addToBatch } from '../../engine/approval/batches.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { parse, type P, type Q } from './util.ts';
import { fetchImage } from '../../engine/references/fetchImage.ts';

const Tags = z.array(z.string().max(40)).max(20).optional();

const TagBody = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  add: z.array(z.string().max(40)).max(20).optional(),
  remove: z.array(z.string().max(40)).max(20).optional(),
});

const ImageBody = z.object({
  tags: Tags,
  fileName: z.string().min(1).max(255),
  dataBase64: z.string().min(1).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8),
  label: z.string().max(60).optional(),
  sourceTool: z.string().max(80).optional(),
  prompt: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
  madeAt: z.string().max(40).optional(),
});

const TextBody = z.object({
  field: z.enum(['title', 'description', 'tags', 'page_text', 'other']),
  text: z.string().min(1).max(50_000),
  /** Each non-empty line becomes its own example (handy for pasting a list of titles). */
  eachLine: z.boolean().default(false),
  tags: Tags,
  label: z.string().max(60).optional(),
  sourceTool: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
});

const PatchBody = z.object({
  label: z.string().max(60).optional(),
  sourceTool: z.string().max(80).optional(),
  prompt: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
  useAsExample: z.boolean().optional(),
});

const ProductBody = z.object({
  referenceIds: z.array(z.string()).min(1).max(40),
  title: z.string().max(120).optional(),
  cover: z.boolean().optional(),
  marketplaces: z.array(z.string()).optional(),
});

function summary(o: ImportOutcome) {
  if (o.status === 'imported') return { status: o.status, id: o.item.id, label: o.item.label, path: o.item.rel_path };
  if (o.status === 'duplicate') return { status: o.status, fileName: o.fileName, existingId: o.existing.id, existingLabel: o.existing.label, existingPath: o.existing.rel_path, tagsAdded: o.tagsAdded ?? 0 };
  return o;
}

const kindOf = (v: unknown) => (v === 'image' || v === 'text' ? v : undefined);

export function registerReferenceRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  // ?tag=fonts shows one group; ?tag=_untagged shows what is still to be sorted.
  s.get('/api/references', async (req) => {
    const q = req.query as Q;
    const rows = listReferences(app, kindOf(q.kind), typeof q.tag === 'string' && q.tag ? q.tag : undefined);
    const tags = tagsFor(app, rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [], usedBy: r.kind === 'image' ? productsUsingReference(app, r.id) : [] }));
  });

  s.get('/api/references/tags', async (req) => {
    const kind = kindOf((req.query as Q).kind);
    const all = listReferences(app, kind).length;
    const untagged = listReferences(app, kind, '_untagged').length;
    return { tags: listTags(app, kind), total: all, untagged };
  });

  s.post('/api/references/tags', async (req) => tagReferences(app, parse(TagBody, req.body, 'tags')));

  s.get('/api/references/:id/file', async (req, reply) => {
    const r = getReference(app, (req.params as P).id);
    if (!r.rel_path || !existsSync(app.assets.resolve(r.rel_path))) throw notFound('File for reference', r.id);
    reply.header('Content-Type', r.mime ?? 'application/octet-stream');
    reply.header('Content-Disposition', `inline; filename="${r.rel_path.split('/').pop()}"`);
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(createReadStream(app.assets.resolve(r.rel_path)));
  });

  s.post('/api/references/images', async (req) => {
    const b = parse(ImageBody, req.body, 'image');
    return summary(importReferenceImage(app, { ...b, data: Buffer.from(b.dataBase64, 'base64') }));
  });

  // A picture dragged in from a web page arrives as its link. The app fetches the bytes and hands them back,
  // so the page can convert formats the factory doesn't store (AVIF, BMP, SVG...) before importing.
  s.post('/api/references/fetch-image', async (req, reply) => {
    const { url } = parse(z.object({ url: z.string().min(8).max(4000) }), req.body, 'link');
    const f = await fetchImage(url);
    reply.header('Content-Type', f.contentType);
    reply.header('X-File-Name', encodeURIComponent(f.fileName));
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    return reply.send(f.bytes);
  });

  s.post('/api/references/texts', async (req) => {
    const b = parse(TextBody, req.body, 'text');
    const pieces = b.eachLine ? b.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3) : [b.text];
    return { results: pieces.slice(0, 200).map((text) => summary(importReferenceText(app, { field: b.field, text, label: b.label, sourceTool: b.sourceTool, notes: b.notes, tags: b.tags }))) };
  });

  s.patch('/api/references/:id', async (req) => updateReference(app, (req.params as P).id, parse(PatchBody, req.body, 'change')));

  s.delete('/api/references/:id', async (req) => {
    deleteReference(app, (req.params as P).id);
    return { ok: true };
  });

  s.post('/api/references/products', async (req) => {
    const b = parse(ProductBody, req.body, 'product');
    const { product, version } = createProductFromReferences(app, b);
    const batchId = createBatch(app, `Imported — ${product.title}`.slice(0, 120), 'manual');
    addToBatch(app, batchId, version.id);
    startPipeline(app, version.id, { marketplaces: b.marketplaces });
    return { productId: product.id, versionId: version.id, batchId };
  });
}
