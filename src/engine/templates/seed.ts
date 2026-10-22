import type { Db } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { BUILTIN_DESIGN_SYSTEMS, BUILTIN_AUDIENCES, BUILTIN_THEMES, BUILTIN_CATEGORIES } from './library.ts';
import { productTypes } from '../producttypes/registry.ts';

const DEFAULT_DESIGN: Record<string, string> = {
  'monthly-calendar': 'Botanical Sage', 'weekly-planner': 'Minimal Mono', 'daily-planner': 'Soft Pastel', 'habit-tracker': 'Soft Pastel',
  'todo-checklist': 'Minimal Mono', 'cleaning-schedule': 'Warm Neutral', 'home-inventory': 'Bold Modern', 'budget-planner': 'Bold Modern',
  'invoice-template': 'Bold Modern', 'guided-journal': 'Warm Neutral', 'goal-planner': 'Botanical Sage', 'mandala-coloring': 'Minimal Mono',
  'maze-activity': 'Kids Bright', 'word-search': 'Kids Bright', 'illustrated-coloring': 'Minimal Mono', bundle: 'Minimal Mono',
};

export function seedBuiltins(db: Db): { inserted: number } {
  const now = new Date().toISOString();
  let inserted = 0;
  db.tx(() => {
    for (const c of BUILTIN_CATEGORIES) {
      if (!db.get('SELECT 1 FROM categories WHERE name = ?', c.name)) {
        db.insert('categories', { id: newId('cat'), name: c.name, description: c.description });
        inserted++;
      }
    }
    for (const d of BUILTIN_DESIGN_SYSTEMS) {
      if (!db.get('SELECT 1 FROM design_systems WHERE name = ?', d.name)) {
        db.insert('design_systems', { id: newId('dsn'), name: d.name, description: d.description, tokens: JSON.stringify(d.tokens), is_builtin: 1, created_at: now, updated_at: now });
        inserted++;
      }
    }
    for (const a of BUILTIN_AUDIENCES) {
      if (!db.get('SELECT 1 FROM audiences WHERE name = ?', a.name)) {
        db.insert('audiences', { id: newId('aud'), name: a.name, description: a.description, profile: JSON.stringify(a.profile), is_builtin: 1, created_at: now });
        inserted++;
      }
    }
    for (const t of BUILTIN_THEMES) {
      if (!db.get('SELECT 1 FROM themes WHERE name = ?', t.name)) {
        db.insert('themes', { id: newId('thm'), name: t.name, description: t.description, keywords: JSON.stringify(t.keywords), seasonal_months: JSON.stringify(t.seasonalMonths), is_builtin: 1, created_at: now });
        inserted++;
      }
    }
    for (const type of productTypes()) {
      const name = `${type.name} (standard)`;
      if (!db.get('SELECT 1 FROM templates WHERE product_type = ? AND name = ?', type.id, name)) {
        const ds = db.get<{ id: string }>('SELECT id FROM design_systems WHERE name = ?', DEFAULT_DESIGN[type.id] ?? 'Minimal Mono');
        const defaults = type.id === 'bundle' ? { members: [] } : type.defaultParams(new Date());
        db.insert('templates', { id: newId('tpl'), product_type: type.id, name, description: type.description, default_params: JSON.stringify(defaults), default_design_system_id: ds?.id ?? null, is_builtin: 1, revision: 1, created_at: now, updated_at: now });
        inserted++;
      }
    }
    const marketplaces: [string, string][] = [['etsy', 'Etsy (export only)'], ['gumroad', 'Gumroad (export only)'], ['generic', 'Generic export']];
    for (const [m, label] of marketplaces) {
      if (!db.get('SELECT 1 FROM marketplace_accounts WHERE marketplace = ?', m)) {
        db.insert('marketplace_accounts', { id: newId('mka'), marketplace: m, label, status: 'export_only', created_at: now });
        inserted++;
      }
    }
  });
  return { inserted };
}
