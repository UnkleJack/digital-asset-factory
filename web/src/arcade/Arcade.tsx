import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import '@fontsource/bungee-shade/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/press-start-2p/400.css';
import './arcade.css';
import { api, errorText, useApi } from '../api.ts';
import { useArcadeInput, type Direction } from './input.ts';
import { WorldList, WorldDetail, BuilderScreen, BuilderWorldScreen, ArcadeTabs } from './Worlds.tsx';
import { StatsTicker } from './Ticker.tsx';
import { ARCADE_GAME_NAME, ARCADE_TAGLINE, ENGINE_NAME } from '../../../src/core/brand.ts';

// HAPPY DAFFY: the arcade front end of Asset Foundry.
// Owner's change, 2026-11-05: the opening screens (Insert Coin, Start Gate, Title, Character Select) became
// one HUB: pick a player, pick one of that player's worlds, and see your stats. The HUB button in the
// cabinet header returns to it from anywhere. Locked rules kept: always dark, Insert Coin never changes
// credits (it is cabinet flair only), and at 0 credits ENTER WORLD stays locked and says why.

interface Character {
  id: string;
  type: 'IDE' | 'AI_CHATBOT' | 'DAF';
  displayName: string;
  role: string;
  tagline: string;
  bio: string;
  /** The owner's own image for this character, or null for the built-in pixel art. */
  portraitUrl: string | null;
  scope: string;
  stats: { eye: number | null; craft: number | null; taste: number | null; patience: number | null };
}
interface ArcadeData {
  credits: { value: number; source: 'test'; live: false; state: 'normal' | 'zero' };
  characters: Character[];
  hiScores: { label: string; score: number }[];
  startAllowed: boolean;
}

const TITLE_WORDS = ARCADE_GAME_NAME.split(' ');

type Screen = 'hub' | 'world' | 'builder' | 'builderWorld';
const SCREEN_TITLES: Record<Screen, string> = { hub: 'HUB', world: 'WORLD DETAIL', builder: 'WORLD BUILDER', builderWorld: 'WORLD BUILDER' };
const BACK: Partial<Record<Screen, Screen>> = { world: 'hub', builder: 'hub', builderWorld: 'builder' };
const CHARACTER_KEY = 'daf.arcade.character';
const MOTION_KEY = 'daf.arcade.reducedMotion';

function readStore(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(store: 'local' | 'session', key: string, value: string | null) {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage blocked: the setting just isn't remembered */
  }
}

function useReducedMotion(): [boolean, () => void] {
  const systemPrefers = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [reduced, setReduced] = useState<boolean>(() => {
    const saved = readStore('local', MOTION_KEY);
    return saved === null ? systemPrefers() : saved === '1';
  });
  const toggle = useCallback(() => {
    setReduced((r) => {
      writeStore('local', MOTION_KEY, r ? '0' : '1');
      return !r;
    });
  }, []);
  return [reduced, toggle];
}

export function Arcade() {
  const { data, error, loading, reload } = useApi<ArcadeData>('/arcade', { poll: 15000 });
  const [screen, setScreen] = useState<Screen>('hub');
  // The last player is remembered on this computer (it used to last only for the browser tab).
  const [character, setCharacter] = useState<string | null>(() => readStore('local', CHARACTER_KEY) ?? readStore('session', CHARACTER_KEY));
  const [highlight, setHighlight] = useState<string | null>(character);
  const [reduced, toggleMotion] = useReducedMotion();
  const [stick, setStick] = useState<Direction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coin, setCoin] = useState(false);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [builderWorldId, setBuilderWorldId] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const credits = data?.credits;
  const creditsKnown = !!credits && !error;
  const startAllowed = creditsKnown && !!data?.startAllowed;
  const active = data?.characters.find((c) => c.id === character) ?? null;
  const lockText = creditsKnown ? 'ENTER LOCKED: NO AVAILABLE CREDITS' : 'ENTER LOCKED: CREDITS UNAVAILABLE';

  const go = useCallback((s: Screen) => {
    setNotice(null);
    setScreen(s);
  }, []);
  const back = useCallback(() => {
    const to = BACK[screen];
    if (to) go(to);
  }, [screen, go]);
  const insertCoin = useCallback(() => {
    // Cabinet flair only (owner confirmed 2026-11-03): it never changes the credit balance.
    setCoin(true);
    window.setTimeout(() => setCoin(false), 700);
  }, []);
  const enterWorld = useCallback((id: string) => {
    // Locked rule (spec B2): nothing starts at 0 credits. Entering a world is the "start".
    if (!startAllowed) return setNotice(lockText);
    setWorldId(id);
    go('world');
  }, [startAllowed, lockText, go]);
  const pressStart = useCallback(() => {
    if (screen !== 'hub') return;
    // Start enters the world in focus, or the top one (closest to its next milestone).
    const focused = document.activeElement as HTMLElement | null;
    const target = focused?.matches('[data-enter-world]') ? focused : screenRef.current?.querySelector<HTMLElement>('[data-enter-world]');
    if (target) target.click();
    else setNotice(active ? `${active.displayName} HAS NO OPEN WORLDS YET: TRY THE WORLD BUILDER` : 'PICK A PLAYER FIRST');
  }, [screen, active]);
  const choose = useCallback((id: string) => {
    setCharacter(id);
    setHighlight(id);
    setNotice(null);
    writeStore('local', CHARACTER_KEY, id);
  }, []);

  useArcadeInput(screenRef, { onBack: back, onStart: pressStart, onSelect: insertCoin, onMove: (d) => { setStick(d); window.setTimeout(() => setStick(null), 160); } });

  // Put keyboard/controller focus on the screen's main control whenever the screen changes.
  useEffect(() => {
    const root = screenRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('[data-nav]');
    target?.focus({ preventScroll: true });
  }, [screen, loading]);

  const pressA = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && screenRef.current?.contains(el) && el.matches('[data-nav]')) el.click();
    else screenRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.click();
  };

  let body: ReactNode;
  if (loading && !data) body = <Loading />;
  else if (screen === 'world' && worldId) body = <WorldDetail worldId={worldId} character={active} onBack={() => go('hub')} />;
  else if (screen === 'builder') body = <BuilderScreen onOpen={(id) => { setBuilderWorldId(id); go('builderWorld'); }} onBack={() => go('hub')} />;
  else if (screen === 'builderWorld' && builderWorldId) body = <BuilderWorldScreen worldId={builderWorldId} defaultCharacter={character} onBack={() => go('builder')} onHub={() => go('hub')} />;
  else {
    body = (
      <Hub
        data={data}
        chosen={character}
        highlight={highlight}
        onHighlight={setHighlight}
        onChoose={choose}
        onPortraitChanged={() => void reload()}
        locked={!startAllowed}
        lockText={lockText}
        notice={notice}
        reduced={reduced}
        onEnterWorld={enterWorld}
        onBuilder={() => go('builder')}
        onSoon={(d) => setNotice(`${d} UNLOCKS IN A LATER BUILD`)}
      />
    );
  }

  return (
    <div className={`arcade-room${reduced ? ' reduced' : ''}`}>
      <div className="cabinet">
        <header className="cab-marquee" aria-label={ARCADE_GAME_NAME}>
          <div className="marquee-lights" aria-hidden="true" />
          <h1 className="marquee-title">{TITLE_WORDS.map((w, i) => <span key={w}>{i ? ' ' : ''}{w}</span>)}</h1>
          <p className="marquee-sub">{ARCADE_TAGLINE}</p>
        </header>

        <div className="cab-status">
          <CreditMeter credits={credits} error={!!error} />
          <div className="char-indicator" aria-label="Current character">
            <span className="led-label">P1</span>
            <span className={`led-value${active ? '' : ' dim'}`}>{active ? active.displayName : 'NO PLAYER'}</span>
          </div>
          <div className="cab-tools">
            <button type="button" className="cab-switch hub-switch" onClick={() => go('hub')} aria-current={screen === 'hub' ? 'page' : undefined} title="Back to the hub: pick a player, a world, or check your stats">
              ◀ HUB
            </button>
            <button type="button" className="cab-switch" onClick={toggleMotion} aria-pressed={reduced} title="Reduce CRT flicker, scrolling and other movement">
              MOTION: {reduced ? 'LOW' : 'FULL'}
            </button>
            <Link className="cab-switch" to="/" title={`The factory's back-office screens (${ENGINE_NAME})`}>BACK OFFICE</Link>
          </div>
        </div>

        <div className="bezel">
          <div className="crt">
            <div className="crt-screen" ref={screenRef} aria-live="polite">
              <div className="screen-tag" aria-hidden="true">{SCREEN_TITLES[screen]}</div>
              {error && data ? <div className="crt-error" role="alert">LINK TO FACTORY LOST. CREDITS UNAVAILABLE. <button type="button" className="arc-btn small" data-nav onClick={() => void reload()}>RETRY</button></div> : null}
              {error && !data ? <InitError message={error} onRetry={() => void reload()} /> : body}
            </div>
            <div className="crt-scanlines" aria-hidden="true" />
            <div className="crt-glare" aria-hidden="true" />
          </div>
        </div>

        <div className="control-panel">
          <div className={`joystick${stick ? ` tilt-${stick}` : ''}`} aria-hidden="true">
            <div className="stick-base" />
            <div className="stick-shaft" />
            <div className="stick-ball" />
          </div>
          <div className="panel-buttons">
            <PanelButton label="A" hint="SELECT" tone="lime" onPress={pressA} />
            <PanelButton label="B" hint="BACK" tone="red" onPress={back} />
          </div>
          <div className="panel-small">
            <PanelButton label="1P" hint="START" tone="gold" small onPress={pressStart} />
            <button type="button" className={`coin-door${coin ? ' live' : ''}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={insertCoin} aria-label="Insert coin (for fun: credits don't change)">
              <span className="coin-slot" />
              <span className="coin-text">{coin ? 'CLINK!' : 'INSERT COIN'}</span>
            </button>
          </div>
        </div>
        <div className="kick-plate" aria-hidden="true"><span>DAF</span></div>
      </div>
      <p className="arcade-help">Arrows or WASD move · Enter or Space select · Esc back · Start enters a world · controllers work too</p>
    </div>
  );
}

function PanelButton({ label, hint, tone, small, onPress }: { label: string; hint: string; tone: 'lime' | 'red' | 'gold'; small?: boolean; onPress: () => void }) {
  // Physical cabinet buttons copy what the keyboard does, so they stay out of the tab order and never steal focus.
  return (
    <button type="button" className={`panel-btn ${tone}${small ? ' small' : ''}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onPress} aria-label={`${label} button: ${hint}`}>
      <span className="cap">{label}</span>
      <span className="hint">{hint}</span>
    </button>
  );
}

function CreditMeter({ credits, error }: { credits?: ArcadeData['credits']; error: boolean }) {
  if (!credits || error) {
    return (
      <div className="credit-meter unavailable" aria-label="Credits unavailable">
        <span className="led-label">CREDITS</span><span className="led-value">--</span><span className="led-tag">UNAVAILABLE</span>
      </div>
    );
  }
  const zero = credits.state === 'zero';
  return (
    <div className={`credit-meter${zero ? ' zero' : ''}`} aria-label={`Credits ${credits.value}, test data${zero ? ', no credits' : ''}`}>
      <span className="led-label">CREDITS</span>
      <span className="led-value">{String(credits.value).padStart(2, '0')}</span>
      <span className="led-tag" title="Test number from Settings. Live provider credits come in a later build.">{zero ? 'EMPTY · TEST' : 'TEST'}</span>
    </div>
  );
}

function Loading() {
  return <div className="scr center"><p className="blink-slow big-pixel">LOADING...</p></div>;
}

function InitError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="scr center" role="alert">
      <p className="big-pixel bad">SYSTEM ERROR</p>
      <p className="crt-text">The cabinet couldn't load: {message}</p>
      <button type="button" className="arc-btn" data-nav data-autofocus onClick={onRetry}>RETRY</button>
    </div>
  );
}

function HiScoreBanner({ scores, reduced }: { scores: ArcadeData['hiScores']; reduced: boolean }) {
  const text = scores.length
    ? scores.map((s, i) => `${i + 1}. ${s.label} ${s.score}`).join('   ★   ')
    : 'NO HIGH SCORES YET   ★   SHIP A FINISHED PACK TO GET ON THE BOARD';
  return (
    <div className={`hiscore-banner${reduced ? ' static' : ''}`} aria-label={scores.length ? 'High scores' : 'No high scores yet'}>
      <span className="hiscore-label">HI-SCORE</span>
      <div className="hiscore-track">
        <span className="hiscore-text">{text}</span>
        {!reduced ? <span className="hiscore-text" aria-hidden="true">{text}</span> : null}
      </div>
    </div>
  );
}

const STAT_NAMES = [['eye', 'EYE'], ['craft', 'CRAFT'], ['taste', 'TASTE'], ['patience', 'PATIENCE']] as const;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

function PortraitControls({ character, onChanged }: { character: Character; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="portrait-controls">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Custom portrait for ${character.displayName}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run(async () => api(`/arcade/characters/${character.id}/portrait`, { method: 'PUT', body: { dataBase64: await readBase64(f) } }));
        }}
      />
      <button type="button" className="arc-btn small" data-nav disabled={busy} onClick={() => input.current?.click()}>
        {character.portraitUrl ? 'CHANGE PORTRAIT' : 'CUSTOM PORTRAIT'}
      </button>
      {character.portraitUrl ? (
        <button type="button" className="arc-btn small" data-nav disabled={busy} onClick={() => void run(() => api(`/arcade/characters/${character.id}/portrait`, { method: 'DELETE' }))}>
          USE PIXEL ART
        </button>
      ) : null}
      {err ? <p className="crt-error" role="alert">{err}</p> : null}
    </div>
  );
}

/** The opening screen: pick a player, pick one of their worlds, check the stats. */
function Hub({ data, chosen, highlight, onHighlight, onChoose, onPortraitChanged, locked, lockText, notice, reduced, onEnterWorld, onBuilder, onSoon }: {
  data: ArcadeData | null; chosen: string | null; highlight: string | null;
  onHighlight: (id: string) => void; onChoose: (id: string) => void; onPortraitChanged: () => void;
  locked: boolean; lockText: string; notice: string | null; reduced: boolean;
  onEnterWorld: (id: string) => void; onBuilder: () => void; onSoon: (name: string) => void;
}) {
  const characters = data?.characters ?? [];
  const player = characters.find((c) => c.id === chosen) ?? null;
  const shown = characters.find((c) => c.id === (highlight ?? chosen)) ?? characters[0];
  const [extras, setExtras] = useState(false);
  return (
    <div className="scr hub">
      <HiScoreBanner scores={data?.hiScores ?? []} reduced={reduced} />

      <section className="hub-zone" aria-labelledby="hub-player">
        <h2 id="hub-player" className="zone-title">PLAYER</h2>
        <div className="char-grid compact" role="radiogroup" aria-label="Characters">
          {characters.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={chosen === c.id}
              className={`char-card char-${c.id}${chosen === c.id ? ' chosen' : ''}`}
              data-nav
              {...(chosen ? (chosen === c.id ? { 'data-autofocus': true } : {}) : i === 0 ? { 'data-autofocus': true } : {})}
              onFocus={() => onHighlight(c.id)}
              onMouseEnter={() => onHighlight(c.id)}
              onClick={() => onChoose(c.id)}
            >
              <span className="char-portrait" aria-hidden="true">
                {c.portraitUrl ? <img className="char-photo" src={c.portraitUrl} alt="" /> : <CharacterSprite type={c.type} />}
              </span>
              <span className="char-name">{c.displayName}</span>
              <span className="char-tag">{c.role === c.displayName ? c.tagline : `${c.role} · ${c.tagline}`}</span>
              {chosen === c.id ? <span className="char-picked">PLAYING</span> : null}
            </button>
          ))}
        </div>
        {shown ? (
          <div className="char-info">
            <p className="fine">{shown.displayName}: {shown.scope}</p>
            <button type="button" className="arc-btn small" data-nav aria-expanded={extras} onClick={() => setExtras((x) => !x)}>{extras ? 'HIDE BIO & PORTRAIT' : 'BIO, PORTRAIT & STATS'}</button>
            {extras ? (
              <>
                <p className="crt-text">{shown.bio}</p>
                <PortraitControls character={shown} onChanged={onPortraitChanged} />
                <dl className="stat-panel" aria-label={`${shown.displayName} stats`}>
                  {STAT_NAMES.map(([k, label]) => (
                    <div key={k} className="stat">
                      <dt>{label}</dt>
                      <dd>{shown.stats[k] ?? '--'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="fine">Stats stay blank until the XP rules are decided.</p>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="hub-zone" aria-labelledby="hub-worlds">
        <h2 id="hub-worlds" className="zone-title">{player ? `${player.displayName}'S WORLDS` : 'WORLDS'}</h2>
        {player ? <WorldList character={player} locked={locked} onOpen={onEnterWorld} /> : <p className="hint-line center-text">PICK A PLAYER TO SEE THEIR WORLDS</p>}
        {locked ? <p className="lock-line center-text" role="status"><span className="lock-icon" aria-hidden="true">■</span> {lockText}</p> : null}
        {notice && notice !== lockText ? <p className="lock-line center-text" role="status">{notice}</p> : null}
        <div className="row-actions">
          <button type="button" className="arc-btn" data-nav onClick={onBuilder}>WORLD BUILDER</button>
        </div>
      </section>

      <section className="hub-zone" aria-labelledby="hub-stats">
        <h2 id="hub-stats" className="zone-title">STATS</h2>
        <StatsTicker character={chosen} reduced={reduced} />
      </section>

      <ArcadeTabs onSoon={onSoon} />
    </div>
  );
}

// Small pixel portraits drawn as SVG rects so no image files are needed.
function CharacterSprite({ type }: { type: Character['type'] }) {
  const px = (rows: string[], palette: Record<string, string>) =>
    rows.flatMap((row, y) => [...row].map((ch, x) => (palette[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[ch]} /> : null)));
  // Original designs (not copied from any game). IDE: ninja, facing right. AI Chatbot: desk robot, facing front.
  // DAF: wizard, facing left. Side characters face the middle of the select screen.
  const art: Record<Character['type'], { rows: string[]; palette: Record<string, string> }> = {
    IDE: {
      rows: [
        '....hh..............',
        '.....hh.............',
        '......gh.kkkkk......',
        '.......gknnnnnk.....',
        '........knnnnnnk....',
        '.......knnnnnnnnk...',
        '.......knnnsssssk...',
        '.......knnnsskesk...',
        '...rrrrknnnnnnnnk...',
        '..rrRrkkknnnnnnk....',
        '.rR..rRkNNnnnnnkk...',
        '......knNnnnnnnnsss.',
        '......knnNnnnnnkss..',
        '......knnnggggggk...',
        '......knnnnnnnnnk...',
        '.......knnnk.knnnk..',
        '.......knnk...knnk..',
        '......knnnk...knnnk.',
        '......kkkkk...kkkkkk',
        '....................',
      ],
      palette: { k: '#0b0d14', n: '#22304f', N: '#3b5384', s: '#d9a066', e: '#a8ff00', r: '#d93a3a', R: '#8c1f1f', g: '#f5c542', h: '#7a5230' },
    },
    AI_CHATBOT: {
      rows: [
        '.........gg.........',
        '.........kk.........',
        '......kkkkkkkk......',
        '.....kmmmmmmmmk.....',
        '....kmMMMMMMMMmk....',
        '...hkmbbbbbbbbmkh...',
        '...hkmbeebbeebmkh...',
        '...hkmbeebbeebmkh...',
        '...hkmbbbbbbbbmk.h..',
        '....kmbbgggggbmk.c..',
        '.....kmmmmmmmmkccc..',
        '.......kkmmkk.......',
        '...kkkkkkkkkkkkkk...',
        '..kmmMMMMMMMMMMmmk..',
        '..kmmqqqqqqqqqqmmk..',
        '..kmmqwwwwwwwwqmmk..',
        '..kmmqwkkkwkkwqmmk..',
        '..kmmqqqqqqqqqqmmk..',
        '..kkkkkkkkkkkkkkkk..',
        '....................',
      ],
      palette: { k: '#0b0d14', m: '#7c8494', M: '#a9b1c0', b: '#0f1a14', e: '#5ef0ff', g: '#a8ff00', h: '#f5c542', c: '#f5c542', q: '#c48a2a', w: '#f0f0d8' },
    },
    DAF: {
      rows: [
        '..............kk....',
        '.............kPk....',
        '............kppk....',
        '..kk.......kpppk....',
        '.kOOk.....kpgppk....',
        '.kOok....kpppppk....',
        '..kk....kpppppppk...',
        '..tt..kkgggggggggk..',
        '..tt...kssskppppk...',
        '..tt...kekskppppk...',
        '..tt..kssssspppk....',
        '..tt..kwwwwwwppk....',
        '..ttsskwWwwwwPppk...',
        '..ttsskwwWwwPpppk...',
        '..tt..kpwwwpPpgppk..',
        '..tt..kppwpPpppppk..',
        '..tt.kppppPppgpppk..',
        '..tt.kpppPppppppppk.',
        '..tt.kkkkkkkkkkkkkk.',
        '....................',
      ],
      palette: { k: '#0b0d14', p: '#4b3591', P: '#7d5fd0', g: '#f5c542', s: '#e0b080', e: '#111111', w: '#ecece4', W: '#b5b5ad', t: '#8a5a32', o: '#a8ff00', O: '#e6ffb0' },
    },
  };
  const a = art[type];
  return <svg viewBox="0 0 20 20" shapeRendering="crispEdges" width="100%" height="100%">{px(a.rows, a.palette)}</svg>;
}
