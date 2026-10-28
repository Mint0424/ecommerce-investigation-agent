import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, '日期必须是真实的 YYYY-MM-DD');
const cents = z.number().int().nonnegative();
const rowBase = { id: z.string().min(1), sku: z.string().min(1), date: dateSchema };
export const productSchema = z.object({
  sku: z.string().min(1), name: z.string().min(1), variant: z.string().min(1),
  priceCents: cents.positive(), costCents: cents, fulfillmentCents: cents,
  minGrossMargin: z.number().min(0).max(1), maxDailyAdSpendCents: cents,
});
export const salesSchema = z.object({ ...rowBase, units: z.number().int().nonnegative(), revenueCents: cents });
export const inventorySchema = z.object({ ...rowBase, closingUnits: z.number().int().nonnegative(), availableHours: z.number().min(0).max(24) });
export const promotionSchema = z.object({ ...rowBase, active: z.boolean(), effectivePriceCents: cents.positive(), campaign: z.string() });
export const advertisingSchema = z.object({ ...rowBase, clicks: z.number().int().nonnegative(), orders: z.number().int().nonnegative(), spendCents: cents, attributedRevenueCents: cents });
export const sourceMetaSchema = z.object({ sourceId: z.string(), refreshedAt: dateSchema });
export const datasetSchema = z.object({
  schemaVersion: z.literal(1), simulated: z.literal(true), asOf: dateSchema, currency: z.literal('CNY'),
  sources: z.object({ sales: sourceMetaSchema, inventory: sourceMetaSchema, promotions: sourceMetaSchema, advertising: sourceMetaSchema }),
  products: z.array(productSchema), sales: z.array(salesSchema), inventory: z.array(inventorySchema),
  promotions: z.array(promotionSchema), advertising: z.array(advertisingSchema),
});
export type Product = z.infer<typeof productSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Table = 'sales' | 'inventory' | 'promotions' | 'advertising';
export type Rows = Array<Dataset[Table][number]>;
export type DateWindow = { start: string; end: string; days: number };
export type InvestigationInput = { sku: string; endDate?: string; days?: number };
export type QualityIssue = { code: 'missing_rows' | 'stale_source' | 'conflicting_records'; source: Table; message: string };
export interface Evidence {
  id: string;
  sourceId: string;
  table: Table;
  simulated: true;
  sku: string;
  refreshedAt: string;
  window: DateWindow;
  rowIds: string[];
  missingDates: string[];
  quality: QualityIssue[];
  rows: Rows;
}
export type TableEvidence = Record<Table, { baseline: Evidence; recent: Evidence }>;
export type HypothesisCode = 'stockout' | 'promotion_ended' | 'ad_conversion_decline' | 'insufficient_data' | 'unexplained_decline' | 'no_material_decline';
export interface Hypothesis {
  code: HypothesisCode;
  title: string;
  interpretation: 'supported_hypothesis' | 'unresolved' | 'observation';
  detail: string;
  evidenceIds: string[];
}
export interface ActionDraft {
  kind: 'replenish' | 'promotion' | 'advertising' | 'collect_data' | 'monitor';
  title: string;
  requiresApproval: boolean;
  executed: false;
  detail: string;
}
export interface Report {
  schemaVersion: 1;
  simulated: true;
  executionMode: 'deterministic_workflow';
  sku: string;
  product: Product;
  asOf: string;
  status: 'complete' | 'partial';
  baseline: DateWindow;
  recent: DateWindow;
  metrics: {
    baselineUnits: number | null;
    recentUnits: number | null;
    unitsChangeRate: number | null;
    baselineRevenueCents: number | null;
    recentRevenueCents: number | null;
    stockoutHours: number | null;
    baselineAdCvr: number | null;
    recentAdCvr: number | null;
    recentAdRoas: number | null;
  };
  hypotheses: Hypothesis[];
  actions: ActionDraft[];
  quality: QualityIssue[];
  evidence: Evidence[];
  review: { passed: boolean; checks: string[]; scope: string };
  limitations: string[];
}
export interface ToolPort {
  execute(name: string, input: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface TraceEvent {
  runId: string;
  sequence: number;
  timestamp: string;
  type: 'run_started' | 'tool_started' | 'tool_completed' | 'run_completed' | 'run_failed' | 'run_cancelled';
  data: Record<string, unknown>;
}
export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; }
}
export const addDays = (date: string, delta: number) => new Date(Date.parse(date + 'T00:00:00Z') + delta * 86_400_000).toISOString().slice(0, 10);
export function makeWindows(asOf: string, endDate = addDays(asOf, -1), days = 7) {
  dateSchema.parse(endDate);
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new DomainError('invalid_window', '窗口天数必须为 1–31 的整数');
  if (endDate >= asOf) throw new DomainError('future_window', `演示数据时点为 ${asOf}，只能查询此日前的完整日期`);
  return {
    recent: { start: addDays(endDate, 1 - days), end: endDate, days },
    baseline: { start: addDays(endDate, 1 - 2 * days), end: addDays(endDate, -days), days },
  };
}
export const safeRatio = (a: number, b: number): number | null => b === 0 ? null : a / b;
