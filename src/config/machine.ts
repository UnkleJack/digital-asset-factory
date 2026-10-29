import { hostname } from 'node:os';
import type { AppContext } from '../app/context.ts';

/** This computer's name for sharing work between machines: the setting, or the OS host name. */
export function machineName(app: Pick<AppContext, 'settings'>): string {
  return app.settings.get('general').machineName || hostname().replace(/\.local$/i, '');
}
