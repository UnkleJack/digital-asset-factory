import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { DesignTokensSchema, FONTS, FONT_IDS, FONT_PAIRINGS } from './library.ts';
import { newId } from '../../core/ids.ts';
import { notFound } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';

export const FontChoiceSchema = z.object({ heading: z.enum(FONT_IDS), body: z.enum(FONT_IDS), accent: z.enum(FONT_IDS).optional() });
export type FontChoice = z.infer<typeof FontChoiceSchema>;

/**
 * Returns a design system that looks like `baseId` but uses the given fonts. If the fonts already
 * match, that is `baseId` itself; otherwise an existing custom design system with identical tokens
 * is reused, or a new one is created. Fonts live in design-system tokens, so this keeps the spec,
 * fingerprints and the "design" variation axis working unchanged.
 */
export function designSystemWithFonts(app: AppContext, baseId: string, fonts: FontChoice, actor: AuditActor = 'user'): string {
  const base = app.db.get<{ name: string; tokens: string }>('SELECT name, tokens FROM design_systems WHERE id = ?', baseId);
  if (!base) throw notFound('Design system', baseId);
  const tokens = DesignTokensSchema.parse(JSON.parse(base.tokens));
  const wanted = { heading: fonts.heading, body: fonts.body, accent: fonts.accent ?? fonts.heading };
  if (tokens.fonts.heading === wanted.heading && tokens.fonts.body === wanted.body && tokens.fonts.accent === wanted.accent) return baseId;
  const next = JSON.stringify({ ...tokens, fonts: wanted });
  const same = app.db.get<{ id: string }>('SELECT id FROM design_systems WHERE tokens = ? ORDER BY created_at LIMIT 1', next);
  if (same) return same.id;
  const pairing = FONT_PAIRINGS.find((p) => p.fonts.heading === wanted.heading && p.fonts.body === wanted.body && p.fonts.accent === wanted.accent);
  const fontsLabel = pairing?.name ?? `${FONTS[wanted.heading].family} + ${FONTS[wanted.body].family}`;
  const baseName = base.name.split(' · ')[0]; // a copy of a copy is named after the original look
  let name = `${baseName} · ${fontsLabel}`.slice(0, 60);
  for (let i = 2; app.db.get('SELECT 1 FROM design_systems WHERE name = ?', name); i++) name = `${baseName.slice(0, 40)} · ${fontsLabel}`.slice(0, 55) + ` ${i}`;
  const id = newId('dsn');
  const now = new Date().toISOString();
  app.db.insert('design_systems', { id, name, description: `${base.name} with ${FONTS[wanted.heading].family} headings and ${FONTS[wanted.body].family} body text.`, tokens: next, is_builtin: 0, created_at: now, updated_at: now });
  audit(app.db, actor, 'design_system.created', 'design_system', id, { name, basedOn: baseId, reason: 'font choice' });
  return id;
}
