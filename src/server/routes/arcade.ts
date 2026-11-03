import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { arcadeState, canStart } from '../../engine/arcade/service.ts';

export function registerArcadeRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/arcade', async () => {
    const state = arcadeState(app);
    return { ...state, startAllowed: canStart(state) };
  });
}
