import type { z } from 'zod';
import type { AudienceProfile, DesignTokens, Paper } from '../templates/library.ts';
import type { SafeHtml } from '../rendering/html.ts';

export type Family = 'printable' | 'activity' | 'structured' | 'bundle';
export type ArtworkMode = 'none' | 'procedural' | 'ai-image';

export interface TypeContext<P> {
  title: string;
  params: P;
  paper: Paper;
  tokens: DesignTokens;
  audience: { name: string; profile: AudienceProfile } | null;
  theme: { name: string; keywords: string[] } | null;
  shopName: string;
  seed: number;
  revisionNotes: string;
}

export interface ArtworkItem {
  name: string;
  kind: 'svg' | 'png';
  data: Buffer | string;
  widthPx?: number;
  heightPx?: number;
  role: 'deliverable' | 'source';
  provenance: Record<string, unknown>;
}

export interface ExtraFile {
  fileName: string;
  kind: string;
  mime: string;
  data: Buffer | string;
  role: 'deliverable' | 'source';
}

export interface RenderPlan {
  pages: SafeHtml[];
  extraFiles?: ExtraFile[];
}

export interface ContentPrompt {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface QaFinding {
  code: string;
  severity: 'hard' | 'warning';
  passed: boolean;
  message: string;
  details?: unknown;
}

export interface ListingHints {
  keywords: string[];
  features: string[];
  included: string[];
  usage: string;
}

export type ImageGenerator = (prompt: string, opts: { size: 'portrait' | 'square' | 'landscape' }) => Promise<{ png: Buffer; widthPx: number; heightPx: number; provenance: Record<string, unknown> }>;

export interface ProductTypeDefinition<P = any, C = any> {
  id: string;
  name: string;
  family: Family;
  category: string;
  description: string;
  paramsSchema: z.ZodType<P>;
  contentSchema: z.ZodType<C>;
  defaultParams(now: Date): P;
  defaultTitle(ctx: Omit<TypeContext<P>, 'title'>): string;
  aiContent: boolean;
  artwork: ArtworkMode;
  contentPrompt?(ctx: TypeContext<P>): ContentPrompt;
  deterministicContent(ctx: TypeContext<P>, rand: () => number): C;
  generateArtwork?(ctx: TypeContext<P>, content: C, rand: () => number, imageGen: ImageGenerator | null): Promise<ArtworkItem[]>;
  render(ctx: TypeContext<P>, content: C, artwork: ArtworkItem[]): RenderPlan | Promise<RenderPlan>;
  expectedPageCount(ctx: TypeContext<P>, content: C): number;
  consistencyChecks?(ctx: TypeContext<P>, content: C, artwork: ArtworkItem[]): QaFinding[];
  qaText(content: C): string[];
  listingHints(ctx: TypeContext<P>, content: C): ListingHints;
  variationAxes?: string[];
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

export function shuffle<T>(rand: () => number, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function audienceLine(ctx: TypeContext<unknown>): string {
  if (!ctx.audience) return 'a general adult audience';
  return `${ctx.audience.name} (tone: ${ctx.audience.profile.tone}; reading level: ${ctx.audience.profile.readingLevel}; ${ctx.audience.profile.notes})`;
}

export function themeLine(ctx: TypeContext<unknown>): string {
  return ctx.theme ? `${ctx.theme.name} (${ctx.theme.keywords.join(', ')})` : 'no specific theme';
}

export const AI_SYSTEM_BASE = `You write content for printable digital products sold by an independent shop.
Rules:
- Write original text. Never copy song lyrics, book passages, or famous quotes, and never attribute text to real people.
- Never mention brands, trademarks, franchises, celebrities, or copyrighted characters.
- No placeholder text (no "lorem ipsum", "TBD", "[insert]", "XXX").
- Keep every item short enough to fit on a printed line. Use plain ASCII punctuation.
- Content must be safe and suitable for the stated audience.`;

export function revisionClause(ctx: TypeContext<unknown>): string {
  return ctx.revisionNotes ? `\nThe reviewer asked for these changes from the previous version; apply them:\n${ctx.revisionNotes}` : '';
}
