import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { floor, feedProduct, openCart, sealCart, dissolveCart, fillCart, runBreak, remixWinners, addItemManually, removeItem, productTags, setExtraTags, suggestTags, allTags, TAG_KINDS } from '../../engine/packing/service.ts';
import { parse, type P } from './util.ts';

const TagBody = z.object({ kind: z.enum(TAG_KINDS), tag: z.string().trim().min(2).max(40) });

export function registerPackingRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/packing', async () => floor(app));
  s.post('/api/packing/feed', async (req) => {
    const { productIds } = parse(z.object({ productIds: z.array(z.string()).min(1).max(200) }), req.body, 'feed');
    return { results: productIds.map((id) => feedProduct(app, id, 'user')) };
  });
  s.post('/api/packing/carts', async (req) => {
    const b = parse(z.object({ name: z.string().trim().max(120).optional(), tags: z.array(TagBody).max(6).default([]) }), req.body, 'cart');
    return { cartId: openCart(app, { ...b, origin: 'manual' }) };
  });
  s.post('/api/packing/carts/:id/seal', async (req) => sealCart(app, (req.params as P).id));
  s.post('/api/packing/carts/:id/dissolve', async (req) => { dissolveCart(app, (req.params as P).id); return { ok: true }; });
  s.post('/api/packing/carts/:id/fill', async (req) => ({ added: fillCart(app, (req.params as P).id) }));
  s.post('/api/packing/carts/:id/items', async (req) => {
    const { productId } = parse(z.object({ productId: z.string().min(3) }), req.body, 'item');
    addItemManually(app, (req.params as P).id, productId);
    return { ok: true };
  });
  s.delete('/api/packing/carts/:id/items/:productId', async (req) => {
    const p = req.params as P & { productId: string };
    removeItem(app, p.id, p.productId);
    return { ok: true };
  });
  s.post('/api/packing/break', async () => runBreak(app, { force: true, actor: 'user' }));
  s.post('/api/packing/remix', async () => remixWinners(app));

  s.get('/api/tags', async () => allTags(app));
  s.get('/api/products/:id/tags', async (req) => productTags(app, (req.params as P).id));
  s.put('/api/products/:id/tags', async (req) => {
    const { tags } = parse(z.object({ tags: z.array(TagBody).max(40) }), req.body, 'tags');
    setExtraTags(app, (req.params as P).id, tags);
    return productTags(app, (req.params as P).id);
  });
  s.post('/api/products/:id/tags/suggest', async (req) => ({ tags: await suggestTags(app, (req.params as P).id) }));
}
