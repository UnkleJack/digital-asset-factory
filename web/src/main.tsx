import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/press-start-2p/400.css';
import './styles.css';
import { ToastProvider } from './ui.tsx';
import { useApi } from './api.ts';
import { Dashboard } from './pages/Dashboard.tsx';
import { CalendarPage } from './pages/Calendar.tsx';
import { Library } from './pages/Library.tsx';
import { ProductDetail } from './pages/ProductDetail.tsx';
import { Research } from './pages/Research.tsx';
import { Digest } from './pages/Digest.tsx';
import { Templates } from './pages/Templates.tsx';
import { Jobs } from './pages/Jobs.tsx';
import { QaPage } from './pages/Qa.tsx';
import { Batches, BatchReview } from './pages/Batches.tsx';
import { Rework } from './pages/Rework.tsx';
import { Listings } from './pages/Listings.tsx';
import { Publishing } from './pages/Publishing.tsx';
import { Analytics } from './pages/Analytics.tsx';
import { Settings } from './pages/Settings.tsx';
import { Packing } from './pages/Packing.tsx';
import { Imports } from './pages/Imports.tsx';
import { Arcade } from './arcade/Arcade.tsx';
import { ARCADE_GAME_NAME, SUITE_NAME } from '../../src/core/brand.ts';

const NAV_ICONS: Record<string, string> = { '/arcade': '◉', '/': '⌂', '/calendar': '⏲', '/digest': '✉', '/research': '⌕', '/library': '▦', '/imports': '⇩', '/packing': '⛭', '/templates': '✎', '/jobs': '⚙', '/qa': '⚖', '/batches': '⚔', '/rework': '↺', '/listings': '☰', '/publishing': '⇪', '/analytics': '◔', '/settings': '⚒' };
const NAV_HINTS: Record<string, string> = {
  '/arcade': 'The arcade cabinet: play your way through the suite (early build)',
  '/': 'What the factory is doing right now',
  '/calendar': 'Schedule automatic daily production',
  '/digest': 'Market research emailed every few days, with new ideas',
  '/research': 'Product ideas and the evidence for them',
  '/library': 'Every product; make new ones and build packs',
  '/imports': 'Images and text you made with other tools',
  '/packing': 'Finished products sorted onto up to six pack carts',
  '/templates': 'Design systems, fonts, audiences and themes',
  '/jobs': 'Behind-the-scenes production steps',
  '/qa': 'Quality checks on every product',
  '/batches': 'Approve or reject what was made (do this daily)',
  '/rework': 'Everything rejected or failed, in one place to fix',
  '/listings': 'Edit marketplace titles, prices and tags',
  '/publishing': 'Post to Gumroad or download upload packages',
  '/analytics': 'Sales, what sold when, and recommendations',
  '/settings': 'Keys, integrations and options',
};

function Nav() {
  const { data } = useApi<any>('/dashboard', { poll: 10000 });
  const c = data?.counts ?? {};
  const link = (to: string, text: string, count?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} title={NAV_HINTS[to]}>
      <span className="ico" aria-hidden="true">{NAV_ICONS[to] ?? '•'}</span><span className="lbl">{text}</span>{count ? <span className="count">{count}</span> : null}
    </NavLink>
  );
  return (
    <nav className="sidebar nav" aria-label="Main">
      <div className="brand">{SUITE_NAME}<small>{data ? (data.providers.text.mode === 'ai' ? `AI: ${data.providers.text.model}` : 'AI not configured') : ' '}</small></div>
      {link('/arcade', `${ARCADE_GAME_NAME} arcade`)}
      {link('/', 'Dashboard')}
      {link('/calendar', 'Production calendar')}
      <div className="nav-section">Make</div>
      {link('/digest', 'Research digest')}
      {link('/research', 'Research & opportunities', c.openOpportunities)}
      {link('/library', 'Product library')}
      {link('/imports', 'Imports')}
      {link('/packing', 'Factory floor', c.packingBacklog)}
      {link('/templates', 'Templates')}
      {link('/jobs', 'Production jobs', data?.jobs?.running?.length)}
      {link('/qa', 'QA results', c.qaFailed)}
      <div className="nav-section">Sell</div>
      {link('/batches', 'Batch approval', c.awaitingReview)}
      {link('/rework', 'Rework', c.rework)}
      {link('/listings', 'Marketplace listings')}
      {link('/publishing', 'Publishing status', c.needsReconciliation)}
      {link('/analytics', 'Analytics')}
      <div className="nav-section">System</div>
      {link('/settings', 'Settings & integrations')}
    </nav>
  );
}

function NotFound() {
  return <div className="page"><h1>Page not found</h1><p className="muted">That page does not exist. Use the menu on the left.</p></div>;
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* The arcade has its own full-screen cabinet; everything else keeps the back-office layout. */}
          <Route path="/arcade/*" element={<Arcade />} />
          <Route path="*" element={<BackOffice />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

function BackOffice() {
  return (
    <div className="shell">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/library" element={<Library />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/research" element={<Research />} />
          <Route path="/digest" element={<Digest />} />
          <Route path="/packing" element={<Packing />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/qa" element={<QaPage />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchReview />} />
          <Route path="/rework" element={<Rework />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/publishing" element={<Publishing />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
