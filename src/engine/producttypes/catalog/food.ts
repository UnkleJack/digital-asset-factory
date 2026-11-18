import { logSheetType } from '../logsheets.ts';
import { formType } from '../forms.ts';

/** Food & Cooking: meal plans, recipe books, pantry and freezer logs, a conversion chart. */
export const FOOD = 'Food & Cooking';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const pantryInventory = logSheetType({
  id: 'pantry-inventory', name: 'Pantry inventory', category: FOOD,
  description: 'Pantry stock list with best-by dates and a restock column, plus a matching spreadsheet.',
  title: 'Pantry Inventory', heading: 'Pantry inventory',
  columns: [{ label: 'Item', width: 30 }, { label: 'Shelf', width: 14 }, { label: 'Qty', width: 9 }, { label: 'Best by', width: 14 }, { label: 'Opened', width: 13 }, { label: 'Restock', width: 12 }],
  pages: { default: 3, max: 20 },
  coverSubtitle: 'Know what you have before you shop',
  intro: 'List what is on each shelf, then tick Restock when something runs low so it goes on the next shopping list.',
  tips: ['Check best-by dates once a month and move older items to the front.', 'Keep one page per cupboard or shelf if that is easier.', 'Update the list after each big shop.'],
  keywords: ['pantry inventory', 'pantry list', 'kitchen inventory', 'food storage list', 'kitchen organization'],
  features: ['Best-by and opened dates so nothing goes to waste'],
  priceCents: 349, design: 'Warm Neutral', aiTopic: 'a list of what is in the pantry, with best-by dates and what needs restocking',
});

export const freezerInventory = logSheetType({
  id: 'freezer-inventory', name: 'Freezer and fridge inventory', category: FOOD,
  description: 'Log of what went into the freezer or fridge, when, and when to use it.',
  title: 'Freezer and Fridge Inventory', heading: 'Freezer and fridge',
  columns: [{ label: 'Item', width: 32 }, { label: 'Date in', width: 14 }, { label: 'Portions', width: 12 }, { label: 'Use by', width: 14 }, { label: 'Where', width: 14 }, { label: 'Used', width: 10 }],
  fields: ['Freezer or fridge'],
  pages: { default: 2, max: 20 },
  coverSubtitle: 'Use what you stored before it is forgotten',
  intro: 'Write each item in on the day it goes in, then tick Used when it comes out.',
  tips: ['Label containers with the same name you write here.', 'Keep the sheet on the freezer door.', 'Plan a meal from the oldest items each week.'],
  keywords: ['freezer inventory', 'fridge inventory', 'freezer log', 'meal prep printable', 'kitchen printable'],
  features: ['Date in and use-by columns'],
  priceCents: 299, design: 'Minimal Mono', aiTopic: 'a log of food stored in the freezer or fridge',
});

export const bakingLog = logSheetType({
  id: 'baking-log', name: 'Baking log', category: FOOD,
  description: 'Record of each bake: the recipe, what you changed and how it turned out.',
  title: 'Baking Log', heading: 'Baking log',
  columns: [{ label: 'Date', width: 12 }, { label: 'Recipe', width: 26 }, { label: 'What I changed', width: 28 }, { label: 'Result', width: 22 }, { label: 'Rating', width: 12 }],
  pages: { default: 4, max: 30 },
  coverSubtitle: 'Every bake, every tweak, every result',
  intro: 'Write a line for each bake so you remember what worked and what to try next time.',
  tips: ['Note oven temperature and baking time when you change them.', 'Rate each bake out of five.', 'Star the recipes worth repeating.'],
  keywords: ['baking log', 'baking journal', 'recipe log', 'baker gift', 'baking tracker'],
  features: ['A column for every change you made'],
  priceCents: 349, design: 'Soft Pastel', aiTopic: 'a log of home baking: what was baked, what was changed and how it turned out',
});

export const weeklyMealPlan = formType({
  id: 'weekly-meal-plan', name: 'Weekly meal plan', category: FOOD,
  description: 'A week of meals on one page with a shopping list underneath.',
  title: 'Weekly Meal Planner',
  pages: [{ heading: 'Meal plan', repeat: true, sections: [
    { kind: 'fields', fields: ['Week of'] },
    { kind: 'grid', rows: DAYS, columns: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'], firstWidth: 16 },
    { kind: 'checklist', title: 'Shopping list', items: ['Fruit', 'Vegetables', 'Bread', 'Milk'], blank: 6 },
  ] }],
  copies: { default: 4, max: 52 },
  coverSubtitle: 'Plan the week, shop once, eat well',
  intro: 'Fill in the meals for each day, then add what you need to the shopping list before you go.',
  keywords: ['meal planner', 'weekly meal plan', 'meal planning printable', 'grocery list', 'menu planner'],
  features: ['Breakfast, lunch, dinner and snacks for every day', 'Shopping list on the same page'],
  priceCents: 399, design: 'Botanical Sage', aiTopic: 'a weekly meal plan with a shopping list',
});

export const monthlyMealPlan = formType({
  id: 'monthly-meal-plan', name: 'Monthly meal plan', category: FOOD,
  description: 'Dinners for a whole month at a glance, with notes for batch cooking.',
  title: 'Monthly Meal Planner',
  pages: [{ heading: 'Monthly meals', repeat: true, sections: [
    { kind: 'fields', fields: ['Month'] },
    { kind: 'grid', rows: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'], columns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], firstWidth: 13 },
    { kind: 'lines', title: 'Batch cooking and leftovers' },
  ] }],
  copies: { default: 3, max: 12 },
  coverSubtitle: 'A month of dinners, planned in one sitting',
  intro: 'Write a dinner in each square, then use the notes for what to cook ahead or use up.',
  keywords: ['monthly meal planner', 'meal plan printable', 'dinner planner', 'menu planner', 'family meal plan'],
  features: ['Five weeks of dinners on one page', 'Room for batch cooking notes'],
  priceCents: 349, design: 'Botanical Sage', aiTopic: 'a monthly dinner plan',
});

export const mealPrepWorksheet = formType({
  id: 'meal-prep-worksheet', name: 'Meal prep worksheet', category: FOOD,
  description: 'Plan a prep session: what to cook, how much, and the steps in order.',
  title: 'Meal Prep Worksheet',
  pages: [{ heading: 'Meal prep', repeat: true, sections: [
    { kind: 'fields', fields: ['Prep day', 'Meals covered'], twoColumn: true },
    { kind: 'grid', rows: ['Main', 'Grains', 'Vegetables', 'Sauces', 'Snacks'], columns: ['Recipe', 'Batch size', 'Containers', 'Eat by'], firstWidth: 16 },
    { kind: 'checklist', title: 'Prep steps', items: ['Check the fridge and pantry', 'Shop for what is missing', 'Cook the longest item first', 'Cool, portion and label'], blank: 4 },
  ] }],
  copies: { default: 4, max: 52 },
  coverSubtitle: 'One prep session, a week of easy meals',
  intro: 'Choose what to cook, write the batch sizes, then follow the steps in order on prep day.',
  keywords: ['meal prep planner', 'meal prep printable', 'batch cooking planner', 'meal planning', 'food prep'],
  features: ['Batch sizes, containers and eat-by dates', 'Step list for prep day'],
  priceCents: 349, design: 'Minimal Mono', aiTopic: 'a meal prep worksheet for a batch cooking session',
});

export const groceryList = formType({
  id: 'grocery-list', name: 'Grocery list', category: FOOD,
  description: 'Shopping list sorted by section of the store, with blank lines to add to.',
  title: 'Grocery Shopping List',
  pages: [{ heading: 'Shopping list', repeat: true, sections: [
    { kind: 'fields', fields: ['Store', 'Date'], twoColumn: true },
    { kind: 'checklist', title: 'Fresh', items: ['Fruit', 'Vegetables', 'Bread', 'Milk', 'Eggs'], blank: 3 },
    { kind: 'checklist', title: 'Pantry and frozen', items: ['Rice or pasta', 'Canned goods', 'Frozen vegetables'], blank: 4 },
    { kind: 'checklist', title: 'Household', items: ['Dish soap', 'Paper towels'], blank: 3 },
  ] }],
  copies: { default: 4, max: 52 },
  coverSubtitle: 'Shop by section and forget nothing',
  intro: 'Tick what you need in each section, add anything else on the blank lines, and take it to the store.',
  keywords: ['grocery list', 'shopping list printable', 'grocery checklist', 'kitchen printable', 'meal planning'],
  features: ['Sorted by section of the store', 'Blank lines in every section'],
  priceCents: 249, design: 'Soft Pastel', aiTopic: 'a grocery shopping list sorted by section of the store',
});

export const recipeBook = formType({
  id: 'recipe-book', name: 'Recipe book', category: FOOD,
  description: 'Fill-in family recipe book: an index, section dividers and recipe pages.',
  title: 'Family Recipe Book',
  pages: [
    { heading: 'Recipe index', sections: [
      { kind: 'fields', fields: ['This book belongs to'] },
      { kind: 'grid', rows: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'], columns: ['Recipe', 'Section', 'Page'], firstWidth: 8 },
    ] },
    { heading: 'Sections', sections: [
      { kind: 'checklist', title: 'Sections in this book', items: ['Breakfast', 'Soups and salads', 'Mains', 'Sides', 'Baking', 'Desserts'], blank: 2 },
      { kind: 'lines', title: 'Notes' },
    ] },
    { heading: 'Recipe', repeat: true, sections: [
      { kind: 'fields', fields: ['Recipe', 'From', 'Serves', 'Time'], twoColumn: true },
      { kind: 'lines', title: 'Ingredients' },
      { kind: 'lines', title: 'Method' },
      { kind: 'prompts', prompts: ['How did it turn out, and what would you change?'], linesEach: 2 },
    ] },
  ],
  copies: { default: 20, max: 60 },
  coverSubtitle: 'The recipes worth keeping, all in one place',
  intro: 'Write one recipe per page, number the pages, and add each one to the index at the front.',
  keywords: ['recipe book', 'recipe journal', 'family cookbook', 'blank recipe book', 'recipe binder'],
  features: ['Recipe index and section page', 'Ingredients, method and notes on every recipe page'],
  priceCents: 599, design: 'Warm Neutral', aiTopic: 'a fill-in family recipe book',
});

export const kitchenConversions = formType({
  id: 'kitchen-conversions', name: 'Kitchen conversion chart', category: FOOD,
  description: 'Reference chart of common US kitchen measures in metric, worked out exactly and rounded.',
  title: 'Kitchen Conversion Chart',
  pages: [{ heading: 'Kitchen conversions', sections: [
    // US customary units; metric values rounded to one decimal place (1 US cup = 236.588 mL, 1 oz = 28.3495 g).
    { kind: 'grid', title: 'Volume', rows: ['1 teaspoon', '1 tablespoon', '1 fluid ounce', '1/4 cup', '1/2 cup', '1 cup', '1 pint', '1 quart'], columns: ['Also equals', 'Milliliters'], firstWidth: 30,
      cells: [['1/3 tablespoon', '4.9'], ['3 teaspoons', '14.8'], ['2 tablespoons', '29.6'], ['4 tablespoons', '59.1'], ['8 tablespoons', '118.3'], ['16 tablespoons', '236.6'], ['2 cups', '473.2'], ['4 cups', '946.4']] },
    { kind: 'grid', title: 'Weight', rows: ['1 ounce', '4 ounces', '8 ounces', '1 pound'], columns: ['Also equals', 'Grams'], firstWidth: 30,
      cells: [['1/16 pound', '28.3'], ['1/4 pound', '113.4'], ['1/2 pound', '226.8'], ['16 ounces', '453.6']] },
    { kind: 'grid', title: 'Oven', rows: ['300 °F', '325 °F', '350 °F', '375 °F', '400 °F', '425 °F'], columns: ['Celsius'], firstWidth: 30,
      cells: [['149 °C'], ['163 °C'], ['177 °C'], ['191 °C'], ['204 °C'], ['218 °C']] },
    { kind: 'lines', title: 'My own conversions' },
  ] }],
  coverSubtitle: 'Cups, spoons, ounces and oven heat at a glance',
  intro: 'US measures with their metric amounts, rounded to one decimal place. Pin it inside a cupboard door.',
  keywords: ['kitchen conversion chart', 'measurement conversion', 'cooking conversions', 'baking conversion chart', 'kitchen printable'],
  features: ['Volume, weight and oven temperatures', 'Worked out exactly from the unit definitions, then rounded'],
  priceCents: 249, design: 'Bold Modern', aiTopic: 'a kitchen conversion reference chart',
});

export const FOOD_TYPES = [pantryInventory, freezerInventory, bakingLog, weeklyMealPlan, monthlyMealPlan, mealPrepWorksheet, groceryList, recipeBook, kitchenConversions];
