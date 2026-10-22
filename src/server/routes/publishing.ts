import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { getListing, mapListing } from '../../db/repos.ts';
import { updateListing, prepareListings, isMarketplace } from '../../engine/listing/service.ts';
import { prepareExport, publishListing, recordManualPublication, reconcileListing, publicationStatus, activeApproval } from '../../engine/publishing/service.ts';
import { adapters } from '../../engine/publishing/adapters.ts';
import { adapterForApp, gumroadClientFor, syncGumroadSales } from '../../engine/publishing/gumroad.ts';
import { runReleaseQa } from '../../engine/qa/service.ts';
import { validation, errorMessage } from '../../core/errors.ts';
import { int, parse, type Q, type P } from './util.ts';

export function registerPublishingRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/marketplaces', async () => {
    const m = app.settings.get('marketplaces');
    return adapters().map((x) => adapterForApp(app, x.id)).map((a) => ({ id: a.id, name: a.displayName, verification: a.verification, capabilities: a.capabilities, notes: a.notes, enabled: m[a.id as 'etsy' | 'gumroad' | 'generic'].enabled, directPublishOn: a.id === 'gumroad' ? m.gumroad.autoPublishEnabled : a.verification === 'verified', rules: m[a.id as 'etsy' | 'gumroad' | 'generic'].rules }));
  });

  // Checks the saved Gumroad token with one read-only call; creates nothing.
  s.post('/api/integrations/gumroad/test', async () => {
    try {
      const u = await gumroadClientFor(app).user();
      return { ok: true, account: u.name ?? u.email ?? 'connected' };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
  s.post('/api/integrations/gumroad/sync-sales', async () => syncGumroadSales(app, { sinceDays: 90 }));

  s.get('/api/listings', async (req) => {
    const q = req.query as Q;
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.marketplace) { where.push('l.marketplace = ?'); args.push(q.marketplace); }
    if (q.status) { where.push('l.status = ?'); args.push(q.status); }
    if (q.current === '1') where.push('p.current_version_id = l.version_id');
    const rows = app.db.all<Record<string, unknown>>(`SELECT l.*, p.title AS product_title, v.version_no, v.status AS version_status, (p.current_version_id = l.version_id) AS is_current,
        (SELECT e.external_url FROM external_listings e WHERE e.listing_id = l.id LIMIT 1) AS external_url,
        (SELECT e.verification FROM external_listings e WHERE e.listing_id = l.id LIMIT 1) AS verification
      FROM listings l JOIN products p ON p.id = l.product_id JOIN product_versions v ON v.id = l.version_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.updated_at DESC LIMIT ?`, ...args, int(q.limit, 200, 1, 500));
    return rows.map((r) => {
      const l = mapListing(r);
      return { ...l, product_title: r.product_title, version_no: r.version_no, version_status: r.version_status, is_current: !!r.is_current, external_url: r.external_url, verification: r.verification, approved: !!activeApproval(app, l) };
    });
  });
  s.get('/api/listings/:id', async (req) => publicationStatus(app, (req.params as P).id));
  s.patch('/api/listings/:id', async (req) => {
    const l = updateListing(app, (req.params as P).id, req.body);
    await runReleaseQa(app, l.version_id);
    return l;
  });
  s.post('/api/versions/:id/listings', async (req) => {
    const b = parse(z.object({ marketplaces: z.array(z.string()).min(1) }), req.body, 'listing request');
    const bad = b.marketplaces.filter((m) => !isMarketplace(m));
    if (bad.length) throw validation(`Unknown marketplaces: ${bad.join(', ')}`);
    const id = (req.params as P).id;
    const out = await prepareListings(app, id, b.marketplaces.filter(isMarketplace), {}, 'user');
    await runReleaseQa(app, id);
    return out;
  });

  s.get('/api/publishing', async () => {
    const rows = app.db.all<Record<string, unknown>>(`SELECT l.* FROM listings l JOIN products p ON p.id = l.product_id WHERE p.current_version_id = l.version_id OR l.status IN ('published_manual','published_verified','needs_reconciliation') ORDER BY l.updated_at DESC LIMIT 300`);
    return rows.map((r) => {
      const l = mapListing(r);
      const st = publicationStatus(app, l.id);
      return { listing: { ...l, product_title: app.db.value('SELECT title FROM products WHERE id = ?', l.product_id) }, adapter: st.adapter, approval: st.approval, external: st.external, lastAttempt: st.attempts[0] ?? null, exportAssetId: app.db.value('SELECT id FROM assets WHERE version_id = ? AND kind = ? AND rel_path LIKE ? ORDER BY created_at DESC LIMIT 1', l.version_id, 'export_zip', `exports/${l.marketplace}/%`) ?? null };
    });
  });
  s.post('/api/listings/:id/export', async (req) => prepareExport(app, (req.params as P).id));
  s.post('/api/listings/:id/publish', async (req) => publishListing(app, (req.params as P).id));
  s.post('/api/listings/:id/record', async (req) => {
    const b = parse(z.object({ externalUrl: z.string().min(8).max(2000), externalId: z.string().max(300).optional() }), req.body, 'publication record');
    return recordManualPublication(app, (req.params as P).id, b);
  });
  s.post('/api/listings/:id/reconcile', async (req) => {
    const b = parse(z.object({ outcome: z.enum(['published', 'not_published']), externalUrl: z.string().max(2000).optional(), externalId: z.string().max(300).optional() }), req.body, 'reconciliation');
    return reconcileListing(app, (req.params as P).id, b);
  });
  s.get('/api/listings/:id/raw', async (req) => getListing(app.db, (req.params as P).id));
}
