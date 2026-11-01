import type { AppContext } from '../../app/context.ts';
import { permanent } from '../../core/errors.ts';

interface Row {
  id: string;
  kind: string;
  rel_path: string | null;
  mime: string | null;
  width_px: number | null;
  height_px: number | null;
  source_tool: string;
  original_name: string;
  prompt: string;
  sha256: string;
}

/** A reference image as PNG, for printing. Formats other than PNG are converted with Chrome. */
export async function referenceImageAsPng(app: AppContext, id: string): Promise<{ png: Buffer; widthPx: number; heightPx: number; provenance: Record<string, unknown> }> {
  const r = app.db.get<Row>('SELECT * FROM reference_items WHERE id = ?', id);
  if (!r || r.kind !== 'image' || !r.rel_path) throw permanent('reference_missing', `Reference image ${id} is no longer in the library`);
  const data = app.assets.readRaw(r.rel_path);
  const provenance = { generator: 'imported', referenceId: r.id, sourceTool: r.source_tool || 'unknown', originalName: r.original_name, prompt: r.prompt || undefined, sha256: r.sha256 };
  if (r.mime === 'image/png') return { png: data, widthPx: r.width_px ?? 0, heightPx: r.height_px ?? 0, provenance };
  const out = await app.renderer.toPng(data, r.mime ?? 'image/png');
  return { ...out, provenance: { ...provenance, convertedFrom: r.mime } };
}

