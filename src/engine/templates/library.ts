import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');

export const FONT_IDS = [
  // ── Readable body & UI ────────────────────────────────────────────────────
  'inter', 'lora', 'playfair-display', 'nunito', 'patrick-hand',
  'montserrat', 'poppins', 'merriweather', 'roboto-slab', 'quicksand',
  // ── Friendly / rounded ────────────────────────────────────────────────────
  'fredoka', 'comfortaa',
  // ── Handwritten & script ──────────────────────────────────────────────────
  'caveat', 'dancing-script', 'amatic-sc', 'pacifico', 'lobster',
  // ── Bold display — thick strokes, great for coloring-in titles ───────────
  'abril-fatface', 'titan-one', 'lilita-one', 'passion-one', 'concert-one',
  'ultra', 'alfa-slab-one', 'sigmar', 'calistoga',
  // ── Blocky / condensed / impact ───────────────────────────────────────────
  'bangers', 'russo-one', 'black-han-sans', 'righteous',
  // ── Hollow / inline / outline — letters designed to be colored in ─────────
  'bungee', 'bungee-outline', 'bungee-inline', 'bungee-shade',
  // ── Decorative & specialty ────────────────────────────────────────────────
  'cinzel', 'press-start-2p',
] as const;
export type FontId = (typeof FONT_IDS)[number];

/** Per-font metadata. `colorable` marks fonts whose strokes are thick or
 *  hollow enough that the letter bodies work as coloring-book fill areas. */
export const FONTS: Record<FontId, { family: string; weights: number[]; italic: boolean; license: string; fallback: string; category: string; colorable?: true }> = {
  // ── Readable body & UI ────────────────────────────────────────────────────
  inter: { family: 'Inter', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'body' },
  lora: { family: 'Lora', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'serif', category: 'body' },
  'playfair-display': { family: 'Playfair Display', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'serif', category: 'body' },
  nunito: { family: 'Nunito', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'body' },
  'patrick-hand': { family: 'Patrick Hand', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'body' },
  montserrat: { family: 'Montserrat', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'body' },
  poppins: { family: 'Poppins', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'body' },
  merriweather: { family: 'Merriweather', weights: [400, 600, 700], italic: true, license: 'SIL OFL 1.1', fallback: 'serif', category: 'body' },
  'roboto-slab': { family: 'Roboto Slab', weights: [400, 600, 700], italic: false, license: 'Apache 2.0', fallback: 'serif', category: 'body' },
  quicksand: { family: 'Quicksand', weights: [400, 600, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'body' },
  // ── Friendly / rounded ────────────────────────────────────────────────────
  fredoka: { family: 'Fredoka', weights: [400, 600, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'friendly' },
  comfortaa: { family: 'Comfortaa', weights: [400, 600, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'friendly' },
  // ── Handwritten & script ──────────────────────────────────────────────────
  caveat: { family: 'Caveat', weights: [400, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'handwritten' },
  'dancing-script': { family: 'Dancing Script', weights: [400, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'handwritten' },
  'amatic-sc': { family: 'Amatic SC', weights: [400, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'handwritten' },
  pacifico: { family: 'Pacifico', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'handwritten', colorable: true },
  lobster: { family: 'Lobster', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'cursive', category: 'handwritten', colorable: true },
  // ── Bold display — thick strokes, great for coloring-in titles ───────────
  'abril-fatface': { family: 'Abril Fatface', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'serif', category: 'display-bold', colorable: true },
  'titan-one': { family: 'Titan One', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  'lilita-one': { family: 'Lilita One', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  'passion-one': { family: 'Passion One', weights: [400, 700, 900], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  'concert-one': { family: 'Concert One', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  ultra: { family: 'Ultra', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'serif', category: 'display-bold', colorable: true },
  'alfa-slab-one': { family: 'Alfa Slab One', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'serif', category: 'display-bold', colorable: true },
  sigmar: { family: 'Sigmar', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  calistoga: { family: 'Calistoga', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'display-bold', colorable: true },
  // ── Blocky / condensed / impact ───────────────────────────────────────────
  bangers: { family: 'Bangers', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'blocky', colorable: true },
  'russo-one': { family: 'Russo One', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'blocky', colorable: true },
  'black-han-sans': { family: 'Black Han Sans', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'blocky', colorable: true },
  righteous: { family: 'Righteous', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'blocky', colorable: true },
  // ── Hollow / inline / outline — letters designed to be colored in ─────────
  bungee: { family: 'Bungee', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'hollow', colorable: true },
  'bungee-outline': { family: 'Bungee Outline', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'hollow', colorable: true },
  'bungee-inline': { family: 'Bungee Inline', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'hollow', colorable: true },
  'bungee-shade': { family: 'Bungee Shade', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'sans-serif', category: 'hollow', colorable: true },
  // ── Decorative & specialty ────────────────────────────────────────────────
  cinzel: { family: 'Cinzel', weights: [400, 600, 700], italic: false, license: 'SIL OFL 1.1', fallback: 'serif', category: 'decorative', colorable: true },
  'press-start-2p': { family: 'Press Start 2P', weights: [400], italic: false, license: 'SIL OFL 1.1', fallback: 'monospace', category: 'decorative', colorable: true },
};

/** Ready-made heading/body/accent combinations offered when creating a product.
 *  `colorable` marks pairings whose heading font is suited for letter coloring-in. */
export const FONT_PAIRINGS: { id: string; name: string; mood: string; colorable?: true; fonts: { heading: FontId; body: FontId; accent: FontId } }[] = [
  // ── Everyday readable ─────────────────────────────────────────────────────
  { id: 'clean-modern', name: 'Clean modern', mood: 'Neutral and very readable', fonts: { heading: 'montserrat', body: 'inter', accent: 'montserrat' } },
  { id: 'classic-serif', name: 'Classic serif', mood: 'Elegant, editorial', fonts: { heading: 'playfair-display', body: 'lora', accent: 'lora' } },
  { id: 'bookish', name: 'Bookish', mood: 'Calm, journal-like', fonts: { heading: 'merriweather', body: 'merriweather', accent: 'lora' } },
  { id: 'friendly-round', name: 'Friendly rounded', mood: 'Soft and approachable', fonts: { heading: 'quicksand', body: 'nunito', accent: 'quicksand' } },
  { id: 'geometric-bold', name: 'Geometric bold', mood: 'Confident business look', fonts: { heading: 'poppins', body: 'inter', accent: 'poppins' } },
  { id: 'farmhouse', name: 'Farmhouse slab', mood: 'Warm, sturdy headings', fonts: { heading: 'roboto-slab', body: 'lora', accent: 'caveat' } },
  { id: 'handwritten', name: 'Handwritten notes', mood: 'Casual, personal', fonts: { heading: 'caveat', body: 'nunito', accent: 'caveat' } },
  { id: 'script-romance', name: 'Romantic script', mood: 'Weddings, gifts, self-care', fonts: { heading: 'dancing-script', body: 'lora', accent: 'dancing-script' } },
  { id: 'kids-play', name: 'Kids playful', mood: 'Big, bubbly, fun', fonts: { heading: 'fredoka', body: 'nunito', accent: 'patrick-hand' } },
  { id: 'chalkboard', name: 'Chalkboard', mood: 'Tall, hand-lettered headings', fonts: { heading: 'amatic-sc', body: 'quicksand', accent: 'amatic-sc' } },
  { id: 'bubble-round', name: 'Bubble round', mood: 'Super-soft rounded, great for stickers', fonts: { heading: 'comfortaa', body: 'comfortaa', accent: 'pacifico' } },
  // ── Bold display — thick strokes for color-in titles ─────────────────────
  { id: 'fat-serif', name: 'Fat serif', mood: 'Chunky slab headings, easy to color in', colorable: true, fonts: { heading: 'abril-fatface', body: 'lora', accent: 'abril-fatface' } },
  { id: 'titan-body', name: 'Titan', mood: 'Massive rounded sans, fills a page', colorable: true, fonts: { heading: 'titan-one', body: 'nunito', accent: 'concert-one' } },
  { id: 'passion-bold', name: 'Passion bold', mood: 'Condensed bold impact poster look', colorable: true, fonts: { heading: 'passion-one', body: 'inter', accent: 'passion-one' } },
  { id: 'ultra-slab', name: 'Ultra slab', mood: 'Heavy serif with real presence', colorable: true, fonts: { heading: 'ultra', body: 'merriweather', accent: 'alfa-slab-one' } },
  { id: 'sigmar-accent', name: 'Sigmar accent', mood: 'Bold display + clean body, retro feel', colorable: true, fonts: { heading: 'sigmar', body: 'inter', accent: 'sigmar' } },
  { id: 'warm-calistoga', name: 'Warm display', mood: 'Wide, chunky, almost brush-like', colorable: true, fonts: { heading: 'calistoga', body: 'nunito', accent: 'lobster' } },
  // ── Blocky / impact ───────────────────────────────────────────────────────
  { id: 'comic-impact', name: 'Comic impact', mood: 'Comic-book style, wide letters', colorable: true, fonts: { heading: 'bangers', body: 'nunito', accent: 'concert-one' } },
  { id: 'bold-block', name: 'Bold block', mood: 'Solid, no-frills, high impact', colorable: true, fonts: { heading: 'black-han-sans', body: 'inter', accent: 'russo-one' } },
  { id: 'retro-block', name: 'Retro block', mood: 'Geometric 70s-style bold', colorable: true, fonts: { heading: 'righteous', body: 'poppins', accent: 'righteous' } },
  // ── Hollow / outline — letters are coloring frames ─────────────────────
  { id: 'bungee-fill', name: 'Bungee fill', mood: 'Solid condensed Bungee + readable body', colorable: true, fonts: { heading: 'bungee', body: 'inter', accent: 'bungee' } },
  { id: 'outline-letters', name: 'Outline letters', mood: 'Hollow outlined letters — color-in ready', colorable: true, fonts: { heading: 'bungee-outline', body: 'nunito', accent: 'bungee' } },
  { id: 'inline-pop', name: 'Inline pop', mood: 'Striped letter fill, art-deco vibe', colorable: true, fonts: { heading: 'bungee-inline', body: 'inter', accent: 'bungee-shade' } },
  // ── Decorative ────────────────────────────────────────────────────────────
  { id: 'roman-elegance', name: 'Roman elegance', mood: 'All-caps classical, regal coloring pages', colorable: true, fonts: { heading: 'cinzel', body: 'lora', accent: 'cinzel' } },
  { id: 'pixel-retro', name: 'Pixel retro', mood: 'Blocky pixel game letters, great for kids', colorable: true, fonts: { heading: 'press-start-2p', body: 'nunito', accent: 'press-start-2p' } },
];

export const DesignTokensSchema = z.object({
  palette: z.object({
    paper: hex, ink: hex, muted: hex, line: hex, primary: hex, accent: hex, soft: hex,
  }),
  fonts: z.object({ heading: z.enum(FONT_IDS), body: z.enum(FONT_IDS), accent: z.enum(FONT_IDS) }),
  baseSizePt: z.number().min(7).max(16),
  headingScale: z.number().min(1.2).max(3.5),
  lineWeightPt: z.number().min(0.25).max(2.5),
  radiusPt: z.number().min(0).max(12),
  ornament: z.enum(['none', 'dots', 'leaf', 'stars', 'waves', 'geometric']),
  density: z.enum(['airy', 'balanced', 'compact']),
  marginsMm: z.object({ top: z.number().min(5).max(30), right: z.number().min(5).max(30), bottom: z.number().min(5).max(30), left: z.number().min(5).max(30) }),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

const M = { top: 12, right: 12, bottom: 12, left: 12 };

export const BUILTIN_DESIGN_SYSTEMS: { name: string; description: string; tokens: DesignTokens }[] = [
  {
    name: 'Minimal Mono',
    description: 'Clean black-and-grey layout, ink-friendly, works for any audience.',
    tokens: { palette: { paper: '#ffffff', ink: '#1d1d1f', muted: '#6e6e73', line: '#c7c7cc', primary: '#1d1d1f', accent: '#8e8e93', soft: '#f2f2f4' }, fonts: { heading: 'inter', body: 'inter', accent: 'inter' }, baseSizePt: 10, headingScale: 2.2, lineWeightPt: 0.6, radiusPt: 3, ornament: 'none', density: 'balanced', marginsMm: M },
  },
  {
    name: 'Soft Pastel',
    description: 'Blush and lavender tones with a friendly rounded sans.',
    tokens: { palette: { paper: '#fffdfb', ink: '#3d3445', muted: '#8a7f93', line: '#e6d9e9', primary: '#b48ead', accent: '#f2b5c4', soft: '#f8eef5' }, fonts: { heading: 'playfair-display', body: 'nunito', accent: 'patrick-hand' }, baseSizePt: 10, headingScale: 2.4, lineWeightPt: 0.7, radiusPt: 8, ornament: 'dots', density: 'airy', marginsMm: M },
  },
  {
    name: 'Botanical Sage',
    description: 'Muted sage greens with serif headings and leaf accents.',
    tokens: { palette: { paper: '#fbfbf7', ink: '#2f3a32', muted: '#6f7d70', line: '#cfd8cc', primary: '#7d9b76', accent: '#c9a66b', soft: '#eef3ea' }, fonts: { heading: 'lora', body: 'inter', accent: 'lora' }, baseSizePt: 10, headingScale: 2.3, lineWeightPt: 0.6, radiusPt: 4, ornament: 'leaf', density: 'balanced', marginsMm: M },
  },
  {
    name: 'Bold Modern',
    description: 'High-contrast navy and coral for business and productivity products.',
    tokens: { palette: { paper: '#ffffff', ink: '#14213d', muted: '#5c677d', line: '#cdd3de', primary: '#14213d', accent: '#fc7a57', soft: '#eef1f6' }, fonts: { heading: 'inter', body: 'inter', accent: 'inter' }, baseSizePt: 10, headingScale: 2.6, lineWeightPt: 0.8, radiusPt: 2, ornament: 'geometric', density: 'compact', marginsMm: M },
  },
  {
    name: 'Kids Bright',
    description: 'Playful primary colors, large rounded type, generous spacing.',
    tokens: { palette: { paper: '#ffffff', ink: '#22223b', muted: '#5f5f7a', line: '#b8c0ff', primary: '#3a86ff', accent: '#ffbe0b', soft: '#eef4ff' }, fonts: { heading: 'patrick-hand', body: 'nunito', accent: 'patrick-hand' }, baseSizePt: 12, headingScale: 2.4, lineWeightPt: 1.2, radiusPt: 10, ornament: 'stars', density: 'airy', marginsMm: { top: 14, right: 14, bottom: 14, left: 14 } },
  },
  {
    name: 'Warm Neutral',
    description: 'Oat and terracotta farmhouse palette with classic serif headings.',
    tokens: { palette: { paper: '#fdfaf5', ink: '#3b2f2a', muted: '#857266', line: '#e3d6c8', primary: '#b5654a', accent: '#d9a46c', soft: '#f6efe6' }, fonts: { heading: 'playfair-display', body: 'lora', accent: 'lora' }, baseSizePt: 10, headingScale: 2.3, lineWeightPt: 0.6, radiusPt: 4, ornament: 'waves', density: 'balanced', marginsMm: M },
  },
  {
    name: 'Large Print High Contrast',
    description: 'Accessible large type, thick lines and strong contrast for low-vision users.',
    tokens: { palette: { paper: '#ffffff', ink: '#000000', muted: '#333333', line: '#555555', primary: '#000000', accent: '#0050a0', soft: '#f0f0f0' }, fonts: { heading: 'inter', body: 'inter', accent: 'inter' }, baseSizePt: 14, headingScale: 1.9, lineWeightPt: 1.4, radiusPt: 0, ornament: 'none', density: 'airy', marginsMm: { top: 14, right: 14, bottom: 14, left: 14 } },
  },
];

export const AudienceProfileSchema = z.object({
  tone: z.string(),
  readingLevel: z.enum(['early-reader', 'general', 'professional']),
  fontScale: z.number().min(0.8).max(1.6),
  density: z.enum(['airy', 'balanced', 'compact']),
  notes: z.string(),
});
export type AudienceProfile = z.infer<typeof AudienceProfileSchema>;

export const BUILTIN_AUDIENCES: { name: string; description: string; profile: AudienceProfile }[] = [
  { name: 'General adults', description: 'Broad adult audience', profile: { tone: 'warm, practical', readingLevel: 'general', fontScale: 1, density: 'balanced', notes: 'Clear and uncluttered.' } },
  { name: 'Students', description: 'High school and college students', profile: { tone: 'motivating, concise', readingLevel: 'general', fontScale: 1, density: 'compact', notes: 'Study schedules, deadlines, exams.' } },
  { name: 'Busy parents', description: 'Parents juggling family logistics', profile: { tone: 'reassuring, efficient', readingLevel: 'general', fontScale: 1, density: 'balanced', notes: 'Family routines, meals, school.' } },
  { name: 'Small business owners', description: 'Solo founders and makers', profile: { tone: 'professional, direct', readingLevel: 'professional', fontScale: 1, density: 'compact', notes: 'Clients, invoices, cash flow.' } },
  { name: 'Teachers', description: 'K-12 teachers', profile: { tone: 'encouraging, organized', readingLevel: 'professional', fontScale: 1, density: 'balanced', notes: 'Lesson planning, classroom activities.' } },
  { name: 'Kids 4-8', description: 'Young children with adult help', profile: { tone: 'playful, simple words', readingLevel: 'early-reader', fontScale: 1.3, density: 'airy', notes: 'Short words, big shapes, no small text.' } },
  { name: 'Seniors (large print)', description: 'Older adults who prefer large print', profile: { tone: 'respectful, calm', readingLevel: 'general', fontScale: 1.4, density: 'airy', notes: 'Large print, high contrast, fewer items per page.' } },
  { name: 'ADHD-friendly', description: 'People who benefit from low-friction structure', profile: { tone: 'kind, non-judgmental, brief', readingLevel: 'general', fontScale: 1.05, density: 'airy', notes: 'Few items per section, visual chunking, small wins.' } },
];

export const BUILTIN_THEMES: { name: string; description: string; keywords: string[]; seasonalMonths: number[] }[] = [
  { name: 'Minimalist', description: 'Timeless and plain', keywords: ['minimal', 'simple', 'clean'], seasonalMonths: [] },
  { name: 'Botanical', description: 'Leaves and gentle greens', keywords: ['botanical', 'plants', 'greenery'], seasonalMonths: [3, 4, 5] },
  { name: 'Celestial', description: 'Moon, stars and night sky', keywords: ['celestial', 'moon', 'stars'], seasonalMonths: [] },
  { name: 'Ocean', description: 'Waves and coastal blues', keywords: ['ocean', 'beach', 'coastal'], seasonalMonths: [6, 7, 8] },
  { name: 'Autumn Harvest', description: 'Warm autumn tones', keywords: ['autumn', 'fall', 'harvest'], seasonalMonths: [9, 10, 11] },
  { name: 'Winter Holidays', description: 'Cozy winter season', keywords: ['winter', 'holiday', 'cozy'], seasonalMonths: [11, 12] },
  { name: 'New Year Reset', description: 'Fresh starts and goal setting', keywords: ['new year', 'goals', 'fresh start'], seasonalMonths: [12, 1] },
  { name: 'Back to School', description: 'School year preparation', keywords: ['back to school', 'classroom', 'study'], seasonalMonths: [7, 8, 9] },
  { name: 'Farmhouse', description: 'Rustic and homey', keywords: ['farmhouse', 'rustic', 'home'], seasonalMonths: [] },
  { name: 'Space Adventure', description: 'Rockets and planets for kids', keywords: ['space', 'planets', 'rocket'], seasonalMonths: [] },
  { name: 'Dinosaurs', description: 'Dinosaur fun for kids', keywords: ['dinosaur', 'prehistoric', 'fossil'], seasonalMonths: [] },
  { name: 'Woodland Animals', description: 'Forest friends', keywords: ['woodland', 'animals', 'forest'], seasonalMonths: [9, 10] },
];

export const BUILTIN_CATEGORIES: { name: string; description: string }[] = [
  { name: 'Calendars & Planners', description: 'Dated calendars and planners' },
  { name: 'Productivity', description: 'To-do lists, habit trackers, goal sheets, time blocking' },
  { name: 'Home Organization', description: 'Cleaning, inventory and maintenance sheets' },
  { name: 'Finance & Business', description: 'Budgets, invoices and business forms' },
  { name: 'Journals & Worksheets', description: 'Guided journals, worksheets and trackers' },
  { name: 'Kids Activities', description: 'Mazes, word searches and educational printables' },
  { name: 'Coloring Pages', description: 'Coloring pages and line art' },
  { name: 'Bundles', description: 'Collections of related products' },
];

export const PAPER_SIZES_MM = {
  letter: [215.9, 279.4],
  a4: [210, 297],
  a5: [148, 210],
  'half-letter': [139.7, 215.9],
  legal: [215.9, 355.6],
} as const;
export type PaperSize = keyof typeof PAPER_SIZES_MM;

export const PaperSchema = z.object({
  size: z.enum(['letter', 'a4', 'a5', 'half-letter', 'legal']).default('letter'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  grayscale: z.boolean().default(false),
});
export type Paper = z.infer<typeof PaperSchema>;

export function paperDimsMm(p: Paper): { w: number; h: number } {
  const [a, b] = PAPER_SIZES_MM[p.size];
  return p.orientation === 'portrait' ? { w: a, h: b } : { w: b, h: a };
}

export const mmToPt = (mm: number) => (mm / 25.4) * 72;

export function toGray(hexColor: string): string {
  const n = parseInt(hexColor.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const h = y.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

export function applyAudienceAndPaper(tokens: DesignTokens, audience: AudienceProfile | null, paper: Paper): DesignTokens {
  const t: DesignTokens = structuredClone(tokens);
  if (audience) {
    t.baseSizePt = Math.min(16, Math.round(t.baseSizePt * audience.fontScale * 10) / 10);
    if (audience.density === 'airy' && t.density === 'compact') t.density = 'balanced';
  }
  const { w } = paperDimsMm(paper);
  if (w < 150) {
    t.baseSizePt = Math.max(7.5, Math.round(t.baseSizePt * 0.85 * 10) / 10);
    t.marginsMm = { top: Math.max(8, t.marginsMm.top - 3), right: Math.max(8, t.marginsMm.right - 3), bottom: Math.max(8, t.marginsMm.bottom - 3), left: Math.max(8, t.marginsMm.left - 3) };
  }
  if (paper.grayscale) {
    for (const k of Object.keys(t.palette) as (keyof DesignTokens['palette'])[]) t.palette[k] = toGray(t.palette[k]);
  }
  return t;
}
