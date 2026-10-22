import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, PageHead, Pill, Tabs, useToast } from '../ui.tsx';
import { AI_PROVIDER_LABELS, bytes, fmtDate, label, providerLabel } from '../format.ts';

const TABS = [
  { id: 'general', label: 'General' }, { id: 'ai', label: 'AI providers' }, { id: 'integrations', label: 'Integrations' }, { id: 'generation', label: 'Generation' }, { id: 'rendering', label: 'Rendering' },
  { id: 'qa', label: 'QA' }, { id: 'scoring', label: 'Scoring' }, { id: 'marketplaces', label: 'Marketplaces' }, { id: 'scheduler', label: 'Scheduler' },
  { id: 'licensing', label: 'License text' }, { id: 'compliance', label: 'Compliance' }, { id: 'analytics', label: 'Analytics' }, { id: 'backups', label: 'Backups' },
  { id: 'logs', label: 'Logs & audit' }, { id: 'system', label: 'System' },
];

const HELP: Record<string, string> = {
  general: 'Shop name appears on every product footer and in the license. The timezone controls when production plans run.',
  generation: 'Which text and image providers to use. Text can be Anthropic, one of five OpenAI-compatible free-tier providers (OpenRouter, Groq, NVIDIA NIM, Cerebras, Together AI), or turned off ("deterministic"). "unconfiguredPolicy" decides what happens when AI is selected but no key is set: use the built-in content library, or fail.',
  rendering: 'Chrome is used to render PDFs and previews. Changing these restarts the renderer.',
  qa: 'Thresholds for near-duplicate detection, spelling and image checks. Add words the spell-checker should accept to the allowlist (one per line).',
  scoring: 'Factor weights and the score/confidence thresholds. These thresholds are starting points — tune them as you learn what sells.',
  marketplaces: 'Listing rules per marketplace and default prices per product type (in cents). Rules marked unverified could not be confirmed from official pages; check them against the marketplace.',
  scheduler: 'How often the scheduler checks plans, the catch-up window for runs missed while the app was off, retry policy and concurrency.',
  licensing: 'The license included in every download. {{shopName}} and {{year}} are filled in automatically.',
  compliance: 'Terms that block a product or listing in QA (trademarks, licensed characters, brands). One per line.',
  analytics: 'Minimum evidence before a recommendation is made.',
};

export function Settings() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'general';
  const st = useApi<any>('/settings');
  return (
    <div className="page">
      <PageHead title="Settings & integrations" sub="Everything is stored locally. API keys are kept in the macOS Keychain and are never shown again after you save them." />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setSp({ tab: t })} />
      {tab === 'ai' && <AiProviders onChanged={st.reload} />}
      {tab === 'integrations' && <Integrations onChanged={st.reload} />}
      {tab === 'backups' && <Backups />}
      {tab === 'logs' && <Logs />}
      {tab === 'system' && <System />}
      {!['ai', 'integrations', 'backups', 'logs', 'system'].includes(tab) && <Async state={st}>{(d) => <SectionEditor key={tab} section={tab} value={d.settings[tab]} onSaved={st.reload} />}</Async>}
    </div>
  );
}

function SectionEditor({ section, value, onSaved }: { section: string; value: any; onSaved: () => void }) {
  const [draft, setDraft] = useState<any>(value);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => setDraft(value), [value]);
  return (
    <Card title={label(section)} actions={<>
      <ActionButton className="small" confirm="Reset this section to its defaults?" onClick={async () => { await api(`/settings/${section}/reset`, { body: {} }); toast('Reset to defaults'); onSaved(); }}>Reset to defaults</ActionButton>
      <button className="primary small" onClick={async () => { setErr(null); try { await api(`/settings/${section}`, { method: 'PATCH', body: draft }); toast('Saved'); onSaved(); } catch (e) { setErr(errorText(e)); } }}>Save</button>
    </>}>
      {HELP[section] && <p className="small muted" style={{ marginTop: 0 }}>{HELP[section]}</p>}
      <ObjectFields value={draft} onChange={setDraft} path={[]} />
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Card>
  );
}

const JSON_KEYS = new Set(['textPrices', 'imagePricePerImageUsd', 'defaultPriceCents']);
// Price tables for AI calls. Only used to estimate cost and enforce the budget limit, so they sit under "Advanced".
const ADVANCED_KEYS = new Set(['textPrices', 'imagePricePerImageUsd']);

function ObjectFields({ value, onChange, path }: { value: any; onChange: (v: any) => void; path: string[] }) {
  const prims = Object.entries(value).filter(([k, v]) => (typeof v !== 'object' || v === null || Array.isArray(v)) && !JSON_KEYS.has(k));
  const nested = Object.entries(value).filter(([k, v]) => typeof v === 'object' && v !== null && !Array.isArray(v) && !JSON_KEYS.has(k));
  const jsons = Object.entries(value).filter(([k]) => JSON_KEYS.has(k) && !ADVANCED_KEYS.has(k));
  const advanced = Object.entries(value).filter(([k]) => ADVANCED_KEYS.has(k));
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="stack">
      {prims.length > 0 && <div className="form">{prims.map(([k, v]) => <Field key={k} name={k} value={v} onChange={(nv) => set(k, nv)} long={k === 'licenseText'} />)}</div>}
      {jsons.map(([k, v]) => <JsonField key={k} name={k} value={v} onChange={(nv) => set(k, nv)} />)}
      {nested.map(([k, v]) => <fieldset key={k} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}><legend className="small muted" style={{ padding: '0 6px' }}>{label(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</legend><ObjectFields value={v} onChange={(nv) => set(k, nv)} path={[...path, k]} /></fieldset>)}
      {advanced.length > 0 && <details className="advanced"><summary className="small">Advanced: AI price table</summary><p className="small muted">Only used to estimate what paid AI calls cost and to enforce the budget limit. Free models are listed at 0, so you can leave this alone.</p>{advanced.map(([k, v]) => <JsonField key={k} name={k} value={v} onChange={(nv) => set(k, nv)} />)}</details>}
    </div>
  );
}

const SELECT_OPTIONS: Record<string, string[]> = {
  textProvider: ['groq', 'openrouter', 'cerebras', 'together', 'nvidia', 'anthropic', 'deterministic'],
  imageProvider: ['openai', 'none'],
  unconfiguredPolicy: ['deterministic', 'fail'],
  effort: ['low', 'medium', 'high', 'xhigh', 'max'],
  quality: ['low', 'medium', 'high'],
};

const OPTION_LABELS: Record<string, string> = { ...AI_PROVIDER_LABELS, openai: 'OpenAI', deterministic: 'Deterministic (no AI)' };

function Field({ name, value, onChange, long }: { name: string; value: any; onChange: (v: any) => void; long?: boolean }) {
  const text = label(name.replace(/([A-Z])/g, ' $1').toLowerCase());
  if (typeof value === 'boolean') return <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />{text}</label>;
  if (typeof value === 'number') return <label className="f">{text}<input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} /></label>;
  if (Array.isArray(value)) return <label className="f" style={{ gridColumn: '1 / -1' }}>{text} <span className="field-help">one per line</span><textarea rows={Math.min(10, Math.max(3, value.length + 1))} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /></label>;
  if (long) return <label className="f" style={{ gridColumn: '1 / -1' }}>{text}<textarea rows={12} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>;
  if (SELECT_OPTIONS[name]) return <label className="f">{text}<select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>{SELECT_OPTIONS[name].map((o) => <option key={o} value={o}>{OPTION_LABELS[o] ?? label(o)}</option>)}</select></label>;
  return <label className="f">{text}<input value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>;
}

function JsonField({ name, value, onChange }: { name: string; value: any; onChange: (v: any) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return <label className="f">{label(name.replace(/([A-Z])/g, ' $1').toLowerCase())} (JSON){bad && <span style={{ color: 'var(--bad)' }}> — not valid JSON yet</span>}<textarea rows={8} className="mono" value={text} onChange={(e) => { setText(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} /></label>;
}

const AI_KEYS: Record<string, string> = {
  groq_api_key: 'Groq (text, free tier)',
  openrouter_api_key: 'OpenRouter (text, free models)',
  cerebras_api_key: 'Cerebras (text, free credit — may ask for a card)',
  together_api_key: 'Together AI (text, may need a small credit purchase)',
  nvidia_api_key: 'NVIDIA NIM (text, free trial credits)',
  anthropic_api_key: 'Anthropic (text, paid — used last as a backup)',
  openai_api_key: 'OpenAI (illustrated coloring pictures, paid)',
};

const INTEGRATION_KEYS: Record<string, string> = {
  gumroad_token: 'Gumroad access token (posts products, reads sales)',
  tavily_api_key: 'Tavily (web search, free, no card)',
  exa_api_key: 'Exa (web search, free monthly credit, no card)',
  brave_search_api_key: 'Brave Search (web search, free credit, needs a card)',
  smtp_password: 'Gmail app password (sends the research digest)',
  etsy_api_key: 'Etsy API key (not used yet)',
  etsy_oauth: 'Etsy OAuth token (not used yet)',
};

/** Write-only key fields with a "get a key" link; saved values are never shown again. */
function SecretList({ names, onChanged }: { names: Record<string, string>; onChanged?: () => void }) {
  const st = useApi<any>('/secrets');
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <Async state={st}>{(d) => (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Stored in: <b>{d.store === 'keychain' ? 'macOS Keychain' : d.store === 'environment' ? 'environment variables (read-only)' : d.store}</b>. Saved keys are never displayed again.</p>
        {Object.keys(names).map((name) => d.secrets.find((x: any) => x.name === name)).filter(Boolean).map((s: any) => (
          <div key={s.name} className="stack" style={{ gap: 4 }}>
            <div className="spread"><span className="small"><b>{names[s.name]}</b>{s.keyUrl && <> · <a href={s.keyUrl} target="_blank" rel="noopener noreferrer">{s.name === 'smtp_password' ? 'Create one' : s.keyIsFree ? 'Get a free key' : 'Get a key (paid)'} ↗</a></>}</span>{s.configured ? <Pill value="ready" text={`Saved (${s.source})`} /> : <Pill value="pending" text="Not set" />}</div>
            <div className="row">
              <input type="password" autoComplete="off" placeholder={s.configured ? 'Enter a new key to replace it' : 'Paste key'} value={values[s.name] ?? ''} onChange={(e) => setValues({ ...values, [s.name]: e.target.value })} style={{ flex: 1 }} />
              <ActionButton className="small primary" disabled={!values[s.name]} onClick={async () => { await api(`/secrets/${s.name}`, { method: 'PUT', body: { value: values[s.name] } }); setValues({ ...values, [s.name]: '' }); toast('Key saved'); st.reload(); onChanged?.(); }}>Save</ActionButton>
              {s.configured && s.source === 'keychain' && <ActionButton className="small danger" confirm="Remove this key from the Keychain?" onClick={async () => { await api(`/secrets/${s.name}`, { method: 'DELETE' }); st.reload(); onChanged?.(); }}>Remove</ActionButton>}
            </div>
          </div>
        ))}
      </div>
    )}</Async>
  );
}

function TestResult({ r }: { r: any }) {
  if (!r) return null;
  return r.ok ? <span className="small"><Pill value="ready" text="Working" /> {r.account ?? r.model ?? r.to ?? ''}{r.ms ? ` · ${r.ms} ms` : ''}{r.warning && <span style={{ color: 'var(--warn)' }}> — {r.warning}</span>}</span> : <span className="small" style={{ color: 'var(--bad)' }}>{r.error}</span>;
}

function AiProviders({ onChanged }: { onChanged: () => void }) {
  const settings = useApi<any>('/settings');
  const [tests, setTests] = useState<Record<string, any>>({});
  return (
    <div className="grid g2">
      <Card title="AI keys">
        <p className="small muted" style={{ marginTop: 0 }}>Add as many free providers as you like. Every AI task tries your chosen provider first, then the others in <b>Generation → Fallback order</b>, so one that is rate-limited or out of credit doesn't stop the work. Free limits change on the providers' side; check their pages when you sign up.</p>
        <SecretList names={AI_KEYS} onChanged={onChanged} />
      </Card>
      <Card title="Test the connection">
        <p className="small muted" style={{ marginTop: 0 }}>Each test makes one <b>real API call</b> and checks the answer. If your chosen provider fails, the test says which backup answered instead.</p>
        <Async state={settings}>{(d) => {
          const g = d.settings.generation;
          const activeCfg = g.textProvider === 'deterministic' ? null : g[g.textProvider];
          return <div className="kv" style={{ marginBottom: 12 }}>
            <span>Text (first choice)</span><span>{g.textProvider === 'deterministic' ? 'Deterministic (no AI)' : providerLabel(g.textProvider)}{activeCfg ? ` · ${activeCfg.model}` : ' (turned off)'}</span>
            <span>Backups, in order</span><span>{g.fallbackOrder.filter((x: string) => x !== g.textProvider).map(providerLabel).join(' → ') || 'none'}</span>
            <span>Images</span><span>{g.imageProvider} · {g.openai.imageModel}</span>
            <span>If no AI key works</span><span>{g.unconfiguredPolicy === 'deterministic' ? 'use the built-in content library' : 'fail the job'}</span>
          </div>;
        }}</Async>
        {(['text', 'image'] as const).map((p) => (
          <div key={p} className="row" style={{ marginBottom: 8 }}>
            <ActionButton onClick={async () => { const r = await api('/providers/test', { body: { provider: p } }); setTests({ ...tests, [p]: r }); }}>Test {p} provider</ActionButton>
            <TestResult r={tests[p]} />
          </div>
        ))}
        <p className="small muted">Change the first choice, backup order and models under the Generation tab.</p>
      </Card>
    </div>
  );
}

function Integrations({ onChanged }: { onChanged: () => void }) {
  const settings = useApi<any>('/settings');
  const toast = useToast();
  const [tests, setTests] = useState<Record<string, any>>({});
  const [email, setEmail] = useState<any>(null);
  const [gum, setGum] = useState<any>(null);
  useEffect(() => { if (settings.data) { setEmail(settings.data.settings.email); setGum(settings.data.settings.marketplaces.gumroad); } }, [settings.data]);
  return (
    <div className="grid g2">
      <Card title="Keys for selling, search and email">
        <SecretList names={INTEGRATION_KEYS} onChanged={onChanged} />
      </Card>
      <div className="stack">
        <Card title="Gumroad">
          {gum && <div className="stack">
            <label className="check"><input type="checkbox" checked={gum.autoPublishEnabled} onChange={(e) => setGum({ ...gum, autoPublishEnabled: e.target.checked })} />Allow posting products to Gumroad from this app</label>
            <label className="check"><input type="checkbox" checked={gum.autoPublishOnApproval} disabled={!gum.autoPublishEnabled} onChange={(e) => setGum({ ...gum, autoPublishOnApproval: e.target.checked })} />Post automatically when I approve a batch item</label>
            <label className="check"><input type="checkbox" checked={gum.publishLive} onChange={(e) => setGum({ ...gum, publishLive: e.target.checked })} />Publish immediately (off = create as a draft I switch on in Gumroad)</label>
            <p className="small muted" style={{ margin: 0 }}>Direct posting is new and has not yet been confirmed against a live Gumroad account. Try it on one product first and check it in your Gumroad dashboard. Cover images can't be set through Gumroad's API; add one there if you want it.</p>
            <div className="row">
              <ActionButton className="primary small" onClick={async () => { await api('/settings/marketplaces', { method: 'PATCH', body: { gumroad: gum } }); toast('Saved'); settings.reload(); }}>Save</ActionButton>
              <ActionButton className="small" onClick={async () => setTests({ ...tests, gumroad: await api('/integrations/gumroad/test', { body: {} }) })}>Test token</ActionButton>
              <ActionButton className="small" onClick={async () => { const r = await api('/integrations/gumroad/sync-sales', { body: {} }); toast(`Sales checked: ${r.imported} new, ${r.seen} seen${r.unmatched ? `, ${r.unmatched} not from this app` : ''}`); }}>Pull sales now</ActionButton>
            </div>
            <TestResult r={tests.gumroad} />
          </div>}
        </Card>
        <Card title="Email (research digest)">
          {email && <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Use a Gmail account made for this business. In that Google account turn on 2-Step Verification, then create an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">app password ↗</a> and save it as "Gmail app password" on the left.</p>
            <div className="form">
              <label className="f">Sending Gmail address<input type="email" value={email.smtpUser} placeholder="yourshop@gmail.com" onChange={(e) => setEmail({ ...email, smtpUser: e.target.value })} /></label>
              <label className="f">From name<input value={email.fromName} onChange={(e) => setEmail({ ...email, fromName: e.target.value })} /></label>
            </div>
            <div className="row">
              <ActionButton className="primary small" onClick={async () => { await api('/settings/email', { method: 'PATCH', body: email }); toast('Saved'); settings.reload(); }}>Save</ActionButton>
              <ActionButton className="small" onClick={async () => setTests({ ...tests, email: await api('/integrations/email/test', { body: {} }) })}>Send a test email</ActionButton>
            </div>
            <TestResult r={tests.email} />
            <p className="small muted" style={{ margin: 0 }}>The digest goes to the address set on the Digest page.</p>
          </div>}
        </Card>
      </div>
    </div>
  );
}

function Backups() {
  const st = useApi<any[]>('/backups');
  const toast = useToast();
  return (
    <Card title="Backups" actions={<ActionButton className="primary small" onClick={async () => { const b = await api('/backups', { body: {} }); toast(`Backup created (${bytes(b.bytes)})`); st.reload(); }}>Back up now</ActionButton>}>
      <p className="small muted" style={{ marginTop: 0 }}>A backup is a consistent copy of the database plus every generated file. API keys are not included (they stay in the Keychain). To restore, quit the app and run <code>npm run restore -- &lt;backup-name&gt;</code>; your current data is moved aside, not deleted.</p>
      <Async state={st}>{(list) => list.length ? <table className="t"><thead><tr><th>Backup</th><th>Created</th><th>Products</th><th>Files</th><th>Size</th></tr></thead><tbody>{list.map((b) => <tr key={b.name}><td className="mono">{b.name}</td><td>{fmtDate(b.createdAt)}</td><td>{b.products}</td><td>{b.assets}</td><td>{bytes(b.bytes)}</td></tr>)}</tbody></table> : <Empty title="No backups yet" />}</Async>
    </Card>
  );
}

function Logs() {
  const [level, setLevel] = useState('info');
  const logs = useApi<any>(`/logs?level=${level}&limit=300`, { poll: 5000 });
  const audit = useApi<any[]>('/audit?limit=200');
  return (
    <div className="grid g2">
      <Card title="Application log" actions={<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warnings</option><option value="error">Errors</option></select>}>
        <Async state={logs}>{(d) => d.entries.length ? <div style={{ maxHeight: 600, overflow: 'auto' }}>{d.entries.map((e: any, i: number) => <div key={i} className="small" style={{ borderBottom: '1px solid var(--border)', padding: '4px 0' }}><span className="muted">{fmtDate(e.at)}</span> <Pill value={e.level === 'error' ? 'failed' : e.level === 'warn' ? 'pending' : 'closed'} text={e.level} /> {e.msg} {e.outcome && <Pill value={e.outcome === 'succeeded' ? 'succeeded' : 'failed'} text={e.outcome} />}<div className="mono muted">{Object.entries(e).filter(([k]) => !['at', 'level', 'msg', 'outcome'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}</div></div>)}</div> : <Empty title="No log entries" />}</Async>
        <p className="small muted">Secrets are removed from every log entry before it is written.</p>
      </Card>
      <Card title="Audit trail">
        <Async state={audit}>{(list) => list.length ? <div style={{ maxHeight: 600, overflow: 'auto' }}><table className="t"><tbody>{list.map((a) => <tr key={a.id}><td className="small muted">{fmtDate(a.at)}</td><td><b>{a.action}</b><div className="small muted">{a.actor} · {a.entity_type} {a.entity_id}</div></td></tr>)}</tbody></table></div> : <Empty title="No audit events yet" />}</Async>
      </Card>
    </div>
  );
}

function System() {
  const st = useApi<any>('/system');
  return (
    <Card title="System">
      <Async state={st}>{(d) => (
        <div className="kv">
          <span>Node.js</span><span>{d.node}</span>
          <span>Platform</span><span>{d.platform}</span>
          <span>Data folder</span><span className="mono">{d.dataDir}</span>
          <span>Secret storage</span><span>{d.secretStore}</span>
          <span>Chrome</span><span>{d.chrome.available ? <Pill value="ready" text="Found" /> : <Pill value="failed" text="Not found" />} <span className="mono small">{d.chrome.path}</span></span>
          <span>Database schema</span><span>{d.schema.map((s: any) => `${s.name} (${fmtDate(s.applied_at, false)})`).join(', ')}</span>
          <span>Records</span><span>{d.counts.products} products · {d.counts.assets} files · {d.counts.jobs} jobs</span>
        </div>
      )}</Async>
    </Card>
  );
}
