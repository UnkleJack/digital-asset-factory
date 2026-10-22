import type { Db } from '../db/sqlite.ts';
import type { Paths } from '../config/paths.ts';
import type { SettingsService } from '../config/settings.ts';
import type { SecretStore } from '../config/secrets.ts';
import type { Logger } from '../logging/logger.ts';
import type { AssetStore } from '../storage/assetStore.ts';
import type { Renderer } from '../engine/rendering/renderer.ts';
import type { TextProvider, ImageProvider } from '../engine/generation/providers.ts';
import type { Clock } from '../core/time.ts';

export interface AppContext {
  db: Db;
  paths: Paths;
  settings: SettingsService;
  secrets: SecretStore;
  log: Logger;
  assets: AssetStore;
  renderer: Renderer;
  providers: { text: TextProvider; image: ImageProvider };
  clock: Clock;
}
