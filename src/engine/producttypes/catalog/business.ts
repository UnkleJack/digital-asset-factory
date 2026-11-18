import { logSheetType } from '../logsheets.ts';
import { formType } from '../forms.ts';

/** Small business and money: orders, stock, sales, expenses, clients, pricing and planning. Finance & Business category. */
export const BUSINESS = 'Finance & Business';

export const orderTracker = logSheetType({
  id: 'order-tracker', name: 'Order tracker', category: BUSINESS,
  description: 'Customer order log: what was ordered, paid and sent, with a matching spreadsheet.',
  title: 'Order Tracker', heading: 'Orders',
  columns: [{ label: 'Date', width: 11 }, { label: 'Customer', width: 20 }, { label: 'Item', width: 24 }, { label: 'Qty', width: 8 }, { label: 'Total', width: 12 }, { label: 'Paid', width: 9 }, { label: 'Sent', width: 9 }],
  pages: { default: 6, max: 40 },
  coverSubtitle: 'Every order from first message to delivery',
  intro: 'Add each order as it comes in, then tick Paid and Sent so nothing slips through.',
  tips: ['Give each order a number and write it on the package too.', 'Check the unticked rows at the end of each day.', 'Copy the totals into your sales log each week.'],
  keywords: ['order tracker', 'order form', 'small business planner', 'order log', 'shop organization'],
  features: ['Paid and sent columns at a glance'],
  priceCents: 349, design: 'Bold Modern', aiTopic: 'an order log for a small shop or maker business',
});

export const inventoryTracker = logSheetType({
  id: 'inventory-tracker', name: 'Stock inventory tracker', category: BUSINESS,
  description: 'Product stock list with reorder points and suppliers for a small business.',
  title: 'Business Inventory Tracker', heading: 'Stock',
  columns: [{ label: 'Item', width: 26 }, { label: 'Code', width: 11 }, { label: 'In stock', width: 11 }, { label: 'Reorder at', width: 12 }, { label: 'Supplier', width: 20 }, { label: 'Unit cost', width: 12 }],
  fields: ['Counted on'],
  pages: { default: 4, max: 40 },
  coverSubtitle: 'Know what to reorder before it runs out',
  intro: 'Count your stock, write it in, and reorder anything at or below its reorder number.',
  tips: ['Count at the same time each week or month.', 'Set the reorder number to what sells while you wait for new stock.', 'Keep supplier details on the same line as the item.'],
  keywords: ['inventory tracker', 'stock tracker', 'small business inventory', 'inventory sheet', 'business planner'],
  features: ['Reorder point and supplier for every item'],
  priceCents: 399, design: 'Bold Modern', aiTopic: 'a stock inventory sheet for a small business',
});

export const salesLog = logSheetType({
  id: 'sales-log', name: 'Sales log', category: BUSINESS,
  description: 'Daily sales record by item and where it sold, with a matching spreadsheet.',
  title: 'Sales Log', heading: 'Sales',
  columns: [{ label: 'Date', width: 11 }, { label: 'Item', width: 27 }, { label: 'Qty', width: 8 }, { label: 'Price', width: 11 }, { label: 'Total', width: 12 }, { label: 'Sold through', width: 18 }],
  fields: ['Month'],
  pages: { default: 6, max: 40 },
  coverSubtitle: 'See what sells, where and when',
  intro: 'Write each sale on its own line; at the end of the month add up the totals.',
  tips: ['Use the same item names every time so totals are easy to add up.', 'Note where each sale came from: shop, market or online.', 'Compare months to see what sells best.'],
  keywords: ['sales log', 'sales tracker', 'small business tracker', 'bookkeeping printable', 'business planner'],
  features: ['Where each sale came from'],
  priceCents: 349, design: 'Bold Modern', aiTopic: 'a sales log for a small business',
});

export const expenseLog = logSheetType({
  id: 'expense-log', name: 'Expense tracker', category: BUSINESS,
  description: 'Every expense with its category, payment method and a receipt tick, plus a spreadsheet.',
  title: 'Expense Tracker', heading: 'Expenses',
  columns: [{ label: 'Date', width: 11 }, { label: 'Paid to', width: 22 }, { label: 'Category', width: 17 }, { label: 'Amount', width: 13 }, { label: 'Paid by', width: 13 }, { label: 'Receipt', width: 11 }],
  fields: ['Month'],
  pages: { default: 6, max: 40 },
  coverSubtitle: 'Every expense written down, every receipt kept',
  intro: 'Write each expense on the day you pay it and tick Receipt once it is filed.',
  tips: ['Use a short, fixed list of categories so totals add up easily.', 'File receipts in the same order as this log.', 'Add up each category at the end of the month.'],
  keywords: ['expense tracker', 'expense log', 'spending tracker', 'bookkeeping printable', 'budget printable'],
  features: ['Receipt column so every expense is backed up'],
  priceCents: 349, design: 'Minimal Mono', aiTopic: 'an expense log for a household or small business',
});

export const customerFollowUp = logSheetType({
  id: 'customer-follow-up', name: 'Customer follow-up log', category: BUSINESS,
  description: 'Who to contact, why, and the next step, so no customer is forgotten.',
  title: 'Customer Follow-Up Log', heading: 'Follow-ups',
  columns: [{ label: 'Date', width: 11 }, { label: 'Customer', width: 20 }, { label: 'Contact', width: 18 }, { label: 'Reason', width: 21 }, { label: 'Next step', width: 20 }, { label: 'Done', width: 9 }],
  pages: { default: 4, max: 30 },
  coverSubtitle: 'Keep every conversation moving',
  intro: 'Note each customer you need to get back to and the next step, then tick Done.',
  tips: ['Write the next step as an action: call, send quote, check in.', 'Look at this page at the start of each day.', 'Move anything not done to a new line with a new date.'],
  keywords: ['customer follow up', 'client tracker', 'small business planner', 'sales follow up', 'client log'],
  features: ['Next step column for every customer'],
  priceCents: 299, design: 'Minimal Mono', aiTopic: 'a log of customers to follow up with',
});

export const contentCalendar = logSheetType({
  id: 'content-calendar', name: 'Content calendar', category: BUSINESS,
  description: 'Plan social posts and other content by date, channel, topic and status.',
  title: 'Content Calendar', heading: 'Content plan',
  columns: [{ label: 'Date', width: 11 }, { label: 'Channel', width: 15 }, { label: 'Topic', width: 30 }, { label: 'Format', width: 14 }, { label: 'Status', width: 14 }, { label: 'Posted', width: 10 }],
  fields: ['Month', 'Focus this month'],
  pages: { default: 3, max: 24 },
  coverSubtitle: 'Plan what to post before the week starts',
  intro: 'Plan each post a week or more ahead, update its status as you make it, and tick Posted when it is live.',
  tips: ['Batch similar posts together on one day.', 'Reuse a good post in a new format.', 'Keep a few ideas in reserve for quiet weeks.'],
  keywords: ['content calendar', 'social media planner', 'content planner', 'marketing planner', 'small business planner'],
  features: ['Channel, format and status for every post'],
  priceCents: 349, design: 'Soft Pastel', aiTopic: 'a content calendar for social media and marketing posts',
});

export const serviceMenu = logSheetType({
  id: 'service-menu', name: 'Service menu', category: BUSINESS,
  description: 'Fill-in price list of services with what each one includes and how long it takes.',
  title: 'Service Menu and Price List', heading: 'Services',
  columns: [{ label: 'Service', width: 26 }, { label: 'What is included', width: 40 }, { label: 'Time', width: 14 }, { label: 'Price', width: 14 }],
  fields: ['Business name', 'Valid from'],
  pages: { default: 1, max: 6 },
  coverSubtitle: 'Your services and prices, clearly laid out',
  intro: 'List each service with what the customer gets, how long it takes and what it costs.',
  tips: ['Order services from most to least popular.', 'Say exactly what is included so there are no surprises.', 'Review prices once a year.'],
  keywords: ['service menu', 'price list template', 'small business pricing', 'salon price list', 'service price list'],
  features: ['What is included for every service'],
  priceCents: 299, design: 'Botanical Sage', aiTopic: 'a price list of services for a small service business',
});

export const clientIntakeForm = formType({
  id: 'client-intake-form', name: 'Client intake form', category: BUSINESS,
  description: 'New-client form: contact details, what they need and how they found you.',
  title: 'Client Intake Form',
  pages: [{ heading: 'New client', repeat: true, sections: [
    { kind: 'fields', title: 'Contact details', fields: ['Name', 'Business', 'Email', 'Phone', 'Address', 'Best way to reach you'], twoColumn: true },
    { kind: 'prompts', prompts: ['What would you like help with?', 'What would a great result look like for you?', 'Are there any dates or deadlines to know about?'], linesEach: 3 },
    { kind: 'checklist', title: 'How did you hear about us?', items: ['Search', 'Social media', 'A friend or client', 'An event'], blank: 1 },
  ] }],
  copies: { default: 10, max: 60 },
  coverSubtitle: 'Start every client relationship with the right questions',
  intro: 'Give one form to each new client, or fill it in together on your first call.',
  keywords: ['client intake form', 'new client form', 'client questionnaire', 'small business forms', 'client onboarding'],
  features: ['Contact details, goals and deadlines on one page', 'How the client found you'],
  priceCents: 399, design: 'Minimal Mono', aiTopic: 'a new-client intake form for a service business',
});

export const appointmentPlanner = formType({
  id: 'appointment-planner', name: 'Appointment planner', category: BUSINESS,
  description: 'Daily appointment sheet by the hour, with client, service and notes.',
  title: 'Appointment Planner',
  pages: [{ heading: 'Appointments', repeat: true, sections: [
    { kind: 'fields', fields: ['Date'] },
    { kind: 'grid', rows: ['8:00', '9:00', '10:00', '11:00', '12:00', '1:00', '2:00', '3:00', '4:00', '5:00', '6:00'], columns: ['Client', 'Service', 'Phone', 'Notes'], firstWidth: 11 },
    { kind: 'lines', title: 'Reminders' },
  ] }],
  copies: { default: 7, max: 60 },
  coverSubtitle: 'Every booking for the day on one page',
  intro: 'Write each booking at its time, with the client, the service and a contact number.',
  keywords: ['appointment planner', 'appointment book', 'booking sheet', 'salon planner', 'small business planner'],
  features: ['Hour-by-hour from 8:00 to 6:00', 'Client, service and phone for each booking'],
  priceCents: 349, design: 'Soft Pastel', aiTopic: 'a daily appointment sheet for a service business',
});

export const projectTracker = formType({
  id: 'project-tracker', name: 'Project tracker', category: BUSINESS,
  description: 'One page per project: the client, dates, the task list and notes.',
  title: 'Project Tracker',
  pages: [{ heading: 'Project', repeat: true, sections: [
    { kind: 'fields', fields: ['Project', 'Client', 'Start', 'Due', 'Budget', 'Status'], twoColumn: true },
    { kind: 'checklist', title: 'Tasks', items: ['Agree the brief', 'First draft', 'Review with the client', 'Final changes', 'Deliver and invoice'], blank: 5 },
    { kind: 'lines', title: 'Notes' },
  ] }],
  copies: { default: 10, max: 60 },
  coverSubtitle: 'Every project from brief to invoice',
  intro: 'Start a page for each project, tick the tasks as you go and keep notes underneath.',
  keywords: ['project tracker', 'project planner', 'client project planner', 'freelance planner', 'task tracker'],
  features: ['Dates, budget and status at the top', 'Task list with room for your own steps'],
  priceCents: 349, design: 'Bold Modern', aiTopic: 'a project tracking page for freelance or small business work',
});

export const businessPlan = formType({
  id: 'business-plan', name: 'One-page business plan', category: BUSINESS,
  description: 'Six questions that turn an idea into a plan, with a page of goals for the first year.',
  title: 'One-Page Business Plan',
  pages: [
    { heading: 'Business plan', sections: [
      { kind: 'fields', fields: ['Business name'] },
      { kind: 'prompts', prompts: ['What do you sell?', 'Who buys it, and why?', 'What makes yours different?', 'How will people find you?', 'What will it cost to run each month?', 'What does a good first year look like?'], linesEach: 3 },
    ] },
    { heading: 'First-year goals', sections: [
      { kind: 'grid', rows: ['3 months', '6 months', '9 months', '12 months'], columns: ['Goal', 'How I will know', 'Done'], firstWidth: 16 },
      { kind: 'checklist', title: 'Next steps this week', items: ['Write the plan down', 'Talk to three possible customers', 'Work out the monthly costs'], blank: 4 },
    ] },
  ],
  coverSubtitle: 'From idea to plan on two pages',
  intro: 'Answer each question in a few lines, then set goals for each quarter of your first year.',
  keywords: ['business plan template', 'one page business plan', 'small business planner', 'startup planner', 'side hustle planner'],
  features: ['Six plain questions instead of a long template', 'Goals for each quarter of the first year'],
  priceCents: 449, design: 'Botanical Sage', aiTopic: 'a one-page business plan for a new small business',
});

export const pricingWorksheet = formType({
  id: 'pricing-worksheet', name: 'Pricing worksheet', category: BUSINESS,
  description: 'Work out a product price from your costs, your time and the profit you want.',
  title: 'Product Pricing Worksheet',
  pages: [{ heading: 'Pricing', repeat: true, sections: [
    { kind: 'fields', fields: ['Product', 'Date'], twoColumn: true },
    { kind: 'grid', rows: ['Materials', 'Packaging', 'Fees per sale', 'Your time (hours x rate)', 'Share of running costs', 'Total cost', 'Profit you want', 'Price'], columns: ['Amount', 'Notes'], firstWidth: 38 },
    { kind: 'prompts', prompts: ['What do similar products sell for?', 'Is this price one you would pay?'], linesEach: 2 },
  ] }],
  copies: { default: 6, max: 40 },
  coverSubtitle: 'Price with your real costs in front of you',
  intro: 'Fill in each cost, add them up, add the profit you want, and compare the result with similar products.',
  keywords: ['pricing worksheet', 'pricing calculator printable', 'small business pricing', 'handmade pricing', 'product pricing'],
  features: ['Costs, time and profit in one table', 'A check against similar products'],
  priceCents: 349, design: 'Minimal Mono', aiTopic: 'a worksheet for working out a product price from costs',
});

export const businessChecklist = formType({
  id: 'business-checklist', name: 'Small business checklist', category: BUSINESS,
  description: 'Getting set up, monthly and yearly checklists for running a small business.',
  title: 'Small Business Checklist',
  pages: [{ heading: 'Business checklist', sections: [
    { kind: 'checklist', title: 'Getting set up', items: ['Choose a business name', 'Register the business where required', 'Open a separate bank account', 'Set up simple bookkeeping', 'Make a shop or website page'], blank: 2 },
    { kind: 'checklist', title: 'Every month', items: ['Match the bank account to your records', 'Chase unpaid invoices', 'Look over prices and stock', 'Back up your files'], blank: 2 },
    { kind: 'checklist', title: 'Every year', items: ['Review the year: what sold and what did not', 'Check renewals and subscriptions', 'Set goals for next year'], blank: 2 },
  ] }],
  coverSubtitle: 'The routine jobs that keep a small business running',
  intro: 'Work through the setup list once, then come back to the monthly and yearly lists.',
  keywords: ['small business checklist', 'business planner', 'startup checklist', 'side hustle checklist', 'business organization'],
  features: ['Setup, monthly and yearly lists', 'Blank lines for your own jobs'],
  priceCents: 249, design: 'Bold Modern', aiTopic: 'a checklist for setting up and running a small business',
});

export const BUSINESS_TYPES = [orderTracker, inventoryTracker, salesLog, expenseLog, customerFollowUp, contentCalendar, serviceMenu, clientIntakeForm, appointmentPlanner, projectTracker, businessPlan, pricingWorksheet, businessChecklist];
