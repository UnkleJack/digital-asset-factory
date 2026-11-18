import { logSheetType } from '../logsheets.ts';
import { formType } from '../forms.ts';

/**
 * Health & Fitness: workout, running, water and sleep logs, a weekly fitness plan, a wellness journal and a daily
 * routine. The words stay practical and countable: no medical, diet or weight-loss claims.
 */
export const HEALTH = 'Health & Fitness';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const workoutLog = logSheetType({
  id: 'workout-log', name: 'Workout log', category: HEALTH,
  description: 'Strength and gym log: exercise, sets, reps and weight for every session.',
  title: 'Workout Log', heading: 'Workouts',
  columns: [{ label: 'Date', width: 11 }, { label: 'Exercise', width: 27 }, { label: 'Sets', width: 9 }, { label: 'Reps', width: 9 }, { label: 'Weight', width: 11 }, { label: 'Notes', width: 25 }],
  pages: { default: 8, max: 60 },
  coverSubtitle: 'Write it down, see the progress',
  intro: 'Write a line for each exercise in a session, with the sets, reps and weight you used.',
  tips: ['Use the same exercise names every time so you can compare sessions.', 'Note how the last set felt.', 'Look back a month to see what has changed.'],
  keywords: ['workout log', 'gym log', 'fitness tracker', 'exercise log', 'strength training log'],
  features: ['Sets, reps and weight for every exercise'],
  priceCents: 349, design: 'Bold Modern', aiTopic: 'a strength training workout log',
});

export const runningLog = logSheetType({
  id: 'running-log', name: 'Running and walking log', category: HEALTH,
  description: 'Runs and walks by date, route, distance and time.',
  title: 'Running and Walking Log', heading: 'Runs and walks',
  columns: [{ label: 'Date', width: 11 }, { label: 'Route', width: 25 }, { label: 'Distance', width: 12 }, { label: 'Time', width: 11 }, { label: 'Pace', width: 11 }, { label: 'How it felt', width: 26 }],
  fields: ['Goal'],
  pages: { default: 6, max: 52 },
  coverSubtitle: 'Every run and walk in one place',
  intro: 'Log each run or walk with the route, the distance and the time it took.',
  tips: ['Write the distance in the same unit every time.', 'Pace is time divided by distance.', 'Add up the distance at the end of each week.'],
  keywords: ['running log', 'running journal', 'walking tracker', 'mileage log', 'fitness tracker'],
  features: ['Distance, time and pace columns'],
  priceCents: 299, design: 'Minimal Mono', aiTopic: 'a running and walking log',
});

export const waterTracker = logSheetType({
  id: 'water-tracker', name: 'Water tracker', category: HEALTH,
  description: 'A week per page: shade or count glasses in the morning, midday, afternoon and evening.',
  title: 'Water Intake Tracker', heading: 'Water',
  columns: [{ label: 'Day', width: 18 }, { label: 'Morning', width: 15 }, { label: 'Midday', width: 15 }, { label: 'Afternoon', width: 16 }, { label: 'Evening', width: 15 }, { label: 'Total', width: 13 }],
  rowLabels: DAYS,
  fields: ['Week of', 'Daily goal'],
  pages: { default: 4, max: 52 },
  coverSubtitle: 'A simple way to keep count each day',
  intro: 'Write how many glasses you drink in each part of the day, then add up the total.',
  tips: ['Set a daily goal that suits you.', 'Keep a glass or bottle where you can see it.', 'Fill in each part of the day as you go.'],
  keywords: ['water tracker', 'water intake tracker', 'hydration tracker', 'habit tracker', 'wellness printable'],
  features: ['A week on each page, by part of the day'],
  priceCents: 249, design: 'Soft Pastel', aiTopic: 'a daily water intake tracker',
});

export const sleepLog = logSheetType({
  id: 'sleep-log', name: 'Sleep log', category: HEALTH,
  description: 'Bedtime, wake time, hours and how you felt, night by night.',
  title: 'Sleep Log', heading: 'Sleep',
  columns: [{ label: 'Date', width: 11 }, { label: 'Bedtime', width: 13 }, { label: 'Woke up', width: 13 }, { label: 'Hours', width: 10 }, { label: 'How I felt', width: 22 }, { label: 'Notes', width: 31 }],
  pages: { default: 4, max: 52 },
  coverSubtitle: 'Notice your own sleep patterns',
  intro: 'Fill in a line each morning: when you went to bed, when you woke and how you felt.',
  tips: ['Fill it in as soon as you wake up.', 'Note anything that was different the day before.', 'Look for patterns over a few weeks.'],
  keywords: ['sleep log', 'sleep tracker', 'sleep journal', 'wellness tracker', 'self care printable'],
  features: ['Bedtime, wake time and hours slept'],
  priceCents: 249, design: 'Soft Pastel', aiTopic: 'a nightly sleep log; no medical claims',
});

export const fitnessPlanner = formType({
  id: 'fitness-planner', name: 'Weekly fitness planner', category: HEALTH,
  description: 'Plan the week of workouts, tick them off, and look back at the end of the week.',
  title: 'Weekly Fitness Planner',
  pages: [{ heading: 'Fitness week', repeat: true, sections: [
    { kind: 'fields', fields: ['Week of', 'Goal for the week'], twoColumn: true },
    { kind: 'grid', rows: DAYS, columns: ['Workout', 'Time', 'Done'], firstWidth: 16 },
    { kind: 'prompts', prompts: ['What went well this week?', 'What will I change next week?'], linesEach: 2 },
  ] }],
  copies: { default: 4, max: 52 },
  coverSubtitle: 'Plan your workouts, then show up for them',
  intro: 'Plan each day on Sunday, tick Done as you go, and answer the two questions at the end of the week.',
  keywords: ['fitness planner', 'workout planner', 'weekly workout plan', 'exercise planner', 'fitness journal'],
  features: ['A week of workouts on one page', 'End-of-week review'],
  priceCents: 349, design: 'Bold Modern', aiTopic: 'a weekly workout planner; no medical claims',
});

export const wellnessJournal = formType({
  id: 'wellness-journal', name: 'Wellness journal', category: HEALTH,
  description: 'A page a day: how you feel, one good thing, one small kindness to yourself, and a short checklist.',
  title: 'Daily Wellness Journal',
  pages: [{ heading: 'Today', repeat: true, sections: [
    { kind: 'fields', fields: ['Date'] },
    { kind: 'prompts', prompts: ['How am I feeling today?', 'One good thing about today', 'One small thing I will do for myself'], linesEach: 3 },
    { kind: 'checklist', title: 'Today I', items: ['Drank water', 'Moved my body', 'Spent time outside', 'Rested'], blank: 1 },
  ] }],
  copies: { default: 30, max: 60 },
  coverSubtitle: 'A few quiet minutes each day',
  intro: 'Fill in one page a day; it only takes a few minutes and there are no wrong answers.',
  keywords: ['wellness journal', 'self care journal', 'daily journal', 'mindfulness journal', 'gratitude journal'],
  features: ['Three short prompts and a checklist each day'],
  priceCents: 449, design: 'Botanical Sage', aiTopic: 'a daily wellness journal; no medical or mental-health claims',
});

export const dailyRoutine = formType({
  id: 'daily-routine', name: 'Daily routine planner', category: HEALTH,
  description: 'Morning and evening routine checklists with room to add your own steps.',
  title: 'Daily Routine Planner',
  pages: [{ heading: 'My routine', repeat: true, sections: [
    { kind: 'fields', fields: ['Date'] },
    { kind: 'checklist', title: 'Morning', items: ['Make the bed', 'Drink a glass of water', 'Get ready for the day', 'Check today\'s plan'], blank: 3 },
    { kind: 'checklist', title: 'Evening', items: ['Tidy up for ten minutes', 'Set out tomorrow\'s things', 'Put screens away', 'Read or wind down'], blank: 3 },
  ] }],
  copies: { default: 14, max: 60 },
  coverSubtitle: 'Simple routines, ticked off one day at a time',
  intro: 'Use the steps given or write your own, then tick each one off morning and evening.',
  keywords: ['daily routine', 'routine planner', 'morning routine', 'evening routine', 'habit planner'],
  features: ['Morning and evening checklists', 'Blank lines for your own steps'],
  priceCents: 299, design: 'Soft Pastel', aiTopic: 'a daily morning and evening routine checklist',
});

export const HEALTH_TYPES = [workoutLog, runningLog, waterTracker, sleepLog, fitnessPlanner, wellnessJournal, dailyRoutine];
