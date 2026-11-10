import type { Db } from '../db/sqlite.ts';
import type { Paths } from '../config/paths.ts';
import type { SettingsService } from '../config/settings.ts';
import type { SecretStore } from '../config/secrets.ts';
import type { Logger } from '../logging/logger.ts';
import type { AssetStore } from '../storage/assetStore.ts';
import type { Renderer } from '../engine/rendering/renderer.ts';
import type { TextProvider, ImageProvider } from '../engine/generation/providers.ts';
import type { VisionProvider } from '../engine/generation/vision.ts';
import type { Clock } from '../core/time.ts';

export interface AppContext {
  db: Db;
  paths: Paths;
  settings: SettingsService;
  secrets: SecretStore;
  log: Logger;
  assets: AssetStore;
  renderer: Renderer;
  providers: {
    text: TextProvider;
    image: ImageProvider;
    imageOpenAI?: ImageProvider;
    imageReplicate?: ImageProvider;
    imageFal?: ImageProvider;
    imageGemini?: ImageProvider;
    imageGrok?: ImageProvider;
    imageTogether?: ImageProvider;
    imageHuggingFace?: ImageProvider;
    imagePollinations?: ImageProvider;
    /** The picture-reading AI for review boxes. Off until set in Settings. */
    vision?: VisionProvider;
  };
  clock: Clock;
}
