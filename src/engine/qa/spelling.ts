import { readFileSync, existsSync } from 'node:fs';

const DICT_PATH = '/usr/share/dict/words';

const MODERN = `email emails online website websites app apps wifi smartphone smartphones checklist checklists declutter decluttering decluttered
printable printables planner planners todo meal prep juneteenth selfcare self podcast podcasts laptop laptops internet subscription subscriptions
screen screens microchip microchipped onesie onesies dishwasher dishwashers microwave microwaves smoothie smoothies skincare workout workouts
login logins password passwords app's ok okay journaling journal's vs etc spreadsheet spreadsheets pdf pdfs csv xlsx zip svg png usa us
mindfulness wellbeing overthinking reset resets goal's habit's week's month's year's day's today's tomorrow's yesterday's self-care
recharge recharges reorganize reorganized prioritize prioritized prioritizing reschedule rescheduled timeblock timeblocking timeboxing
budgeting budgeted rollover sinking groceries grocery takeout carpool carpooling homeschool homeschooling preschool kindergarten
toddler toddlers babysitter daycare playdate playdates bedtime bedtimes screentime downtime pickup dropoff lunchbox backpack backpacks
dinosaur dinosaurs triceratops stegosaurus pterosaur jurassic astronaut astronauts spaceship spaceships hedgehog hedgehogs octopus jellyfish
starfish seahorse seahorses blizzard igloo snowman snowflake snowflakes mittens hayride bonfire cider pumpkins pinecone pinecones sunflower
succulent succulents monstera trellis treehouse lighthouse teapot bouquet wildflowers greenery boho farmhouse minimalist celestial
etsy gumroad invoice invoices invoicing receipt receipts subtotal subtotals freelancer freelancers solopreneur startup startups
mandala mandalas maze mazes download downloads downloadable downloaded editable fillable customizable reusable worksheet worksheets
ipad tablet tablets goodnotes notability homeschoolers classroom classrooms unisex giftable keepsake adhd box boxes proud checkpoint checkpoints childcare doormat doormats flashcard flashcards
google nightstand nightstands workspace workspaces unzip unzipped`;

let dict: Set<string> | null = null;

export function dictionaryAvailable(): boolean {
  return existsSync(DICT_PATH);
}

function load(): Set<string> {
  if (dict) return dict;
  const words = existsSync(DICT_PATH) ? readFileSync(DICT_PATH, 'utf8').split('\n') : [];
  dict = new Set(words.map((w) => w.trim().toLowerCase()).filter(Boolean));
  for (const w of MODERN.split(/\s+/)) dict.add(w.toLowerCase());
  return dict;
}

const SUFFIXES: [string, string][] = [['ies', 'y'], ['ied', 'y'], ['ier', 'y'], ['iest', 'y'], ['ily', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e'], ['ly', ''], ['er', ''], ['er', 'e'], ['est', ''], ['est', 'e'], ['ness', ''], ['ful', ''], ['able', ''], ['ize', ''], ['ized', ''], ['izing', ''], ["'s", ''], ["s'", '']];

export function isKnown(word: string, allow: Set<string>): boolean {
  const d = load();
  const w = word.toLowerCase().replace(/[’]/g, "'");
  if (d.has(w) || allow.has(w)) return true;
  for (const [suf, rep] of SUFFIXES) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      const base = w.slice(0, -suf.length) + rep;
      if (d.has(base) || allow.has(base)) return true;
      if (suf === 'ing' || suf === 'ed') {
        const undoubled = base.slice(0, -1);
        if (base.length > 3 && base.at(-1) === base.at(-2) && d.has(undoubled)) return true;
      }
    }
  }
  return false;
}

export function unknownWords(texts: string[], allowlist: string[]): string[] {
  if (!dictionaryAvailable()) return [];
  const allow = new Set(allowlist.map((a) => a.toLowerCase()));
  const out = new Set<string>();
  for (const t of texts) {
    for (const raw of t.split(/[^A-Za-z'’-]+/)) {
      for (const part of raw.split('-')) {
        const w = part.replace(/^'+|'+$/g, '');
        if (w.length < 3 || /^[A-Z]{2,}$/.test(w) && w.length <= 4) continue;
        if (!isKnown(w, allow)) out.add(w.toLowerCase());
      }
    }
  }
  return [...out].sort();
}
