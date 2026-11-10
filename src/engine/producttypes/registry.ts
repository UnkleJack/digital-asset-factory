import { z } from 'zod';
import { notFound } from '../../core/errors.ts';
import type { ProductTypeDefinition } from './types.ts';
import { monthlyCalendar, weeklyPlanner, dailyPlanner } from './dated.ts';
import { habitTracker, todoChecklist, cleaningSchedule, homeInventory, guidedJournal, goalPlanner } from './lists.ts';
import { budgetPlanner, invoiceTemplate } from './structured.ts';
import { mandalaColoring, mazeActivity, wordSearch, illustratedColoring } from './activity.ts';
import { bundleType } from './bundle.ts';
import { importedColoring } from './imported.ts';
import { geometricPatternArt } from './patterns.ts';
import { assignmentTracker, timetable, readingLog } from './students.ts';

const ALL: ProductTypeDefinition[] = [
  monthlyCalendar, weeklyPlanner, dailyPlanner, habitTracker, todoChecklist, cleaningSchedule, homeInventory,
  budgetPlanner, invoiceTemplate, guidedJournal, goalPlanner, mandalaColoring, mazeActivity, wordSearch, illustratedColoring, importedColoring, bundleType,
  geometricPatternArt, assignmentTracker, timetable, readingLog,
];

const BY_ID = new Map(ALL.map((t) => [t.id, t]));

export function productTypes(): ProductTypeDefinition[] {
  return ALL;
}

/** Types the app may pick on its own (ideas, schedules, suggestions): everything except bundles and import-only types. */
export function plannableTypes(): ProductTypeDefinition[] {
  return ALL.filter((t) => t.id !== 'bundle' && !t.importOnly);
}

export function productType(id: string): ProductTypeDefinition {
  const t = BY_ID.get(id);
  if (!t) throw notFound('Product type', id);
  return t;
}

export function hasProductType(id: string): boolean {
  return BY_ID.has(id);
}

export function describeType(t: ProductTypeDefinition) {
  return {
    id: t.id,
    name: t.name,
    family: t.family,
    category: t.category,
    description: t.description,
    aiContent: t.aiContent,
    artwork: t.artwork,
    variationAxes: t.variationAxes ?? [],
    importOnly: t.importOnly ?? false,
    defaultParams: t.id === 'bundle' ? { members: [] } : t.defaultParams(new Date()),
    paramFields: paramFields(t),
  };
}

/** Per-field UI hints (allowed values, numeric bounds) derived from the params schema. */
function paramFields(t: ProductTypeDefinition): Record<string, { options?: Array<string | number>; min?: number; max?: number }> {
  let props: Record<string, any> = {};
  try {
    props = (z.toJSONSchema(t.paramsSchema, { io: 'input', unrepresentable: 'any' }) as any).properties ?? {};
  } catch {
    return {};
  }
  const out: Record<string, { options?: Array<string | number>; min?: number; max?: number }> = {};
  for (const [k, p] of Object.entries(props)) {
    const options = p.enum ?? (Array.isArray(p.anyOf) && p.anyOf.every((x: any) => 'const' in x) ? p.anyOf.map((x: any) => x.const) : undefined);
    out[k] = { ...(options && { options }), ...(typeof p.minimum === 'number' && { min: p.minimum }), ...(typeof p.maximum === 'number' && { max: p.maximum }) };
  }
  return out;
}
