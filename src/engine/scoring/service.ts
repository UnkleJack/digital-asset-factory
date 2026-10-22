import type { AppContext } from '../../app/context.ts';
import { getOpportunity, observationsFor, FACTORS, KNOWN_METRICS, type EvidenceKind, type Factor } from '../research/service.ts';
import { productType } from '../producttypes/registry.ts';
import { findBlockedTerms } from '../qa/service.ts';
import { newId } from '../../core/ids.ts';

export interface FactorScore {
  factor: Factor;
  value: number | null;
  evidence: EvidenceKind;
  weight: number;
  source: string;
  note: string;
}

export interface ScoreResult {
  id: string;
  score: number | null;
  confidence: number;
  outcome: 'meets_threshold' | 'below_threshold' | 'insufficient_evidence' | 'policy_blocked';
  factors: FactorScore[];
  thresholds: { minScore: number; minConfidence: number };
}

const QUALITY: Record<EvidenceKind, number> = { measured: 1, external_estimate: 0.8, model_hypothesis: 0.3, unknown: 0 };
const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v * 10) / 10));

export const SCORING_RULES = {
  search_volume: 'demand = 2 × log10(monthly searches), capped at 10 (100 → 4, 1,000 → 6, 10,000 → 8)',
  competing_listings: 'competition = 10 − 2 × log10(competing listings) (100 → 6, 1,000 → 4, 10,000 → 2); higher is better',
  avg_price: 'commercial = 0.9 × typical price in USD, capped at 10',
  productionCost: '10 − 40 × average AI cost per version − 5 × job failure rate, from this shop\'s own production history',
  bundlePotential: '2 + 1.5 × active products in the same category, capped at 10',
  seasonality: 'evergreen 6; peak 1–2 months away 10; in season 7; 3 months 8; 4–6 months 5; otherwise 3',
  risk: '0 when a blocked trademark term appears; otherwise 10 − 10 × QA failure rate for the product type (8 when there is no QA history yet)',
};

function fromObservations(obs: Record<string, unknown>[], factor: Factor): Omit<FactorScore, 'weight' | 'factor'> | null {
  for (const o of obs) {
    const metric = String(o.metric);
    const def = KNOWN_METRICS[metric];
    if (!def || def.factor !== factor || o.value_num === null || o.evidence_kind === 'unknown') continue;
    const v = Number(o.value_num);
    let value: number;
    if (metric === 'search_volume') value = clamp(2 * Math.log10(Math.max(1, v)));
    else if (metric === 'competing_listings') value = clamp(10 - 2 * Math.log10(Math.max(1, v)));
    else if (metric === 'avg_price') value = clamp(0.9 * v);
    else value = clamp(v);
    return { value, evidence: o.evidence_kind as EvidenceKind, source: `${def.label}: ${v} (${o.source}, ${String(o.observed_at).slice(0, 10)})`, note: SCORING_RULES[metric as keyof typeof SCORING_RULES] ?? 'Rating used as given' };
  }
  return null;
}

export function scoreOpportunity(app: AppContext, opportunityId: string): ScoreResult {
  const opp = getOpportunity(app, opportunityId);
  const s = app.settings.get('scoring');
  const weights = s.weights;
  const obs = observationsFor(app, opportunityId);
  const inputs = opp.inputs as Record<string, { value: number; evidence: EvidenceKind; note?: string }>;
  const typeId = String(opp.product_type);
  const def = productType(typeId);
  const factors: FactorScore[] = [];
  const blocked = findBlockedTerms([String(opp.title), String(opp.description), ...opp.keywords], app.settings.get('compliance').blockedTerms);

  for (const factor of FACTORS) {
    const weight = weights[factor];
    const manual = inputs[factor];
    if (manual && manual.evidence !== 'unknown') {
      factors.push({ factor, value: clamp(manual.value), evidence: manual.evidence, weight, source: 'Entered on the opportunity', note: manual.note ?? '' });
      continue;
    }
    const observed = fromObservations(obs, factor);
    if (observed) {
      factors.push({ factor, weight, ...observed });
      continue;
    }
    if (factor === 'productionCost') {
      const hist = app.db.get<{ versions: number; cost: number | null }>(`SELECT count(DISTINCT g.version_id) AS versions, sum(g.cost_usd) AS cost FROM generation_runs g JOIN product_versions v ON v.id = g.version_id JOIN products p ON p.id = v.product_id WHERE p.product_type = ? AND g.status = 'succeeded'`, typeId)!;
      const jobs = app.db.get<{ total: number; failed: number }>(`SELECT count(*) AS total, sum(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END) AS failed FROM jobs j JOIN products p ON p.id = j.product_id WHERE p.product_type = ? AND j.status IN ('succeeded','failed')`, typeId)!;
      if (jobs.total >= 5 || hist.versions >= 2) {
        const avg = hist.versions ? (hist.cost ?? 0) / hist.versions : 0;
        const failRate = jobs.total ? jobs.failed / jobs.total : 0;
        factors.push({ factor, value: clamp(10 - 40 * avg - 5 * failRate), evidence: 'measured', weight, source: `Own history: ${hist.versions} AI-generated versions, avg ≈ $${avg.toFixed(3)}; ${jobs.failed}/${jobs.total} jobs failed`, note: SCORING_RULES.productionCost });
      } else if (!def.aiContent && def.artwork !== 'ai-image') {
        factors.push({ factor, value: 9, evidence: 'measured', weight, source: 'This product type is generated locally with no AI cost', note: 'No production history yet' });
      } else factors.push({ factor, value: null, evidence: 'unknown', weight, source: 'No production history for this product type yet', note: '' });
      continue;
    }
    if (factor === 'bundlePotential') {
      const n = app.db.value<number>("SELECT count(*) FROM products WHERE category_id IS ? AND status = 'active' AND product_type <> 'bundle'", opp.category_id ?? null) ?? 0;
      factors.push({ factor, value: clamp(2 + 1.5 * n), evidence: 'measured', weight, source: `${n} active product(s) in the same category`, note: SCORING_RULES.bundlePotential });
      continue;
    }
    if (factor === 'seasonality') {
      const months = opp.seasonal_months;
      if (!months.length) factors.push({ factor, value: 6, evidence: 'measured', weight, source: 'Evergreen (no season set on the opportunity)', note: SCORING_RULES.seasonality });
      else {
        const now = app.clock.now().getUTCMonth() + 1;
        const d = Math.min(...months.map((m) => (m - now + 12) % 12));
        const value = d === 0 ? 7 : d <= 2 ? 10 : d === 3 ? 8 : d <= 6 ? 5 : 3;
        factors.push({ factor, value, evidence: 'measured', weight, source: `Season months ${months.join(', ')}; next peak in ${d} month(s) from today`, note: SCORING_RULES.seasonality });
      }
      continue;
    }
    if (factor === 'risk') {
      if (blocked.length) {
        factors.push({ factor, value: 0, evidence: 'measured', weight, source: `Blocked terms: ${blocked.join(', ')}`, note: SCORING_RULES.risk });
        continue;
      }
      const qa = app.db.get<{ total: number; failed: number }>(`SELECT count(*) AS total, sum(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failed FROM qa_runs q JOIN product_versions v ON v.id = q.version_id JOIN products p ON p.id = v.product_id WHERE p.product_type = ? AND q.kind = 'deliverable'`, typeId)!;
      if (qa.total >= 3) factors.push({ factor, value: clamp(10 - 10 * (qa.failed / qa.total)), evidence: 'measured', weight, source: `No blocked terms; ${qa.failed}/${qa.total} QA runs failed for this type`, note: SCORING_RULES.risk });
      else factors.push({ factor, value: 8, evidence: 'measured', weight, source: 'No blocked trademark terms; no QA history for this type yet', note: SCORING_RULES.risk });
      continue;
    }
    if (factor === 'differentiation' && opp.differentiation_note && opp.origin === 'ai_suggestion') {
      factors.push({ factor, value: null, evidence: 'unknown', weight, source: 'An AI-suggested differentiation exists but has not been rated', note: String(opp.differentiation_note).slice(0, 200) });
      continue;
    }
    factors.push({ factor, value: null, evidence: 'unknown', weight, source: 'No data recorded', note: '' });
  }

  const known = factors.filter((f) => f.value !== null);
  const knownWeight = known.reduce((a, f) => a + f.weight, 0);
  const totalWeight = factors.reduce((a, f) => a + f.weight, 0) || 1;
  const score = knownWeight > 0 ? Math.round((known.reduce((a, f) => a + f.weight * (f.value as number), 0) / knownWeight) * 100) / 10 : null;
  const confidence = Math.round((factors.reduce((a, f) => a + f.weight * QUALITY[f.evidence], 0) / totalWeight) * 100) / 100;
  const outcome: ScoreResult['outcome'] = blocked.length ? 'policy_blocked' : confidence < s.minConfidence || score === null ? 'insufficient_evidence' : score >= s.minScore ? 'meets_threshold' : 'below_threshold';
  const id = newId('osc');
  const thresholds = { minScore: s.minScore, minConfidence: s.minConfidence };
  app.db.insert('opportunity_scores', { id, opportunity_id: opportunityId, score, confidence, outcome, factors: JSON.stringify(factors), weights: JSON.stringify(weights), thresholds: JSON.stringify(thresholds), created_at: new Date().toISOString() });
  if (opp.status === 'new') app.db.update('opportunities', opportunityId, { status: 'evaluating', updated_at: new Date().toISOString() });
  return { id, score, confidence, outcome, factors, thresholds };
}

export function latestScore(app: AppContext, opportunityId: string): (Omit<ScoreResult, 'factors' | 'thresholds'> & { factors: FactorScore[]; created_at: string }) | null {
  const r = app.db.get<Record<string, unknown>>('SELECT * FROM opportunity_scores WHERE opportunity_id = ? ORDER BY id DESC LIMIT 1', opportunityId);
  if (!r) return null;
  return { id: String(r.id), score: r.score as number | null, confidence: Number(r.confidence), outcome: r.outcome as ScoreResult['outcome'], factors: JSON.parse(String(r.factors)), created_at: String(r.created_at) };
}
