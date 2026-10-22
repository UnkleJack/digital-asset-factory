export const CONTENT_LIBRARY_REVISION = 'deterministic-library@1';

export const HABITS: Record<string, string[]> = {
  general: [
    'Drink 8 glasses of water', 'Read for 20 minutes', 'Walk 7,000 steps', 'Stretch for 10 minutes', 'No phone for the first hour',
    'Write three lines in a journal', 'Make the bed', 'Meditate for 5 minutes', 'Eat a vegetable with lunch', 'Lights out by 11 pm',
    'Note one thing I am grateful for', 'Tidy for 10 minutes', 'Take vitamins', 'Plan tomorrow tonight', 'Step outside for fresh air',
    'Cook a meal at home', 'Go to bed without screens', 'Move for 30 minutes', 'Check in with a friend', 'Spend 15 minutes on a hobby',
  ],
  students: [
    'Review class notes', 'Study for 45 focused minutes', 'Review flashcards', 'Check the assignment list', 'Pack the bag the night before',
    'Read one chapter', 'Drink water between classes', 'Sleep 8 hours', 'Exercise for 20 minutes', 'Limit social media to 30 minutes',
    'Practice a language for 15 minutes', 'Tidy the desk', 'Write tomorrow\'s top three tasks',
  ],
  parents: [
    'Prep tomorrow\'s lunches', 'Ten-minute family tidy', 'Read a bedtime story', 'Plan the week\'s meals', 'Check the family calendar',
    'Take 15 minutes for myself', 'One load of laundry', 'Screen-free dinner', 'Go outside with the kids', 'Drink water before coffee',
    'Lights out by 10:30 pm', 'Say one encouraging thing to each child',
  ],
  business: [
    'Send five outreach messages', 'Post on one social channel', 'Log receipts and expenses', 'Follow up with open leads', 'Check cash balance',
    'Block one hour of deep work', 'Answer customer messages', 'Update the task board', 'Learn something for 20 minutes', 'Review the weekly goal',
    'Back up important files', 'Stop work at a set time',
  ],
  kids: [
    'Brush teeth in the morning', 'Brush teeth at night', 'Make my bed', 'Read a book', 'Put toys away', 'Feed the pet',
    'Pack my school bag', 'Help set the table', 'Drink water', 'Say please and thank you', 'Get dressed by myself', 'Play outside',
  ],
};

export function habitKey(audienceName: string | undefined): keyof typeof HABITS {
  const a = (audienceName ?? '').toLowerCase();
  if (a.includes('student')) return 'students';
  if (a.includes('parent')) return 'parents';
  if (a.includes('business')) return 'business';
  if (a.includes('kid')) return 'kids';
  return 'general';
}

export const CHECKLISTS: Record<string, { section: string; items: string[] }[]> = {
  'moving house': [
    { section: 'Eight weeks before', items: ['Set a moving budget', 'Get three moving quotes', 'Start decluttering room by room', 'Collect boxes and tape', 'Make an inventory of valuables'] },
    { section: 'Four weeks before', items: ['Book the moving company', 'Notify landlord or agent', 'Change address with the bank', 'Arrange school records transfer', 'Schedule utility shut-off and start'] },
    { section: 'One week before', items: ['Pack an essentials box', 'Defrost the freezer', 'Confirm moving day timing', 'Label every box by room', 'Photograph meter readings'] },
    { section: 'Moving day', items: ['Do a final walk-through', 'Hand over keys', 'Check the new place for damage', 'Unpack the essentials box', 'Make the beds first'] },
  ],
  'travel packing': [
    { section: 'Documents', items: ['Passport or ID', 'Tickets and bookings', 'Travel insurance details', 'Copies of important documents', 'Payment cards and some cash'] },
    { section: 'Clothing', items: ['Tops for each day', 'Bottoms', 'Underwear and socks', 'Sleepwear', 'Light jacket', 'Comfortable shoes'] },
    { section: 'Toiletries', items: ['Toothbrush and toothpaste', 'Deodorant', 'Sunscreen', 'Medication', 'Hair care'] },
    { section: 'Tech and extras', items: ['Phone charger', 'Power adapter', 'Headphones', 'Reusable water bottle', 'Snacks for the journey'] },
  ],
  'new baby': [
    { section: 'Nursery', items: ['Crib and firm mattress', 'Fitted sheets', 'Changing area', 'Diaper bin', 'Night light'] },
    { section: 'Feeding', items: ['Bottles and brush', 'Burp cloths', 'Bibs', 'Nursing pillow', 'Storage bags'] },
    { section: 'Clothing', items: ['Bodysuits in two sizes', 'Sleep sacks', 'Socks and hats', 'Going-home outfit'] },
    { section: 'Hospital bag', items: ['Car seat installed', 'Comfortable clothes', 'Toiletries', 'Phone charger', 'Snacks and water'] },
  ],
  'holiday preparation': [
    { section: 'Plan', items: ['Set a gift budget', 'Write the guest list', 'Choose the menu', 'Plan decorations', 'Pick cards to send'] },
    { section: 'Shop', items: ['Buy gifts early', 'Order cards', 'Stock wrapping supplies', 'Buy pantry staples', 'Order specialty ingredients'] },
    { section: 'Prepare', items: ['Clean guest areas', 'Wrap gifts', 'Bake ahead and freeze', 'Set the table the night before', 'Plan a relaxing evening'] },
  ],
  'spring cleaning': [
    { section: 'Whole house', items: ['Wash windows inside and out', 'Dust ceiling fans and lights', 'Wipe baseboards', 'Wash curtains', 'Declutter one drawer per room'] },
    { section: 'Kitchen', items: ['Clean the oven', 'Empty and wipe the fridge', 'Descale the kettle', 'Organize the pantry', 'Clean behind appliances'] },
    { section: 'Bedrooms', items: ['Flip or rotate mattresses', 'Wash pillows and duvets', 'Sort clothes to donate', 'Vacuum under beds'] },
    { section: 'Outdoors', items: ['Sweep the porch', 'Clean outdoor furniture', 'Check gutters', 'Plant something new'] },
  ],
  'back to school': [
    { section: 'Supplies', items: ['Backpack', 'Notebooks and folders', 'Pens and pencils', 'Calculator', 'Lunch box and bottle'] },
    { section: 'Paperwork', items: ['Complete enrollment forms', 'Update emergency contacts', 'Book health check', 'Note term dates on the calendar'] },
    { section: 'Routine', items: ['Reset bedtime a week early', 'Plan breakfasts', 'Set up a homework spot', 'Practice the route to school'] },
  ],
  'new puppy': [
    { section: 'Essentials', items: ['Crate and bedding', 'Food and water bowls', 'Puppy food', 'Collar, tag and lead', 'Chew toys'] },
    { section: 'Health', items: ['Book a vet visit', 'Plan vaccinations', 'Register microchip details', 'Choose pet insurance'] },
    { section: 'Training', items: ['Set a toilet routine', 'Practice sit and stay', 'Puppy-proof the house', 'Plan short daily walks'] },
  ],
};

export const CLEANING: { room: string; tasks: { task: string; freq: 'Daily' | 'Weekly' | 'Monthly' | 'Seasonal' }[] }[] = [
  { room: 'Kitchen', tasks: [{ task: 'Wipe counters and stove', freq: 'Daily' }, { task: 'Run and empty the dishwasher', freq: 'Daily' }, { task: 'Mop the floor', freq: 'Weekly' }, { task: 'Clean the microwave', freq: 'Weekly' }, { task: 'Wipe cabinet fronts', freq: 'Monthly' }, { task: 'Deep clean the oven', freq: 'Seasonal' }] },
  { room: 'Bathroom', tasks: [{ task: 'Wipe sink and mirror', freq: 'Daily' }, { task: 'Clean the toilet', freq: 'Weekly' }, { task: 'Scrub shower and tub', freq: 'Weekly' }, { task: 'Wash bath mats', freq: 'Weekly' }, { task: 'Clean grout', freq: 'Monthly' }, { task: 'Replace shower curtain liner', freq: 'Seasonal' }] },
  { room: 'Living room', tasks: [{ task: 'Tidy surfaces', freq: 'Daily' }, { task: 'Vacuum floors and rugs', freq: 'Weekly' }, { task: 'Dust shelves', freq: 'Weekly' }, { task: 'Vacuum sofa cushions', freq: 'Monthly' }, { task: 'Wash throw blankets', freq: 'Monthly' }, { task: 'Shampoo the rug', freq: 'Seasonal' }] },
  { room: 'Bedroom', tasks: [{ task: 'Make the bed', freq: 'Daily' }, { task: 'Change the bed linen', freq: 'Weekly' }, { task: 'Dust nightstands', freq: 'Weekly' }, { task: 'Vacuum under the bed', freq: 'Monthly' }, { task: 'Wash pillows', freq: 'Seasonal' }, { task: 'Rotate the mattress', freq: 'Seasonal' }] },
  { room: 'Entryway', tasks: [{ task: 'Put shoes away', freq: 'Daily' }, { task: 'Sweep the floor', freq: 'Weekly' }, { task: 'Wipe door handles', freq: 'Weekly' }, { task: 'Clean the doormat', freq: 'Monthly' }, { task: 'Sort coats by season', freq: 'Seasonal' }] },
  { room: 'Laundry', tasks: [{ task: 'Start one load', freq: 'Daily' }, { task: 'Fold and put away', freq: 'Weekly' }, { task: 'Clean the lint trap', freq: 'Weekly' }, { task: 'Clean the washer seal', freq: 'Monthly' }, { task: 'Run a machine cleaning cycle', freq: 'Monthly' }] },
];

export const INVENTORY_ROOMS = ['Living room', 'Kitchen', 'Primary bedroom', 'Second bedroom', 'Bathroom', 'Home office', 'Garage', 'Storage'];
export const INVENTORY_COLUMNS = ['Item', 'Room', 'Brand / model', 'Serial no.', 'Purchased', 'Price', 'Warranty', 'Notes'];

export const BUDGET_CATEGORIES: Record<string, { income: string[]; fixed: string[]; variable: string[]; savings: string[] }> = {
  general: { income: ['Salary', 'Side income', 'Other income'], fixed: ['Rent or mortgage', 'Utilities', 'Phone and internet', 'Insurance', 'Transport', 'Subscriptions'], variable: ['Groceries', 'Dining out', 'Fuel', 'Personal care', 'Entertainment', 'Gifts', 'Household'], savings: ['Emergency fund', 'Retirement', 'Sinking funds', 'Debt payments'] },
  students: { income: ['Part-time job', 'Allowance', 'Grants or loans'], fixed: ['Rent', 'Phone', 'Transport pass', 'Tuition installment', 'Subscriptions'], variable: ['Groceries', 'Books and supplies', 'Eating out', 'Social', 'Clothing'], savings: ['Emergency fund', 'Travel fund', 'Loan repayment'] },
  parents: { income: ['Salary 1', 'Salary 2', 'Child benefit', 'Other income'], fixed: ['Mortgage or rent', 'Childcare', 'Utilities', 'Insurance', 'Car payment', 'School fees'], variable: ['Groceries', 'Kids activities', 'Fuel', 'Clothing', 'Household', 'Family outings'], savings: ['Emergency fund', 'Education fund', 'Holiday fund', 'Debt payments'] },
  business: { income: ['Product sales', 'Services', 'Other revenue'], fixed: ['Software', 'Hosting', 'Workspace', 'Insurance', 'Accounting'], variable: ['Materials', 'Shipping', 'Marketing', 'Platform fees', 'Equipment'], savings: ['Tax reserve', 'Owner pay', 'Reinvestment'] },
};

export const JOURNAL_PROMPTS: Record<string, string[]> = {
  gratitude: [
    'What small moment made today better than expected?', 'Who helped you recently, and how could you thank them?', 'Describe a place where you feel completely at ease.',
    'What is something you own that makes daily life easier?', 'Which skill are you glad you learned?', 'What made you laugh this week?',
    'Write about a meal you enjoyed and why.', 'What is one thing your body did for you today?', 'Which season do you appreciate most, and why?',
    'What challenge are you grateful for in hindsight?',
  ],
  reflection: [
    'What did you learn about yourself this week?', 'When did you feel most like yourself recently?', 'What is one habit you want to keep, and one to let go?',
    'Which decision are you proud of this month?', 'What would you tell yourself from one year ago?', 'Where did you spend most of your energy today?',
    'What are you avoiding, and what is the smallest first step?', 'Describe a recent disagreement from the other person\'s view.',
    'What does a good day look like for you right now?', 'What are you ready to stop worrying about?',
  ],
  goals: [
    'What would make the next twelve months feel meaningful?', 'Which goal excites you, and which one only sounds impressive?', 'What is one thing you can finish this week?',
    'What support do you need to reach your next milestone?', 'How will you celebrate progress, not just results?', 'Which obstacle keeps returning, and why?',
    'What would you attempt if you could not fail?', 'What does success look like in one sentence?', 'Which daily action moves you closest to your goal?',
    'What can you simplify to make room for what matters?',
  ],
  selfcare: [
    'What helps you recharge when you feel drained?', 'Write a kind note to yourself for a hard day.', 'Which boundary would protect your energy this week?',
    'List five things that calm you down quickly.', 'What does rest look like for you, really?', 'When did you last do something just for fun?',
    'What is one comforting routine you can start tonight?', 'Which thoughts deserve less of your attention?', 'How do you want to feel at the end of this week?',
    'What can you forgive yourself for today?',
  ],
  creativity: [
    'Describe your perfect afternoon in vivid detail.', 'Invent a holiday and explain how people celebrate it.', 'Write about an ordinary object as if it were magical.',
    'What would you create if materials were free?', 'Describe a sound you love without naming it.', 'Write a letter to a future version of your home.',
    'Draw a map of a place from your childhood and label it.', 'What color matches your mood today, and why?', 'Tell the story of your day as a short adventure.',
    'Combine two hobbies into one new activity.',
  ],
};

export const GOAL_SECTIONS = [
  { key: 'why', label: 'Why this goal matters', prompt: 'Who benefits and how will life change when it is done?' },
  { key: 'measure', label: 'How I will measure it', prompt: 'A number, a date, or a clear finish line.' },
  { key: 'milestones', label: 'Milestones', prompt: 'Break the goal into three to five checkpoints.' },
  { key: 'obstacles', label: 'Obstacles and plans', prompt: 'If this gets in the way, then I will...' },
  { key: 'actions', label: 'Weekly actions', prompt: 'Small, repeatable steps I can schedule.' },
  { key: 'reward', label: 'My reward', prompt: 'How I will celebrate reaching it.' },
];

export const DAILY_FOCUS_PROMPTS = [
  'What is the one task that would make today a success?', 'Which task can I finish before lunch?', 'Who can I help today?',
  'What can I say no to today?', 'Where can I add ten minutes of rest?', 'What would make tomorrow easier?', 'What am I looking forward to today?',
  'Which small win can I celebrate today?', 'What can I do today that my future self will thank me for?', 'What is enough for today?',
];

export const WEEKLY_FOCUS_PROMPTS = [
  'Focus on progress, not perfection.', 'Pick one priority and protect time for it.', 'Plan rest as carefully as work.', 'Finish one thing you started.',
  'Reach out to someone you miss.', 'Tidy one area that bothers you.', 'Try one new routine this week.', 'Move a little every day.',
  'Batch the small tasks.', 'Leave space for the unexpected.', 'Review your goals on Sunday.', 'Say yes to what energizes you.',
];

export const WORD_LISTS: Record<string, string[]> = {
  ocean: ['WHALE', 'CORAL', 'SHARK', 'OCTOPUS', 'DOLPHIN', 'TURTLE', 'SEAWEED', 'CRAB', 'STARFISH', 'JELLYFISH', 'WAVE', 'TIDE', 'SHELL', 'REEF', 'SQUID', 'LOBSTER'],
  space: ['PLANET', 'ROCKET', 'COMET', 'GALAXY', 'ORBIT', 'MOON', 'STAR', 'METEOR', 'SATURN', 'MARS', 'NEBULA', 'ASTRONAUT', 'GRAVITY', 'TELESCOPE', 'ECLIPSE', 'SPACESHIP'],
  dinosaurs: ['FOSSIL', 'RAPTOR', 'JURASSIC', 'TRICERATOPS', 'STEGOSAURUS', 'EGG', 'CLAW', 'TAIL', 'HERBIVORE', 'CARNIVORE', 'SKELETON', 'VOLCANO', 'SWAMP', 'PREHISTORIC', 'EXTINCT', 'ROAR'],
  autumn: ['PUMPKIN', 'HARVEST', 'ACORN', 'SCARECROW', 'LEAVES', 'APPLE', 'SWEATER', 'CIDER', 'ORCHARD', 'MAPLE', 'SQUASH', 'BONFIRE', 'CHESTNUT', 'HAYRIDE', 'CRISP', 'GOLDEN'],
  winter: ['SNOWFLAKE', 'MITTENS', 'SCARF', 'SLED', 'ICICLE', 'FROST', 'COCOA', 'BLANKET', 'SNOWMAN', 'FIREPLACE', 'SKATES', 'PENGUIN', 'BLIZZARD', 'IGLOO', 'COZY', 'PINECONE'],
  spring: ['BLOSSOM', 'TULIP', 'RAINBOW', 'PUDDLE', 'BUTTERFLY', 'GARDEN', 'SEEDLING', 'LAMB', 'DAISY', 'UMBRELLA', 'NEST', 'BLOOM', 'SPROUT', 'BREEZE', 'MEADOW', 'ROBIN'],
  animals: ['ELEPHANT', 'GIRAFFE', 'MONKEY', 'ZEBRA', 'PANDA', 'TIGER', 'KANGAROO', 'RABBIT', 'OTTER', 'HEDGEHOG', 'FOX', 'OWL', 'BEAVER', 'DEER', 'BADGER', 'SQUIRREL'],
  kitchen: ['SPATULA', 'WHISK', 'OVEN', 'KETTLE', 'LADLE', 'COLANDER', 'SKILLET', 'BLENDER', 'TOASTER', 'APRON', 'RECIPE', 'MUFFIN', 'BUTTER', 'FLOUR', 'PANTRY', 'TEAPOT'],
  sports: ['SOCCER', 'TENNIS', 'HOCKEY', 'CRICKET', 'RUGBY', 'SWIMMING', 'CYCLING', 'ARCHERY', 'ROWING', 'KARATE', 'GOLF', 'SKIING', 'RELAY', 'TROPHY', 'REFEREE', 'STADIUM'],
  weather: ['THUNDER', 'LIGHTNING', 'DRIZZLE', 'HAIL', 'FOG', 'SUNSHINE', 'TORNADO', 'CLOUD', 'RAINBOW', 'BREEZE', 'MONSOON', 'FORECAST', 'HUMIDITY', 'SLEET', 'DEWDROP', 'CYCLONE'],
};

export function wordListKey(themeName: string | undefined, topic: string | undefined): string {
  const t = `${themeName ?? ''} ${topic ?? ''}`.toLowerCase();
  for (const k of Object.keys(WORD_LISTS)) if (t.includes(k)) return k;
  if (t.includes('dinosaur')) return 'dinosaurs';
  if (t.includes('woodland') || t.includes('animal')) return 'animals';
  if (t.includes('fall') || t.includes('harvest')) return 'autumn';
  if (t.includes('holiday') || t.includes('christmas')) return 'winter';
  if (t.includes('botanical')) return 'spring';
  return 'animals';
}

export const COLORING_SUBJECTS: Record<string, string[]> = {
  woodland: ['a fox curled up beside a mushroom', 'an owl on a mossy branch', 'a hedgehog among autumn leaves', 'a deer in a forest clearing', 'a rabbit by a hollow log', 'a squirrel holding an acorn'],
  ocean: ['a sea turtle swimming over coral', 'a smiling octopus with curly arms', 'a whale breaching from a wave', 'a seahorse among seaweed', 'a crab on a sandy beach', 'a school of fish around a reef'],
  space: ['a rocket launching past the moon', 'an astronaut floating with a star', 'a ringed planet with small moons', 'a friendly alien waving', 'a space station orbiting earth', 'a comet streaking past stars'],
  dinosaurs: ['a long-necked dinosaur eating leaves', 'a baby dinosaur hatching from an egg', 'a triceratops in tall ferns', 'a stegosaurus beside a volcano', 'a flying pterosaur over cliffs', 'a dinosaur skeleton in a museum'],
  botanical: ['a bouquet of wildflowers', 'a monstera leaf pattern', 'a potted succulent arrangement', 'a sunflower in full bloom', 'a fern frond close-up', 'a climbing rose on a trellis'],
  general: ['a cozy reading nook with a cat', 'a hot air balloon over hills', 'a lighthouse on rocky shore', 'a teapot with cups and flowers', 'a treehouse in a big oak', 'a bicycle with a flower basket'],
};

export function coloringKey(themeName: string | undefined): string {
  const t = (themeName ?? '').toLowerCase();
  if (t.includes('woodland') || t.includes('autumn')) return 'woodland';
  if (t.includes('ocean')) return 'ocean';
  if (t.includes('space') || t.includes('celestial')) return 'space';
  if (t.includes('dinosaur')) return 'dinosaurs';
  if (t.includes('botanical') || t.includes('spring')) return 'botanical';
  return 'general';
}

export const US_FEDERAL_HOLIDAYS = (year: number): Record<string, string> => {
  const nth = (month0: number, weekday: number, n: number) => {
    const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  };
  const last = (month0: number, weekday: number) => {
    const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
    return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
  };
  const k = (m0: number, d: number) => `${m0}-${d}`;
  return {
    [k(0, 1)]: "New Year's Day",
    [k(0, nth(0, 1, 3))]: 'Martin Luther King Jr. Day',
    [k(1, nth(1, 1, 3))]: "Washington's Birthday",
    [k(4, last(4, 1))]: 'Memorial Day',
    [k(5, 19)]: 'Juneteenth',
    [k(6, 4)]: 'Independence Day',
    [k(8, nth(8, 1, 1))]: 'Labor Day',
    [k(9, nth(9, 1, 2))]: 'Columbus Day',
    [k(10, 11)]: 'Veterans Day',
    [k(10, nth(10, 4, 4))]: 'Thanksgiving',
    [k(11, 25)]: 'Christmas Day',
  };
};
