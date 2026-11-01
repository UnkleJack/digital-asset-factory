import type { AppContext } from '../../app/context.ts';

/**
 * Text you imported and marked "use as example" (titles, descriptions, tags, page text you
 * liked, often written with other AI tools) is shown to the AI as examples of the style you want.
 * Each AI call only sees the kinds of text that matter for it, newest first, within a size cap.
 */

type Field = 'title' | 'description' | 'tags' | 'page_text' | 'other';

const LABELS: Record<Field, string> = { title: 'Title', description: 'Description', tags: 'Tags', page_text: 'Page text', other: 'Example' };
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 300;
const MAX_BRIEF_CHARS = 2000;

/** Which kinds of example text help an AI call, by its purpose ("listing:etsy", "content:habit-tracker", ...). */
export function fieldsForPurpose(purpose: string): Field[] {
  if (purpose.startsWith('listing:')) return ['title', 'description', 'tags'];
  if (purpose.startsWith('content:')) return ['page_text', 'other'];
  if (purpose === 'packing:suggest-tags') return ['tags', 'title'];
  if (purpose === 'bundle:suggest-copy') return ['title', 'description'];
  if (purpose.startsWith('research:') || purpose.startsWith('digest:')) return ['title'];
  return [];
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** A text block of style examples for this AI call, or "" when there are none that apply. */
export function styleExamplesBrief(app: AppContext, purpose: string): string {
  const fields = fieldsForPurpose(purpose);
  if (!fields.length) return '';
  const rows = app.db.all<{ field: Field; body: string; source_tool: string }>(
    `SELECT field, body, source_tool FROM reference_items
     WHERE kind = 'text' AND use_as_example = 1 AND field IN (${fields.map(() => '?').join(',')})
     ORDER BY made_at DESC, created_at DESC LIMIT ${MAX_ITEMS}`,
    ...fields,
  );
  if (!rows.length) return '';
  const lines = rows.map((r) => `- ${LABELS[r.field]}: ${clip(r.body, MAX_ITEM_CHARS)}`);
  const brief = `\n## Examples of the operator's preferred style\nThese are examples the operator chose. Match their tone, length and structure; do not copy them word for word.\n${lines.join('\n')}`;
  return brief.length <= MAX_BRIEF_CHARS ? brief : `${brief.slice(0, MAX_BRIEF_CHARS - 1)}…`;
}
