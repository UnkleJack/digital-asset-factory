import { Db } from '../db/sqlite.ts';
import { migrate } from '../db/migrate.ts';
import { resolvePaths } from '../config/paths.ts';
import { SettingsService } from '../config/settings.ts';
import { createSecretStore, type SecretStore } from '../config/secrets.ts';
import { Logger, type Level } from '../logging/logger.ts';
import { AssetStore } from '../storage/assetStore.ts';
import { Renderer } from '../engine/rendering/renderer.ts';
import { AnthropicTextProvider, OpenAIImageProvider, OpenAICompatibleTextProvider, RoutedTextProvider, TEXT_PROVIDER_META, type TextProvider, type ImageProvider, type AiTextProviderId } from '../engine/generation/providers.ts';
import { seedBuiltins } from '../engine/templates/seed.ts';
import { systemClock, type Clock } from '../core/time.ts';
import type { AppContext } from './context.ts';

export interface BootstrapOptions {
  dataDir?: string;
  secrets?: SecretStore;
  logConsole?: boolean;
  logLevel?: Level;
  clock?: Clock;
  textProvider?: TextProvider;
  imageProvider?: ImageProvider;
}

export interface App extends AppContext {
  close(): Promise<void>;
  rebuildRenderer(): Promise<void>;
}

export function bootstrap(opts: BootstrapOptions = {}): App {
  const paths = resolvePaths(opts.dataDir);
  const log = new Logger({ dir: paths.logsDir, console: opts.logConsole ?? true, level: opts.logLevel ?? 'info' });
  const db = new Db(paths.dbFile);
  const check = db.value<string>('PRAGMA quick_check');
  if (check !== 'ok') {
    db.close();
    throw new Error(`The database at ${paths.dbFile} failed its integrity check (${check}). Restore a backup with "npm run restore".`);
  }
  const mig = migrate(db, paths.backupsDir);
  if (mig.applied.length) log.info('Database migrated', { applied: mig.applied, backup: mig.backupFile });
  const settings = new SettingsService(db);
  const secrets = opts.secrets ?? createSecretStore();
  const seeded = seedBuiltins(db);
  if (seeded.inserted) log.info('Seeded built-in templates and taxonomy', { inserted: seeded.inserted });
  const assets = new AssetStore(paths.assetsDir, db);
  const makeRenderer = () => {
    const r = settings.get('rendering');
    return new Renderer({ chromePath: r.chromePath, concurrency: r.concurrency, timeoutMs: r.pageTimeoutMs, log });
  };
  const app: App = {
    db,
    paths,
    settings,
    secrets,
    log,
    assets,
    renderer: makeRenderer(),
    clock: opts.clock ?? systemClock,
    providers: {
      text: opts.textProvider ?? new RoutedTextProvider(
        {
          anthropic: new AnthropicTextProvider(() => secrets.get('anthropic_api_key'), () => settings.get('generation').anthropic),
          openrouter: new OpenAICompatibleTextProvider('openrouter', () => secrets.get(TEXT_PROVIDER_META.openrouter.secretName), () => settings.get('generation').openrouter),
          groq: new OpenAICompatibleTextProvider('groq', () => secrets.get(TEXT_PROVIDER_META.groq.secretName), () => settings.get('generation').groq),
          nvidia: new OpenAICompatibleTextProvider('nvidia', () => secrets.get(TEXT_PROVIDER_META.nvidia.secretName), () => settings.get('generation').nvidia),
          cerebras: new OpenAICompatibleTextProvider('cerebras', () => secrets.get(TEXT_PROVIDER_META.cerebras.secretName), () => settings.get('generation').cerebras),
          together: new OpenAICompatibleTextProvider('together', () => secrets.get(TEXT_PROVIDER_META.together.secretName), () => settings.get('generation').together),
        },
        () => settings.get('generation').textProvider as AiTextProviderId,
        () => settings.get('generation').fallbackOrder,
        (from, err) => log.warn('Text provider failed; trying the next backup provider', { provider: from, err: (err as Error)?.message ?? String(err) }),
      ),
      image: opts.imageProvider ?? new OpenAIImageProvider(() => secrets.get('openai_api_key'), () => settings.get('generation').openai),
    },
    async rebuildRenderer() {
      const old = app.renderer;
      app.renderer = makeRenderer();
      await old.close();
    },
    async close() {
      await app.renderer.close();
      db.close();
    },
  };
  return app;
}
