// "Help me with this": an AI reads one QA warning on a version and suggests what it means and how to fix it.
// Suggestion only. Nothing is changed, saved, accepted or approved by this.
import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { getProduct, getVersion } from '../../db/repos.ts';
import { structuredCall, textMode } from '../generation/service.ts';
import { AI_SYSTEM_BASE } from '../producttypes/types.ts';
import { notFound, validation, ProviderError } from '../../core/errors.ts';
import { openWarnings } from './service.ts';

const Help = z.object({
  meaning: z.string().min(3).max(600),
  fix: z.string().min(3).max(1200),
  acceptIf: z.string().min(3).max(600),
});
export type WarningHelp = z.infer<typeof Help>;

export async function warningHelp(app: AppContext, versionId: string, checkCode: string): Promise<WarningHelp> {
  const version = getVersion(app.db, versionId);
  const product = getProduct(app.db, version.product_id);
  const warning = openWarnings(app, versionId).find((w) => w.check_code === checkCode);
  if (!warning) throw notFound('Open QA warning', checkCode);
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'AI help needs an AI provider key (Settings → AI providers).');
  const details = String(warning.details ?? '').slice(0, 1500);
  if (!warning.message) throw validation('This warning has no message to explain.');
  const r = await structuredCall(app, {
    purpose: 'approval:warning-help',
    schema: Help,
    system: `${AI_SYSTEM_BASE}\n- You help the owner of a printable-products shop review one automated quality warning before they decide whether to sell the product. Be plain and specific. Do not decide for them.`,
    prompt: `Product: "${product.title}" (type: ${product.product_type})\nQA check: ${warning.check_code}\nWarning: ${warning.message}${details ? `\nDetails: ${details}` : ''}\n\nReply with: meaning (what this warning is saying, in one or two sentences), fix (concrete steps to fix it in this app: edit the content, change settings, or regenerate with a note), acceptIf (when it would be reasonable to accept it as-is).`,
    maxTokens: 700,
    trace: { versionId },
  });
  return r.data;
}
