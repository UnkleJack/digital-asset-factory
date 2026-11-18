import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { MARKETPLACES } from '../src/core/marketplaces.ts';
import { adapters, registerAdapter, genericAdapter } from '../src/engine/publishing/adapters.ts';
import { adapterForApp } from '../src/engine/publishing/gumroad.ts';
import { directPublishIsOn } from '../src/engine/publishing/service.ts';
import { estimateProfit } from '../src/engine/listing/profit.ts';
import { tempDir } from './helpers.ts';

// One list of marketplaces (src/core/marketplaces.ts) drives settings, adapters, seed rows and the screens.
// A marketplace the factory doesn't know the fees of shows "not available", never another shop's numbers.

const PORT = 4397;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let server: FastifyInstance;

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  server = await buildServer({ app, worker: null, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await app.close();
});

test('every listed marketplace has settings, an adapter and a seeded account row', () => {
  const settings = app.settings.get('marketplaces');
  const ids = adapters().map((a) => a.id);
  for (const m of MARKETPLACES) {
    assert.ok(settings[m]?.rules, `${m} has listing rules in Settings`);
    assert.ok(ids.includes(m), `${m} has an adapter`);
    assert.ok(app.db.get('SELECT 1 FROM marketplace_accounts WHERE marketplace = ?', m), `${m} has an account row`);
  }
});

test('a marketplace with no fee numbers of its own gets no estimate, not the generic shop\'s', () => {
  app.settings.update('marketplaces', { fees: { ...app.settings.get('marketplaces').fees, generic: { known: true, percent: 5, fixedCents: 30 } } });
  const generic = estimateProfit(app, { marketplace: 'generic', price_cents: 1000, currency: 'USD' });
  assert.equal(generic.available, true, 'the generic shop uses the numbers typed in for it');
  const other = estimateProfit(app, { marketplace: 'newshop', price_cents: 1000, currency: 'USD' });
  assert.equal(other.available, false);
  assert.match(other.reason ?? '', /No fee numbers are set up for newshop/);
});

test('an adapter without settings shows as switched off; direct posting follows the adapter, not its name', async () => {
  const restore = registerAdapter({ ...genericAdapter, id: 'newshop', displayName: 'New shop', capabilities: { ...genericAdapter.capabilities, publish: true }, optedIn: () => true });
  try {
    const list = (await server.inject({ method: 'GET', url: '/api/marketplaces', headers: H })).json() as { id: string; enabled: boolean; rules: unknown; directPublishOn: boolean }[];
    const row = list.find((x) => x.id === 'newshop');
    assert.ok(row, 'a registered adapter is listed');
    assert.equal(row.enabled, false);
    assert.equal(row.rules, null);
    assert.equal(row.directPublishOn, true, 'an unverified adapter the owner switched on can post directly');
    assert.equal(directPublishIsOn({ ...genericAdapter, capabilities: { ...genericAdapter.capabilities, publish: true } }), false, 'unverified and not switched on: no direct posting');
  } finally {
    restore();
  }
  // Gumroad keeps its two switches: off by default, on only when the owner turns direct posting on.
  const g = () => adapterForApp(app, 'gumroad');
  assert.equal(directPublishIsOn(g()), false);
  assert.equal(g().publishOnApproval?.(), false);
  app.settings.update('marketplaces', { gumroad: { ...app.settings.get('marketplaces').gumroad, autoPublishEnabled: true } });
  assert.equal(directPublishIsOn(g()), true);
  assert.equal(g().publishOnApproval?.(), false, 'posting on approval needs its own switch too');
  app.settings.update('marketplaces', { gumroad: { ...app.settings.get('marketplaces').gumroad, autoPublishOnApproval: true } });
  assert.equal(g().publishOnApproval?.(), true);
});
