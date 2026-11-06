import { Db } from '../db/sqlite.ts';
import { migrate } from '../db/migrate.ts';
import { resolvePaths } from '../config/paths.ts';
import { SettingsService } from '../config/settings.ts';
import { createSecretStore, type SecretStore } from '../config/secrets.ts';
import { Logger, type Level } from '../logging/logger.ts';
import { AssetStore } from '../storage/assetStore.ts';
import { Renderer } from '../engine/rendering/renderer.ts';
import {
  AnthropicTextProvider,
  OpenAIImageProvider,
  ReplicateImageProvider,
  FalImageProvider,
  GeminiImageProvider,
  GrokImageProvider,
  TogetherImageProvider,
  HuggingFaceImageProvider,
  PollinationsImageProvider,
  RoutedImageProvider,
  ImagePacer,
  OpenAICompatibleTextProvider,
  RoutedTextProvider,
  TEXT_PROVIDER_META,
  type TextProvider,
  type ImageProvider,
  type AiTextProviderId,
  type AiImageProviderId,
} from '../engine/generation/providers.ts';
import { seedBuiltins } from '../engine/templates/seed.ts';
import { Pacer } from '../engine/generation/pacing.ts';
import { resolveChromePath } from '../config/chrome.ts';
import { systemClock, type Clock } from '../core/time.ts';
import { recoverDrafts } from '../engine/arcade/drafts.ts';
import type { AppContext } from './context.ts';

export interface BootstrapOptions {
  /** false turns off spacing out AI calls (tests). */
  pacing?: boolean;
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
  if (mig.renumbered.length) log.info('Migration records moved to renumbered files', { renumbered: mig.renumbered, backup: mig.backupFile });
  if (mig.applied.length) log.info('Database migrated', { applied: mig.applied, backup: mig.backupFile });
  const interrupted = recoverDrafts(db);
  if (interrupted) log.info('World Builder drafts interrupted by the last shutdown were marked failed', { drafts: interrupted });
  const settings = new SettingsService(db);
  const secrets = opts.secrets ?? createSecretStore(paths.dataDir);
  const seeded = seedBuiltins(db);
  if (seeded.inserted) log.info('Seeded built-in templates and taxonomy', { inserted: seeded.inserted });
  const assets = new AssetStore(paths.assetsDir, db);
  const makeRenderer = () => {
    const r = settings.get('rendering');
    return new Renderer({ chromePath: resolveChromePath(r.chromePath), concurrency: r.concurrency, timeoutMs: r.pageTimeoutMs, log });
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
    providers: (() => {
      // Image providers (9 total, including free Pollinations)
      const openAiImage = new OpenAIImageProvider(() => secrets.get('openai_api_key'), () => settings.get('generation').openai);
      const replicateImage = new ReplicateImageProvider(() => secrets.get('replicate_api_key'), () => settings.get('generation').replicate);
      const falImage = new FalImageProvider(() => secrets.get('fal_api_key'), () => settings.get('generation').fal);
      const geminiImage = new GeminiImageProvider(() => secrets.get('gemini_api_key'), () => settings.get('generation').geminiImage);
      const grokImage = new GrokImageProvider(() => secrets.get('grok_api_key'), () => settings.get('generation').grok);
      const togetherImage = new TogetherImageProvider(() => secrets.get('together_api_key'), () => settings.get('generation').togetherImage);
      const hfImage = new HuggingFaceImageProvider(() => secrets.get('huggingface_token'), () => settings.get('generation').huggingfaceImage);
      const pollinationsImage = new PollinationsImageProvider(() => settings.get('generation').pollinations);

      const imageProviders: Partial<Record<AiImageProviderId, ImageProvider>> = {
        openai: openAiImage,
        replicate: replicateImage,
        fal: falImage,
        gemini: geminiImage,
        grok: grokImage,
        together: togetherImage,
        huggingface: hfImage,
        pollinations: pollinationsImage,
      };

      const imagePacer = new ImagePacer();

      const routedImage = new RoutedImageProvider(
        imageProviders,
        () => settings.get('generation').imageProvider as AiImageProviderId,
        () => settings.get('generation').imageFallbackOrder,
        (from, err) => log.warn('Image provider failed; trying the next backup provider', { provider: from, err: (err as Error)?.message ?? String(err) }),
        () => settings.get('generation').allowPaidFallback,
        imagePacer,
      );

      // Text providers (10 total, including origin/main's gemini/mistral/github/huggingface)
      // Each OpenAI-compatible provider tries its main model, then its backup models, on the same key.
      const compatText = (id: Exclude<AiTextProviderId, 'anthropic'>) => {
        const p = new OpenAICompatibleTextProvider(id, () => secrets.get(TEXT_PROVIDER_META[id].secretName), () => settings.get('generation')[id]);
        p.onModelFallback = (model, err) => log.warn('Text model failed; trying the next model at the same provider', { provider: id, model, err: err.message });
        return p;
      };
      const routedText = new RoutedTextProvider(
        {
          anthropic: new AnthropicTextProvider(() => secrets.get('anthropic_api_key'), () => settings.get('generation').anthropic),
          openrouter: compatText('openrouter'),
          groq: compatText('groq'),
          nvidia: compatText('nvidia'),
          cerebras: compatText('cerebras'),
          together: compatText('together'),
          gemini: compatText('gemini'),
          mistral: compatText('mistral'),
          github: compatText('github'),
          huggingface: compatText('huggingface'),
        },
        () => settings.get('generation').textProvider as AiTextProviderId,
        () => settings.get('generation').fallbackOrder,
        (from, err) => log.warn('Text provider failed; trying the next backup provider', { provider: from, err: (err as Error)?.message ?? String(err) }),
        () => settings.get('generation').allowPaidFallback,
        opts.pacing === false ? null : new Pacer(
          () => settings.get('generation').pacing,
          (provider, since) => db.value<number>("SELECT count(*) FROM generation_runs WHERE provider = ? AND started_at >= ?", provider, since) ?? 0
        ),
      );

      return {
        text: opts.textProvider ?? routedText,
        image: opts.imageProvider ?? routedImage,
        imageOpenAI: openAiImage,
        imageReplicate: replicateImage,
        imageFal: falImage,
        imageGemini: geminiImage,
        imageGrok: grokImage,
        imageTogether: togetherImage,
        imageHuggingFace: hfImage,
        imagePollinations: pollinationsImage,
      };
    })(),
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
