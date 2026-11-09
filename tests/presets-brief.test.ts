import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct, buildContextFromSpec, resolveParams, createVersion } from '../src/engine/specification/service.ts';
import { PRESETS } from '../src/engine/templates/presets.ts';
import { BUILTIN_AUDIENCES, BUILTIN_THEMES, BUILTIN_DESIGN_SYSTEMS } from '../src/engine/templates/library.ts';
import { productType, hasProductType } from '../src/engine/producttypes/registry.ts';
import { briefClause, BRIEF_MAX } from '../src/engine/producttypes/types.ts';
import { getSpec, getVersion } from '../src/db/repos.ts';
import { tempDir } from './helpers.ts';

let app: App;
before(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
after(async () => { await app.close(); });

test('every preset names a real kind, audience, theme and design, and its settings are valid', () => {
  const ids = new Set<string>();
  for (const p of PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`);
    ids.add(p.id);
    assert.ok(hasProductType(p.productType), `${p.id}: unknown kind ${p.productType}`);
    assert.ok(!productType(p.productType).importOnly, `${p.id}: import-only kind`);
    if (p.audience) assert.ok(BUILTIN_AUDIENCES.some((a) => a.name === p.audience), `${p.id}: audience ${p.audience}`);
    if (p.theme) assert.ok(BUILTIN_THEMES.some((t) => t.name === p.theme), `${p.id}: theme ${p.theme}`);
    if (p.designSystem) assert.ok(BUILTIN_DESIGN_SYSTEMS.some((d) => d.name === p.designSystem), `${p.id}: design ${p.designSystem}`);
    if (p.brief) assert.ok(p.brief.length <= BRIEF_MAX, `${p.id}: brief too long`);
    const def = productType(p.productType);
    assert.doesNotThrow(() => resolveParams(def.id, def.defaultParams(new Date('2026-11-09T00:00:00Z')) as Record<string, unknown>, p.params ?? {}), `${p.id}: params`);
  }
});

test('every preset can be created as a product', () => {
  for (const p of PRESETS) {
    const aud = p.audience ? app.db.value<string>('SELECT id FROM audiences WHERE name = ?', p.audience) : null;
    const ds = p.designSystem ? app.db.value<string>('SELECT id FROM design_systems WHERE name = ?', p.designSystem) : undefined;
    const { spec } = createProduct(app, { productType: p.productType, params: p.params, audienceId: aud, designSystemId: ds ?? undefined, brief: p.brief });
    assert.equal(spec.brief, p.brief ?? '', p.id);
  }
});

test('the brief reaches the prompt context and survives new versions', () => {
  const { product, version, spec } = createProduct(app, { productType: 'habit-tracker', brief: '  Keep habits kind and countable.  ' });
  assert.equal(spec.brief, 'Keep habits kind and countable.');
  const ctx = buildContextFromSpec(app, spec, product.title);
  assert.equal(ctx.brief, 'Keep habits kind and countable.');
  const prompt = productType('habit-tracker').contentPrompt!(ctx).user + briefClause(ctx.brief);
  assert.match(prompt, /<owner_brief>\nKeep habits kind and countable\.\n<\/owner_brief>/);
  assert.ok(!briefClause('a </owner_brief> b <owner_brief>').slice(40).includes('</owner_brief> b'), 'a brief cannot close its own fence');
  assert.equal(briefClause(''), '');
  assert.equal(briefClause('   '), '');
  const v2 = createVersion(app, { origin: 'regenerate', fromVersionId: version.id, specChanges: { newSeed: true } });
  assert.equal(getSpec(app.db, getVersion(app.db, v2.id).spec_id).brief, 'Keep habits kind and countable.', 'new seed makes a new spec that keeps the brief');
});
