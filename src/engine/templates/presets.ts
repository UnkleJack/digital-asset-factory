import type { Paper } from './library.ts';

/*
 * One-click starting points for the New product form. A preset only fills in the form's boxes
 * (kind, audience, theme, design, paper, the kind's own settings and the brief); the person can
 * change anything before pressing Create. Names refer to the built-in audiences, themes and design
 * systems and are matched by name, so a preset whose name was deleted simply leaves that box empty.
 * Years, dates and titles are left to each kind's own defaults so presets never go stale.
 */
export interface ProductPreset {
  id: string;
  name: string;
  group: 'Students' | 'Teachers' | 'Home and family' | 'Work' | 'Everyone';
  productType: string;
  audience?: string;
  theme?: string;
  designSystem?: string;
  paper?: Partial<Paper>;
  params?: Record<string, unknown>;
  /** Wording instructions for the AI (the form's brief box). */
  brief?: string;
}

const NO_MEDICAL = 'Keep every suggestion practical and countable. No medical, diet or weight-loss claims.';

export const PRESETS: ProductPreset[] = [
  { id: 'student-habit', name: 'Student habit tracker', group: 'Students', productType: 'habit-tracker', audience: 'Students', theme: 'Back to School', designSystem: 'Soft Pastel',
    params: { months: 12, rows: 12 }, brief: `Habits a student can do in a day: study blocks, sleep, water, screen breaks. ${NO_MEDICAL}` },
  { id: 'student-goals', name: 'Student goal planner', group: 'Students', productType: 'goal-planner', audience: 'Students', designSystem: 'Soft Pastel',
    params: { goals: 4 }, brief: 'Phrase prompts for school and university goals: grades, projects, exams, applications.' },
  { id: 'student-checklist', name: 'Back-to-school checklist', group: 'Students', productType: 'todo-checklist', audience: 'Students', theme: 'Back to School', designSystem: 'Bold Modern',
    params: { topic: 'back to school', blankRowsPerSection: 2 }, brief: 'Sections: supplies, forms and deadlines, timetable setup, first-week tasks.' },
  { id: 'student-budget', name: 'Student budget planner', group: 'Students', productType: 'budget-planner', audience: 'Students', designSystem: 'Minimal Mono',
    params: { months: 12 }, brief: 'Categories for student life: rent or housing, books, transport, food, subscriptions, saving. No investment or tax advice.' },
  { id: 'student-assignments', name: 'Student assignment tracker (page per subject)', group: 'Students', productType: 'assignment-tracker', audience: 'Students', theme: 'Back to School', designSystem: 'Soft Pastel',
    params: { layout: 'per-subject', showGrade: true }, brief: 'Tips about planning homework ahead and handing work in on time. Keep them short and encouraging.' },
  { id: 'student-timetable', name: 'Class timetable (Mon-Fri, 6 periods)', group: 'Students', productType: 'timetable', audience: 'Students', designSystem: 'Bold Modern',
    params: { days: 5, weekStart: 1, periods: 6, startTime: '08:30', periodMinutes: 50, breakMinutes: 10, lunchAfter: 3, lunchMinutes: 40 } },
  { id: 'student-timetable-ab', name: 'Two-week (A/B) class timetable', group: 'Students', productType: 'timetable', audience: 'Students', designSystem: 'Minimal Mono',
    params: { weeks: 'ab', periods: 5, periodMinutes: 60, lunchAfter: 3 } },
  { id: 'student-reading-log', name: 'Student reading log', group: 'Students', productType: 'reading-log', audience: 'Students', designSystem: 'Warm Neutral',
    params: { books: 40, goal: 24, minutesMonths: 3, reviewPages: 6 }, brief: 'A reading challenge that mixes fiction and nonfiction. Never name real books, authors or series.' },
  { id: 'kids-reading-log', name: 'Kids reading log', group: 'Students', productType: 'reading-log', audience: 'Kids 4-8', designSystem: 'Kids Bright',
    params: { books: 20, minutesMonths: 2, reviewPages: 4 }, brief: 'Simple words for young readers and the grown-up reading with them.' },
  { id: 'adhd-habit', name: 'ADHD-friendly habit tracker', group: 'Everyone', productType: 'habit-tracker', audience: 'ADHD-friendly', designSystem: 'Warm Neutral',
    params: { months: 12, rows: 8 }, brief: `Few, very small habits, worded kindly, with no streak pressure or guilt. ${NO_MEDICAL}` },
  { id: 'teacher-weekly', name: 'Teacher weekly planner', group: 'Teachers', productType: 'weekly-planner', audience: 'Teachers', designSystem: 'Botanical Sage',
    params: { weeks: 40, weekStart: 1 }, brief: 'Weekly focus lines for a school year: planning, marking, parent contact, rest. Keep them short and encouraging.' },
  { id: 'teacher-goals', name: 'Teacher goal planner', group: 'Teachers', productType: 'goal-planner', audience: 'Teachers', designSystem: 'Botanical Sage',
    params: { goals: 3 }, brief: 'Goals about teaching practice, classroom routines and professional growth.' },
  { id: 'parent-weekly', name: 'Busy parent weekly planner', group: 'Home and family', productType: 'weekly-planner', audience: 'Busy parents', designSystem: 'Warm Neutral',
    params: { weeks: 52, weekStart: 0 }, brief: 'Weekly focus lines about family routines, meals, school runs and a little time for yourself.' },
  { id: 'family-calendar', name: 'Family monthly calendar (Sunday start)', group: 'Home and family', productType: 'monthly-calendar', audience: 'Busy parents', designSystem: 'Soft Pastel',
    params: { months: 12, weekStart: 0, holidays: 'us-federal', notesPanel: true }, brief: 'Month intentions about family time, seasons and small celebrations.' },
  { id: 'monday-calendar', name: 'Monthly calendar (Monday start)', group: 'Everyone', productType: 'monthly-calendar', audience: 'General adults', theme: 'Minimalist', designSystem: 'Minimal Mono',
    params: { months: 12, weekStart: 1, holidays: 'none', notesPanel: true } },
  { id: 'large-print-calendar', name: 'Large-print monthly calendar', group: 'Everyone', productType: 'monthly-calendar', audience: 'Seniors (large print)', designSystem: 'Large Print High Contrast',
    params: { months: 12, weekStart: 0, holidays: 'us-federal', notesPanel: false }, brief: 'Month intentions in plain, calm language. No jargon.' },
  { id: 'business-goals', name: 'Small business goal planner', group: 'Work', productType: 'goal-planner', audience: 'Small business owners', designSystem: 'Bold Modern',
    params: { goals: 4 }, brief: 'Goals about clients, revenue, products and time. No financial, legal or tax advice.' },
  { id: 'geometric-coloring', name: 'Geometric coloring book', group: 'Everyone', productType: 'geometric-pattern-art', audience: 'General adults', designSystem: 'Minimal Mono',
    params: { pages: 12, family: 'tessellate', mode: 'coloring', density: 'medium' } },
  { id: 'geometric-wall-art', name: 'Geometric wall art prints', group: 'Home and family', productType: 'geometric-pattern-art', audience: 'General adults', designSystem: 'Bold Modern',
    params: { pages: 4, family: 'girih', mode: 'print', density: 'medium', cover: false } },
  { id: 'undated-daily', name: 'Undated daily planner page', group: 'Everyone', productType: 'daily-planner', audience: 'General adults', designSystem: 'Minimal Mono',
    params: { dated: false, days: 1, priorities: 3 } },
];
